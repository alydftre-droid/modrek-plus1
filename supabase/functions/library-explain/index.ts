// Library Explain — cached page explanation with AI narration + TTS audio.
// Called from the reader when the student taps «شرح الصفحة» / a section.
// Uses Lovable AI Gateway for both text (openai/gpt-5.5) and audio (openai/gpt-4o-mini-tts).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string) {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const bookId = body.book_id as string | undefined;
    const pageNumber = Number(body.page_number ?? 1);
    const sectionId = (body.section_id ?? null) as string | null;
    const variant = ["default", "deeper", "simpler"].includes(body.variant) ? body.variant : "default";
    const withAudio = body.with_audio !== false; // default true
    const userQuestion = body.question ? String(body.question).slice(0, 500) : null;

    if (!bookId) return json({ error: "book_id required" }, 400);

    // 1) Load book + verify accessible.
    const { data: book, error: bErr } = await admin
      .from("library_books")
      .select("id,title,subject_name_ar,status,access_tier")
      .eq("id", bookId)
      .maybeSingle();
    if (bErr || !book) return json({ error: "book_not_found" }, 404);
    if (book.status !== "ready" || book.access_tier !== "free") {
      return json({ error: "not_accessible" }, 403);
    }

    // 2) Try cache: key by section_id if present, else by (book+page+question hash).
    const cacheKey = await sha256Hex(JSON.stringify({ bookId, pageNumber, sectionId, variant, q: userQuestion || "" }));
    const { data: cached } = await admin
      .from("library_section_explanations")
      .select("*")
      .eq("book_id", bookId)
      .eq("prompt_hash", cacheKey)
      .eq("variant", variant)
      .maybeSingle();

    if (cached) {
      await admin
        .from("library_section_explanations")
        .update({ hit_count: (cached.hit_count ?? 0) + 1 })
        .eq("id", cached.id);
      return json({
        text: cached.text_ar,
        audio_base64: null,
        audio_path: cached.audio_path,
        cached: true,
      });
    }

    // 3) Load section text if we have one, else use page OCR.
    let context = "";
    if (sectionId) {
      const { data: s } = await admin.from("library_book_sections").select("raw_text,kind").eq("id", sectionId).maybeSingle();
      context = s?.raw_text || "";
    }
    if (!context) {
      const { data: p } = await admin.from("library_book_pages").select("ocr_text").eq("book_id", bookId).eq("page_number", pageNumber).maybeSingle();
      context = p?.ocr_text || "";
    }

    // 4) Generate explanation via Lovable AI Gateway (openai/gpt-5.5).
    const styleHint = variant === "deeper"
      ? "قدّم شرحًا موسّعًا ومفصّلاً مع أمثلة ومصطلحات دقيقة."
      : variant === "simpler"
      ? "بسّط الشرح كما لو كنت تشرح لطالب صغير، بلغة عربية سهلة جدًا."
      : "قدّم شرحًا واضحًا ومتوسط الطول مناسبًا لطالب مدرسة.";

    const systemPrompt = `أنت معلم عربي متمكن يشرح دروس كتاب "${book.title}" مادة "${book.subject_name_ar || ''}". ${styleHint}
- تحدث بالعربية الفصحى المبسطة.
- لا تستخدم Markdown ولا رموز أو إيموجي.
- ابدأ مباشرة بالشرح دون مقدمات مثل "بالطبع".
- إذا سأل الطالب سؤالاً محدداً، أجب عليه أولاً ثم اربطه بمحتوى الصفحة.`;

    const userPrompt = userQuestion
      ? `الصفحة رقم ${pageNumber}. سؤال الطالب: ${userQuestion}\n\nمحتوى الصفحة/الجزء:\n${context || "(لا يوجد نص مستخرج، اعتمد على معرفتك بالمادة)"}`
      : `اشرح الصفحة رقم ${pageNumber} من الكتاب.\n\nمحتوى الصفحة/الجزء:\n${context || "(لا يوجد نص مستخرج)"}`;

    const aiRes = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => "");
      return json({ error: `ai_failed: ${aiRes.status} ${errText.slice(0, 200)}` }, 502);
    }
    const aiData = await aiRes.json();
    const explanation: string = aiData?.choices?.[0]?.message?.content?.trim() || "";
    const usage = aiData?.usage || {};

    if (!explanation) return json({ error: "empty_ai_response" }, 502);

    // 5) Optional TTS via Lovable AI Gateway.
    let audioBase64: string | null = null;
    if (withAudio) {
      try {
        const ttsRes = await fetch(`${GATEWAY}/audio/speech`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini-tts",
            input: explanation.slice(0, 3800),
            voice: "alloy",
            response_format: "mp3",
          }),
        });
        if (ttsRes.ok) {
          const buf = new Uint8Array(await ttsRes.arrayBuffer());
          // base64 encode
          let binary = "";
          const CHUNK = 0x8000;
          for (let i = 0; i < buf.length; i += CHUNK) {
            binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)) as any);
          }
          audioBase64 = btoa(binary);
        } else {
          console.warn("tts_failed", ttsRes.status);
        }
      } catch (e) {
        console.warn("tts_error", e);
      }
    }

    // 6) Persist cache row.
    await admin.from("library_section_explanations").insert({
      book_id: bookId,
      section_id: sectionId,
      variant,
      prompt_hash: cacheKey,
      text_ar: explanation,
      voice: withAudio ? "alloy" : null,
      tokens_input: usage.prompt_tokens ?? null,
      tokens_output: usage.completion_tokens ?? null,
      created_by: userData.user.id,
      hit_count: 1,
    });

    return json({
      text: explanation,
      audio_base64: audioBase64,
      audio_path: null,
      cached: false,
    });
  } catch (err: any) {
    console.error("library-explain error", err);
    return json({ error: String(err?.message || err) }, 500);
  }
});

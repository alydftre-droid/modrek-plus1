// Library Explain — cached page/section explanation with AI narration + TTS.
// AI provider: OpenRouter ONLY (via _shared/openrouter.ts + _shared/aiSettings.ts).
// Model is configurable per-function via public.ai_function_settings rows:
//   - "library-explain"     → chat models (models_to_try)
//   - "library-explain-tts" → TTS model (models_to_try[0]) + voice (via env or default)
// No direct calls to Lovable AI or OpenAI. Changing the model = updating a DB row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  loadAiSettings,
  resolveOpenRouterApiKey,
  callGeminiWithFallback,
} from "../_shared/aiSettings.ts";
import {
  openRouterTts,
  pcmToWav,
  OPENROUTER_DEFAULT_TTS_MODEL,
  OPENROUTER_DEFAULT_TTS_VOICE,
} from "../_shared/openrouter.ts";
import { getAccessibleLibraryBook } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string) {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64(buf: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)) as any);
  }
  return btoa(binary);
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
    const studentId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const bookId = body.book_id as string | undefined;
    const pageNumber = Number(body.page_number ?? 1);
    const sectionId = (body.section_id ?? null) as string | null;
    const variant = ["default", "deeper", "simpler"].includes(body.variant) ? body.variant : "default";
    const withAudio = body.with_audio !== false; // default true
    const userQuestion = body.question ? String(body.question).slice(0, 500) : null;

    // Vision input: the reader renders each page to a JPEG and sends it here so
    // the tutor can read scanned pages, diagrams, tables and handwriting even
    // when the PDF has no extractable text layer.
    const rawImage = typeof body.page_image_base64 === "string" ? body.page_image_base64 : "";
    const pageImageBase64 = rawImage.includes(",") && rawImage.startsWith("data:")
      ? rawImage.slice(rawImage.indexOf(",") + 1)
      : rawImage;
    const pageImageMime = typeof body.page_image_mime === "string" && body.page_image_mime.startsWith("image/")
      ? body.page_image_mime
      : "image/jpeg";
    // ~8MB base64 cap to stay inside edge function memory limits.
    const hasImage = pageImageBase64.length > 512 && pageImageBase64.length < 8_000_000;

    if (!bookId) return json({ error: "book_id required" }, 400);

    // 1) Load book + verify accessible.
    const access = await getAccessibleLibraryBook(admin, bookId, studentId, "id,title,subject_name_ar,status,access_tier");
    if (!access.ok) return json({ error: access.error }, access.status);
    const book = access.book as any;

    // 2) Cache lookup (vision explanations are cached separately from text-only ones).
    const cacheKey = await sha256Hex(
      JSON.stringify({ source: "explain", bookId, pageNumber, sectionId, variant, q: userQuestion || "", vision: hasImage ? "v2" : "none" }),
    );
    const { data: cached } = await admin
      .from("library_section_explanations")
      .select("*")
      .eq("book_id", bookId)
      .eq("prompt_hash", cacheKey)
      .eq("variant", variant)
      .maybeSingle();

    const isWeakCachedText = (value: string) =>
      !value.trim() ||
      value.includes("لم يتم العثور على نص واضح") ||
      value.includes("لا يوجد نص مستخرج");

    if (cached && !isWeakCachedText(String(cached.text_ar || ""))) {
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
    if (cached) {
      // Drop the useless placeholder so the page gets a real explanation.
      await admin.from("library_section_explanations").delete().eq("id", cached.id);
    }

    // 3) Load context (section text if provided, else page OCR).
    let context = "";
    if (sectionId) {
      const { data: s } = await admin
        .from("library_book_sections")
        .select("raw_text,kind")
        .eq("id", sectionId)
        .maybeSingle();
      context = s?.raw_text || "";
    }
    if (!context) {
      const { data: p } = await admin
        .from("library_book_pages")
        .select("ocr_text")
        .eq("book_id", bookId)
        .eq("page_number", pageNumber)
        .maybeSingle();
      context = p?.ocr_text || "";
    }

    // 4) Resolve OpenRouter key + model settings.
    const { apiKey } = await resolveOpenRouterApiKey(admin);
    if (!apiKey) return json({ error: "openrouter_key_missing" }, 500);

    const chatSettings = await loadAiSettings(admin, "library-explain");

    const styleHint = variant === "deeper"
      ? "قدّم شرحًا موسّعًا ومفصّلاً مع أمثلة ومصطلحات دقيقة."
      : variant === "simpler"
      ? "بسّط الشرح كما لو كنت تشرح لطالب صغير، بلغة عربية سهلة جدًا."
      : "قدّم شرحًا واضحًا ومتوسط الطول مناسبًا لطالب مدرسة.";

    const systemPrompt = `أنت معلم عربي متمكن يشرح دروس كتاب "${book.title}" مادة "${book.subject_name_ar || ""}". ${styleHint}
- أنت ترى صورة الصفحة كاملة: اقرأ كل ما فيها بنفسك (العناوين، الفقرات، الأرقام، الجداول، الرسومات، الأشكال، المعادلات، الصور التوضيحية، وحتى الكتابة اليدوية) ثم اشرحها كأنك تشرح على السبورة أمام الطالب.
- إن وُجد رسم أو شكل أو جدول أو خريطة، فصِف مكوناته وماذا يوضح ولماذا هو مهم في الدرس.
- إن كانت هناك أسئلة أو تدريبات في الصفحة، فاشرح المطلوب منها وطريقة التفكير في حلها.
- تحدث بالعربية الفصحى المبسطة.
- لا تستخدم Markdown ولا رموز أو إيموجي.
- ابدأ مباشرة بالشرح دون مقدمات مثل "بالطبع".
- إذا سأل الطالب سؤالاً محدداً، أجب عليه أولاً ثم اربطه بمحتوى الصفحة.
- ممنوع تمامًا أن تقول إنك لا ترى الصفحة أو أنه لا يوجد نص واضح؛ اعتمد على الصورة ومعرفتك بالمادة وقدّم شرحًا مفيدًا دائمًا.`;

    const contextBlock = context
      ? `\n\nالنص المستخرج من الصفحة (قد يكون ناقصًا، والصورة هي المرجع الأساسي):\n${context}`
      : hasImage
        ? "\n\nلا يوجد نص مستخرج لهذه الصفحة، فاعتمد كليًا على قراءة صورة الصفحة المرفقة."
        : "\n\n(لا يوجد نص مستخرج، اعتمد على معرفتك بالمادة وبعنوان الكتاب.)";

    const userPrompt = userQuestion
      ? `الصفحة رقم ${pageNumber}. سؤال الطالب: ${userQuestion}${contextBlock}`
      : `اشرح الصفحة رقم ${pageNumber} من الكتاب شرحًا كاملاً كما يفعل معلم محترف: ابدأ بعنوان الدرس أو موضوع الصفحة، ثم اشرح الأفكار بالترتيب، ثم فسّر الرسومات والجداول إن وُجدت، وأنهِ بخلاصة قصيرة.${contextBlock}`;

    const userContent = hasImage
      ? [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: `data:${pageImageMime};base64,${pageImageBase64}` } },
        ]
      : userPrompt;

    const chatResult = await callGeminiWithFallback({
      apiKey,
      models: chatSettings.models_to_try,
      body: {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.6,
      },
      fallbackDelayMs: chatSettings.fallback_delay_ms,
      timeoutMs: 90_000,
    });


    if (!chatResult.ok) {
      return json({ error: `ai_failed: ${chatResult.status} ${(chatResult.lastError || "").slice(0, 200)}` }, 502);
    }
    const aiData = await chatResult.response.json().catch(() => ({}));
    const explanation: string = aiData?.choices?.[0]?.message?.content?.trim() || "";
    const usage = aiData?.usage || {};

    if (!explanation) return json({ error: "empty_ai_response" }, 502);

    // 5) Optional TTS via OpenRouter — model driven from ai_function_settings["library-explain-tts"].
    let audioBase64: string | null = null;
    let ttsVoice: string | null = null;
    if (withAudio) {
      try {
        const ttsSettings = await loadAiSettings(admin, "library-explain-tts");
        const ttsModel = ttsSettings.models_to_try[0] || OPENROUTER_DEFAULT_TTS_MODEL;
        ttsVoice = OPENROUTER_DEFAULT_TTS_VOICE;
        const ttsRes = await openRouterTts({
          apiKey,
          model: ttsModel,
          input: explanation.slice(0, 3800),
          voice: ttsVoice,
          format: "pcm",
          timeoutMs: 60_000,
        });
        if (ttsRes.ok) {
          const pcm = new Uint8Array(await ttsRes.response.arrayBuffer());
          // Wrap PCM into a browser-playable WAV.
          const wav = pcmToWav(pcm);
          audioBase64 = bytesToBase64(wav);
        } else {
          console.warn("library-explain tts_failed", ttsRes.status, (ttsRes.lastError || "").slice(0, 200));
        }
      } catch (e) {
        console.warn("library-explain tts_error", e);
      }
    }

    // 6) Persist cache row.
    await admin.from("library_section_explanations").insert({
      book_id: bookId,
      section_id: sectionId,
      variant,
      prompt_hash: cacheKey,
      text_ar: explanation,
      voice: withAudio ? ttsVoice : null,
      tokens_input: usage.prompt_tokens ?? null,
      tokens_output: usage.completion_tokens ?? null,
      created_by: studentId,
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

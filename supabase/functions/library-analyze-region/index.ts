// Library Analyze Region — explains a specific area of a page (image, figure,
// diagram, equation, table). The client sends a page image URL + bbox and an
// optional question. We crop the page image via a Bunny image transform URL
// when possible, otherwise pass the full page image plus a bbox hint. The
// vision model receives the image + a prompt targeted at that region.
//
// Result is cached in library_section_explanations keyed by (book_id, page,
// bbox, question) so any student re-opens the same figure instantly.
//
// Request:
//   { book_id, page_number, bbox: {x,y,w,h,unit?:'pct'|'px'},
//     question?: string, kind?: 'figure'|'table'|'equation'|'diagram'|'map' }
// Response: { text, cached, section_id? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  loadAiSettings,
  resolveOpenRouterApiKey,
  callGeminiWithFallback,
} from "../_shared/aiSettings.ts";
import { buildVisionMessages } from "../_shared/openrouter.ts";
import { getAccessibleLibraryBook } from "../_shared/auth.ts";
import { resolveAnswerScope, buildAnswerScopeBlock } from "../_shared/answerScope.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "unauthorized" }, 401);
    const studentId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const bookId = String(body.book_id || "");
    const pageNumber = Number(body.page_number || 0);
    const bbox = body.bbox && typeof body.bbox === "object" ? body.bbox : null;
    const question = String(body.question || "اشرح هذا العنصر بالتفصيل").slice(0, 500);
    const kind = String(body.kind || "figure").slice(0, 40);

    if (!bookId || !pageNumber || !bbox) return json({ error: "missing_params" }, 400);

    const access = await getAccessibleLibraryBook(admin, bookId, studentId, "id,title,subject_name_ar,status,access_tier,pdf_path", authHeader);
    if (!access.ok) return json({ error: access.error }, access.status);
    const book = access.book as any;

    const { data: page } = await admin
      .from("library_book_pages")
      .select("id,image_path,ocr_text,width,height")
      .eq("book_id", bookId).eq("page_number", pageNumber).maybeSingle();

    // Cache key includes bbox coords so different regions get separate entries.
    const bboxKey = JSON.stringify({ x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h, u: bbox.unit || "pct" });
    const cacheKey = await sha256Hex(JSON.stringify({ source: "region", bookId, page: pageNumber, bbox: bboxKey, kind, q: question.toLowerCase() }));

    const { data: cached } = await admin
      .from("library_section_explanations")
      .select("id,text_ar,hit_count")
      .eq("book_id", bookId).eq("prompt_hash", cacheKey).maybeSingle();
    if (cached?.text_ar) {
      await admin.from("library_section_explanations")
        .update({ hit_count: (cached.hit_count ?? 0) + 1 })
        .eq("id", cached.id);
      return json({ text: cached.text_ar, cached: true });
    }

    // Build the image URL. Prefer the stored page image; fallback to first page of PDF is out of scope.
    let imageUrl = String(page?.image_path || "").trim();
    if (!imageUrl) return json({ error: "page_image_missing" }, 409);
    if (!/^https?:\/\//i.test(imageUrl)) {
      // Signed URL from Supabase storage (best-effort)
      const { data: signed } = await admin.storage.from("library-books").createSignedUrl(imageUrl, 3600);
      if (signed?.signedUrl) imageUrl = signed.signedUrl;
    }

    const bboxDescription = bbox.unit === "px"
      ? `منطقة الصورة بالإحداثيات (px): x=${Math.round(bbox.x)}, y=${Math.round(bbox.y)}, w=${Math.round(bbox.w)}, h=${Math.round(bbox.h)}`
      : `منطقة الصورة كنسبة مئوية من الصفحة: x=${Number(bbox.x).toFixed(1)}%, y=${Number(bbox.y).toFixed(1)}%, w=${Number(bbox.w).toFixed(1)}%, h=${Number(bbox.h).toFixed(1)}%`;

    const regionScope = resolveAnswerScope(question, { hasImage: true });
    const systemPrompt = `أنت معلم عربي متمكن. أنت تنظر إلى صورة صفحة من كتاب "${book.title}" مادة "${book.subject_name_ar || ""}". ركّز فقط على المنطقة المحددة (${kind}) وليس الصفحة بأكملها.`;

    const userPrompt = `${bboxDescription}
الطالب طلب: ${question}
- ابدأ مباشرة بالشرح دون مقدمات.
- اشرح المحتوى داخل هذه المنطقة تحديداً (رسم/جدول/معادلة/شكل...).
- إن كانت معادلة اشرح رموزها والغرض منها.
- إن كان جدولاً استخرج الأعمدة والصفوف واستنتاجاتها.
- إن كان رسماً اشرح المحاور والعلاقات والدلالة.
- لا تستخدم Markdown ولا رموز التنسيق.

${buildAnswerScopeBlock(regionScope)}`;

    const { apiKey } = await resolveOpenRouterApiKey(admin);
    if (!apiKey) return json({ error: "openrouter_key_missing" }, 500);
    const settings = await loadAiSettings(admin, "library-analyze-region");

    const res = await callGeminiWithFallback({
      apiKey,
      models: settings.models_to_try,
      body: {
        messages: buildVisionMessages(imageUrl, userPrompt, systemPrompt),
        temperature: 0.4,
      },
      fallbackDelayMs: settings.fallback_delay_ms,
      timeoutMs: 60_000,
    });
    if (!res.ok) return json({ error: `ai_failed:${res.status}:${(res.lastError || "").slice(0, 200)}` }, 502);
    const data = await res.response.json().catch(() => ({}));
    const text = String(data?.choices?.[0]?.message?.content || "").trim();
    if (!text) return json({ error: "empty_response" }, 502);
    const usage = data?.usage || {};

    // Store as a persistent section for reuse.
    let sectionId: string | null = null;
    try {
      const { data: sec } = await admin.from("library_book_sections").insert({
        book_id: bookId,
        page_id: page?.id ?? null,
        kind,
        bbox,
        order_index: 9999,
        raw_text: null,
      }).select("id").single();
      sectionId = sec?.id ?? null;
    } catch { /* ignore duplicate */ }

    await admin.from("library_section_explanations").insert({
      book_id: bookId,
      page_id: page?.id ?? null,
      section_id: sectionId,
      variant: "region",
      prompt_hash: cacheKey,
      text_ar: text,
      tokens_input: usage.prompt_tokens ?? null,
      tokens_output: usage.completion_tokens ?? null,
      created_by: studentId,
      hit_count: 1,
    });

    return json({ text, cached: false, section_id: sectionId });
  } catch (err: any) {
    console.error("library-analyze-region error", err);
    return json({ error: String(err?.message || err) }, 500);
  }
});

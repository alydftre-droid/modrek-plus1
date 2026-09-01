// Library Quiz — generate MCQ / T-F / essay quizzes from any scope of the
// book (whole book / chapter (index node) / page range / selected section).
// Cached by (book_id, scope, prompt_hash) — reused for every student.
//
// Request:
//   { book_id, scope: 'page'|'range'|'index'|'book',
//     page_number?, page_start?, page_end?, index_id?,
//     question_count?: number (default 8),
//     types?: ('mcq'|'tf'|'essay')[] (default ['mcq'])
//   }
// Response: { quiz_id, questions: [...], cached }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  loadAiSettings,
  resolveOpenRouterApiKey,
  callGeminiWithFallback,
} from "../_shared/aiSettings.ts";
import { getAccessibleLibraryBook } from "../_shared/auth.ts";
import { enforceAiQuota, aiQuotaResponse } from "../_shared/aiQuota.ts";

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

    const quota = await enforceAiQuota(studentId, "library-quiz");
    if (!quota.allowed) return aiQuotaResponse(quota, corsHeaders);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const bookId = String(body.book_id || "");
    const scope: "page" | "range" | "index" | "book" = ["page", "range", "index", "book"].includes(body.scope) ? body.scope : "page";
    const questionCount = Math.min(20, Math.max(3, Number(body.question_count) || 8));
    const types: string[] = Array.isArray(body.types) && body.types.length ? body.types : ["mcq"];

    if (!bookId) return json({ error: "book_id_required" }, 400);

    const access = await getAccessibleLibraryBook(admin, bookId, studentId, "id,title,subject_name_ar,status,access_tier,page_count", authHeader);
    if (!access.ok) return json({ error: access.error }, access.status);
    const book = access.book as any;

    // Resolve page range
    let pageStart = 1;
    let pageEnd = Math.min(book.page_count || 1, 999999);
    const scopeRef: any = { scope };
    if (scope === "page") {
      const pn = Number(body.page_number) || 1;
      pageStart = pn; pageEnd = pn;
      scopeRef.page_number = pn;
    } else if (scope === "range") {
      pageStart = Math.max(1, Number(body.page_start) || 1);
      pageEnd = Math.min(book.page_count || pageStart, Number(body.page_end) || pageStart);
      scopeRef.page_start = pageStart; scopeRef.page_end = pageEnd;
    } else if (scope === "index" && body.index_id) {
      const { data: node } = await admin
        .from("library_book_index")
        .select("id,title,page_start,page_end")
        .eq("id", String(body.index_id))
        .eq("book_id", bookId)
        .maybeSingle();
      if (!node) return json({ error: "index_not_found" }, 404);
      pageStart = node.page_start; pageEnd = node.page_end;
      scopeRef.index_id = node.id; scopeRef.title = node.title;
    }

    const cacheKey = await sha256Hex(JSON.stringify({ bookId, scope, scopeRef, questionCount, types: types.slice().sort() }));
    const { data: cached } = await admin
      .from("library_generated_quizzes")
      .select("id,questions,hit_count")
      .eq("book_id", bookId).eq("prompt_hash", cacheKey).maybeSingle();
    if (cached) {
      await admin.from("library_generated_quizzes")
        .update({ hit_count: (cached.hit_count ?? 0) + 1 })
        .eq("id", cached.id);
      return json({ quiz_id: cached.id, questions: cached.questions, cached: true });
    }

    // Gather content — prefer chunks (already clean), fallback to pages.
    const { data: chunks } = await admin
      .from("library_book_chunks")
      .select("page_number,content")
      .eq("book_id", bookId)
      .gte("page_number", pageStart)
      .lte("page_number", pageEnd)
      .order("page_number").order("chunk_index")
      .limit(40);
    let sourceText = "";
    if (chunks?.length) {
      sourceText = chunks.map((c: any) => `[صفحة ${c.page_number}] ${c.content}`).join("\n\n").slice(0, 14000);
    } else {
      const { data: pages } = await admin
        .from("library_book_pages")
        .select("page_number,ocr_text")
        .eq("book_id", bookId).gte("page_number", pageStart).lte("page_number", pageEnd)
        .order("page_number").limit(20);
      sourceText = (pages || []).map((p: any) => `[صفحة ${p.page_number}] ${String(p.ocr_text || "").slice(0, 1200)}`).join("\n\n").slice(0, 14000);
    }
    if (!sourceText.trim()) return json({ error: "no_content_yet" }, 409);

    const { apiKey } = await resolveOpenRouterApiKey(admin);
    if (!apiKey) return json({ error: "openrouter_key_missing" }, 500);
    const settings = await loadAiSettings(admin, "library-quiz");

    const typeList = types.join(", ");
    const systemPrompt = `أنت معلم عربي متمكن ينشئ أسئلة امتحان دقيقة من محتوى الكتاب. أخرج JSON صالحاً فقط بدون أي شرح.`;
    const userPrompt = `أنشئ ${questionCount} سؤال من الأنواع التالية: [${typeList}] من محتوى كتاب "${book.title}"، من الصفحات ${pageStart}-${pageEnd}.
- كل سؤال يشير إلى رقم الصفحة (page).
- لأسئلة MCQ: 4 خيارات مع الإجابة الصحيحة (correct_index بين 0 و 3).
- لأسئلة TF: قيمة answer إما true أو false.
- لأسئلة Essay: model_answer نموذجية وموجزة.
- كل سؤال يحتوي explanation قصيراً.
أخرج JSON بهذا الشكل الحرفي:
{"questions":[{"type":"mcq","page":N,"question":"...","options":["أ","ب","ج","د"],"correct_index":0,"explanation":"..."}, ...]}

المحتوى:
${sourceText}`;

    const res = await callGeminiWithFallback({
      apiKey,
      models: settings.models_to_try,
      body: {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.5,
      },
      fallbackDelayMs: settings.fallback_delay_ms,
      timeoutMs: 60_000,
    });
    if (!res.ok) return json({ error: `ai_failed:${res.status}` }, 502);
    const data = await res.response.json().catch(() => ({}));
    const raw: string = data?.choices?.[0]?.message?.content?.trim() || "";
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return json({ error: "no_json" }, 502);
    let parsed: any;
    try { parsed = JSON.parse(m[0]); } catch { return json({ error: "json_parse_failed" }, 502); }
    const questions = Array.isArray(parsed?.questions) ? parsed.questions : [];
    if (!questions.length) return json({ error: "no_questions" }, 502);

    const { data: saved, error: sErr } = await admin.from("library_generated_quizzes").insert({
      book_id: bookId,
      scope,
      scope_ref: scopeRef,
      prompt_hash: cacheKey,
      questions,
      question_count: questions.length,
      created_by: studentId,
      hit_count: 1,
    }).select("id").single();
    if (sErr) return json({ error: `save_failed:${sErr.message}` }, 500);

    return json({ quiz_id: saved.id, questions, cached: false });
  } catch (err: any) {
    console.error("library-quiz error", err);
    return json({ error: String(err?.message || err) }, 500);
  }
});

// Modrek AI Exams — canonical training-exam generator.
// AI is only the question source; persistence, attempt creation, solving,
// submission and grading stay on the existing exam engine.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { callGeminiWithFallback, loadAiSettings, resolveGeminiApiKey } from "../_shared/aiSettings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FUNCTION_NAME = "modrek-ai-exams";
const MAX_JSON_ATTEMPTS = 3;
const DEFAULT_COUNTS = { mcq: 5, trueFalse: 3, essay: 2, fillBlank: 0 };

type Difficulty = "easy" | "medium" | "hard";
type QuestionType = "mcq" | "true_false" | "short_answer" | "essay" | "fill_blank";

type NormalizedQuestion = {
  type: QuestionType;
  question: string;
  options: string[] | null;
  correct_answer: string;
  explanation: string | null;
  marks: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safePreview(value: unknown, max = 600): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function logStep(traceId: string, step: string, details: Record<string, unknown> = {}) {
  console.log(`[${FUNCTION_NAME}] ${step}`, JSON.stringify({ traceId, ...details }));
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const anyErr: any = error;
    const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code]
      .filter((part) => typeof part === "string" && part.trim());
    if (parts.length) return parts.join(" | ");
    try { return JSON.stringify(error); } catch { return Object.prototype.toString.call(error); }
  }
  return "Unknown error";
}

function logError(traceId: string, step: string, error: unknown, details: Record<string, unknown> = {}) {
  console.error(`[${FUNCTION_NAME}] ${step}`, JSON.stringify({
    traceId,
    message: stringifyError(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...details,
  }));
}

function publicFailureMessage(code: string) {
  if (code.includes("AI")) return "تعذر توليد أسئلة صالحة الآن. حاول بصياغة أوضح للدرس أو المادة.";
  if (code.includes("SUBJECT")) return "تعذر تحديد مادة مناسبة لحسابك. افتح المادة المطلوبة ثم اطلب إنشاء الامتحان مرة أخرى.";
  if (code.includes("SAVE")) return "تعذر حفظ الامتحان التدريبي. تم إلغاء أي بيانات جزئية بأمان.";
  if (code.includes("AUTH")) return "انتهت الجلسة. سجّل الدخول مرة أخرى ثم حاول.";
  return "تعذر إنشاء الامتحان حالياً. حاول مرة أخرى بعد قليل.";
}

function failure(traceId: string, code: string, error: unknown, status = 500) {
  const technical = stringifyError(error);
  logError(traceId, `FAIL_${code}`, error, { status, technical: safePreview(technical, 800) });
  const publicMessage = `${publicFailureMessage(code)}\nكود التتبع: ${traceId}`;
  return json({
    error: code,
    errorCode: code,
    publicMessage,
    reply: publicMessage,
    traceId,
  }, status);
}

function getBearer(auth: string | null): string | null {
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

function decodeJwtSub(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1] || ""));
    return typeof payload?.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function stripJsonFence(value: string): string {
  const text = String(value || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

function extractJsonObject(value: string): string {
  const text = stripJsonFence(value)
    .replace(/[\u0000-\u001F\u007F]/g, (ch) => (ch === "\n" || ch === "\r" || ch === "\t" ? ch : " "))
    .trim();
  if (text.startsWith("{") && text.endsWith("}")) return text;
  const start = text.indexOf("{");
  if (start < 0) return text;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const ch = text[index];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) return text.slice(start, index + 1).replace(/,\s*([}\]])/g, "$1");
  }
  return text.slice(start).replace(/,\s*([}\]])/g, "$1");
}

function parseAiJson(raw: string, traceId: string, step: string): Record<string, unknown> {
  const candidate = extractJsonObject(raw);
  try {
    const parsed = JSON.parse(candidate);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not_object");
    return parsed;
  } catch (error) {
    logError(traceId, `${step}_JSON_PARSE_FAILED`, error, {
      rawPreview: safePreview(raw),
      candidatePreview: safePreview(candidate),
    });
    throw new Error(`${step}_invalid_json`);
  }
}

function textFromMessage(message: any): string {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .filter((part: any) => part?.type === "text")
      .map((part: any) => String(part.text || ""))
      .join("\n")
      .trim();
  }
  return "";
}

function normalizeArabic(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ");
}

function inferSubjectFromText(text: string): string | null {
  const normalized = normalizeArabic(text);
  const known = [
    "الحديث", "القران", "التفسير", "الفقه", "التوحيد", "السيره",
    "اللغه العربيه", "العربي", "النحو", "الصرف", "البلاغه", "الادب", "النصوص",
    "الرياضيات", "الجبر", "الهندسه", "الفيزياء", "الكيمياء", "الاحياء", "العلوم",
    "التاريخ", "الجغرافيا", "الدراسات", "الفلسفه", "المنطق", "الانجليزي", "اللغه الانجليزيه",
  ];
  return known.find((name) => normalized.includes(name)) || null;
}

function stageLabel(stage?: string | null) {
  if (stage === "preparatory") return "المرحلة الإعدادية";
  if (stage === "secondary") return "المرحلة الثانوية";
  return stage || null;
}

function gradeLabel(grade?: string | null) {
  if (grade === "first") return "الصف الأول";
  if (grade === "second") return "الصف الثاني";
  if (grade === "third") return "الصف الثالث";
  return grade || null;
}

function normalizeDifficulty(input: unknown): Difficulty {
  const value = String(input || "").toLowerCase().trim();
  if (value === "easy" || value === "سهل") return "easy";
  if (value === "hard" || value === "صعب") return "hard";
  return "medium";
}

function normalizeQuestionType(input: unknown): QuestionType {
  const value = String(input || "").toLowerCase().trim();
  if (["true_false", "tf", "truefalse", "true-false", "true false", "صح وخطأ", "صح/خطأ", "boolean"].includes(value)) return "true_false";
  if (["short_answer", "short", "إجابة قصيرة", "اجابة قصيرة"].includes(value)) return "short_answer";
  if (["essay", "مقالي", "مقال"].includes(value)) return "essay";
  if (["fill_blank", "fill", "اكمل", "أكمل"].includes(value)) return "fill_blank";
  return "mcq";
}

function normalizeQuestion(raw: any, index: number): NormalizedQuestion {
  let type = normalizeQuestionType(raw?.type || raw?.question_type);
  const question = String(raw?.question || raw?.question_text || raw?.text || "").trim();
  if (!question) throw new Error(`question_${index + 1}_missing_text`);
  const marks = Math.max(1, Math.min(10, Number(raw?.marks || raw?.points || 1) || 1));
  let correctAnswer = String(raw?.correct_answer || raw?.answer || raw?.model_answer || "").trim();
  const explanation = raw?.explanation ? String(raw.explanation).trim() : null;

  if (type === "true_false") {
    correctAnswer = /خطأ|false|غير صحيح/i.test(correctAnswer) ? "خطأ" : "صح";
    return { type, question, marks, correct_answer: correctAnswer, options: ["صح", "خطأ"], explanation };
  }

  if (type === "mcq") {
    let options = Array.isArray(raw?.options)
      ? raw.options.map((item: unknown) => String(item || "").trim()).filter(Boolean)
      : [];
    if (options.length < 2 && Array.isArray(raw?.choices)) {
      options = raw.choices.map((item: unknown) => String(item || "").trim()).filter(Boolean);
    }
    const uniqueOptions = [...new Set(options)].slice(0, 6);
    if (uniqueOptions.length < 2) {
      type = "short_answer";
      return {
        type,
        question,
        marks,
        correct_answer: correctAnswer || "إجابة نموذجية تُقبل بالمعنى الصحيح.",
        options: null,
        explanation,
      };
    }
    while (uniqueOptions.length < 4) uniqueOptions.push(["اختيار أ", "اختيار ب", "اختيار ج", "اختيار د"][uniqueOptions.length]);
    return {
      type,
      question,
      marks,
      correct_answer: correctAnswer || uniqueOptions[0],
      options: uniqueOptions.slice(0, 4),
      explanation,
    };
  }

  return {
    type,
    question,
    marks,
    correct_answer: correctAnswer || "إجابة نموذجية تُقبل بالمعنى الصحيح.",
    options: null,
    explanation,
  };
}

let cachedGeminiKey: string | null = null;

async function getGeminiKey(admin: any): Promise<string> {
  if (cachedGeminiKey) return cachedGeminiKey;
  const { apiKey } = await resolveGeminiApiKey(admin, Deno.env.get("GEMINI_API_KEY") || "");
  cachedGeminiKey = apiKey;
  return apiKey;
}

async function callGateway(admin: any, messages: any[], traceId: string, step: string) {
  const apiKey = await getGeminiKey(admin);
  if (!apiKey) throw new Error("ai_api_key_missing");
  const settings = await loadAiSettings(admin, FUNCTION_NAME);
  const result = await callGeminiWithFallback({
    apiKey,
    models: settings.models_to_try,
    body: {
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages,
    },
    fallbackDelayMs: settings.fallback_delay_ms,
    timeoutMs: 60_000,
  });
  if (!result.ok) {
    logError(traceId, `${step}_AI_FAILED`, new Error(result.lastError || "AI failed"), {
      status: result.status,
      body: safePreview(result.lastError, 500),
    });
    if (result.status === 429) throw new Error("rate_limited");
    if (result.status === 402) throw new Error("credits_exhausted");
    throw new Error(`ai_gateway_${result.status || "failed"}`);
  }
  const data = await result.response.json().catch(() => ({} as any));
  const content = String(data?.choices?.[0]?.message?.content || "").trim();
  if (!content) throw new Error(`${step}_empty_ai_response`);
  logStep(traceId, `${step}_AI_OK`, { model: result.model, contentChars: content.length });
  return content;
}

async function callJsonWithRetry(opts: {
  admin: any;
  messages: any[];
  traceId: string;
  step: string;
  validate: (value: Record<string, unknown>) => void;
}) {
  let lastRaw = "";
  let lastError: unknown = null;
  let messages = opts.messages;
  for (let attempt = 1; attempt <= MAX_JSON_ATTEMPTS; attempt++) {
    try {
      lastRaw = await callGateway(opts.admin, messages, opts.traceId, opts.step);
      const parsed = parseAiJson(lastRaw, opts.traceId, opts.step);
      opts.validate(parsed);
      return parsed;
    } catch (error) {
      lastError = error;
      logError(opts.traceId, `${opts.step}_ATTEMPT_FAILED`, error, { attempt, rawPreview: safePreview(lastRaw, 400) });
      if (attempt >= MAX_JSON_ATTEMPTS) break;
      messages = [
        ...opts.messages,
        {
          role: "user",
          content: [
            "الرد السابق لم يكن JSON صالحاً أو ناقص البيانات.",
            "أعد الرد بصيغة JSON فقط بدون Markdown وبدون أي شرح خارجي.",
            "الرد السابق:",
            safePreview(lastRaw, 3000),
          ].join("\n"),
        },
      ];
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${opts.step}_failed`);
}

function validateIntent(value: Record<string, unknown>) {
  if (value.difficulty) value.difficulty = normalizeDifficulty(value.difficulty);
}

function validateExamContent(value: Record<string, unknown>) {
  if (!Array.isArray(value.questions) || value.questions.length === 0) throw new Error("questions_missing");
  value.questions.forEach((question: any, index: number) => {
    if (!question || typeof question !== "object") throw new Error(`question_${index + 1}_not_object`);
    if (!String(question.question || question.question_text || question.text || "").trim()) throw new Error(`question_${index + 1}_missing_text`);
  });
}

async function resolveSubjectId(admin: any, profile: any, subjectHint: string | null, context: any) {
  const explicit = context?.subject_id || context?.subjectId;
  if (explicit) {
    const { data } = await admin.from("subjects").select("id, name, stage, grade, section").eq("id", explicit).maybeSingle();
    if (data?.id) return data;
  }

  const { data: active } = await admin
    .from("subjects")
    .select("id, name, stage, grade, section, category")
    .eq("is_active", true)
    .limit(500);
  const { data: fallback } = active?.length ? { data: active } : await admin
    .from("subjects")
    .select("id, name, stage, grade, section, category")
    .limit(500);
  const all = fallback || [];
  if (!all.length) return null;

  const stageKeys = [profile?.stage, stageLabel(profile?.stage)].filter(Boolean).map(normalizeArabic);
  const gradeKeys = [profile?.grade, gradeLabel(profile?.grade)].filter(Boolean).map(normalizeArabic);
  const profilePool = all.filter((subject: any) => {
    const stage = normalizeArabic(subject.stage);
    const grade = normalizeArabic(subject.grade);
    return (!stageKeys.length || stageKeys.includes(stage)) && (!gradeKeys.length || gradeKeys.includes(grade));
  });
  const pool = profilePool.length ? profilePool : all;
  const wanted = normalizeArabic(subjectHint || context?.subject_name || context?.subjectName || "");
  if (wanted) {
    const byName = pool.find((subject: any) => {
      const name = normalizeArabic(subject.name);
      const category = normalizeArabic(subject.category);
      return name.includes(wanted) || wanted.includes(name) || category.includes(wanted) || wanted.includes(category);
    });
    if (byName) return byName;
  }
  return pool[0];
}

function keywordsFrom(text: string, subject: string | null, chapter: string | null) {
  const words = normalizeArabic(`${subject || ""} ${chapter || ""} ${text}`)
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !["امتحان", "اختبار", "مراجعه", "انشئ", "اعمل", "علي", "في", "من"].includes(word));
  return [...new Set(words)].slice(0, 8);
}

async function retrieveStudyContext(admin: any, subjectId: string, query: string, subject: string | null, chapter: string | null, traceId: string) {
  const keys = keywordsFrom(query, subject, chapter);
  const like = keys.length ? `%${keys[0]}%` : `%${String(subject || "").slice(0, 20)}%`;
  const snippets: string[] = [];
  try {
    const [{ data: contentRows }, { data: unitRows }, { data: chunkRows }] = await Promise.all([
      admin
        .from("content")
        .select("title, description, sub_subject, term")
        .eq("subject_id", subjectId)
        .or(`title.ilike.${like},description.ilike.${like},sub_subject.ilike.${like}`)
        .limit(5),
      admin
        .from("knowledge_units")
        .select("title, content_text, page_from, page_to, knowledge_source_versions!inner(source_id, knowledge_sources!inner(title, subject_id))")
        .eq("knowledge_source_versions.knowledge_sources.subject_id", subjectId)
        .or(`title.ilike.${like},content_text.ilike.${like}`)
        .limit(5),
      admin
        .from("content_chunks")
        .select("content, metadata")
        .textSearch("search_tsv", keys.join(" | "), { type: "websearch" })
        .limit(5),
    ]);

    for (const row of contentRows || []) {
      snippets.push(`محتوى: ${row.title}${row.sub_subject ? ` — ${row.sub_subject}` : ""}${row.description ? `\n${row.description}` : ""}`);
    }
    for (const row of unitRows || []) {
      snippets.push(`كتاب/وحدة: ${row.title || "بدون عنوان"}${row.page_from ? ` (ص ${row.page_from}${row.page_to && row.page_to !== row.page_from ? `-${row.page_to}` : ""})` : ""}\n${String(row.content_text || "").slice(0, 900)}`);
    }
    for (const row of chunkRows || []) {
      snippets.push(`مقطع معرفي:\n${String(row.content || "").slice(0, 900)}`);
    }
  } catch (error) {
    logError(traceId, "RETRIEVE_CONTEXT_FAILED_NON_BLOCKING", error);
  }
  return snippets.slice(0, 8).join("\n\n---\n\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  logStep(traceId, "START", { method: req.method });

  try {
    const token = getBearer(req.headers.get("Authorization"));
    const userId = token ? decodeJwtSub(token) : null;
    if (!token || !userId) return failure(traceId, "AUTH_REQUIRED", new Error("missing bearer token"), 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => null);
    if (!body?.messages || !Array.isArray(body.messages)) return json({ error: "messages required" }, 400);
    const { messages, conversationContext = {} } = body;
    const lastUserMsg = [...messages].reverse().find((msg: any) => msg.role === "user");
    const userText = textFromMessage(lastUserMsg);
    if (!userText) return json({ reply: "اكتب طلب الامتحان أولاً." });

    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("id, stage, grade, section, education_type, full_name")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) return failure(traceId, "AUTH_PROFILE", profileError, 401);

    logStep(traceId, "CONTEXT_READY", {
      userId,
      hasProfile: Boolean(profile),
      textChars: userText.length,
      contextKeys: Object.keys(conversationContext || {}),
    });

    const intentSystem = `استخرج طلب امتحان تدريبي من رسالة الطالب وأرجع JSON فقط:
{
  "subject": "اسم المادة أو null",
  "chapter": "الباب/الدرس أو null",
  "mcq_count": number|null,
  "true_false_count": number|null,
  "essay_count": number|null,
  "fill_blank_count": number|null,
  "difficulty": "easy|medium|hard",
  "title_hint": "عنوان مناسب أو null"
}
إذا لم يحدد الطالب أعداد الأسئلة استخدم: mcq=${DEFAULT_COUNTS.mcq}, true_false=${DEFAULT_COUNTS.trueFalse}, essay=${DEFAULT_COUNTS.essay}.`;

    const intent = await callJsonWithRetry({
      admin,
      traceId,
      step: "INTENT",
      validate: validateIntent,
      messages: [
        { role: "system", content: intentSystem },
        { role: "user", content: userText },
      ],
    }).catch((error) => { throw Object.assign(error, { phase: "AI_INTENT" }); });

    const subjectHint = String(intent.subject || conversationContext?.subject_name || inferSubjectFromText(userText) || "").trim() || null;
    const chapter = String(intent.chapter || conversationContext?.chapter || "").trim() || null;
    const subjectRow = await resolveSubjectId(admin, profile, subjectHint, conversationContext);
    if (!subjectRow?.id) return failure(traceId, "SUBJECT_RESOLVE", new Error("No subject matched"));

    const difficulty = normalizeDifficulty(intent.difficulty);
    const mcq = Math.max(0, Math.min(20, Number(intent.mcq_count ?? DEFAULT_COUNTS.mcq) || 0));
    const trueFalse = Math.max(0, Math.min(20, Number(intent.true_false_count ?? DEFAULT_COUNTS.trueFalse) || 0));
    const essay = Math.max(0, Math.min(10, Number(intent.essay_count ?? DEFAULT_COUNTS.essay) || 0));
    const fillBlank = Math.max(0, Math.min(10, Number(intent.fill_blank_count ?? DEFAULT_COUNTS.fillBlank) || 0));
    const requestedTotal = mcq + trueFalse + essay + fillBlank;
    if (requestedTotal <= 0) return json({ reply: "حدّد عدد الأسئلة أو نوع الامتحان المطلوب." });

    const studyContext = await retrieveStudyContext(admin, subjectRow.id, userText, subjectHint, chapter, traceId);
    logStep(traceId, "SUBJECT_AND_RETRIEVAL_READY", {
      subjectId: subjectRow.id,
      subjectName: subjectRow.name,
      hasStudyContext: Boolean(studyContext),
      requestedTotal,
      difficulty,
    });

    const studentLevel = [stageLabel(profile?.stage), gradeLabel(profile?.grade), profile?.education_type === "azhar" ? "أزهر" : "عام", profile?.section]
      .filter(Boolean)
      .join(" - ");
    const genSystem = `أنت منشئ امتحانات عربي محترف داخل منصة مدرك Plus.
أنشئ امتحاناً تدريبياً لا يؤثر على الدرجات الرسمية، لكنه يجب أن يستخدم نفس جودة امتحانات المعلم.

بيانات الطالب: ${studentLevel || "غير محدد"}
المادة: ${subjectHint || subjectRow.name || "المادة المناسبة"}
${chapter ? `الدرس/الباب المطلوب: ${chapter}` : ""}
الصعوبة: ${difficulty}

سياق مسترجع من محتوى المادة/الكتب إن وجد:
${studyContext || "لا يوجد سياق نصي مسترجع؛ اعتمد على المنهج المناسب للمادة والصف دون ذكر أنك لا تملك سياقاً."}

أرجع JSON فقط بهذه البنية:
{
  "title": "عنوان واضح للامتحان",
  "description": "وصف قصير",
  "questions": [
    {
      "type": "mcq" | "true_false" | "essay" | "fill_blank" | "short_answer",
      "question": "نص السؤال",
      "options": ["...","...","...","..."] أو ["صح","خطأ"] أو null,
      "correct_answer": "الإجابة الصحيحة أو نص الخيار الصحيح",
      "explanation": "شرح مختصر للإجابة",
      "marks": 1
    }
  ]
}

التوزيع المطلوب بالضبط قدر الإمكان: mcq=${mcq}, true_false=${trueFalse}, essay=${essay}, fill_blank=${fillBlank}.
قواعد إلزامية:
- لا تضع أسئلة فارغة.
- كل سؤال اختيار يجب أن يحتوي 4 اختيارات واضحة وخياراً صحيحاً مطابقاً لنص أحد الاختيارات.
- أسئلة صح/خطأ اختياراتها فقط: صح، خطأ.
- لا تخرج عن JSON.`;

    const generated = await callJsonWithRetry({
      admin,
      traceId,
      step: "GENERATE_EXAM",
      validate: validateExamContent,
      messages: [
        { role: "system", content: genSystem },
        { role: "user", content: `طلب الطالب: ${userText}` },
      ],
    }).catch((error) => { throw Object.assign(error, { phase: "AI_GENERATE" }); });

    const normalizedQuestions = (generated.questions as any[])
      .map((question, index) => normalizeQuestion(question, index))
      .filter((question) => question.question.trim().length > 0);
    if (!normalizedQuestions.length) return failure(traceId, "AI_NO_VALID_QUESTIONS", new Error("No normalized questions"));

    const totalMarks = normalizedQuestions.reduce((sum, question) => sum + question.marks, 0);
    const durationMinutes = Math.max(10, Math.min(120, Math.ceil(normalizedQuestions.length * 2.5)));
    const examTitle = String(generated.title || intent.title_hint || `امتحان تدريبي في ${subjectHint || subjectRow.name || "المادة"}`).trim();
    const payload = {
      title: examTitle,
      description: generated.description || `امتحان تدريبي مولد بواسطة Modrek AI${chapter ? ` على ${chapter}` : ""}`,
      duration_minutes: durationMinutes,
      total_marks: totalMarks,
      pass_marks: Math.ceil(totalMarks * 0.5),
      difficulty,
      subject_id: subjectRow.id,
      term: conversationContext?.term || "term1",
      questions: normalizedQuestions,
    };

    logStep(traceId, "SAVE_TRAINING_EXAM_START", {
      subjectId: subjectRow.id,
      questionCount: normalizedQuestions.length,
      totalMarks,
    });
    const { data: created, error: createError } = await userClient.rpc("create_modrek_ai_training_exam", { _payload: payload } as any);
    if (createError) return failure(traceId, "SAVE_TRAINING_EXAM", createError);
    if (!created?.success || !created?.examId) return failure(traceId, "SAVE_TRAINING_EXAM", new Error(created?.error || "training exam RPC returned no exam"));

    logStep(traceId, "SAVE_TRAINING_EXAM_OK", {
      examId: created.examId,
      attemptId: created.attemptId || null,
      questionCount: created.questionCount,
      answerCount: created.answerCount,
    });

    return json({
      examId: created.examId,
      attemptId: created.attemptId || null,
      title: examTitle,
      questionCount: created.questionCount || normalizedQuestions.length,
      redirectTo: `/student/exams/${created.examId}/take`,
      reply: `تم إنشاء **${examTitle}** — ${created.questionCount || normalizedQuestions.length} سؤال، مدة الحل ${durationMinutes} دقيقة.`,
    });
  } catch (error: any) {
    if (error?.message === "rate_limited") return failure(traceId, "AI_RATE_LIMIT", error, 429);
    if (error?.message === "credits_exhausted") return failure(traceId, "AI_CREDITS", error, 402);
    return failure(traceId, error?.phase || "UNHANDLED_EXCEPTION", error);
  }
});
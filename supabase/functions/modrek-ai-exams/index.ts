// Modrek AI - Exams assistant.
// Understands a natural-language request, extracts intent, and creates a real
// exam (exam + questions + choices + attempt + blank answers) that the student
// takes using the existing exam engine.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { callGeminiWithFallback, loadAiSettings, resolveGeminiApiKey } from "../_shared/aiSettings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FUNCTION_NAME = "modrek-ai-exams";
const SAFE_FAILURE_REPLY = "تعذر إنشاء الامتحان.";
const MAX_JSON_ATTEMPTS = 3;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safePreview(value: unknown, max = 800): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function logStep(traceId: string, step: string, details: Record<string, unknown> = {}) {
  console.log(`[${FUNCTION_NAME}] ${step}`, JSON.stringify({ traceId, ...details }));
}

function logError(traceId: string, step: string, error: unknown, details: Record<string, unknown> = {}) {
  let message = "Unknown error";
  let stack: string | undefined;
  if (error instanceof Error) {
    message = error.message;
    stack = error.stack;
  } else if (typeof error === "string") {
    message = error;
  } else if (error && typeof error === "object") {
    const anyErr: any = error;
    const extracted = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code]
      .filter((part) => typeof part === "string" && part.trim())
      .join(" | ");
    if (extracted) {
      message = extracted;
    } else {
      try { message = JSON.stringify(error); } catch { message = Object.prototype.toString.call(error); }
    }
  }
  console.error(`[${FUNCTION_NAME}] ${step}`, JSON.stringify({
    traceId,
    message,
    stack,
    ...details,
  }));
}

function failure(traceId: string, code: string, error: unknown, status = 500) {
  const anyErr: any = error ?? {};
  const message = typeof anyErr?.message === "string" && anyErr.message
    ? anyErr.message
    : (error instanceof Error ? error.message : "");
  const details = anyErr?.details || anyErr?.hint || anyErr?.code || "";
  let fallback = "";
  if (!message && !details) {
    try { fallback = JSON.stringify(error); } catch { fallback = String(error); }
    if (fallback === "{}") fallback = String(error);
  }
  const detail = [message, details].filter(Boolean).join(" | ") || fallback || "Unknown error";
  const err = error instanceof Error ? error : new Error(detail);
  logError(traceId, `FAIL_${code}`, err, { status, raw: anyErr });
  const reason = `[${code}] ${detail}`.slice(0, 800);
  const publicReason = publicFailureReason(code, detail);
  const publicFull = `${publicReason}\n\nتفاصيل تقنية: ${detail.slice(0, 400)}`;
  return json({
    reply: `${SAFE_FAILURE_REPLY}\n\n${publicFull}\n\nمعرّف التتبع: ${traceId}`,
    error: reason,
    errorCode: code,
    publicMessage: publicFull,
    traceId,
  }, status);
}

function publicFailureReason(code: string, detail: string): string {
  const lower = String(detail || "").toLowerCase();
  if (code.includes("INTENT") || code.includes("GENERATE") || code.includes("JSON")) {
    return "سبب الفشل: لم يرجع نموذج الذكاء الاصطناعي صيغة امتحان صالحة بعد إعادة المحاولة.";
  }
  if (code.includes("OPENROUTER") || lower.includes("gateway") || lower.includes("rate_limited") || lower.includes("credits")) {
    return "سبب الفشل: خدمة الذكاء الاصطناعي غير متاحة مؤقتاً أو عليها ضغط.";
  }
  if (code.includes("CREATE_MODREK_AI_EXAM") || lower.includes("subject") || lower.includes("questions") || lower.includes("constraint")) {
    return "سبب الفشل: فشل حفظ الامتحان في قاعدة البيانات أثناء مرحلة إنشاء الامتحان.";
  }
  if (code.includes("NO_SUBJECT")) {
    return "سبب الفشل: لم يتم العثور على مادة مناسبة لحساب الطالب.";
  }
  return "سبب الفشل: حدث خطأ داخلي أثناء تجهيز الامتحان، وتم تسجيل التفاصيل للتشخيص.";
}

function stageLabel(s?: string | null) {
  if (s === "preparatory") return "المرحلة الإعدادية";
  if (s === "secondary") return "المرحلة الثانوية";
  return null;
}
function gradeLabel(g?: string | null) {
  if (g === "first") return "الصف الأول";
  if (g === "second") return "الصف الثاني";
  if (g === "third") return "الصف الثالث";
  return null;
}

function stripJsonFence(s: string): string {
  const t = String(s || "").trim();
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (m ? m[1] : t).trim();
}

function extractJsonObject(s: string): string {
  const stripped = stripJsonFence(s)
    .replace(/[\u0000-\u001F\u007F]/g, (ch) => (ch === "\n" || ch === "\r" || ch === "\t" ? ch : " "))
    .trim();
  if (stripped.startsWith("{") && stripped.endsWith("}")) return stripped;

  const start = stripped.indexOf("{");
  if (start < 0) return stripped;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) return stripped.slice(start, i + 1).replace(/,\s*([}\]])/g, "$1");
  }

  const end = stripped.lastIndexOf("}");
  if (end > start) return stripped.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1");
  return stripped;
}

function parseAiJson(text: string, traceId: string, step: string): any {
  const candidate = extractJsonObject(text);
  try {
    return JSON.parse(candidate);
  } catch (error) {
    logError(traceId, `${step}_JSON_PARSE_FAILED`, error, { rawPreview: safePreview(text), candidatePreview: safePreview(candidate) });
    throw new Error(`${step}_invalid_json`);
  }
}

function ensureObject(value: unknown, step: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${step}_not_json_object`);
  }
  return value as Record<string, unknown>;
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

function inferSubjectFromText(text: string): string | null {
  const normalized = String(text || "").trim();
  const known = [
    "الحديث", "القرآن", "التفسير", "الفقه", "التوحيد", "السيرة",
    "اللغة العربية", "العربي", "النحو", "الصرف", "البلاغة", "الأدب", "النصوص",
    "الرياضيات", "الجبر", "الهندسة", "الفيزياء", "الكيمياء", "الأحياء", "العلوم",
    "التاريخ", "الجغرافيا", "الدراسات", "الفلسفة", "المنطق", "الإنجليزي", "اللغة الإنجليزية",
  ];
  return known.find((name) => normalized.includes(name)) || null;
}

function normalizeQuestionType(input: unknown): "mcq" | "true_false" | "essay" | "fill_blank" {
  const value = String(input || "").toLowerCase().trim();
  if (["true_false", "tf", "صح وخطأ", "صح/خطأ"].includes(value)) return "true_false";
  if (["essay", "مقالي", "مقال"].includes(value)) return "essay";
  if (["fill_blank", "fill", "اكمل", "أكمل"].includes(value)) return "fill_blank";
  return "mcq";
}

function normalizeQuestion(raw: any, index: number, difficulty: "easy" | "medium" | "hard") {
  const type = normalizeQuestionType(raw?.type || raw?.question_type);
  const question = String(raw?.question || raw?.question_text || raw?.text || `سؤال ${index + 1}`).trim();
  const marks = Math.max(1, Math.min(10, Number(raw?.marks || raw?.points || 1) || 1));
  const correctAnswer = String(raw?.correct_answer || raw?.answer || raw?.model_answer || "").trim();
  const explanation = raw?.explanation ? String(raw.explanation) : null;

  if (type === "true_false") {
    return { type, question, marks, difficulty, correct_answer: /خطأ|false|غير صحيح/i.test(correctAnswer) ? "خطأ" : "صح", options: ["صح", "خطأ"], explanation };
  }

  if (type === "essay" || type === "fill_blank") {
    return { type, question, marks, difficulty, correct_answer: correctAnswer || "إجابة نموذجية تُقبل بالمعنى الصحيح.", options: null, explanation };
  }

  let options = Array.isArray(raw?.options) ? raw.options.map((x: unknown) => String(x).trim()).filter(Boolean) : [];
  if (options.length < 2 && raw?.choices && Array.isArray(raw.choices)) {
    options = raw.choices.map((x: unknown) => String(x).trim()).filter(Boolean);
  }
  while (options.length < 4) options.push(["اختيار أ", "اختيار ب", "اختيار ج", "اختيار د"][options.length]);
  options = options.slice(0, 4);
  const correct = correctAnswer || options[0];
  return { type: "mcq" as const, question, marks, difficulty, correct_answer: correct, options, explanation };
}

let cachedGeminiKey: string | null = null;
async function getGeminiKey(): Promise<string> {
  if (cachedGeminiKey) return cachedGeminiKey;
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const { apiKey } = await resolveGeminiApiKey(admin, Deno.env.get("GEMINI_API_KEY") || "");
  cachedGeminiKey = apiKey;
  return apiKey;
}

async function callGateway(messages: any[], traceId: string, step: string) {
  const apiKey = await getGeminiKey();
  if (!apiKey) throw new Error("openrouter_api_key_missing");
  const settingsClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const settings = await loadAiSettings(settingsClient, FUNCTION_NAME);
  const body: Record<string, unknown> = {
    temperature: 0.2,
    messages,
    response_format: { type: "json_object" },
  };
  logStep(traceId, `${step}_CALL_OPENROUTER`, { modelCount: settings.models_to_try.length, models: settings.models_to_try, messageCount: messages.length, promptChars: safePreview(messages.map((m) => m.content).join("\n"), 120).length });
  const result = await callGeminiWithFallback({
    apiKey,
    models: settings.models_to_try,
    body,
    fallbackDelayMs: settings.fallback_delay_ms,
    timeoutMs: 60000,
  });
  if (!result.ok) {
    logError(traceId, `${step}_OPENROUTER_FAILED`, new Error(result.lastError || "OpenRouter failed"), { httpStatus: result.status, responseBody: safePreview(result.lastError, 500) });
    if (result.status === 429) throw new Error("rate_limited");
    if (result.status === 402) throw new Error("credits_exhausted");
    if (result.status === 401 || result.status === 403) throw new Error("openrouter_auth_failed");
    if (result.status === 0) throw new Error("openrouter_timeout_or_network");
    throw new Error("gateway_error");
  }
  logStep(traceId, `${step}_OPENROUTER_OK`, { model: result.model, provider: result.provider });
  const data = await result.response.json().catch(() => ({} as any));
  const content = data?.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error(`${step}_empty_response`);
  logStep(traceId, `${step}_RECEIVE_RESPONSE`, { contentChars: String(content).length, preview: safePreview(content, 240) });
  return content;
}

async function callJsonWithRetry(opts: {
  messages: any[];
  traceId: string;
  step: string;
  validate: (value: any) => void;
}) {
  let lastRaw = "";
  let lastError: unknown = null;
  let messages = opts.messages;

  for (let attempt = 1; attempt <= MAX_JSON_ATTEMPTS; attempt++) {
    try {
      logStep(opts.traceId, `${opts.step}_JSON_ATTEMPT`, { attempt });
      lastRaw = await callGateway(messages, opts.traceId, opts.step);
      const parsed = ensureObject(parseAiJson(lastRaw, opts.traceId, opts.step), opts.step);
      opts.validate(parsed);
      return parsed;
    } catch (error) {
      lastError = error;
      logError(opts.traceId, `${opts.step}_JSON_ATTEMPT_FAILED`, error, { attempt, rawPreview: safePreview(lastRaw, 400) });
      if (attempt >= MAX_JSON_ATTEMPTS) break;
      messages = [
        ...opts.messages,
        {
          role: "user",
          content: [
            "الرد السابق لم يكن JSON صالحاً أو لم يطابق البنية المطلوبة.",
            "أعد الرد الآن بصيغة JSON فقط بدون Markdown وبدون شرح وبدون نص قبل أو بعد JSON.",
            "الرد السابق:",
            safePreview(lastRaw, 3500),
          ].join("\n"),
        },
      ];
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${opts.step}_json_retry_failed`);
}

function validateIntent(value: any) {
  if (!value || typeof value !== "object") throw new Error("intent_not_object");
  if (value.difficulty && !["سهل", "متوسط", "صعب", "easy", "medium", "hard"].includes(String(value.difficulty))) {
    value.difficulty = "متوسط";
  }
}

function validateExamContent(value: any) {
  if (!value || typeof value !== "object") throw new Error("exam_content_not_object");
  if (!Array.isArray(value.questions) || value.questions.length === 0) throw new Error("exam_questions_missing");
  value.questions.forEach((q: any, idx: number) => {
    if (!q || typeof q !== "object") throw new Error(`question_${idx + 1}_not_object`);
    const question = String(q.question || q.question_text || q.text || "").trim();
    if (!question) throw new Error(`question_${idx + 1}_text_missing`);
    const type = normalizeQuestionType(q.type || q.question_type);
    if ((type === "mcq" || type === "true_false") && !Array.isArray(q.options)) {
      throw new Error(`question_${idx + 1}_options_missing`);
    }
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  logStep(traceId, "START", { method: req.method });

  try {
    const auth = req.headers.get("Authorization") || "";
    logStep(traceId, "RECEIVE_REQUEST", {
      hasAuth: auth.startsWith("Bearer "),
      contentType: req.headers.get("content-type"),
      clientInfo: req.headers.get("x-client-info"),
    });
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = auth.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      logError(traceId, "VALIDATE_USER_FAILED", userErr || new Error("missing user"));
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;
    logStep(traceId, "VALIDATE_USER_OK", { userId });

    const body = await req.json().catch(() => null);
    if (!body?.messages || !Array.isArray(body.messages)) return json({ error: "messages required" }, 400);
    const { messages, conversationContext = {} } = body;
    logStep(traceId, "VALIDATE_BODY_OK", { messageCount: messages.length, hasContext: Boolean(conversationContext && Object.keys(conversationContext).length) });

    const { data: profile } = await supabase
      .from("profiles")
      .select("stage, grade, section, education_type, full_name")
      .eq("id", userId)
      .maybeSingle();
    logStep(traceId, "LOAD_PROFILE", { hasProfile: Boolean(profile), stage: profile?.stage || null, grade: profile?.grade || null, educationType: profile?.education_type || null });

    const eduType = profile?.education_type === "azhar" ? "الأزهر" : "التعليم العام";
    const stage = stageLabel(profile?.stage);
    const grade = gradeLabel(profile?.grade);
    const section = profile?.section || null;

    // Step 1: Extract intent (subject, chapter, counts, difficulty)
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
    const userText = textFromMessage(lastUserMsg);
    logStep(traceId, "LOAD_PROMPT", { userTextChars: userText.length, userTextPreview: safePreview(userText, 180) });

    const intentSystem = `استخرج بيانات طلب الامتحان من رسالة الطالب وأرجع JSON فقط بالبنية:
{
  "subject": "اسم المادة أو null",
  "chapter": "الباب/الدرس أو null",
  "mcq_count": عدد أو null,
  "true_false_count": عدد أو null,
  "essay_count": عدد أو null,
  "fill_blank_count": عدد أو null,
  "difficulty": "سهل|متوسط|صعب",
  "reference": "امتحان مرجعي مذكور أو null",
  "needs_subject": true إذا لم تُذكر المادة ولا يوجد سياق ثابت
}
سياق المحادثة الثابت: ${JSON.stringify(conversationContext || {})}
إذا لم يحدد الطالب أعدادًا، استخدم القيم الافتراضية: mcq=5, true_false=3, essay=2.`;

    let intent: any;
    try {
      intent = await callJsonWithRetry({
        traceId,
        step: "INTENT",
        validate: validateIntent,
        messages: [
        { role: "system", content: intentSystem },
        { role: "user", content: userText },
      ],
      });
      logStep(traceId, "INTENT_PARSED", { intent });
    } catch (e: any) {
      if (e.message === "rate_limited") return json({ error: "تم تجاوز حد الاستخدام. حاول بعد قليل." }, 429);
      if (e.message === "credits_exhausted") return json({ error: "نفدت رصيد خدمة الذكاء الاصطناعي." }, 402);
      return failure(traceId, "INTENT_PARSE_OR_GATEWAY", e);
    }

    const subject = intent.subject || conversationContext?.subject_name || inferSubjectFromText(userText) || null;
    const subjectLabel = subject || "المادة المناسبة لصف الطالب";
    if (!subject) {
      logStep(traceId, "SUBJECT_NOT_EXPLICIT", { action: "will_use_profile_fallback_subject" });
    }

    const mcq = Math.max(0, Math.min(20, intent.mcq_count ?? 5));
    const tf = Math.max(0, Math.min(20, intent.true_false_count ?? 3));
    const essay = Math.max(0, Math.min(10, intent.essay_count ?? 2));
    const fill = Math.max(0, Math.min(10, intent.fill_blank_count ?? 0));
    const total = mcq + tf + essay + fill;
    if (total === 0) return json({ reply: "حدّد عدد الأسئلة المطلوبة." });

    const difficulty = ["easy", "medium", "hard"].includes(intent.difficulty)
      ? intent.difficulty
      : (intent.difficulty === "سهل" ? "easy" : intent.difficulty === "صعب" ? "hard" : "medium");

    // Step 2: Generate questions
    const genSystem = `أنشئ امتحانًا احترافيًا باللغة العربية.
معلومات الطالب: ${stage || ""} - ${grade || ""} - ${eduType}${section ? ` - ${section}` : ""}.
المادة: ${subjectLabel}
${intent.chapter || conversationContext?.chapter ? `الباب/الدرس: ${intent.chapter || conversationContext?.chapter}` : ""}
${intent.reference ? `المرجع المطلوب: ${intent.reference} (استلهم منه، لا تنسخ)` : ""}
الصعوبة: ${difficulty}

أرجع JSON فقط بالبنية:
{
  "title": "عنوان الامتحان",
  "description": "وصف قصير",
  "questions": [
    {
      "type": "mcq" | "true_false" | "essay" | "fill_blank",
      "question": "نص السؤال",
      "options": ["أ","ب","ج","د"] (فقط لـ mcq)  |  ["صح","خطأ"] (لـ true_false)  |  null,
      "correct_answer": "الإجابة الصحيحة (نص الخيار أو رقمه للـ mcq، صح/خطأ للـ true_false)",
      "explanation": "شرح مختصر للإجابة",
      "marks": 1
    }
  ]
}
عدد الأسئلة المطلوبة: mcq=${mcq}, true_false=${tf}, essay=${essay}, fill_blank=${fill}.
كل سؤال يجب أن يكون واضحًا ومناسبًا للمستوى.`;

    let examContent: any;
    try {
      examContent = await callJsonWithRetry({
        traceId,
        step: "GENERATE_EXAM",
        validate: validateExamContent,
        messages: [
        { role: "system", content: genSystem },
        { role: "user", content: `أنشئ الامتحان الآن.` },
      ],
      });
      logStep(traceId, "GENERATE_EXAM_PARSED", { title: examContent?.title || null, questionCount: Array.isArray(examContent?.questions) ? examContent.questions.length : 0 });
    } catch (e: any) {
      if (e.message === "rate_limited") return json({ error: "تم تجاوز حد الاستخدام." }, 429);
      if (e.message === "credits_exhausted") return json({ error: "نفدت رصيد الذكاء الاصطناعي." }, 402);
      return failure(traceId, "GENERATE_OR_PARSE", e);
    }

    if (!Array.isArray(examContent?.questions) || examContent.questions.length === 0) {
      return failure(traceId, "NO_VALID_QUESTIONS", new Error("AI returned no questions"));
    }

    const normalizedQuestions = examContent.questions
      .map((q: any, idx: number) => normalizeQuestion(q, idx, difficulty))
      .filter((q: any) => q.question && q.question.trim().length > 0);
    if (normalizedQuestions.length === 0) {
      return failure(traceId, "NO_NORMALIZED_QUESTIONS", new Error("No normalized questions"));
    }

    const totalMarks = normalizedQuestions.reduce((s: number, q: any) => s + Number(q.marks || 1), 0);
    const durationMinutes = Math.max(10, Math.ceil(total * 2.5));

    // Resolve a valid subject_id for the exam (schema requires NOT NULL).
    // Strategy: try to match student's profile (stage/grade) + subject name; fallback to any active subject for the profile; final fallback to any active subject.
    async function resolveSubjectId(): Promise<string | null> {
      const { data: active } = await admin.from("subjects").select("id, name, stage, grade, section").eq("is_active", true);
      const { data: anySubjects } = active?.length ? { data: active } : await admin.from("subjects").select("id, name, stage, grade, section").limit(100);
      const all = anySubjects || [];
      if (!all || all.length === 0) return null;
      const stageKeys = [profile?.stage, profile?.stage === "secondary" ? "ثانوي" : profile?.stage === "preparatory" ? "إعدادي" : null].filter(Boolean);
      const gradeKeys = [profile?.grade, profile?.grade === "first" ? "الصف الأول" : profile?.grade === "second" ? "الصف الثاني" : profile?.grade === "third" ? "الصف الثالث" : null].filter(Boolean);
      const inProfile = all.filter((s: any) =>
        (stageKeys.length === 0 || stageKeys.includes(s.stage)) &&
        (gradeKeys.length === 0 || gradeKeys.includes(s.grade)),
      );
      const pool = inProfile.length > 0 ? inProfile : all;
      const wanted = String(subject || inferSubjectFromText(userText) || "").trim();
      const byName = wanted
        ? pool.find((s: any) => String(s.name).includes(wanted) || wanted.includes(String(s.name)))
        : null;
      return (byName || pool[0])?.id || null;
    }

    const resolvedSubjectId = await resolveSubjectId();
    if (!resolvedSubjectId) {
      return failure(traceId, "NO_SUBJECT_ID", new Error("No active subjects available"));
    }
    logStep(traceId, "RESOLVE_SUBJECT", { subject: subject || null, resolvedSubjectId });

    // Step 3: Persist exam atomically through the database RPC.
    // This avoids partial exams and uses auth.uid() inside the DB, so the
    // student owner is always correct even when Edge runtime service-role
    // configuration differs between environments.
    logStep(traceId, "SAVE_EXAM_START", { totalMarks, durationMinutes });
    const examTitle = examContent.title || `امتحان في ${subjectLabel}`;
    const createPayload = {
      title: examTitle,
      description: examContent.description || null,
      duration_minutes: durationMinutes,
      total_marks: totalMarks,
      pass_marks: Math.ceil(totalMarks * 0.5),
      difficulty,
      subject_id: resolvedSubjectId,
      questions: normalizedQuestions.map((q: any) => ({
        type: q.type,
        question: String(q.question || "").trim(),
        marks: Number(q.marks || 1),
        correct_answer: String(q.correct_answer ?? "").trim(),
        options: Array.isArray(q.options) ? q.options : null,
        explanation: q.explanation ? String(q.explanation) : null,
      })),
    };
    logStep(traceId, "CREATE_RPC_CALL", { rpc: "create_modrek_ai_exam", payload: { ...createPayload, questions: `[${normalizedQuestions.length} questions]` } });
    const { data: createdRaw, error: createErr } = await supabase.rpc("create_modrek_ai_exam", {
      _payload: createPayload,
    });

    const created = createdRaw as any;
    if (createErr || !created?.examId) {
      return failure(traceId, "CREATE_MODREK_AI_EXAM", createErr || new Error("No exam returned from create_modrek_ai_exam"));
    }

    logStep(traceId, "SAVE_EXAM_OK", {
      examId: created.examId,
      attemptId: created.attemptId || null,
      questionCount: created.questionCount || normalizedQuestions.length,
      answerCount: created.answerCount || 0,
    });

    logStep(traceId, "REDIRECT_READY", { examId: created.examId, attemptId: created.attemptId || null, path: `/student/exams/${created.examId}/take` });
    return json({
      examId: created.examId,
      attemptId: created.attemptId || null,
      title: examTitle,
      questionCount: created.questionCount || normalizedQuestions.length,
      redirectTo: `/student/exams/${created.examId}/take`,
      reply: `تم إنشاء **${examTitle}** — ${created.questionCount || normalizedQuestions.length} سؤال، مدة الحل ${durationMinutes} دقيقة.`,
    });
  } catch (e) {
    return failure(traceId, "UNHANDLED_EXCEPTION", e);
  }
});

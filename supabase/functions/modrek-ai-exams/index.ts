// Modrek AI - Exams assistant.
// Understands a natural-language request, extracts intent, and creates a real
// exam (exam + questions + choices + attempt + blank answers) that the student
// takes using the existing exam engine.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { callGeminiWithFallback, resolveGeminiApiKey } from "../_shared/aiSettings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FUNCTION_NAME = "modrek-ai-exams";
const SAFE_FAILURE_REPLY = "تعذر إنشاء الامتحان حالياً، جاري إعادة المحاولة...";

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
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(`[${FUNCTION_NAME}] ${step}`, JSON.stringify({
    traceId,
    message: err.message,
    stack: err.stack,
    ...details,
  }));
}

function failure(traceId: string, code: string, error: unknown, status = 500) {
  const err = error instanceof Error ? error : new Error(String(error));
  logError(traceId, `FAIL_${code}`, err, { status });
  const detail = (err as any)?.details || (err as any)?.hint || err.message || String(error);
  const reason = `[${code}] ${detail}`.slice(0, 800);
  return json({
    reply: `${SAFE_FAILURE_REPLY}\n\nسبب الفشل: ${reason}\nمعرّف التتبع: ${traceId}`,
    error: reason,
    errorCode: code,
    traceId,
  }, status);
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
  const body: Record<string, unknown> = { temperature: 0.25, messages };
  logStep(traceId, `${step}_CALL_OPENROUTER`, { modelCount: 2, messageCount: messages.length, promptChars: safePreview(messages.map((m) => m.content).join("\n"), 120).length });
  const result = await callGeminiWithFallback({
    apiKey,
    models: ["google/gemini-2.5-flash", "google/gemini-2.5-flash-lite"],
    body,
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
      const raw = await callGateway([
        { role: "system", content: intentSystem },
        { role: "user", content: userText },
      ], traceId, "INTENT");
      intent = parseAiJson(raw, traceId, "INTENT");
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
      const raw = await callGateway([
        { role: "system", content: genSystem },
        { role: "user", content: `أنشئ الامتحان الآن.` },
      ], traceId, "GENERATE_EXAM");
      examContent = parseAiJson(raw, traceId, "GENERATE_EXAM");
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

    // Step 3: Insert exam using service role (student is owner)
    logStep(traceId, "SAVE_EXAM_START", { totalMarks, durationMinutes });
    const { data: exam, error: examErr } = await admin
      .from("exams")
      .insert({
        title: examContent.title || `امتحان في ${subjectLabel}`,
        description: examContent.description || null,
        duration_minutes: durationMinutes,
        total_marks: totalMarks,
        pass_marks: Math.ceil(totalMarks * 0.5),
        status: "published",
        is_published: true,
        is_ai_generated: true,
        difficulty,
        source: "modrek_ai",
        owner_student_id: userId,
        teacher_id: null,
        subject_id: resolvedSubjectId,
        show_results_immediately: true,
        show_correct_answers: true,
        shuffle_questions: false,
        shuffle_options: true,
        max_attempts: 999,
      })
      .select()
      .single();

    if (examErr || !exam) {
      return failure(traceId, "INSERT_EXAM", examErr || new Error("No exam returned"));
    }
    logStep(traceId, "SAVE_EXAM_OK", { examId: exam.id });

    // Insert questions
    const questionRows = normalizedQuestions.map((q: any, idx: number) => {
      return {
        exam_id: exam.id,
        order_index: idx + 1,
        question_type: q.type,
        question_text: String(q.question || "").trim(),
        marks: Number(q.marks || 1),
        difficulty,
        correct_answer: String(q.correct_answer ?? "").trim(),
        explanation: q.explanation ? String(q.explanation) : null,
      };
    });

    const { data: insertedQsRaw, error: qErr } = await admin
      .from("exam_questions")
      .insert(questionRows)
      .select("id, order_index, question_type");

    if (qErr) {
      await admin.from("exams").delete().eq("id", exam.id);
      return failure(traceId, "INSERT_QUESTIONS", qErr);
    }
    const insertedQs = (insertedQsRaw || []).sort((a: any, b: any) => Number(a.order_index || 0) - Number(b.order_index || 0));
    logStep(traceId, "SAVE_QUESTIONS_OK", { questionCount: insertedQs?.length || 0 });

    // Insert options for mcq / true_false
    const optionRows: any[] = [];
    for (let i = 0; i < insertedQs.length; i++) {
      const q = insertedQs[i];
      const src = normalizedQuestions[i];
      if (q.question_type === "mcq" && Array.isArray(src.options)) {
        src.options.forEach((opt: string, oi: number) => {
          const optText = String(opt).trim();
          const correct = String(src.correct_answer ?? "").trim();
          const isCorrect = optText === correct
            || correct === String(oi + 1)
            || correct.toLowerCase() === String.fromCharCode(97 + oi)
            || correct === ["أ","ب","ج","د","هـ"][oi];
          optionRows.push({
            question_id: q.id,
            option_text: optText,
            is_correct: isCorrect,
            order_index: oi + 1,
          });
        });
      } else if (q.question_type === "true_false") {
        const correct = String(src.correct_answer ?? "").trim();
        ["صح", "خطأ"].forEach((label, oi) => {
          optionRows.push({
            question_id: q.id,
            option_text: label,
            is_correct: label === correct || (label === "صح" && /true|صح|صحيح/i.test(correct)) || (label === "خطأ" && /false|خطأ|خاطئ/i.test(correct)),
            order_index: oi + 1,
          });
        });
      }
    }
    if (optionRows.length > 0) {
      const { error: optErr } = await admin.from("exam_question_options").insert(optionRows);
      if (optErr) {
        await admin.from("exams").delete().eq("id", exam.id);
        return failure(traceId, "INSERT_OPTIONS", optErr);
      }
    }
    logStep(traceId, "SAVE_OPTIONS_OK", { optionCount: optionRows.length });

    const { data: attempt, error: attemptErr } = await admin
      .from("exam_attempts")
      .insert({
        exam_id: exam.id,
        student_id: userId,
        attempt_number: 1,
        max_score: totalMarks,
        status: "in_progress",
      })
      .select("id")
      .single();

    if (attemptErr) {
      await admin.from("exams").delete().eq("id", exam.id);
      return failure(traceId, "CREATE_ATTEMPT", attemptErr);
    }
    logStep(traceId, "CREATE_ATTEMPT_OK", { attemptId: attempt?.id || null });

    if (attempt?.id) {
      const answerRows = insertedQs.map((q: any) => ({
        attempt_id: attempt.id,
        question_id: q.id,
        selected_option_ids: [],
        answer_text: null,
        marks_awarded: 0,
        is_correct: null,
      }));
      const { error: answerErr } = await admin.from("exam_answers").insert(answerRows);
      if (answerErr) {
        await admin.from("exams").delete().eq("id", exam.id);
        return failure(traceId, "CREATE_ATTEMPT_ANSWERS", answerErr);
      }
      logStep(traceId, "CREATE_ATTEMPT_ANSWERS_OK", { answerCount: answerRows.length });
    }

    logStep(traceId, "REDIRECT_READY", { examId: exam.id, attemptId: attempt?.id || null, path: `/student/exams/${exam.id}/take` });
    return json({
      examId: exam.id,
      attemptId: attempt?.id || null,
      title: exam.title,
      questionCount: insertedQs.length,
      redirectTo: `/student/exams/${exam.id}/take`,
      reply: `تم إنشاء **${exam.title}** — ${insertedQs.length} سؤال، مدة الحل ${durationMinutes} دقيقة.`,
    });
  } catch (e) {
    return failure(traceId, "UNHANDLED_EXCEPTION", e);
  }
});

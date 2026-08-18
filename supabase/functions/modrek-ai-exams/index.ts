// Modrek AI Exams — canonical training-exam generator.
// AI is only the question source; persistence, attempt creation, solving,
// submission and grading stay on the existing exam engine.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { callGeminiWithFallback, loadAiSettings, resolveGeminiApiKey } from "../_shared/aiSettings.ts";
import {
  detectSubject,
  retrieveFromLibrary,
  buildLibraryContextBlock,
  logRagPipeline,
  MODREK_ASSISTANT_SCOPE_RULES,
} from "../_shared/modrekLibraryRag.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FUNCTION_NAME = "modrek-ai-exams";
const MAX_JSON_ATTEMPTS = 3;
const DEFAULT_COUNTS = { mcq: 5, trueFalse: 3, essay: 0, fillBlank: 0 };

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

type ExamDiagnostics = {
  currentStep: string;
  modelUsed?: string | null;
  finalPrompt?: unknown;
  rawResponse?: string;
  rawProviderResponse?: unknown;
  receivedJson?: unknown;
  parserRejectReason?: string;
  validationErrors: string[];
  normalizationWarnings?: string[];
  fallbackUsed?: boolean;
  rag: {
    subjectId?: string;
    librarySubjectIds?: string[];
    subjectName?: string;
    keywords?: string[];
    contentRows?: number;
    knowledgeRows?: number;
    chunkRows?: number;
    snippets?: number;
    reason?: string;
    libraryBooks?: number;
    librarySelectedBook?: string | null;
    libraryLesson?: string | null;
    libraryPassages?: number;
    libraryConfidence?: string;
  };
};

const intentJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    subject: { type: ["string", "null"] },
    chapter: { type: ["string", "null"] },
    mcq_count: { type: ["number", "null"] },
    true_false_count: { type: ["number", "null"] },
    essay_count: { type: ["number", "null"] },
    fill_blank_count: { type: ["number", "null"] },
    difficulty: { type: "string" },
    title_hint: { type: ["string", "null"] },
  },
  required: ["subject", "chapter", "mcq_count", "true_false_count", "essay_count", "fill_blank_count", "difficulty", "title_hint"],
};

const examJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    questions: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: ["mcq", "true_false", "essay", "fill_blank", "short_answer"] },
          text: { type: "string", minLength: 1 },
          options: { type: "array", items: { type: "string" } },
          correct_answer: { type: "string", minLength: 1 },
          explanation: { type: "string" },
          marks: { type: "number" },
        },
        required: ["type", "text", "options", "correct_answer", "explanation", "marks"],
      },
    },
  },
  required: ["title", "description", "questions"],
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

function logDiagnosticFailure(traceId: string, code: string, error: unknown, diagnostics?: ExamDiagnostics, details: Record<string, unknown> = {}) {
  console.error(`[${FUNCTION_NAME}] DIAGNOSTIC_FAILURE`, JSON.stringify({
    traceId,
    edgeFunction: FUNCTION_NAME,
    code,
    stoppedAtStep: diagnostics?.currentStep || code,
    modelUsed: diagnostics?.modelUsed || null,
    finalPrompt: diagnostics?.finalPrompt || null,
    rawResponse: diagnostics?.rawResponse || null,
    rawProviderResponse: diagnostics?.rawProviderResponse || null,
    parserRejectReason: diagnostics?.parserRejectReason || null,
    receivedJson: diagnostics?.receivedJson || null,
    validationErrors: diagnostics?.validationErrors || [],
    normalizationWarnings: diagnostics?.normalizationWarnings || [],
    fallbackUsed: Boolean(diagnostics?.fallbackUsed),
    rag: diagnostics?.rag || null,
    stackTrace: error instanceof Error ? error.stack : null,
    message: stringifyError(error),
    ...details,
  }));
}

function publicFailureMessage(code: string) {
  if (code.includes("AI")) return "تعذر توليد أسئلة صالحة من نموذج الذكاء الاصطناعي.";
  if (code.includes("SUBJECT")) return "تعذر تحديد مادة مناسبة لحسابك. افتح المادة المطلوبة ثم اطلب إنشاء الامتحان مرة أخرى.";
  if (code.includes("SAVE")) return "تعذر حفظ الامتحان التدريبي. تم إلغاء أي بيانات جزئية بأمان.";
  if (code.includes("AUTH")) return "انتهت الجلسة. سجّل الدخول مرة أخرى ثم حاول.";
  return "تعذر إنشاء الامتحان حالياً. حاول مرة أخرى بعد قليل.";
}

function failure(traceId: string, code: string, error: unknown, status = 500, diagnostics?: ExamDiagnostics) {
  const technical = stringifyError(error);
  if (diagnostics) logDiagnosticFailure(traceId, code, error, diagnostics, { status });
  logError(traceId, `FAIL_${code}`, error, { status, technical: safePreview(technical, 800) });
  const stoppedAt = diagnostics?.currentStep || code;
  const reason = diagnostics?.parserRejectReason || diagnostics?.validationErrors?.join(" | ") || technical;
  const publicMessage = `${publicFailureMessage(code)}\nالمرحلة التي توقفت: ${stoppedAt}\nسبب الفشل التقني: ${safePreview(reason, 700)}\nكود التتبع: ${traceId}`;
  return json({
    error: code,
    errorCode: code,
    publicMessage,
    reply: publicMessage,
    traceId,
    debug: diagnostics ? {
      edgeFunction: FUNCTION_NAME,
      stoppedAtStep: stoppedAt,
      modelUsed: diagnostics.modelUsed || null,
      parserRejectReason: diagnostics.parserRejectReason || null,
      validationErrors: diagnostics.validationErrors,
      normalizationWarnings: diagnostics.normalizationWarnings || [],
      receivedJson: diagnostics.receivedJson,
      rawResponse: diagnostics.rawResponse,
      rawProviderResponse: diagnostics.rawProviderResponse,
      rag: diagnostics.rag,
      fallbackUsed: Boolean(diagnostics.fallbackUsed),
    } : undefined,
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

function hasBalancedJsonDelimiters(value: string): boolean {
  const text = stripJsonFence(value);
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") braces++;
    if (ch === "}") braces--;
    if (ch === "[") brackets++;
    if (ch === "]") brackets--;
    if (braces < 0 || brackets < 0) return false;
  }
  return braces === 0 && brackets === 0 && !inString;
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

function parseAiJson(raw: string, traceId: string, step: string, diagnostics?: ExamDiagnostics): Record<string, unknown> {
  diagnostics && (diagnostics.rawResponse = raw);
  if (!hasBalancedJsonDelimiters(raw)) {
    const reason = `${step}_response_truncated_or_unbalanced_json`;
    if (diagnostics) diagnostics.parserRejectReason = reason;
    logError(traceId, `${step}_JSON_TRUNCATED`, new Error(reason), { rawResponse: raw });
    throw new Error(reason);
  }
  const candidate = extractJsonObject(raw);
  try {
    const parsed = JSON.parse(candidate);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not_object");
    if (diagnostics) diagnostics.receivedJson = parsed;
    return parsed;
  } catch (error) {
    if (diagnostics) {
      diagnostics.parserRejectReason = stringifyError(error);
      diagnostics.receivedJson = candidate;
    }
    logError(traceId, `${step}_JSON_PARSE_FAILED`, error, {
      rawResponse: raw,
      candidateJson: candidate,
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

// Subject detection is delegated to the shared multi-subject vocabulary so
// religious/Arabic/literary subjects are recognized exactly like scientific ones.
function inferSubjectFromText(text: string): string | null {
  return detectSubject(text);
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
  const value = normalizeArabic(input).toLowerCase().trim();
  if (["true_false", "tf", "truefalse", "true-false", "true false", "صح وخطأ", "صح/خطأ", "boolean"].includes(value)) return "true_false";
  if (["short_answer", "short", "اجابه قصيره", "سؤال قصير"].includes(value)) return "short_answer";
  if (["essay", "مقالي", "مقال", "سؤال مقالي"].includes(value)) return "essay";
  if (["fill_blank", "fill", "اكمل", "املأ الفراغ", "املا الفراغ"].includes(value)) return "fill_blank";
  return "mcq";
}

const QUESTION_TEXT_KEYS = [
  "text", "question", "question_text", "prompt", "stem", "content", "body", "title", "statement", "q",
  "السؤال", "سؤال", "نص السؤال", "نص_السؤال", "نص", "المتن", "المحتوى",
];

const OPTION_KEYS = ["options", "choices", "answers", "alternatives", "الاختيارات", "اختيارات", "الخيارات", "خيارات", "بدائل"];
const CORRECT_KEYS = ["correct_answer", "answer", "model_answer", "correct", "correctAnswer", "right_answer", "الإجابة الصحيحة", "الاجابة الصحيحة", "الإجابة", "الاجابة", "الحل"];
const EXCLUDED_TEXT_SCAN_KEYS = new Set([
  "type", "question_type", "kind", "marks", "points", "difficulty", "explanation", "rationale",
  ...OPTION_KEYS, ...CORRECT_KEYS,
]);

function primitiveString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  return "";
}

function stringFromValue(value: unknown, preferredKeys = QUESTION_TEXT_KEYS, seen = new Set<unknown>()): string {
  const direct = primitiveString(value);
  if (direct) return direct;
  if (!value || typeof value !== "object" || seen.has(value)) return "";
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = stringFromValue(item, preferredKeys, seen);
      if (text) return text;
    }
    return "";
  }

  const obj = value as Record<string, unknown>;
  for (const key of preferredKeys) {
    const text = stringFromValue(obj[key], preferredKeys, seen);
    if (text) return text;
  }
  return "";
}

function findLikelyQuestionText(value: unknown, seen = new Set<unknown>()): string {
  const direct = primitiveString(value);
  if (direct && direct.length >= 8) return direct;
  if (!value || typeof value !== "object" || seen.has(value)) return "";
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = findLikelyQuestionText(item, seen);
      if (text) return text;
    }
    return "";
  }

  const obj = value as Record<string, unknown>;
  for (const key of QUESTION_TEXT_KEYS) {
    const text = findLikelyQuestionText(obj[key], seen);
    if (text) return text;
  }
  for (const [key, nested] of Object.entries(obj)) {
    if (EXCLUDED_TEXT_SCAN_KEYS.has(key)) continue;
    const text = findLikelyQuestionText(nested, seen);
    if (text) return text;
  }
  return "";
}

function normalizeOptionEntry(option: unknown): { text: string; isCorrect: boolean } | null {
  if (typeof option === "string" || typeof option === "number") {
    const text = primitiveString(option);
    return text ? { text, isCorrect: false } : null;
  }
  if (!option || typeof option !== "object") return null;
  const obj = option as Record<string, unknown>;
  const text = stringFromValue(obj, ["text", "option_text", "label", "value", "answer", "content", "ar", "الخيار", "النص"]);
  if (!text) return null;
  const isCorrect = obj.isCorrect === true || obj.is_correct === true || obj.correct === true || obj["صحيح"] === true;
  return { text, isCorrect };
}

function pickOptionEntries(raw: any): Array<{ text: string; isCorrect: boolean }> {
  for (const key of OPTION_KEYS) {
    const value = raw?.[key];
    if (Array.isArray(value)) return value.map(normalizeOptionEntry).filter(Boolean) as Array<{ text: string; isCorrect: boolean }>;
    if (value && typeof value === "object") return Object.values(value).map(normalizeOptionEntry).filter(Boolean) as Array<{ text: string; isCorrect: boolean }>;
  }
  return [];
}

function resolveCorrectAnswer(correctAnswer: string, options: string[], markedCorrect?: string): string {
  const raw = String(correctAnswer || markedCorrect || "").trim();
  if (!raw) return markedCorrect || options[0] || "";
  if (options.includes(raw)) return raw;
  const normalized = normalizeArabic(raw).toLowerCase();
  const numeric = Number(raw.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))));
  if (Number.isInteger(numeric)) {
    const idx = numeric >= 1 ? numeric - 1 : numeric;
    if (options[idx]) return options[idx];
  }
  const letters = ["ا", "أ", "ب", "ج", "د", "ه", "هـ", "و", "a", "b", "c", "d", "e", "f"];
  const letterIndex = letters.indexOf(normalized);
  if (letterIndex >= 0) {
    const mapped = normalized === "ا" || normalized === "أ" || normalized === "a" ? 0
      : normalized === "ب" || normalized === "b" ? 1
        : normalized === "ج" || normalized === "c" ? 2
          : normalized === "د" || normalized === "d" ? 3
            : normalized === "ه" || normalized === "هـ" || normalized === "e" ? 4
              : 5;
    if (options[mapped]) return options[mapped];
  }
  const fuzzy = options.find((option) => normalizeArabic(option).includes(normalized) || normalized.includes(normalizeArabic(option)));
  return fuzzy || markedCorrect || options[0] || raw;
}

function pickFirstString(raw: any, keys: string[]): string {
  for (const key of keys) {
    const value = raw?.[key];
    const text = stringFromValue(value, QUESTION_TEXT_KEYS);
    if (text) return text;
  }
  return "";
}

function pickFirstArray(raw: any, keys: string[]): string[] {
  const entries = pickOptionEntries(raw);
  if (entries.length) return entries.map((entry) => entry.text);
  for (const key of keys) {
    const value = raw?.[key];
    if (Array.isArray(value)) return value.map((item) => stringFromValue(item, ["text", "option_text", "label", "value", "answer", "content", "ar", "الخيار", "النص"])).filter(Boolean);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.values(value).map((item) => stringFromValue(item, ["text", "option_text", "label", "value", "answer", "content", "ar", "الخيار", "النص"])).filter(Boolean);
    }
  }
  return [];
}

function normalizeQuestion(raw: any, index: number): NormalizedQuestion {
  let type = normalizeQuestionType(pickFirstString(raw, ["type", "question_type", "kind", "نوع", "نوع السؤال"]));
  const question = pickFirstString(raw, QUESTION_TEXT_KEYS) || findLikelyQuestionText(raw);
  if (!question) throw new Error(`question_${index + 1}_missing_text`);
  const marks = Math.max(1, Math.min(10, Number(raw?.marks || raw?.points || raw?.["درجة"] || raw?.["الدرجة"] || 1) || 1));
  const optionEntries = pickOptionEntries(raw);
  const markedCorrect = optionEntries.find((option) => option.isCorrect)?.text || "";
  let correctAnswer = pickFirstString(raw, CORRECT_KEYS) || markedCorrect;
  const explanation = pickFirstString(raw, ["explanation", "rationale", "شرح", "التفسير"]) || null;

  if (type === "true_false") {
    correctAnswer = /خطأ|false|غير صحيح/i.test(correctAnswer) ? "خطأ" : "صح";
    return { type, question, marks, correct_answer: correctAnswer, options: ["صح", "خطأ"], explanation };
  }

  if (type === "mcq") {
    const options = pickFirstArray(raw, ["options", "choices", "answers", "الاختيارات", "اختيارات", "الخيارات", "خيارات"]);
    const uniqueOptions = [...new Set(options)].slice(0, 6);
    correctAnswer = resolveCorrectAnswer(correctAnswer, uniqueOptions, markedCorrect);
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
      correct_answer: uniqueOptions.includes(correctAnswer) ? correctAnswer : uniqueOptions[0],
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
  const responseFormat = step === "GENERATE_EXAM"
    ? { type: "json_schema", json_schema: { name: "modrek_ai_exam", strict: false, schema: examJsonSchema } }
    : { type: "json_schema", json_schema: { name: "modrek_ai_exam_intent", strict: false, schema: intentJsonSchema } };
  logStep(traceId, `${step}_AI_REQUEST`, {
    modelCandidates: settings.models_to_try,
    responseFormat,
    finalPrompt: messages,
  });
  const result = await callGeminiWithFallback({
    apiKey,
    models: settings.models_to_try,
    body: {
      temperature: 0.2,
      response_format: responseFormat,
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
  const finishReason = data?.choices?.[0]?.finish_reason || data?.choices?.[0]?.native_finish_reason || data?.stop_reason || null;
  const content = String(data?.choices?.[0]?.message?.content || "").trim();
  logStep(traceId, `${step}_AI_RAW_PROVIDER_RESPONSE`, { model: result.model, finishReason, rawProviderResponse: data });
  if (finishReason === "length" || finishReason === "max_tokens") throw new Error(`${step}_response_truncated_by_token_limit`);
  if (!content) throw new Error(`${step}_empty_ai_response`);
  logStep(traceId, `${step}_AI_OK`, { model: result.model, contentChars: content.length, rawResponse: content });
  return { content, model: result.model, rawProviderResponse: data };
}

async function callJsonWithRetry(opts: {
  admin: any;
  messages: any[];
  traceId: string;
  step: string;
  validate: (value: Record<string, unknown>) => void;
  diagnostics: ExamDiagnostics;
}) {
  let lastRaw: { content: string; model: string } | null = null;
  let lastError: unknown = null;
  let messages = opts.messages;
  for (let attempt = 1; attempt <= MAX_JSON_ATTEMPTS; attempt++) {
    try {
      const gatewayResult = await callGateway(opts.admin, messages, opts.traceId, opts.step) as { content: string; model: string; rawProviderResponse?: unknown };
      lastRaw = gatewayResult;
      opts.diagnostics.currentStep = opts.step;
      opts.diagnostics.modelUsed = gatewayResult.model;
      opts.diagnostics.finalPrompt = messages;
      opts.diagnostics.rawProviderResponse = gatewayResult.rawProviderResponse;
      const parsed = parseAiJson(gatewayResult.content, opts.traceId, opts.step, opts.diagnostics);
      try {
        opts.validate(parsed);
      } catch (validationError) {
        opts.diagnostics.validationErrors.push(stringifyError(validationError));
        throw validationError;
      }
      return parsed;
    } catch (error) {
      lastError = error;
      logError(opts.traceId, `${opts.step}_ATTEMPT_FAILED`, error, { attempt, rawResponse: lastRaw?.content || "" });
      if (attempt >= MAX_JSON_ATTEMPTS) break;
      messages = [
        ...opts.messages,
        {
          role: "user",
          content: [
            "الرد السابق لم يكن JSON صالحاً أو ناقص البيانات.",
            "أعد الرد بصيغة JSON فقط بدون Markdown وبدون أي شرح خارجي.",
            "الرد السابق:",
            safePreview(lastRaw?.content || "", 3000),
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

function normalizeGeneratedQuestions(questions: any[], diagnostics: ExamDiagnostics): NormalizedQuestion[] {
  const normalized: NormalizedQuestion[] = [];
  questions.forEach((question, index) => {
    try {
      const nq = normalizeQuestion(question, index);
      if (nq.question.trim()) normalized.push(nq);
    } catch (error) {
      const warning = `normalize_question_${index + 1}: ${stringifyError(error)} | raw=${safePreview(question, 1200)}`;
      diagnostics.validationErrors.push(warning);
      diagnostics.normalizationWarnings?.push(warning);
      console.error(`[${FUNCTION_NAME}] QUESTION_NORMALIZATION_REJECTED`, JSON.stringify({ index: index + 1, reason: stringifyError(error), raw: question }));
    }
  });
  return normalized;
}

async function cleanupDirectExamSave(admin: any, created: { examId?: string; attemptId?: string; questionIds: string[] }) {
  try {
    if (created.attemptId) {
      await admin.from("exam_answers").delete().eq("attempt_id", created.attemptId);
      await admin.from("exam_attempts").delete().eq("id", created.attemptId);
    }
    if (created.questionIds.length) {
      await admin.from("exam_question_options").delete().in("question_id", created.questionIds);
      await admin.from("exam_questions").delete().in("id", created.questionIds);
    }
    if (created.examId) await admin.from("exams").delete().eq("id", created.examId);
  } catch (cleanupError) {
    console.error(`[${FUNCTION_NAME}] DIRECT_SAVE_CLEANUP_FAILED`, JSON.stringify({ message: stringifyError(cleanupError), created }));
  }
}

async function saveTrainingExamDirect(admin: any, userId: string, payload: any, traceId: string) {
  const created: { examId?: string; attemptId?: string; questionIds: string[] } = { questionIds: [] };
  const questions = Array.isArray(payload.questions) ? payload.questions as NormalizedQuestion[] : [];
  if (!questions.length) throw new Error("direct_save_no_questions");

  const totalMarks = questions.reduce((sum, question) => sum + Number(question.marks || 0), 0);
  if (totalMarks <= 0) throw new Error("direct_save_invalid_total_marks");

  try {
    // Training exam — fully isolated from teacher exams.
    // No teacher_id, no group_id. source='modrek_ai', owner_student_id=userId.
    const examInsertPayload: Record<string, unknown> = {
      teacher_id: null,
      subject_id: payload.subject_id,
      group_id: null,
      sub_subject_id: null,
      title: String(payload.title || "امتحان تدريبي من Modrek AI").trim(),
      description: payload.description || null,
      instructions: "امتحان تدريبي مولد بواسطة Modrek AI ولا يؤثر على الدرجات الرسمية.",
      duration_minutes: Math.max(5, Math.min(240, Number(payload.duration_minutes || 30))),
      total_marks: totalMarks,
      pass_marks: Math.max(0, Math.min(totalMarks, Number(payload.pass_marks || Math.ceil(totalMarks * 0.5)))),
      max_attempts: 999,
      shuffle_questions: false,
      shuffle_options: true,
      show_results_immediately: true,
      show_correct_answers: true,
      prevent_tab_switch: false,
      require_fullscreen: false,
      prevent_copy_paste: false,
      max_cheat_exits: 999,
      prevent_reload: false,
      random_snapshots: false,
      status: "published",
      is_published: true,
      difficulty: normalizeDifficulty(payload.difficulty),
      term: payload.term || "term1",
      is_ai_generated: true,
      source: "modrek_ai",
      owner_student_id: userId,
      target_education_type: null,
      target_section: null,
    };

    const { error: createdByProbeError } = await admin
      .from("exams")
      .select("created_by")
      .limit(1);
    if (!createdByProbeError) {
      examInsertPayload.created_by = userId;
    }

    const { data: exam, error: examError } = await admin
      .from("exams")
      .insert(examInsertPayload)
      .select("id")
      .single();

    if (examError) {
      logError(traceId, "DIRECT_SAVE_EXAM_INSERT_FAILED", examError, { payload: examInsertPayload });
      throw examError;
    }
    if (!exam?.id) throw new Error("direct_save_exam_insert_returned_no_id");
    created.examId = exam.id;

    for (let index = 0; index < questions.length; index++) {
      const question = questions[index];
      const { data: savedQuestion, error: questionError } = await admin
        .from("exam_questions")
        .insert({
          exam_id: created.examId,
          order_index: index + 1,
          question_type: question.type,
          question_text: question.question,
          marks: Math.max(1, Math.min(10, Number(question.marks || 1))),
          difficulty: normalizeDifficulty(payload.difficulty),
          correct_answer: question.correct_answer || null,
          explanation: question.explanation || null,
        })
        .select("id")
        .single();

      if (questionError) throw questionError;
      created.questionIds.push(savedQuestion.id);

      if (question.type === "mcq" || question.type === "true_false") {
        const optionTexts = question.type === "true_false" ? ["صح", "خطأ"] : (question.options || []).filter(Boolean).slice(0, 6);
        if (optionTexts.length) {
          const rows = optionTexts.map((optionText, optionIndex) => ({
            question_id: savedQuestion.id,
            option_text: optionText,
            is_correct:
              optionText === question.correct_answer ||
              String(optionIndex + 1) === String(question.correct_answer).trim() ||
              (question.type === "true_false" && optionText === "صح" && /true|صح|صحيح/i.test(question.correct_answer)) ||
              (question.type === "true_false" && optionText === "خطأ" && /false|خطأ|خاطئ/i.test(question.correct_answer)),
            order_index: optionIndex + 1,
          }));
          if (!rows.some((row) => row.is_correct)) rows[0].is_correct = true;
          const { error: optionsError } = await admin.from("exam_question_options").insert(rows);
          if (optionsError) throw optionsError;
        }
      }
    }

    const { data: attempt, error: attemptError } = await admin
      .from("exam_attempts")
      .insert({
        exam_id: created.examId,
        student_id: userId,
        attempt_number: 1,
        max_score: totalMarks,
      })
      .select("id")
      .single();

    if (attemptError) throw attemptError;
    created.attemptId = attempt.id;

    const answerRows = created.questionIds.map((questionId) => ({
      attempt_id: created.attemptId,
      question_id: questionId,
      selected_option_ids: [],
      answer_text: null,
      marks_awarded: 0,
      is_correct: null,
    }));
    const { error: answersError } = await admin.from("exam_answers").insert(answerRows);
    if (answersError) throw answersError;

    logStep(traceId, "DIRECT_SAVE_OK", {
      examId: created.examId,
      attemptId: created.attemptId,
      questionCount: created.questionIds.length,
      answerCount: answerRows.length,
    });

    return {
      success: true,
      examId: created.examId,
      attemptId: created.attemptId,
      questionCount: created.questionIds.length,
      answerCount: answerRows.length,
      totalMarks,
    };
  } catch (error) {
    logError(traceId, "DIRECT_SAVE_FAILED", error, created);
    await cleanupDirectExamSave(admin, created);
    throw error;
  }
}

function isOwnModrekTrainingExam(exam: any, userId: string): boolean {
  return Boolean(
    exam?.id &&
    exam?.is_published === true &&
    exam?.status === "published" &&
    exam?.source === "modrek_ai" &&
    exam?.owner_student_id === userId
  );
}

async function loadTrainingQuestionsByAttempt(admin: any, userId: string, attemptId: string, traceId: string) {
  if (!attemptId || typeof attemptId !== "string") return json({ error: "attemptId required" }, 400);

  const { data: attempt, error: attemptError } = await admin
    .from("exam_attempts")
    .select("id, exam_id, student_id, status, started_at")
    .eq("id", attemptId)
    .maybeSingle();
  if (attemptError) throw attemptError;
  if (!attempt || attempt.student_id !== userId) return json({ error: "training attempt not found" }, 404);

  const { data: exam, error: examError } = await admin
    .from("exams")
    .select("id, source, owner_student_id, is_published, status")
    .eq("id", attempt.exam_id)
    .maybeSingle();
  if (examError) throw examError;
  if (!isOwnModrekTrainingExam(exam, userId)) return json({ error: "training exam not available" }, 403);

  const { data: questions, error: questionsError } = await admin
    .from("exam_questions")
    .select("id, exam_id, order_index, question_type, question_text, image_url, marks, difficulty")
    .eq("exam_id", attempt.exam_id)
    .order("order_index", { ascending: true });
  if (questionsError) throw questionsError;

  const questionIds = (questions || []).map((q: any) => q.id);
  let optionsByQuestion = new Map<string, any[]>();
  if (questionIds.length) {
    const { data: options, error: optionsError } = await admin
      .from("exam_question_options")
      .select("id, question_id, order_index, option_text, image_url")
      .in("question_id", questionIds)
      .order("order_index", { ascending: true });
    if (optionsError) throw optionsError;
    optionsByQuestion = (options || []).reduce((map: Map<string, any[]>, option: any) => {
      map.set(option.question_id, [...(map.get(option.question_id) || []), option]);
      return map;
    }, new Map<string, any[]>());
  }

  const safeQuestions = (questions || []).map((question: any) => ({
    ...question,
    correct_answer: null,
    explanation: null,
    options: optionsByQuestion.get(question.id) || [],
  }));

  logStep(traceId, "LOAD_TRAINING_QUESTIONS_OK", {
    attemptId,
    examId: attempt.exam_id,
    questionCount: safeQuestions.length,
  });
  return json({ questions: safeQuestions, attempt });
}

async function startTrainingAttemptDirect(admin: any, userId: string, examId: string, attemptId: string | null, traceId: string) {
  if (!examId || typeof examId !== "string") return json({ success: false, error: "examId required" }, 400);

  const { data: exam, error: examError } = await admin
    .from("exams")
    .select("id, source, owner_student_id, is_published, status, max_attempts")
    .eq("id", examId)
    .maybeSingle();
  if (examError) throw examError;
  if (!isOwnModrekTrainingExam(exam, userId)) {
    return json({ success: false, error: "هذا التدريب تابع لطالب آخر أو غير متاح", training_exam: true }, 403);
  }

  if (attemptId) {
    const { data: existingAttempt, error: existingAttemptError } = await admin
      .from("exam_attempts")
      .select("id, status")
      .eq("id", attemptId)
      .eq("exam_id", examId)
      .eq("student_id", userId)
      .maybeSingle();
    if (existingAttemptError) throw existingAttemptError;
    if (existingAttempt?.id) {
      const inProgress = existingAttempt.status === "in_progress";
      return json({
        success: true,
        attempt_id: existingAttempt.id,
        resumed: true,
        already_submitted: !inProgress,
        redirect_to_review: !inProgress,
        training_exam: true,
      });
    }
  }

  const { data: anyAttempt, error: anyAttemptError } = await admin
    .from("exam_attempts")
    .select("id, status")
    .eq("exam_id", examId)
    .eq("student_id", userId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (anyAttemptError) throw anyAttemptError;
  if (anyAttempt?.id) {
    if (anyAttempt.status === "in_progress") {
      return json({ success: true, attempt_id: anyAttempt.id, resumed: true, training_exam: true });
    }
    // Already submitted/graded → route student to review page instead of creating a duplicate.
    return json({
      success: true,
      attempt_id: anyAttempt.id,
      resumed: true,
      already_submitted: true,
      redirect_to_review: true,
      training_exam: true,
    });
  }

  const [{ count: submittedCount, error: countError }, { data: questions, error: questionsError }] = await Promise.all([
    admin
      .from("exam_attempts")
      .select("id", { count: "exact", head: true })
      .eq("exam_id", examId)
      .eq("student_id", userId)
      .in("status", ["submitted", "graded", "expired"]),
    admin
      .from("exam_questions")
      .select("id, marks")
      .eq("exam_id", examId),
  ]);
  if (countError) throw countError;
  if (questionsError) throw questionsError;
  if (Number(submittedCount || 0) >= Number(exam.max_attempts || 999)) {
    return json({ success: false, error: "تم استنفاد عدد المحاولات", training_exam: true });
  }

  const maxScore = (questions || []).reduce((sum: number, question: any) => sum + Number(question.marks || 0), 0);
  if (maxScore <= 0 || !(questions || []).length) {
    return json({ success: false, error: "لا توجد أسئلة صالحة في هذا التدريب", training_exam: true });
  }

  const { data: newAttempt, error: newAttemptError } = await admin
    .from("exam_attempts")
    .insert({ exam_id: examId, student_id: userId, attempt_number: Number(submittedCount || 0) + 1, max_score: maxScore })
    .select("id")
    .single();
  if (newAttemptError) throw newAttemptError;

  const answerRows = (questions || []).map((question: any) => ({
    attempt_id: newAttempt.id,
    question_id: question.id,
    selected_option_ids: [],
    answer_text: null,
    marks_awarded: 0,
    is_correct: null,
  }));
  if (answerRows.length) {
    const { error: answersError } = await admin.from("exam_answers").insert(answerRows);
    if (answersError) throw answersError;
  }

  logStep(traceId, "START_TRAINING_ATTEMPT_OK", { examId, attemptId: newAttempt.id, questionCount: answerRows.length });
  return json({ success: true, attempt_id: newAttempt.id, resumed: false, training_exam: true });
}

function normalizeArabicText(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[أإآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/[ة]/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameUuidSet(a: unknown, b: string[]) {
  const left = Array.isArray(a) ? a.map(String).sort() : [];
  const right = [...b].map(String).sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function remapQuestionShape(raw: any): any {
  if (!raw || typeof raw !== "object") return raw;
  const out: any = { ...raw };
  // If nested under body/data/question object, flatten
  for (const wrap of ["data", "body", "payload", "item"]) {
    if (out[wrap] && typeof out[wrap] === "object" && !Array.isArray(out[wrap])) {
      Object.assign(out, out[wrap]);
    }
  }
  // Coalesce alternative text field names into `text`
  if (!out.text) {
    for (const key of QUESTION_TEXT_KEYS) {
      const v = out[key];
      if (typeof v === "string" && v.trim()) { out.text = v.trim(); break; }
      if (v && typeof v === "object") {
        const inner = (v as any).text || (v as any).ar || (v as any).value;
        if (typeof inner === "string" && inner.trim()) { out.text = inner.trim(); break; }
      }
    }
  }
  // Coalesce options
  if (!Array.isArray(out.options)) {
    for (const key of ["choices", "answers", "الاختيارات", "الخيارات", "خيارات", "اختيارات"]) {
      const v = out[key];
      if (Array.isArray(v)) { out.options = v.map((x: any) => (typeof x === "string" ? x : (x?.text || x?.label || String(x || "")))); break; }
    }
  }
  // Coalesce correct_answer
  if (typeof out.correct_answer !== "string" || !out.correct_answer.trim()) {
    for (const key of ["answer", "model_answer", "correct", "الإجابة الصحيحة", "الاجابة الصحيحة", "الإجابة", "الاجابة"]) {
      const v = out[key];
      if (typeof v === "string" && v.trim()) { out.correct_answer = v.trim(); break; }
      if (typeof v === "number") { out.correct_answer = String(v); break; }
    }
  }
  return out;
}

function validateExamContent(value: Record<string, unknown>) {
  const questions = extractQuestionsArray(value);
  if (!Array.isArray(questions) || questions.length === 0) throw new Error("questions_missing");
  const remapped = questions.map(remapQuestionShape);
  const first = remapped[0];
  console.log(`[${FUNCTION_NAME}] FIRST_QUESTION_DEBUG`, JSON.stringify({
    keys: first && typeof first === "object" ? Object.keys(first) : null,
    hasText: Boolean(first?.text),
    textPreview: typeof first?.text === "string" ? first.text.slice(0, 120) : null,
    type: first?.type,
    optionsLen: Array.isArray(first?.options) ? first.options.length : null,
    hasCorrect: Boolean(first?.correct_answer),
    raw: safePreview(first, 800),
  }));
  const validQuestions = remapped.filter((q: any) => q && typeof q === "object" && typeof q.text === "string" && q.text.trim());
  if (!validQuestions.length) {
    const reason = `all_questions_missing_text | first_keys=${first && typeof first === "object" ? Object.keys(first).join(",") : "n/a"}`;
    throw new Error(reason);
  }
  value.questions = validQuestions;
}

function extractQuestionsArray(value: Record<string, unknown>): any[] {
  const direct = (value as any).questions || (value as any)["الأسئلة"] || (value as any)["الاسئلة"];
  if (Array.isArray(direct)) return direct;
  const nested = (value as any).exam || (value as any).data || (value as any).result || (value as any)["امتحان"];
  if (nested && typeof nested === "object") return extractQuestionsArray(nested as Record<string, unknown>);
  return [];
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

async function resolveEquivalentLibrarySubjectIds(admin: any, publicSubjectId: string, subjectName: string | null) {
  const normalizedName = normalizeArabic(subjectName || "");

  const { data: linkedRows } = await admin
    .from("library_subjects")
    .select("id, name_ar, source_subject_id")
    .eq("is_active", true)
    .eq("source_subject_id", publicSubjectId)
    .limit(80);

  const ids = new Set<string>((linkedRows || []).map((row: any) => row.id).filter(Boolean));
  const anchorName = normalizedName || normalizeArabic((linkedRows || [])[0]?.name_ar || "");

  if (anchorName) {
    const { data: nameRows } = await admin
      .from("library_subjects")
      .select("id, name_ar")
      .eq("is_active", true)
      .limit(1200);

    for (const row of nameRows || []) {
      const rowName = normalizeArabic(row.name_ar || "");
      if (rowName && (rowName === anchorName || rowName.includes(anchorName) || anchorName.includes(rowName))) {
        ids.add(row.id);
      }
    }
  }

  return Array.from(ids);
}

async function retrieveStudyContext(admin: any, subjectId: string, query: string, subject: string | null, chapter: string | null, traceId: string, diagnostics: ExamDiagnostics) {
  const keys = keywordsFrom(query, subject, chapter);
  diagnostics.rag.subjectId = subjectId;
  diagnostics.rag.keywords = keys;
  const like = keys.length ? `%${keys[0]}%` : `%${String(subject || "").slice(0, 20)}%`;
  const snippets: string[] = [];
  try {
    const librarySubjectIds = await resolveEquivalentLibrarySubjectIds(admin, subjectId, subject);
    diagnostics.rag.librarySubjectIds = librarySubjectIds.slice(0, 20);

    const contentQuery = admin
      .from("content")
      .select("title, description, sub_subject, term")
      .eq("subject_id", subjectId)
      .or(`title.ilike.${like},description.ilike.${like},sub_subject.ilike.${like}`)
      .limit(5);

    let unitQuery = admin
      .from("knowledge_units")
      .select("title, content_text, page_from, page_to, knowledge_source_versions!inner(source_id, knowledge_sources!inner(title, subject_id))")
      .or(`title.ilike.${like},content_text.ilike.${like}`)
      .limit(5);

    if (librarySubjectIds.length > 0) {
      unitQuery = unitQuery.in("knowledge_source_versions.knowledge_sources.subject_id", librarySubjectIds);
    } else {
      unitQuery = unitQuery.eq("knowledge_source_versions.knowledge_sources.subject_id", subjectId);
    }

    const [{ data: contentRows }, { data: unitRows }, { data: chunkRows }] = await Promise.all([
      contentQuery,
      unitQuery,
      admin
        .from("content_chunks")
        .select("content, metadata")
        .textSearch("search_tsv", keys.join(" | "), { type: "websearch" })
        .limit(5),
    ]);

    diagnostics.rag.contentRows = (contentRows || []).length;
    diagnostics.rag.knowledgeRows = (unitRows || []).length;
    diagnostics.rag.chunkRows = (chunkRows || []).length;

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
    diagnostics.rag.reason = stringifyError(error);
    logError(traceId, "RETRIEVE_CONTEXT_FAILED_NON_BLOCKING", error);
  }
  diagnostics.rag.snippets = snippets.length;
  if (!snippets.length && !diagnostics.rag.reason) diagnostics.rag.reason = "no matching content, knowledge units, or content chunks for query keywords";
  return snippets.slice(0, 8).join("\n\n---\n\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  const diagnostics: ExamDiagnostics = {
    currentStep: "START",
    modelUsed: null,
    validationErrors: [],
    normalizationWarnings: [],
    rag: {},
  };
  logStep(traceId, "START", { method: req.method });

  try {
    const token = getBearer(req.headers.get("Authorization"));
    const userId = token ? decodeJwtSub(token) : null;
    if (!token || !userId) return failure(traceId, "AUTH_REQUIRED", new Error("missing bearer token"), 401, diagnostics);

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

    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("id, stage, grade, section, education_type, full_name")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) return failure(traceId, "AUTH_PROFILE", profileError, 401, diagnostics);

    if (body?.action === "load-training-questions") {
      return await loadTrainingQuestionsByAttempt(admin, userId, String(body.attemptId || ""), traceId);
    }
    if (body?.action === "start-training-attempt") {
      return await startTrainingAttemptDirect(
        admin,
        userId,
        String(body.examId || ""),
        body.attemptId ? String(body.attemptId) : null,
        traceId,
      );
    }
    if (body?.action === "submit-training-attempt") {
      logStep(traceId, "SUBMIT_TRAINING_BRIDGED_TO_RESILIENT_RPC", {
        userId,
        receivedAttemptId: body.attemptId || null,
        receivedExamId: body.examId || null,
        answersCount: Array.isArray(body.answers) ? body.answers.length : 0,
      });
      const { data: submitResult, error: submitError } = await userClient.rpc("submit_exam_attempt_resilient", {
        _exam_id: body.examId || null,
        _attempt_id: body.attemptId || null,
        _answers: Array.isArray(body.answers) ? body.answers : [],
        _tab_switches: Number(body.tabSwitches || 0),
        _fullscreen_exits: Number(body.fullscreenExits || 0),
      });
      if (submitError) {
        logError(traceId, "SUBMIT_TRAINING_RESILIENT_RPC_FAILED", submitError, {
          userId,
          receivedAttemptId: body.attemptId || null,
          receivedExamId: body.examId || null,
        });
        return json({ success: false, error: submitError.message || "تعذر تسليم التدريب", code: submitError.code || "submit_failed", training_exam: true, traceId }, 500);
      }
      logStep(traceId, "SUBMIT_TRAINING_RESILIENT_RPC_OK", { userId, result: submitResult });
      return json({ ...(submitResult as Record<string, unknown>), training_exam: true, traceId });
    }
    if (!body?.messages || !Array.isArray(body.messages)) return json({ error: "messages required" }, 400);
    const { messages, conversationContext = {} } = body;
    const lastUserMsg = [...messages].reverse().find((msg: any) => msg.role === "user");
    const userText = textFromMessage(lastUserMsg);
    if (!userText) return json({ reply: "اكتب طلب الامتحان أولاً." });

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

    let intent: Record<string, unknown>;
    try {
      intent = await callJsonWithRetry({
        admin,
        traceId,
        step: "INTENT",
        validate: validateIntent,
        diagnostics,
        messages: [
          { role: "system", content: intentSystem },
          { role: "user", content: userText },
        ],
      });
    } catch (error) {
      const message = stringifyError(error);
      if (message === "rate_limited" || message === "credits_exhausted") throw Object.assign(error as Error, { phase: "AI_INTENT" });
      diagnostics.fallbackUsed = true;
      diagnostics.validationErrors.push(`intent_recovered_with_local_parser: ${message}`);
      logDiagnosticFailure(traceId, "AI_INTENT_RECOVERED", error, diagnostics, { status: 200 });
      intent = {
        subject: inferSubjectFromText(userText),
        chapter: /الدرس\s+الأول|الدرس الاول/i.test(userText) ? "الدرس الأول" : null,
        mcq_count: DEFAULT_COUNTS.mcq,
        true_false_count: DEFAULT_COUNTS.trueFalse,
        essay_count: DEFAULT_COUNTS.essay,
        fill_blank_count: DEFAULT_COUNTS.fillBlank,
        difficulty: normalizeDifficulty(userText.includes("صعب") ? "hard" : userText.includes("سهل") ? "easy" : "medium"),
        title_hint: `امتحان تدريبي في ${inferSubjectFromText(userText) || "المادة"}`,
      };
    }

    const subjectHint = String(intent.subject || conversationContext?.subject_name || inferSubjectFromText(userText) || "").trim() || null;
    const chapter = String(intent.chapter || conversationContext?.chapter || "").trim() || null;
    const subjectRow = await resolveSubjectId(admin, profile, subjectHint, conversationContext);
    if (!subjectRow?.id) return failure(traceId, "SUBJECT_RESOLVE", new Error("No subject matched"), 500, diagnostics);
    diagnostics.rag.subjectId = subjectRow.id;
    diagnostics.rag.subjectName = subjectRow.name;

    const difficulty = normalizeDifficulty(intent.difficulty);
    const mcq = Math.max(0, Math.min(20, Number(intent.mcq_count ?? DEFAULT_COUNTS.mcq) || 0));
    const trueFalse = Math.max(0, Math.min(20, Number(intent.true_false_count ?? DEFAULT_COUNTS.trueFalse) || 0));
    const essay = Math.max(0, Math.min(10, Number(intent.essay_count ?? DEFAULT_COUNTS.essay) || 0));
    const fillBlank = Math.max(0, Math.min(10, Number(intent.fill_blank_count ?? DEFAULT_COUNTS.fillBlank) || 0));
    const requestedTotal = mcq + trueFalse + essay + fillBlank;
    if (requestedTotal <= 0) return json({ reply: "حدّد عدد الأسئلة أو نوع الامتحان المطلوب." });

    // Library FIRST: ground the exam on the student's real Modrek book.
    // lesson request -> lesson pages only, unit -> unit pages, whole curriculum -> book-wide sampling.
    let libraryBlock = "";
    let libraryFound = false;
    try {
      if (!userId) throw new Error("no user id for library rag");
      const historyTexts = (messages as any[])
        .filter((m: any) => m.role === "user")
        .map((m: any) => textFromMessage(m))
        .filter(Boolean)
        .slice(-6, -1);
      const rag = await retrieveFromLibrary(admin, {
        userId,
        query: `${userText} ${chapter || ""}`.trim(),
        history: historyTexts,
        contextSubject: subjectHint || conversationContext?.subject_name || null,
        maxPassages: 10,
        surface: "modrek-ai-exams",

      });
      logRagPipeline("modrek-ai-exams", rag, { traceId });
      libraryFound = rag.found;
      libraryBlock = buildLibraryContextBlock(rag);
      diagnostics.rag.libraryBooks = rag.accessible_books.length;
      diagnostics.rag.librarySelectedBook = rag.selected_book?.title ?? null;
      diagnostics.rag.libraryLesson = rag.lesson?.title ?? null;
      diagnostics.rag.libraryPassages = rag.passages.length;
      diagnostics.rag.libraryConfidence = rag.confidence;
    } catch (ragError) {
      logError(traceId, "LIBRARY_RAG_FAILED_NON_BLOCKING", ragError);
    }

    const studyContext = libraryFound
      ? ""
      : await retrieveStudyContext(admin, subjectRow.id, userText, subjectHint, chapter, traceId, diagnostics);
    logStep(traceId, "SUBJECT_AND_RETRIEVAL_READY", {
      subjectId: subjectRow.id,
      subjectName: subjectRow.name,
      libraryFound,
      hasStudyContext: Boolean(studyContext),
      requestedTotal,
      difficulty,
    });

    const studentLevel = [stageLabel(profile?.stage), gradeLabel(profile?.grade), profile?.education_type === "azhar" ? "أزهر" : "عام", profile?.section]
      .filter(Boolean)
      .join(" - ");
    const genSystem = `أنت منشئ امتحانات عربي محترف داخل منصة مدرك Plus.
أنشئ امتحاناً تدريبياً لا يؤثر على الدرجات الرسمية، لكنه يجب أن يستخدم نفس جودة امتحانات المعلم.

${MODREK_ASSISTANT_SCOPE_RULES}

بيانات الطالب: ${studentLevel || "غير محدد"}
المادة: ${subjectHint || subjectRow.name || "المادة المناسبة"}
${chapter ? `الدرس/الباب المطلوب: ${chapter}` : ""}
الصعوبة: ${difficulty}

## محتوى مكتبة Modrek (المصدر الإلزامي للأسئلة إن وُجد)
${libraryBlock || "لا يوجد"}

${libraryFound
      ? "⚠️ إلزامي: كل سؤال يجب أن يكون مبنيًا حرفيًا على المحتوى المسترجع أعلاه (نفس الدرس/الوحدة/المنهج المطلوب فقط). ممنوع توليد أي سؤال من معلومات خارج هذا المحتوى، وممنوع الخروج لدروس أخرى."
      : `لم يُعثر على محتوى في المكتبة لهذا الطلب. اعتمد على المنهج الرسمي المناسب للمادة والصف والنظام دون اختراع أسماء دروس.\n\nسياق إضافي من محتوى المنصة إن وجد:\n${studyContext || "لا يوجد"}`}


أرجع JSON فقط بهذه البنية الصارمة (بدون Markdown، بدون أي نص خارج JSON):
{
  "title": "عنوان واضح للامتحان",
  "description": "وصف قصير",
  "questions": [
    {
      "type": "mcq",
      "text": "نص السؤال هنا (إلزامي - لا تستخدم أي اسم آخر لهذا الحقل)",
      "options": ["الخيار الأول","الخيار الثاني","الخيار الثالث","الخيار الرابع"],
      "correct_answer": "الخيار الأول",
      "explanation": "شرح مختصر",
      "marks": 1
    }
  ]
}

⚠️ حقل نص السؤال اسمه بالضبط "text" — ليس "question" ولا "question_text" ولا "prompt" ولا "content" ولا "stem".
⚠️ حقل text إلزامي لكل سؤال ولا يجوز أن يكون فارغاً.
⚠️ حقل options إلزامي دائماً: للأسئلة المقالية والقصيرة اجعله مصفوفة فارغة [].

التوزيع المطلوب بالضبط قدر الإمكان: mcq=${mcq}, true_false=${trueFalse}, essay=${essay}, fill_blank=${fillBlank}.
قواعد إلزامية:
- لا تضع أسئلة فارغة أو مكررة.
- كل سؤال اختيار (mcq) يجب أن يحتوي على 4 اختيارات نصية وخيار صحيح مطابق لنص أحد الاختيارات.
- أسئلة true_false اختياراتها فقط: ["صح","خطأ"].
- لا تخرج عن JSON. لا Markdown. لا شرح. JSON فقط.`;


    const generated = await callJsonWithRetry({
      admin,
      traceId,
      step: "GENERATE_EXAM",
      validate: validateExamContent,
      diagnostics,
      messages: [
        { role: "system", content: genSystem },
        { role: "user", content: `طلب الطالب: ${userText}` },
      ],
    }).catch((error) => { throw Object.assign(error, { phase: "AI_GENERATE" }); });

    diagnostics.currentStep = "NORMALIZE_QUESTIONS";
    const normalizedQuestions = normalizeGeneratedQuestions((generated.questions as any[]) || [], diagnostics);
    if (!normalizedQuestions.length) return failure(traceId, "AI_NO_VALID_QUESTIONS", new Error("No normalized questions"), 500, diagnostics);

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
      mode: "direct_edge_save",
      firstQuestion: normalizedQuestions[0]
        ? {
          type: normalizedQuestions[0].type,
          textPreview: normalizedQuestions[0].question.slice(0, 180),
          options: normalizedQuestions[0].options,
          correctAnswer: normalizedQuestions[0].correct_answer,
        }
        : null,
    });
    diagnostics.currentStep = "SAVE_TRAINING_EXAM";
    let created: any;
    try {
      created = await saveTrainingExamDirect(admin, userId, payload, traceId);
    } catch (directSaveError) {
      return failure(traceId, "SAVE_TRAINING_EXAM", directSaveError, 500, diagnostics);
    }
    if (!created?.success || !created?.examId) return failure(traceId, "SAVE_TRAINING_EXAM", new Error(created?.error || "training exam RPC returned no exam"), 500, diagnostics);

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
      redirectTo: `/student/exams/${created.examId}/take${created.attemptId ? `?attempt=${created.attemptId}` : ""}`,
      reply: `تم إنشاء **${examTitle}** — ${created.questionCount || normalizedQuestions.length} سؤال، مدة الحل ${durationMinutes} دقيقة.`,
    });
  } catch (error: any) {
    if (error?.message === "rate_limited") return failure(traceId, "AI_RATE_LIMIT", error, 429, diagnostics);
    if (error?.message === "credits_exhausted") return failure(traceId, "AI_CREDITS", error, 402, diagnostics);
    return failure(traceId, error?.phase || "UNHANDLED_EXCEPTION", error, 500, diagnostics);
  }
});
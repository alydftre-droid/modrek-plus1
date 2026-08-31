// deno-lint-ignore-file no-explicit-any
import { sanitizeAiRequestBody } from '../_shared/promptGuard.ts';
// Modrek AI — Reasoning & Assistant Brain (Phase 4)
// Central orchestrator: Intent → Plan → Retrieve (library-first) → Reason → Answer w/ citations.
// Modes: answer | explain | solve | summarize | compare | translate |
//        generate_exam | extract_questions | analyze_exam | analyze_image | grade_answer
//
// NOTE: This function only orchestrates & generates. It does NOT modify DB schema,
// does NOT touch the library ingestion pipeline, and does NOT rebuild search.
// It relies on modrek-retrieve for all library lookups.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { callGeminiWithFallback, resolveGeminiApiKey } from "../_shared/aiSettings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

// Modrek reasoning engine powers student chat / lesson explanation / RAG
// responses / image analysis — all Flash per platform policy
// (see supabase/functions/_shared/aiModels.ts). Pro is exam-only.
const REASON_MODEL_PRIMARY = "google/gemini-2.5-flash";
const REASON_MODEL_FALLBACK = "google/gemini-2.5-flash-lite";
const VISION_MODEL = "google/gemini-2.5-flash";


const CONFIDENCE_MIN = 0.55;
const MAX_CONTEXT_CHARS = 12000;

type Mode =
  | "auto" | "answer" | "explain" | "solve" | "summarize" | "compare" | "translate"
  | "generate_exam" | "extract_questions" | "analyze_exam" | "analyze_image" | "grade_answer";

interface ChatMsg { role: "system" | "user" | "assistant"; content: any }

interface ReasonRequest {
  mode?: Mode;
  query?: string;
  messages?: ChatMsg[];
  image_base64?: string | null;
  image_mime?: string | null;
  file_base64?: string | null;
  file_mime?: string | null;
  file_name?: string | null;
  filters?: Record<string, any>;
  exam?: {
    question_count?: number;
    mcq?: number;
    tf?: number;
    essay?: number;
    difficulty?: "سهل" | "متوسط" | "صعب" | "مختلط";
    distribution?: string;
    subject?: string;
    lesson?: string;
  };
  student_answer?: string;
  model_answer?: string;
  stream?: boolean;
  user_id?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const started = Date.now();
  try {
    // SECURITY: require a verified Supabase user. Prevents unauthenticated
    // access to admin-only library/knowledge content via the service-role
    // client used below and via nested modrek-retrieve calls.
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ error: "unauthorized" }, 401);
    }
    const authClient = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(
      authHeader.replace(/^Bearer\s+/i, "").trim(),
    );
    if (claimsErr || !claimsData?.claims?.sub) {
      return json({ error: "unauthorized" }, 401);
    }
    const verifiedUserId = String(claimsData.claims.sub);

    const body = (await req.json().catch(() => ({}))) as ReasonRequest;
    try { sanitizeAiRequestBody(body); } catch (_e) { /* noop */ }
    // SECURITY: user_id comes only from the verified token, never from the body.
    body.user_id = verifiedUserId;
    const mode: Mode = body.mode ?? "auto";
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);


    const userQuery = extractQuery(body);
    if (!userQuery && !body.image_base64 && !body.file_base64 && mode !== "generate_exam") {
      return json({ error: "empty_query" }, 400);
    }

    // ---------- STEP 1: PLAN ----------
    const plan = await buildPlan({
      mode, query: userQuery, hasImage: !!body.image_base64,
      hasFile: !!body.file_base64, exam: body.exam,
    });

    // ---------- STEP 2: RETRIEVE (library first) ----------
    let retrieval: any = null;
    if (plan.use_library) {
      retrieval = await callRetrieve(req, {
        query: plan.retrieval_query || userQuery,
        image_base64: body.image_base64 ?? undefined,
        image_mime: body.image_mime ?? undefined,
        filters: body.filters ?? {},
        user_id: body.user_id ?? undefined,
      }).catch((e) => {
        console.warn("[reason] retrieve failed", e?.message ?? e);
        return null;
      });
    }

    // ---------- STEP 3: BUILD CONTEXT ----------
    const contextBlock = buildContextBlock(retrieval);
    const citations = extractCitations(retrieval);
    const confidence = retrieval?.top_confidence ?? 0;
    const libraryUsable = !!retrieval && !retrieval.below_threshold && citations.length > 0;

    // ---------- STEP 4: SPECIALIZED MODES ----------
    if (plan.effective_mode === "generate_exam") {
      const exam = await runExamGenerator({
        query: userQuery,
        exam: body.exam ?? {},
        file_base64: body.file_base64 ?? null,
        file_mime: body.file_mime ?? null,
        file_name: body.file_name ?? null,
        contextBlock,
        libraryUsable,
      });
      return json({
        mode: "generate_exam", plan, exam,
        citations, confidence,
        library_used: libraryUsable, suggest_external: !libraryUsable,
        duration_ms: Date.now() - started,
      });
    }

    if (plan.effective_mode === "extract_questions" || plan.effective_mode === "analyze_exam") {
      if (!body.file_base64 && !body.image_base64) {
        return json({ error: "missing_attachment" }, 400);
      }
      const analysis = await runExamAnalyzer({
        query: userQuery,
        image_base64: body.image_base64 ?? null,
        image_mime: body.image_mime ?? null,
        file_base64: body.file_base64 ?? null,
        file_mime: body.file_mime ?? null,
        file_name: body.file_name ?? null,
        mode: plan.effective_mode,
      });
      return json({
        mode: plan.effective_mode, plan, analysis,
        citations, confidence,
        library_used: libraryUsable,
        duration_ms: Date.now() - started,
      });
    }

    if (plan.effective_mode === "analyze_image") {
      const analysis = await runImageAnalyzer({
        query: userQuery,
        image_base64: body.image_base64 ?? "",
        image_mime: body.image_mime ?? "image/jpeg",
        contextBlock,
      });
      return json({
        mode: "analyze_image", plan, analysis,
        citations, confidence,
        library_used: libraryUsable, suggest_external: !libraryUsable,
        duration_ms: Date.now() - started,
      });
    }

    if (plan.effective_mode === "grade_answer") {
      const grading = await runGrader({
        query: userQuery,
        student_answer: body.student_answer ?? "",
        model_answer: body.model_answer ?? "",
        contextBlock,
      });
      return json({
        mode: "grade_answer", plan, grading,
        citations, confidence,
        duration_ms: Date.now() - started,
      });
    }

    // ---------- STEP 5: GENERAL REASONING (answer / explain / solve / summarize / compare / translate) ----------
    const messages = buildReasoningMessages({
      mode: plan.effective_mode,
      userQuery,
      priorMessages: body.messages ?? [],
      contextBlock,
      libraryUsable,
      plan,
    });

    const answer = await callChatWithFallback(messages);

    return json({
      mode: plan.effective_mode,
      plan,
      answer,
      citations,
      confidence,
      library_used: libraryUsable,
      suggest_external: !libraryUsable,
      duration_ms: Date.now() - started,
    });
  } catch (e: any) {
    console.error("modrek-reason error", e);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

// ================= HELPERS =================

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractQuery(body: ReasonRequest): string {
  if (body.query && body.query.trim()) return body.query.trim();
  const last = (body.messages ?? []).slice().reverse().find((m) => m.role === "user");
  if (!last) return "";
  if (typeof last.content === "string") return last.content;
  if (Array.isArray(last.content)) {
    return last.content
      .filter((p: any) => p?.type === "text")
      .map((p: any) => p.text)
      .join("\n");
  }
  return String(last.content ?? "");
}

// ---------- PLANNING ----------
async function buildPlan(input: {
  mode: Mode; query: string; hasImage: boolean; hasFile: boolean; exam: any;
}) {
  const explicit = input.mode !== "auto" ? input.mode : null;
  let effective: Mode = explicit ?? "answer";
  let use_library = true;
  let retrieval_query = input.query;
  let reasoning = "";

  if (!explicit) {
    // Lightweight rules — cheap and deterministic; heavy classification is done inside modrek-retrieve.
    const q = input.query.toLowerCase();
    if (input.hasImage && !input.hasFile) effective = "analyze_image";
    else if (input.hasFile && /امتحان|اسئلة|أسئلة|exam/.test(q)) effective = "analyze_exam";
    else if (/انشئ|أنشئ|امتحان|اختبار|اسئلة جديدة|generate exam/.test(q)) effective = "generate_exam";
    else if (/استخرج|استخراج/.test(q) && /اسئلة|أسئلة/.test(q)) effective = "extract_questions";
    else if (/لخص|ملخص|summarize/.test(q)) effective = "summarize";
    else if (/قارن|فرق|compare/.test(q)) effective = "compare";
    else if (/ترجم|translate/.test(q)) effective = "translate";
    else if (/حل|احسب|solve/.test(q)) effective = "solve";
    else if (/اشرح|شرح|explain/.test(q)) effective = "explain";
  }

  if (effective === "translate") use_library = false;
  if (effective === "generate_exam") {
    reasoning = "Exam generator will use library context if available.";
    retrieval_query = `${input.exam?.subject ?? ""} ${input.exam?.lesson ?? ""} ${input.query}`.trim();
  }
  if (effective === "extract_questions" || effective === "analyze_exam") use_library = false;

  return {
    original_mode: input.mode,
    effective_mode: effective,
    use_library,
    retrieval_query,
    reasoning,
    has_image: input.hasImage,
    has_file: input.hasFile,
  };
}

// ---------- RETRIEVAL ----------
async function callRetrieve(req: Request, payload: Record<string, any>) {
  const auth = req.headers.get("Authorization") ?? "";
  const r = await fetch(`${SUPABASE_URL}/functions/v1/modrek-retrieve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": auth,
      "apikey": Deno.env.get("SUPABASE_ANON_KEY") ?? SERVICE_ROLE,
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`retrieve_${r.status}`);
  return await r.json();
}

function buildContextBlock(retrieval: any): string {
  const research = retrieval?.research;
  const researchTail = [research?.context_block, research?.mandate_block].filter(Boolean).join("\n\n");
  if (!retrieval || !Array.isArray(retrieval.results) || retrieval.results.length === 0) return researchTail;
  const parts: string[] = [];
  let total = 0;
  for (let i = 0; i < retrieval.results.length; i++) {
    const r = retrieval.results[i];
    const c = r.citation ?? {};
    const header = `[مصدر ${i + 1}] ${c.source_title ?? ""} — ${c.unit_title ?? ""}${c.page_from ? ` — صفحة ${c.page_from}${c.page_to && c.page_to !== c.page_from ? "-" + c.page_to : ""}` : ""}`;
    const body = String(r.text ?? "").slice(0, 2500);
    const block = `${header}\n${body}`;
    if (total + block.length > MAX_CONTEXT_CHARS) break;
    parts.push(block);
    total += block.length;
  }
  const libraryBlock = parts.join("\n\n---\n\n");
  return researchTail ? `${libraryBlock}\n\n${researchTail}` : libraryBlock;
}

function extractCitations(retrieval: any) {
  const library = Array.isArray(retrieval?.results)
    ? retrieval.results.map((r: any, i: number) => ({
        index: i + 1,
        source_id: r.citation?.source_id ?? null,
        source_title: r.citation?.source_title ?? null,
        source_type: r.citation?.source_type ?? null,
        unit_title: r.citation?.unit_title ?? null,
        page_from: r.citation?.page_from ?? null,
        page_to: r.citation?.page_to ?? null,
        confidence: r.confidence ?? null,
      }))
    : [];
  // مصادر البحث الخارجي تُعرض للطالب فقط عند استخدام البحث فعليًا.
  const web = Array.isArray(retrieval?.research?.citations)
    ? retrieval.research.citations.map((c: any, i: number) => ({
        index: library.length + i + 1,
        source_id: null,
        source_title: c.title ?? c.domain ?? null,
        source_type: "web",
        unit_title: c.domain ?? null,
        page_from: null,
        page_to: null,
        url: c.url ?? null,
        confidence: null,
      }))
    : [];
  return [...library, ...web];
}

// ---------- REASONING PROMPTS ----------
function buildReasoningMessages(args: {
  mode: Mode; userQuery: string; priorMessages: ChatMsg[];
  contextBlock: string; libraryUsable: boolean; plan: any;
}): ChatMsg[] {
  const { mode, userQuery, priorMessages, contextBlock, libraryUsable } = args;

  const guidelines = `أنت "Modrek AI"، مساعد تعليمي عربي احترافي.
- التزم بلغة عربية فصيحة واضحة، ومناسبة لمستوى الطالب.
- اعتمد أولًا على المصادر المرفقة من مكتبة المنصة (إن وجدت). لا تنسخ حرفيًا، بل أعد الصياغة.
- عند الاعتماد على مصدر اذكر الاستشهاد داخل النص هكذا: (المصدر رقم N).
- إذا لم تكن المصادر كافية، وضّح ذلك بصراحة ولا تخترع معلومات.
- للمسائل الرياضية أظهر الخطوات بالتسلسل، وليس الناتج فقط.
- استخدم Markdown مع عناوين وقوائم مرتبة عند الحاجة.`;

  const modeInstruction: Record<string, string> = {
    answer:    "أجب عن السؤال بدقة وباختصار مفيد.",
    explain:   "اشرح الدرس/المفهوم كمعلم محترف مع أمثلة وتفصيل تدريجي.",
    solve:     "حل المسألة خطوة بخطوة مع تفسير كل خطوة.",
    summarize: "قدّم ملخصًا منظمًا بنقاط واضحة.",
    compare:   "قارن العناصر المطلوبة في جدول أو نقاط متقابلة.",
    translate: "ترجم النص إلى اللغة المطلوبة مع الحفاظ على المعنى.",
  };

  const sys: string =
    guidelines + "\n\n" +
    (modeInstruction[mode] ?? modeInstruction.answer) + "\n\n" +
    (contextBlock
      ? `مقتطفات من مكتبة Modrek (استخدمها كمصدر أول):\n\n${contextBlock}`
      : (libraryUsable
          ? ""
          : "لا توجد مصادر من المكتبة بثقة كافية. أجب من معرفتك العامة مع التنبيه للمستخدم."));

  const trimmedHistory = (priorMessages ?? []).slice(-8).filter((m) => m.role !== "system");

  return [
    { role: "system", content: sys },
    ...trimmedHistory,
    { role: "user", content: userQuery || "..." },
  ];
}

async function callGeminiJson(messages: ChatMsg[], models: string[], timeoutMs = 90_000) {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const resolved = await resolveGeminiApiKey(admin, GEMINI_API_KEY);
  const result = await callGeminiWithFallback({
    apiKey: resolved.apiKey,
    models,
    body: { messages, response_format: { type: "json_object" }, temperature: 0.2 },
    timeoutMs,
  });
  if (!result.ok) throw new Error(`gemini_json_${result.status}:${String(result.lastError ?? "").slice(0, 200)}`);
  const data = await result.response.json();
  const content = String(data?.choices?.[0]?.message?.content ?? "").trim();
  try { return JSON.parse(content || "{}"); }
  catch { return { raw: content }; }
}

async function callChat(model: string, messages: ChatMsg[], opts: any = {}) {
  const body = { model, messages, temperature: opts.temperature ?? 0.4, ...opts.extra };
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const resolved = await resolveGeminiApiKey(admin, GEMINI_API_KEY);
  const geminiModel = model.replace(/^google\//, "");
  const result = await callGeminiWithFallback({
    apiKey: resolved.apiKey,
    models: [geminiModel, "gemini-2.5-flash", "gemini-2.5-flash-lite"],
    body: { ...body, model: geminiModel },
    timeoutMs: 90_000,
  });
  if (!result.ok) throw new Error(`chat_${result.status}:${String(result.lastError ?? "").slice(0, 200)}`);
  const data = await result.response.json();
  return String(data?.choices?.[0]?.message?.content ?? "").trim();
}

async function callChatWithFallback(messages: ChatMsg[]) {
  try {
    return await callChat(REASON_MODEL_PRIMARY, messages);
  } catch (e) {
    console.warn("[reason] primary failed, falling back", (e as Error).message);
    return await callChat(REASON_MODEL_FALLBACK, messages);
  }
}

// ---------- EXAM GENERATION ----------
async function runExamGenerator(args: {
  query: string; exam: any;
  file_base64: string | null; file_mime: string | null; file_name: string | null;
  contextBlock: string; libraryUsable: boolean;
}) {
  const e = args.exam ?? {};
  const total = Number(e.question_count) || (Number(e.mcq) || 0) + (Number(e.tf) || 0) + (Number(e.essay) || 0) || 10;
  const mcq = Number(e.mcq) || Math.ceil(total * 0.5);
  const tf = Number(e.tf) || Math.ceil(total * 0.3);
  const essay = Number(e.essay) || Math.max(1, total - mcq - tf);
  const difficulty = e.difficulty || "متوسط";

  const sys = `أنت خبير مناهج عربي. أنشئ امتحانًا احترافيًا بصيغة JSON فقط.
اعتمد أولًا على المصادر المرفقة من مكتبة Modrek إن وجدت، ولا تخرج عن نطاق المنهج.
- ${mcq} اختيار من متعدد (4 خيارات).
- ${tf} صح/خطأ.
- ${essay} مقالي مع نموذج إجابة شامل.
- المستوى: ${difficulty}.
- رتب: MCQ ← True/False ← Essay.
- لكل سؤال حدد points (1-5) و source_ref إن أمكن.
- أسئلة صح/خطأ إلزاميًا: options يجب أن تكون بالضبط ["صح", "خطأ"]، و correct_answer يجب أن تكون بالضبط "صح" أو "خطأ" فقط، ولا تستخدم true/false أو boolean.
- الأسئلة المقالية/أكمل/الإجابة القصيرة: model_answer يجب أن يكون إجابة نموذجية كاملة قابلة للتصحيح، ولا تتركه فارغًا أبدًا.
${e.distribution ? `- توزيع المنهج: ${e.distribution}` : ""}`;

  const userContent: any[] = [{
    type: "text",
    text: [
      args.query ? `طلب المعلم:\n${args.query}` : "",
      e.subject ? `المادة: ${e.subject}` : "",
      e.lesson ? `الدرس: ${e.lesson}` : "",
      args.contextBlock ? `\n\nمصادر من مكتبة Modrek:\n${args.contextBlock}` : "",
      !args.libraryUsable && !args.file_base64
        ? "\n\n(لا يوجد مصدر كافٍ من المكتبة — أنشئ الأسئلة من معرفتك العامة مع الالتزام بالمنهج)"
        : "",
    ].filter(Boolean).join("\n"),
  }];

  if (args.file_base64) {
    const isPdf = (args.file_mime ?? "").includes("pdf") || String(args.file_name ?? "").toLowerCase().endsWith(".pdf");
    userContent.push(isPdf
      ? { type: "file", file: { filename: args.file_name ?? "content.pdf", file_data: `data:application/pdf;base64,${args.file_base64}` } }
      : { type: "image_url", image_url: { url: `data:${args.file_mime ?? "image/jpeg"};base64,${args.file_base64}` } });
  }

  const tools = [{
    type: "function",
    function: {
      name: "generate_exam_questions",
      description: "Structured exam",
      parameters: {
        type: "object",
        properties: {
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                question: { type: "string" },
                type: { type: "string", enum: ["mcq", "true_false", "essay"] },
                options: { type: "array", items: { type: "string" } },
                correct_answer: { type: "string" },
                model_answer: { type: "string" },
                points: { type: "number" },
                source_ref: { type: "string" },
              },
              required: ["question", "type", "points"],
            },
          },
        },
        required: ["questions"],
      },
    },
  }];

  const requestBody = {
    model: REASON_MODEL_PRIMARY,
    messages: [{ role: "system", content: sys }, { role: "user", content: userContent }],
    tools,
    tool_choice: { type: "function", function: { name: "generate_exam_questions" } },
    temperature: 0.3,
  };

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const resolved = await resolveGeminiApiKey(admin, GEMINI_API_KEY);
  const result = await callGeminiWithFallback({
    apiKey: resolved.apiKey,
    models: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
    body: { ...requestBody, model: "gemini-2.5-flash" },
    timeoutMs: 120_000,
  });
  if (!result.ok) throw new Error(`exam_gen_${result.status}`);
  const data = await result.response.json();

  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  const content = data?.choices?.[0]?.message?.content;
  if (!call && typeof content === "string" && content.trim()) {
    try { return JSON.parse(content.replace(/```json?\n?/g, "").replace(/```/g, "").trim()); }
    catch { /* fall through */ }
  }
  if (!call) throw new Error("exam_gen_no_tool_call");
  try { return JSON.parse(call.function.arguments); }
  catch { throw new Error("exam_gen_invalid_json"); }
}

// ---------- EXAM ANALYSIS / EXTRACTION ----------
async function runExamAnalyzer(args: {
  query: string; mode: string;
  image_base64: string | null; image_mime: string | null;
  file_base64: string | null; file_mime: string | null; file_name: string | null;
}) {
  const sys = `أنت مقيّم امتحانات عربي محترف. حلّل الملف واستخرج JSON فقط بالحقول:
{
  "questions": [
    { "number": number, "question": string, "type": "mcq"|"true_false"|"essay"|"short_answer",
      "difficulty": "سهل"|"متوسط"|"صعب", "topic": string|null,
      "options": string[]|null, "answer_hint": string|null, "points": number|null }
  ],
  "summary": {
    "total": number,
    "by_type": { "mcq": number, "true_false": number, "essay": number, "short_answer": number },
    "by_difficulty": { "سهل": number, "متوسط": number, "صعب": number },
    "topics": string[],
    "coverage_notes": string,
    "quality_score": number,
    "improvements": string[]
  }
}`;

  const attachment: any = args.file_base64
    ? ((args.file_mime ?? "").includes("pdf") || String(args.file_name ?? "").toLowerCase().endsWith(".pdf")
        ? { type: "file", file: { filename: args.file_name ?? "exam.pdf", file_data: `data:application/pdf;base64,${args.file_base64}` } }
        : { type: "image_url", image_url: { url: `data:${args.file_mime ?? "image/jpeg"};base64,${args.file_base64}` } })
    : { type: "image_url", image_url: { url: `data:${args.image_mime ?? "image/jpeg"};base64,${args.image_base64}` } };

  return await callGeminiJson([
    { role: "system", content: sys },
    { role: "user", content: [{ type: "text", text: args.query || "حلل هذا الامتحان" }, attachment] },
  ] as any, [VISION_MODEL.replace(/^google\//, ""), "gemini-2.5-flash", "gemini-2.5-flash-lite"], 120_000);
}

// ---------- IMAGE ANALYSIS ----------
async function runImageAnalyzer(args: {
  query: string; image_base64: string; image_mime: string; contextBlock: string;
}) {
  const sys = `أنت معلم عربي محترف يحلل صور المحتوى التعليمي.
- استخرج النص أو المسألة من الصورة أولًا.
- ثم إن كانت مسألة: حلّها خطوة بخطوة. وإن كانت شرحًا: لخّصه واشرحه.
- اعتمد على مصادر المكتبة إن وجدت وأذكر (المصدر رقم N).
- أعد Markdown منظمًا.`;

  const messages: any[] = [
    { role: "system", content: sys + (args.contextBlock ? `\n\nمصادر:\n${args.contextBlock}` : "") },
    {
      role: "user",
      content: [
        { type: "text", text: args.query || "حلل هذه الصورة تعليميًا" },
        { type: "image_url", image_url: { url: `data:${args.image_mime};base64,${args.image_base64}` } },
      ],
    },
  ];
  const content = await callChat(VISION_MODEL, messages as any, { temperature: 0.3 });
  return { content };
}

// ---------- GRADER ----------
async function runGrader(args: {
  query: string; student_answer: string; model_answer: string; contextBlock: string;
}) {
  const sys = `أنت مصحح امتحانات عربي. قيّم إجابة الطالب مقارنة بنموذج الإجابة والسياق.
أعد JSON فقط:
{
  "score_percent": number 0-100,
  "verdict": "صحيحة"|"صحيحة جزئيًا"|"خاطئة",
  "correct_points": string[],
  "missing_points": string[],
  "mistakes": string[],
  "feedback": string
}`;
  const user = `السؤال:\n${args.query}\n\nإجابة الطالب:\n${args.student_answer}\n\nنموذج الإجابة:\n${args.model_answer || "(غير متاح)"}${args.contextBlock ? `\n\nسياق من المكتبة:\n${args.contextBlock}` : ""}`;

  return await callGeminiJson(
    [{ role: "system", content: sys }, { role: "user", content: user }],
    [REASON_MODEL_PRIMARY.replace(/^google\//, ""), "gemini-2.5-flash", "gemini-2.5-flash-lite"],
    90_000,
  );
}

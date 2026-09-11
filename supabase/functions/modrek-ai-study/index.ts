// Modrek AI - Study assistant (chat)
// Reads student profile automatically. Supports text + images + PDF via Lovable AI Gateway.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { callGeminiWithFallback, resolveGeminiApiKey, detectAiFailureKind } from "../_shared/aiSettings.ts";
import { buildTeacherEnginePrompt } from "../_shared/teacherEngine.ts";
import { enforceAiQuota, aiQuotaResponse } from "../_shared/aiQuota.ts";
import { enforceStudentAiQuota, studentAiQuotaResponse } from "../_shared/studentAiQuota.ts";
import {
  resolveStudentScope,
  retrieveFromLibrary,
  buildStudentScopeBlock,
  buildLibraryContextBlock,
  logRagPipeline,
  MODREK_ASSISTANT_SCOPE_RULES,
} from "../_shared/modrekLibraryRag.ts";
import { hybridResearch } from "../_shared/modrekWebResearch.ts";
import { resolveAnswerScopeFromMessages, buildAnswerScopeBlock, isDeepTeaching } from "../_shared/answerScope.ts";
import {
  dedupeRepeatedBlocks,
  isTruncated,
  stitchContinuation,
  CONTINUE_INSTRUCTION,
  LESSON_DIAGRAM_SYSTEM,
  parseLessonDiagram,
  type LessonDiagram,
} from "../_shared/lessonAnswerPostProcess.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const token = auth.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    // Cost protection: per-user daily + burst quota (admins bypass).
    const quota = await enforceAiQuota(userId, "modrek-ai-study");
    if (!quota.allowed) return aiQuotaResponse(quota, corsHeaders);

    const body = await req.json().catch(() => null);
    if (!body?.messages || !Array.isArray(body.messages)) return json({ error: "messages required" }, 400);

    // Student AI quota (shared with the exams assistant), enforced before any
    // AI provider call. Teachers/admins/support are exempt inside the RPC.
    const studentQuota = await enforceStudentAiQuota(userId, 1);
    if (!studentQuota.allowed) return studentAiQuotaResponse(studentQuota, corsHeaders);

    const { messages, conversationContext = {} } = body;

    // Load profile for automatic context
    const { data: profile } = await supabase
      .from("profiles")
      .select("stage, grade, section, education_type, full_name")
      .eq("id", userId)
      .maybeSingle();

    const eduType = profile?.education_type === "azhar" ? "الأزهر" : "التعليم العام";
    const stage = stageLabel(profile?.stage);
    const grade = gradeLabel(profile?.grade);
    const section = profile?.section || null;

    const contextLine = conversationContext?.title
      ? `سياق المحادثة الثابت: ${conversationContext.title}${conversationContext.subject_name ? ` (المادة: ${conversationContext.subject_name})` : ""}${conversationContext.chapter ? ` — ${conversationContext.chapter}` : ""}.`
      : "";

    // ---------- Exam review context (post-exam AI review) ----------
    // When the caller is PostExamReviewChat we receive a rich context_json
    // that already contains the exam, attempt summary, every question, the
    // student's answers, correctness, feedback, and explanations. Inject it
    // verbatim as an authoritative source so the model can reference specific
    // questions by number without asking the student to re-share anything.
    let examReviewBlock = "";
    try {
      const ctx: any = conversationContext || {};
      if (ctx?.attempt_id && Array.isArray(ctx?.questions) && ctx.questions.length > 0) {
        const s = ctx.attempt_summary || {};
        const header =
          `## سياق مراجعة الامتحان (مصدر موثوق — لا تطلب من الطالب تكراره)\n` +
          `- الامتحان: ${ctx.exam?.title || "—"}\n` +
          `- المادة: ${ctx.subject_name || "—"}\n` +
          `- عدد الأسئلة: ${s.total_questions ?? ctx.questions.length}\n` +
          `- الدرجة: ${s.total_score ?? "?"} / ${s.max_score ?? "?"} (${s.percentage ?? "?"}%)\n` +
          `- الحالة: ${s.status || "?"}${s.is_graded === false ? " — بانتظار تصحيح المعلم لبعض الأسئلة" : ""}\n` +
          `- إجابات صحيحة: ${s.correct_count ?? "?"} • خاطئة: ${s.wrong_count ?? "?"} • بدون إجابة: ${s.unanswered_count ?? "?"}\n` +
          `- زمن الحل: ${s.time_spent_seconds ? Math.round(s.time_spent_seconds / 60) + " دقيقة" : "—"}\n`;

        const qLines = ctx.questions
          .filter((q: any) => q.type !== "section")
          .map((q: any, idx: number) => {
            const num = q.n ?? idx + 1;
            const opts = Array.isArray(q.options) && q.options.length
              ? "\n  الخيارات: " + q.options.map((o: any) => `${o.is_correct ? "✅" : "•"} ${o.text}`).join(" | ")
              : "";
            const status =
              q.is_correct === true ? "✅ صحيحة" :
              q.is_correct === false ? "❌ خاطئة" :
              q.student_answer ? "⏳ بانتظار التصحيح" : "— لم يجب";
            return (
              `\n### سؤال ${num} (${q.type}) — ${q.marks_awarded ?? 0}/${q.marks ?? 0} — ${status}\n` +
              `- نص السؤال: ${q.text || "—"}${opts}\n` +
              `- الإجابة الصحيحة: ${q.correct ?? "—"}\n` +
              `- إجابة الطالب: ${q.student_answer ?? "لم يجب"}\n` +
              (q.ai_feedback ? `- ملاحظة التصحيح: ${q.ai_feedback}\n` : "") +
              (q.explanation ? `- الشرح المرجعي: ${q.explanation}\n` : "")
            );
          })
          .join("");

        examReviewBlock =
          "\n\n" + header + qLines +
          `\n\n### تعليمات مراجعة الامتحان (إلزامية)\n` +
          `- تصرّف كمعلم صحّح هذا الامتحان بنفسه ويعرف كل تفاصيله.\n` +
          `- عندما يشير الطالب إلى "السؤال الثالث" أو "ليه ادّتني صفر" أو "أنا كتبت نفس الإجابة"، ارجع لبيانات السؤال أعلاه مباشرةً وقارن إجابته بالإجابة الصحيحة وسبب التصحيح.\n` +
          `- إذا طلب "راجع معايا سؤال سؤال" ابدأ من السؤال الأول واسر بالترتيب.\n` +
          `- إذا طلب "اعمل اختبار جديد على أخطائي" اعتمد فقط على الأسئلة التي is_correct=false أو التي لم يجب عنها.\n` +
          `- لا تسأل الطالب عن الامتحان أو رفعه؛ كل البيانات معك.\n`;
      }
    } catch (_) { /* ignore malformed context */ }


    // ---------- Unified Modrek library retrieval (single source of truth) ----------
    // Pipeline: Student Context -> Library Retrieval -> Rerank -> Chunks -> Answer
    const adminEarly = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!,
    );

    let knowledgeBlock = "";
    let allowExternal = true;
    let scopeBlock = "";
    let deepTeaching = false;

    try {
      const lastUser = [...messages].reverse().find((m: any) => m.role === "user");
      const queryText = typeof lastUser?.content === "string"
        ? lastUser.content
        : Array.isArray(lastUser?.content)
          ? lastUser.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n")
          : "";
      const trimmedQ = (queryText || "").trim();

      // Prior user turns let "اشرح لي هذا الدرس" inherit the previous subject/lesson.
      const history = messages
        .filter((m: any) => m.role === "user")
        .map((m: any) => (typeof m.content === "string"
          ? m.content
          : Array.isArray(m.content) ? m.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join(" ") : ""))
        .filter(Boolean)
        .slice(-6, -1);

      const earlyScope = resolveAnswerScopeFromMessages(messages);
      deepTeaching = isDeepTeaching(earlyScope);
      const scope = await resolveStudentScope(adminEarly, userId, req.headers.get("Authorization"));
      scopeBlock = buildStudentScopeBlock(scope);

      if (trimmedQ.length >= 3) {
        const rag = await retrieveFromLibrary(adminEarly, {
          userId,
          query: trimmedQ,
          history,
          contextSubject: (conversationContext as any)?.subject_name ?? null,
          maxPassages: deepTeaching ? 24 : 8,
          surface: "modrek-ai-study",
          scope,

        });
        logRagPipeline("modrek-ai-study", rag);

        // Hybrid decision engine: library first, trusted web research only when
        // the retrieved coverage is incomplete.
        const research = await hybridResearch({
          admin: adminEarly,
          surface: "modrek-ai-study",
          query: trimmedQ,
          library: rag,
          scope,
        }).catch((e) => {
          console.warn("[modrek-ai-study] hybrid research failed", String(e).slice(0, 200));
          return null;
        });

        const researchActive = Boolean(research?.evaluation?.needs_web);
        knowledgeBlock = `\n\n${buildLibraryContextBlock(rag, { researchActive })}\n${research?.contextBlock ? `\n${research.contextBlock}\n` : ""}${research?.mandateBlock ? `\n${research.mandateBlock}\n` : ""}`;
        allowExternal = !rag.found || Boolean(research?.usedWeb) || researchActive;
      }
    } catch (retrievalErr) {
      console.warn("[modrek-ai-study] library retrieval failed", String(retrievalErr).slice(0, 300));
      allowExternal = true;
    }

    // Intent -> scope -> length. Only controls answer size/scope, nothing else.
    const answerScope = resolveAnswerScopeFromMessages(messages);
    deepTeaching = isDeepTeaching(answerScope);
    console.log("[modrek-ai-study] answer intent:", answerScope.intent);

    const systemPrompt = buildTeacherEnginePrompt(`${scopeBlock || `بيانات الطالب:
- الاسم: ${profile?.full_name || "الطالب"}
- المرحلة: ${stage || "غير محددة"}
- الصف: ${grade || "غير محدد"}
- النظام: ${eduType}
${section ? `- الشعبة: ${section}` : ""}`}

${MODREK_ASSISTANT_SCOPE_RULES}

${contextLine}
${examReviewBlock}
${knowledgeBlock}

مهامك: شرح الدروس في كل المواد (شرعية، عربية، أدبية، لغات، علمية)، حل المسائل والأسئلة، شرح الصور وملفات PDF المرفقة، وإنشاء تدريبات ومراجعات وتلخيص.

قواعد المصادر (إلزامية بهذا الترتيب):
1. اعتمد أولًا على محتوى مكتبة Modrek المرفق أعلاه، وعلى فهرس الكتاب في تسمية الدروس وترتيبها.
2. ${allowExternal
      ? "المكتبة لم تكفِ: أكمل من المصادر الخارجية المرفقة (إن وُجدت) أو من المنهج الرسمي الموثوق (وزارة التربية والتعليم / الأزهر)، مع جملة قصيرة توضح أن الشرح من مصدر خارجي، وممنوع الاكتفاء بالقول إن الدرس غير موجود، وممنوع اختراع أسماء دروس أو كتب."
      : "لا تستخدم مصادر خارجية؛ اعتمد على محتوى المكتبة أعلاه فقط، وإذا كان ناقصًا قل ذلك صراحةً."}
3. لا تسأل الطالب عن مرحلته أو صفه أو نظامه أو شعبته أبدًا.
4. إذا لم يذكر الطالب المادة صراحة، استخدم سياق المحادثة أو آخر مادة تحدثتما عنها.
5. اربط الشرح دائمًا بمنهج الصف والمرحلة المذكورين أعلاه وبطريقة الامتحان المصري.

${buildAnswerScopeBlock(answerScope)}`, { concise: !answerScope.expansive });



    const gwMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { apiKey: GEMINI_API_KEY } = await resolveGeminiApiKey(admin, Deno.env.get("GEMINI_API_KEY") || "");

    const result = await callGeminiWithFallback({
      apiKey: GEMINI_API_KEY,
      models: ["google/gemini-2.5-flash", "google/gemini-2.5-flash-lite"],
      body: {
        temperature: 0.5,
        messages: gwMessages,
        // Full-lesson explanations need the whole output budget so the answer
        // is never cut short mid-lesson.
        max_tokens: deepTeaching ? 16384 : 4096,
      },
      timeoutMs: deepTeaching ? 120000 : 45000,
    });

    if (!result.ok) {
      const kind = detectAiFailureKind(result.status, result.lastError);
      console.error("[modrek-ai-study] gateway error", result.status, String(result.lastError).slice(0, 400), "kind:", kind);
      if (result.status === 429) return json({ error: "تم تجاوز حد الاستخدام. حاول بعد قليل." }, 429);
      if (result.status === 402) return json({ error: "نفدت رصيد الاشتراك في خدمة الذكاء الاصطناعي." }, 402);
      // Return a graceful assistant reply instead of a 502 so the UI never appears stuck.
      return json({ reply: "تعذر الوصول للمساعد الآن. أعد إرسال سؤالك بعد لحظات وسأكمل معك فورًا.", fallback: true });
    }

    const data = await result.response.json().catch(() => ({} as any));
    let reply = data?.choices?.[0]?.message?.content ?? "";
    if (!reply) {
      return json({ reply: "لم يصلني رد مكتمل هذه المرة. أعد صياغة سؤالك بشكل أقصر وسأحاول فورًا.", fallback: true });
    }

    // ---------- Anti-truncation: continue a lesson that hit the token budget ----------
    if (deepTeaching && isTruncated(data?.choices?.[0])) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const cont = await callGeminiWithFallback({
          apiKey: GEMINI_API_KEY,
          models: ["google/gemini-2.5-flash", "google/gemini-2.5-flash-lite"],
          body: {
            temperature: 0.4,
            messages: [
              ...gwMessages,
              { role: "assistant", content: reply },
              { role: "user", content: CONTINUE_INSTRUCTION },
            ],
            max_tokens: 12288,
          },
          timeoutMs: 120000,
          functionName: "modrek-ai-study",
        }).catch(() => null);
        if (!cont?.ok) break;
        const contData = await cont.response.json().catch(() => ({} as any));
        const chunk = contData?.choices?.[0]?.message?.content ?? "";
        if (!chunk.trim()) break;
        reply = stitchContinuation(reply, chunk);
        if (!isTruncated(contData?.choices?.[0])) break;
      }
    }

    // ---------- Repetition cleanup ----------
    reply = dedupeRepeatedBlocks(reply);

    // ---------- Automatic standalone lesson diagram ----------
    let diagram: LessonDiagram | null = null;
    if (deepTeaching) {
      try {
        const diagRes = await callGeminiWithFallback({
          apiKey: GEMINI_API_KEY,
          models: ["google/gemini-2.5-flash", "google/gemini-2.5-flash-lite"],
          body: {
            temperature: 0.2,
            messages: [
              { role: "system", content: LESSON_DIAGRAM_SYSTEM },
              { role: "user", content: `هذا هو شرح الدرس الذي قُدّم للطالب. ولّد رسمًا توضيحيًا واحدًا يلخّصه:\n\n${reply.slice(0, 12000)}` },
            ],
            max_tokens: 1200,
          },
          timeoutMs: 45000,
          functionName: "modrek-ai-study",
          task: "lesson-diagram",
        });
        if (diagRes.ok) {
          const diagData = await diagRes.response.json().catch(() => ({} as any));
          diagram = parseLessonDiagram(diagData?.choices?.[0]?.message?.content ?? "");
        }
      } catch (e) {
        console.warn("[modrek-ai-study] diagram generation failed", String(e).slice(0, 200));
      }
    }

    return json({ reply, diagram, usage: data?.usage ?? null });

  } catch (e) {
    console.error("[modrek-ai-study] error", e);
    return json({ error: (e as Error)?.message || "Internal error" }, 500);
  }
});

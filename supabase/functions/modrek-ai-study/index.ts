// Modrek AI - Study assistant (chat)
// Reads student profile automatically. Supports text + images + PDF via Lovable AI Gateway.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { callGeminiWithFallback, resolveGeminiApiKey, detectAiFailureKind } from "../_shared/aiSettings.ts";
import { buildTeacherEnginePrompt } from "../_shared/teacherEngine.ts";

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

    const body = await req.json().catch(() => null);
    if (!body?.messages || !Array.isArray(body.messages)) return json({ error: "messages required" }, 400);

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

      const scope = await resolveStudentScope(adminEarly, userId);
      scopeBlock = buildStudentScopeBlock(scope);

      if (trimmedQ.length >= 3) {
        const rag = await retrieveFromLibrary(adminEarly, {
          userId,
          query: trimmedQ,
          history,
          contextSubject: (conversationContext as any)?.subject_name ?? null,
          maxPassages: 8,
          scope,
        });
        logRagPipeline("modrek-ai-study", rag);
        knowledgeBlock = `\n\n${buildLibraryContextBlock(rag)}\n`;
        allowExternal = !rag.found;
      }
    } catch (retrievalErr) {
      console.warn("[modrek-ai-study] library retrieval failed", String(retrievalErr).slice(0, 300));
      allowExternal = true;
    }

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
      ? "المكتبة لم ترجع محتوى مطابقًا: وضّح للطالب أن الدرس غير متاح في مكتبته، ثم أجب من مصدر تعليمي رسمي موثوق (وزارة التربية والتعليم / الأزهر) بجملة قصيرة توضح ذلك، ولا تخترع أسماء دروس أو كتب."
      : "لا تستخدم مصادر خارجية؛ اعتمد على محتوى المكتبة أعلاه فقط، وإذا كان ناقصًا قل ذلك صراحةً."}
3. لا تسأل الطالب عن مرحلته أو صفه أو نظامه أو شعبته أبدًا.
4. إذا لم يذكر الطالب المادة صراحة، استخدم سياق المحادثة أو آخر مادة تحدثتما عنها.
5. اربط الشرح دائمًا بمنهج الصف والمرحلة المذكورين أعلاه وبطريقة الامتحان المصري.`);



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
      body: { temperature: 0.5, messages: gwMessages },
      timeoutMs: 45000,
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
    const reply = data?.choices?.[0]?.message?.content ?? "";
    if (!reply) {
      return json({ reply: "لم يصلني رد مكتمل هذه المرة. أعد صياغة سؤالك بشكل أقصر وسأحاول فورًا.", fallback: true });
    }
    return json({ reply, usage: data?.usage ?? null });
  } catch (e) {
    console.error("[modrek-ai-study] error", e);
    return json({ error: (e as Error)?.message || "Internal error" }, 500);
  }
});

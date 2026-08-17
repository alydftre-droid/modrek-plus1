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


    // ---------- Hierarchical Knowledge Retrieval ----------
    // Order: (1) Modrek library  (2) student personal books  (3) question bank
    //        (4) platform exams  (5) trusted external sources (only if nothing internal)
    let knowledgeBlock = "";
    let allowExternal = false;
    try {
      const lastUser = [...messages].reverse().find((m: any) => m.role === "user");
      const queryText = typeof lastUser?.content === "string"
        ? lastUser.content
        : Array.isArray(lastUser?.content)
          ? lastUser.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n")
          : "";
      const trimmedQ = (queryText || "").trim();

      const sections: string[] = [];

      if (trimmedQ.length >= 4) {
        // Tier 1, 3, 4: reuse modrek-retrieve (covers library, question bank, exams tiers)
        try {
          const rCtl = new AbortController();
          const rTimer = setTimeout(() => rCtl.abort(), 20000);
          const rr = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/modrek-retrieve`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": auth },
            body: JSON.stringify({
              query: trimmedQ,
              max_results: 6,
              // Curriculum scope is resolved server-side from the student profile;
              // we only narrow it further with the conversation subject.
              filters: (conversationContext as any)?.subject_id
                ? { subject_id: (conversationContext as any).subject_id }
                : {},
            }),
            signal: rCtl.signal,
          }).finally(() => clearTimeout(rTimer));
          if (rr.ok) {
            const rj = await rr.json();
            const rows = Array.isArray(rj?.results) ? rj.results : [];
            if (rows.length > 0) {
              const lessonLabel = rj?.lesson_target?.title
                ? ` — الدرس المطلوب: ${rj.lesson_target.title}`
                : "";
              sections.push(
                `### مصادر داخلية من منهج الطالب${lessonLabel} (مكتبة Modrek / بنك الأسئلة / امتحانات المنصة):\n` +
                rows.map((r: any, i: number) => `[${i + 1}] ${r.citation?.source_title || "مصدر"}${r.citation?.page_from ? ` — ص${r.citation.page_from}` : ""}\n${(r.text || "").slice(0, 600)}`).join("\n\n")
              );
            }
            if (rj?.suggest_external) allowExternal = true;
          }
        } catch (retrErr) { console.warn("[modrek-ai-study] retrieve skipped", String(retrErr).slice(0, 200)); }

        // Tier 2: student-visible library books. Use the real library_books
        // table only; never query taxonomy tables as if they were content.
        try {
          const admin = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!,
          );
          const like = `%${trimmedQ.slice(0, 60).replace(/[%_]/g, " ")}%`;
          const { data: libRows } = await admin
            .from("library_books")
            .select("id,title,description,subject_name_ar,page_count")
            .eq("status", "ready")
            .eq("access_tier", "free")
            .or(`title.ilike.${like},description.ilike.${like},subject_name_ar.ilike.${like}`)
            .limit(3);
          if (libRows && libRows.length > 0) {
            sections.push(
              "### مكتبة الطالب الشخصية:\n" +
              libRows.map((r: any, i: number) => `[${i + 1}] ${r.title}${r.subject_name_ar ? ` — ${r.subject_name_ar}` : ""}${r.description ? ` — ${String(r.description).slice(0, 200)}` : ""}`).join("\n")
            );
          }
        } catch (_) { /* ignore */ }
      }

      if (sections.length === 0) allowExternal = true;
      if (sections.length > 0) knowledgeBlock = `\n\nمصادر معرفية للاستعانة بها (لا تكررها حرفيًا؛ استخدمها لإثراء الشرح):\n${sections.join("\n\n")}\n`;
    } catch (retrievalErr) {
      console.warn("[modrek-ai-study] retrieval failed", retrievalErr);
      allowExternal = true;
    }

    const systemPrompt = buildTeacherEnginePrompt(`بيانات الطالب (استخدمها تلقائيًا ولا تسأل عنها أبدًا):
- الاسم: ${profile?.full_name || "الطالب"}
- المرحلة: ${stage || "غير محددة"}
- الصف: ${grade || "غير محدد"}
- النظام: ${eduType}
${section ? `- الشعبة: ${section}` : ""}

${contextLine}
${examReviewBlock}
${knowledgeBlock}

مهامك: شرح الدروس، حل المسائل والأسئلة، شرح الصور وملفات PDF المرفقة، وإنشاء تدريبات ومراجعات وتلخيص.

قواعد المصادر (إلزامية بهذا الترتيب):
1. اعتمد أولًا على "المصادر الداخلية" أعلاه إن وُجدت (مكتبة Modrek، مكتبة الطالب، بنك الأسئلة، امتحانات المنصة).
2. ${allowExternal
      ? "إن لم تكفِ المصادر الداخلية، استعن بمصادر تعليمية موثوقة (وزارة التربية والتعليم، مراجع أكاديمية معتمدة) وأشر لذلك بإيجاز."
      : "لا تستخدم مصادر خارجية؛ استعن فقط بالمصادر الداخلية أعلاه."}
3. لا تسأل الطالب عن مرحلته أو صفه أو نظامه أو شعبته أبدًا.
4. إذا لم يذكر الطالب المادة صراحة، استخدم سياق المحادثة الثابت أعلاه.
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

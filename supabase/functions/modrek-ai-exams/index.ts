// Modrek AI - Exams assistant.
// Understands a natural-language request, extracts intent, and creates a real
// exam (rows in `exams` + `exam_questions`) that the student takes using the
// existing exam engine. Returns { examId } for redirect to /student/exams/:id/take.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

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

async function callGateway(messages: any[], jsonMode = false) {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("AI not configured");
  const body: any = {
    model: "google/gemini-2.5-flash",
    messages,
  };
  if (jsonMode) body.response_format = { type: "json_object" };
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("[modrek-ai-exams] gateway", res.status, t.slice(0, 400));
    if (res.status === 429) throw new Error("rate_limited");
    if (res.status === 402) throw new Error("credits_exhausted");
    throw new Error("gateway_error");
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
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
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = auth.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => null);
    if (!body?.messages || !Array.isArray(body.messages)) return json({ error: "messages required" }, 400);
    const { messages, conversationContext = {} } = body;

    const { data: profile } = await supabase
      .from("profiles")
      .select("stage, grade, section, education_type, full_name")
      .eq("id", userId)
      .maybeSingle();

    const eduType = profile?.education_type === "azhar" ? "الأزهر" : "التعليم العام";
    const stage = stageLabel(profile?.stage);
    const grade = gradeLabel(profile?.grade);
    const section = profile?.section || null;

    // Step 1: Extract intent (subject, chapter, counts, difficulty)
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
    const userText = typeof lastUserMsg?.content === "string" ? lastUserMsg.content : "";

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
      ], true);
      intent = JSON.parse(raw);
    } catch (e: any) {
      if (e.message === "rate_limited") return json({ error: "تم تجاوز حد الاستخدام. حاول بعد قليل." }, 429);
      if (e.message === "credits_exhausted") return json({ error: "نفدت رصيد خدمة الذكاء الاصطناعي." }, 402);
      return json({ reply: "لم أفهم الطلب. اذكر المادة والباب مثل: امتحان في الفيزياء على الباب الأول." });
    }

    const subject = intent.subject || conversationContext?.subject_name || null;
    if (!subject) {
      return json({
        reply: "من فضلك اذكر المادة التي تريد الامتحان فيها. مثال: **امتحان في الفيزياء على الباب الأول**.",
      });
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
المادة: ${subject}
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
      ], true);
      examContent = JSON.parse(raw);
    } catch (e: any) {
      if (e.message === "rate_limited") return json({ error: "تم تجاوز حد الاستخدام." }, 429);
      if (e.message === "credits_exhausted") return json({ error: "نفدت رصيد الذكاء الاصطناعي." }, 402);
      return json({ error: "تعذر إنشاء الامتحان. حاول مرة أخرى." }, 502);
    }

    if (!Array.isArray(examContent?.questions) || examContent.questions.length === 0) {
      return json({ error: "لم يتم إنشاء أسئلة صالحة. حاول بصياغة أوضح." }, 502);
    }

    const totalMarks = examContent.questions.reduce((s: number, q: any) => s + Number(q.marks || 1), 0);
    const durationMinutes = Math.max(10, Math.ceil(total * 2.5));

    // Step 3: Insert exam using service role (student is owner)
    const { data: exam, error: examErr } = await admin
      .from("exams")
      .insert({
        title: examContent.title || `امتحان في ${subject}`,
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
        show_results_immediately: true,
        show_correct_answers: true,
        shuffle_questions: false,
        shuffle_options: true,
        max_attempts: 999,
      })
      .select()
      .single();

    if (examErr || !exam) {
      console.error("[modrek-ai-exams] insert exam", examErr);
      return json({ error: "فشل حفظ الامتحان" }, 500);
    }

    // Insert questions
    const questionRows = examContent.questions.map((q: any, idx: number) => {
      const type = q.type === "true_false" ? "true_false"
        : q.type === "essay" ? "essay"
        : q.type === "fill_blank" ? "fill_blank"
        : "mcq";
      return {
        exam_id: exam.id,
        order_index: idx + 1,
        question_type: type,
        question_text: String(q.question || "").trim(),
        marks: Number(q.marks || 1),
        difficulty,
        correct_answer: String(q.correct_answer ?? "").trim(),
        explanation: q.explanation ? String(q.explanation) : null,
      };
    });

    const { data: insertedQs, error: qErr } = await admin
      .from("exam_questions")
      .insert(questionRows)
      .select("id, order_index, question_type");

    if (qErr) {
      console.error("[modrek-ai-exams] insert questions", qErr);
      await admin.from("exams").delete().eq("id", exam.id);
      return json({ error: "فشل حفظ الأسئلة" }, 500);
    }

    // Insert options for mcq / true_false
    const optionRows: any[] = [];
    for (let i = 0; i < insertedQs.length; i++) {
      const q = insertedQs[i];
      const src = examContent.questions[i];
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
      if (optErr) console.error("[modrek-ai-exams] options", optErr);
    }

    return json({
      examId: exam.id,
      title: exam.title,
      questionCount: insertedQs.length,
      reply: `تم إنشاء **${exam.title}** — ${insertedQs.length} سؤال، مدة الحل ${durationMinutes} دقيقة. اضغط "بدء الامتحان" للحل.`,
    });
  } catch (e) {
    console.error("[modrek-ai-exams] error", e);
    return json({ error: (e as Error)?.message || "Internal error" }, 500);
  }
});

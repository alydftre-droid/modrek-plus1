import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { loadAiSettings, callGeminiWithFallback, errorResponseFromStatus, resolveGeminiApiKey } from "../_shared/aiSettings.ts";
import { getVerifiedUserFromAuthHeader } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

function fallbackScore(answer: string, modelAnswer: string, maxPoints: number) {
  const a = normalizeArabicText(answer);
  const m = normalizeArabicText(modelAnswer);
  if (!a || !m || !maxPoints) return 0;
  if (a === m || m.includes(a) || a.includes(m)) return maxPoints;
  const answerWords = new Set(a.split(" ").filter((word) => word.length >= 3));
  const modelWords = m.split(" ").filter((word) => word.length >= 3);
  if (modelWords.length === 0) return 0;
  const common = modelWords.filter((word) => answerWords.has(word)).length;
  const ratio = common / modelWords.length;
  if (ratio >= 0.75) return maxPoints;
  if (ratio >= 0.55) return Math.round(maxPoints * 0.75 * 100) / 100;
  if (ratio >= 0.35) return Math.round(maxPoints * 0.5 * 100) / 100;
  if (ratio >= 0.2) return Math.round(maxPoints * 0.25 * 100) / 100;
  return 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { essays, attemptId } = await req.json();
    try {
      const { sanitizeUserPrompt } = await import('../_shared/promptGuard.ts');
      if (Array.isArray(essays)) {
        for (const e of essays) {
          if (e && typeof e.studentAnswer === "string") e.studentAnswer = sanitizeUserPrompt(e.studentAnswer).clean;
        }
      }
    } catch { /* noop */ }
    // essays: Array<{ index: number, question: string, studentAnswer: string, modelAnswer: string, maxPoints: number }>

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const sb = createClient(supabaseUrl, supabaseServiceKey);

    // SECURITY: every code path (including the direct-essays path) requires a
    // verified authenticated caller to prevent unauthenticated AI quota abuse.
    const verifiedCaller = await getVerifiedUserFromAuthHeader(supabaseUrl, supabaseAnonKey, req.headers.get("Authorization"));
    if (!verifiedCaller?.id) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let effectiveEssays = essays;
    let attempt: any = null;
    let exam: any = null;


    if (attemptId) {
      const verifiedUser = verifiedCaller;


      const { data: attemptRow, error: attemptError } = await sb
        .from("exam_attempts")
        .select("*, exams(*)")
        .eq("id", attemptId)
        .maybeSingle();
      if (attemptError || !attemptRow) {
        return new Response(JSON.stringify({ error: "محاولة غير صالحة" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      attempt = attemptRow;
      exam = attemptRow.exams;
      if (attempt.student_id !== verifiedUser.id && exam?.teacher_id !== verifiedUser.id) {
        return new Response(JSON.stringify({ error: "غير مصرح" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const [{ data: questions }, { data: answers }] = await Promise.all([
        sb
          .from("exam_questions")
          .select("id, question_text, question_type, correct_answer, marks, order_index")
          .eq("exam_id", attempt.exam_id)
          .in("question_type", ["short_answer", "fill_blank", "essay"])
          .order("order_index"),
        sb.from("exam_answers").select("id, question_id, answer_text").eq("attempt_id", attemptId),
      ]);

      const answerByQuestion = new Map((answers || []).map((answer: any) => [answer.question_id, answer]));
      effectiveEssays = (questions || []).map((question: any, index: number) => {
        const answer: any = answerByQuestion.get(question.id);
        return {
          index,
          answerId: answer?.id,
          questionId: question.id,
          question: question.question_text,
          studentAnswer: answer?.answer_text || "",
          modelAnswer: question.correct_answer || "",
          maxPoints: Number(question.marks || 0),
        };
      }).filter((item: any) => item.answerId && item.maxPoints > 0 && String(item.modelAnswer || "").trim().length > 0);
    }

    if (!effectiveEssays || !Array.isArray(effectiveEssays) || effectiveEssays.length === 0) {
      return new Response(JSON.stringify({ scores: {}, feedback: {} }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = effectiveEssays.map((e: any, i: number) => `
سؤال ${i + 1}: ${e.question}
الإجابة النموذجية: ${e.modelAnswer}
إجابة الطالب: ${e.studentAnswer}
الدرجة القصوى: ${e.maxPoints}
`).join("\n---\n");

    const tools = [
      {
        type: "function",
        function: {
          name: "grade_essays",
          description: "Grade essay answers and provide feedback",
          parameters: {
            type: "object",
            properties: {
              results: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    index: { type: "number" },
                    score: { type: "number" },
                    feedback: { type: "string" },
                  },
                  required: ["index", "score", "feedback"],
                  additionalProperties: false,
                },
              },
            },
            required: ["results"],
            additionalProperties: false,
          },
        },
      },
    ];

    const settings = await loadAiSettings(sb, "grade-essay");
    const { apiKey: GEMINI_API_KEY } = await resolveGeminiApiKey(sb, Deno.env.get("GEMINI_API_KEY") || "");

    const result = await callGeminiWithFallback({
      apiKey: GEMINI_API_KEY,
      models: settings.models_to_try,
      body: {
        messages: [
          { role: "system", content: `أنت مصحح امتحانات عربي عادل جداً مثل المعلم الخبير.
قواعد إلزامية:
- لا تعطِ درجات عشوائية أبداً.
- امنح الدرجة كاملة إذا كانت إجابة الطالب صحيحة بالمعنى حتى لو مختصرة أو بصياغة مختلفة.
- اقبل طرق الحل المختلفة إذا وصلت لنفس النتيجة الصحيحة.
- إذا الإجابة ناقصة امنح درجة جزئية دقيقة حسب العناصر الصحيحة فقط.
- إذا السؤال مقالي فقارن الفكرة والمعنى والخطوات لا تطابق الكلمات فقط.
- لا تعاقب الطالب على اختلاف الأسلوب أو ترتيب النقاط إذا المعنى صحيح.
- الدرجة يجب أن تكون بين 0 والدرجة القصوى فقط، ويمكن استخدام كسور عشرية عادلة.` },
          { role: "user", content: prompt },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "grade_essays" } },
      },
      fallbackDelayMs: settings.fallback_delay_ms,
    });

    const scores: Record<string, number> = {};
    const feedback: Record<string, string> = {};

    if (result.ok) {
      const response = result.response;
      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

      if (toolCall) {
        const parsed = JSON.parse(toolCall.function.arguments);
        (parsed.results || []).forEach((r: any) => {
          const essayItem = effectiveEssays[r.index] || effectiveEssays.find((e: any) => e.index === r.index);
          const key = String(essayItem?.index ?? r.index);
          scores[key] = Math.max(0, Math.min(Number(r.score || 0), essayItem?.maxPoints || r.score));
          feedback[key] = r.feedback;
        });
      } else {
        const content = String(data.choices?.[0]?.message?.content || "").replace(/```json?\n?/g, "").replace(/```/g, "").trim();
        if (content) {
          const parsed = JSON.parse(content);
          (parsed.results || []).forEach((r: any) => {
            const essayItem = effectiveEssays[r.index] || effectiveEssays.find((e: any) => e.index === r.index);
            const key = String(essayItem?.index ?? r.index);
            scores[key] = Math.max(0, Math.min(Number(r.score || 0), essayItem?.maxPoints || r.score));
            feedback[key] = r.feedback;
          });
        }
      }
    } else {
      console.warn("grade-essay provider unavailable; using deterministic fallback", JSON.stringify({ status: result.status, error: result.lastError || null }));
    }

    effectiveEssays.forEach((item: any, index: number) => {
      const key = String(item.index ?? index);
      if (scores[key] === undefined) {
        scores[key] = fallbackScore(item.studentAnswer, item.modelAnswer, Number(item.maxPoints || 0));
        feedback[key] = scores[key] > 0
          ? "تم احتساب الدرجة بتصحيح احتياطي ذكي حسب العناصر الصحيحة ومعنى الإجابة."
          : "الإجابة لا تحتوي على عناصر كافية من الإجابة النموذجية.";
      }
    });

    if (attemptId && attempt && exam) {
      for (const item of effectiveEssays) {
        const key = String(item.index);
        const score = Number(scores[key] || 0);
        await sb
          .from("exam_answers")
          .update({
            marks_awarded: score,
            is_correct: score >= Number(item.maxPoints || 0),
            ai_feedback: feedback[key] || "تم التصحيح بالذكاء الاصطناعي وفق نموذج الإجابة والمعنى الصحيح.",
          })
          .eq("id", item.answerId);
      }

      const { data: answerRows } = await sb.from("exam_answers").select("marks_awarded").eq("attempt_id", attemptId);
      const totalScore = (answerRows || []).reduce((sum: number, row: any) => sum + Number(row.marks_awarded || 0), 0);
      const maxScore = Number(attempt.max_score || exam.total_marks || 0);
      const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 10000) / 100 : 0;
      await sb
        .from("exam_attempts")
        .update({
          status: "graded",
          total_score: totalScore,
          percentage,
          passed: totalScore >= Number(exam.pass_marks || 0),
          is_graded: true,
          graded_at: new Date().toISOString(),
          graded_by: exam.teacher_id,
        })
        .eq("id", attemptId);
      if (exam?.source !== "modrek_ai") {
        const { error: statsError } = await sb.rpc("refresh_student_exam_stats", { _student_id: attempt.student_id });
        if (statsError) {
          console.warn("refresh_student_exam_stats skipped", statsError.message);
        }
      }
    }

    return new Response(JSON.stringify({ scores, feedback }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("grade-essay error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "حدث خطأ" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

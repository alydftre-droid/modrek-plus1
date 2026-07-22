import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { loadAiSettings, callGeminiWithFallback, errorResponseFromStatus, resolveGeminiApiKey } from "../_shared/aiSettings.ts";
import { getVerifiedUserFromAuthHeader } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
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

function normalizeSemanticToken(word: string) {
  let w = normalizeArabicText(word)
    .replace(/^(و|ف|ب|ك|ل)(?=\p{L}{3,})/u, "")
    .replace(/^ال(?=\p{L}{3,})/u, "")
    .replace(/(ه|ها|هم|نا|ات|ين|ون)$/u, "");
  if (["salah", "salat", "sala", "prayer", "pray", "صلاه", "صلا", "صلوات", "مصلي", "يصلي"].includes(w)) return "صلاه";
  if (["wudu", "wudhu", "wodo", "ablution", "tahara", "purity", "وضوء", "وضو", "توضا", "يتوضا", "طهاره", "طاهر", "حدث", "الحدث", "نجاسه", "نجس", "نجاسة"].includes(w)) return "طهاره";
  if (["ghusl", "ghosl", "غسل", "اغتسال"].includes(w)) return "غسل";
  if (["قبله", "كعبه"].includes(w)) return "قبله";
  if (["niyyah", "niya", "intention", "intent", "نيه", "ني", "نوي", "ينوي"].includes(w)) return "نيه";
  if (["فرض", "فريضه", "واجب", "واجبه"].includes(w)) return "فرض";
  if (["year", "aam", "hawl", "sanah", "sana", "عام", "حول", "سنه", "سنة"].includes(w)) return "عام";
  if (["arafah", "arafa", "عرفه", "عرف", "عرفة"].includes(w)) return "عرفه";
  if (["zakat", "zakah", "زكاه", "زكا", "زكاة"].includes(w)) return "زكاه";
  if (["sawm", "fasting", "fast", "صيام", "صوم"].includes(w)) return "صيام";
  if (["hajj", "haj", "حج"].includes(w)) return "حج";
  if (["الله", "رب", "ربه", "ربك", "الرب"].includes(w)) return "الله";
  if (["صله", "صلة", "تقرب", "قرب", "تقويه", "تقوي", "علاقه"].includes(w)) return "صله_الله";
  if (["خشوع", "خاشع", "تدبر", "طمأنينه", "طمأنينة", "سكينه"].includes(w)) return "خشوع";
  if (["محبه", "الفه", "تعاون", "ترابط", "تكافل"].includes(w)) return "محبه";
  if (["نظام", "انضباط", "انتظام"].includes(w)) return "انضباط";
  return w;
}

const ARABIC_STOP_WORDS = new Set([
  "من", "في", "على", "علي", "عن", "الى", "الي", "ان", "إن", "أن", "هو", "هي", "هما", "هم", "هن",
  "هذا", "هذه", "ذلك", "تلك", "الذي", "التي", "الذين", "او", "أو", "و", "ثم", "كما", "كل", "اي", "أي",
  "لا", "لم", "لن", "ما", "مع", "بين", "عند", "اذا", "إذا", "كان", "كانت", "يكون", "تكون", "قد", "لقد",
  "الى", "حتى", "حتي", "فقط", "غير", "بعد", "قبل", "خلال", "حول", "له", "لها", "به", "بها", "فيها",
  "سؤال", "السؤال", "سوال", "السوال", "اجابه", "اجابة", "اعرف", "ادري", "اعلم", "اجب", "اجيب",
  "صلاه", "صلا",
]);

function tokenizeMeaningful(value: string) {
  return normalizeArabicText(value)
    .split(" ")
    .map((word) => normalizeSemanticToken(word.trim()))
    .filter((word, index, arr) => word.length >= 3 && !ARABIC_STOP_WORDS.has(word) && arr.indexOf(word) === index);
}

const NON_ANSWER_PHRASES = [
  "لا اعرف", "لا ادري", "لا اعلم", "مش عارف", "مش عارفه", "معرفش", "ماعرفش", "مش فاكر",
  "لا اتذكر", "لم اجب", "لم اجيب", "لم تجب", "لم يجيب", "لم احل", "لم تحل", "بدون اجابه", "بدون إجابة", "لا توجد اجابه",
  "لا يوجد اجابه", "ليس لدي اجابه", "لم اجب علي هذا السؤال", "لم اجيب علي هذا السؤال", "لم تجب علي هذا السؤال", "لم تجب على هذا السؤال",
].map(normalizeArabicText);

function isNonAnswer(answer: string) {
  const normalized = normalizeArabicText(answer);
  if (!normalized) return true;
  if (/^(\?|0|لا|لم|مش|معرفش|ماعرفش|مدري)$/.test(normalized)) return true;
  const exactShort = NON_ANSWER_PHRASES.some((phrase) => normalized === phrase || normalized === `${phrase} علي هذا السؤال` || normalized === `${phrase} على هذا السؤال`);
  if (exactShort) return true;
  const matchedPhrase = NON_ANSWER_PHRASES.find((phrase) => normalized.includes(phrase));
  if (!matchedPhrase) return false;
  let remainder = normalized;
  for (const phrase of NON_ANSWER_PHRASES) remainder = remainder.replaceAll(phrase, " ");
  // Do not erase partially correct answers such as “الوضوء والطهارة، لا أعرف الشرط الثالث”.
  // Treat it as a full non-answer only when almost no meaningful content remains.
  return tokenizeMeaningful(remainder).length <= 1;
}

function overlapStats(answer: string, modelAnswer: string) {
  const answerWords = [...new Set(tokenizeMeaningful(answer))];
  const modelWords = [...new Set(tokenizeMeaningful(modelAnswer))];
  const common = answerWords.filter((word) => modelWords.includes(word));
  return {
    answerWords,
    modelWords,
    common,
    answerCoverage: answerWords.length ? common.length / answerWords.length : 0,
    modelCoverage: modelWords.length ? common.length / modelWords.length : 0,
  };
}

function fallbackScore(answer: string, modelAnswer: string, maxPoints: number) {
  const a = normalizeArabicText(answer);
  const m = normalizeArabicText(modelAnswer);
  if (!a || !m || !maxPoints || isNonAnswer(answer)) return 0;
  const stats = overlapStats(answer, modelAnswer);
  if (a === m || (stats.modelWords.length <= 4 && (m.includes(a) || a.includes(m)))) return maxPoints;
  if (stats.common.length === 0) return 0;
  // Smooth linear scoring based on how much of the model answer the student covered,
  // with a small credit boost when the answer is coherent (not padded with irrelevant words).
  const modelCov = stats.modelCoverage; // 0..1
  const answerCov = stats.answerCoverage; // 0..1
  const coherence = Math.min(1, answerCov + 0.15); // reward focused answers
  const combined = Math.min(1, modelCov * 0.85 + coherence * 0.15);
  if (combined <= 0.1) return 0;
  if (combined >= 0.9 && modelCov >= 0.6) return maxPoints;
  // Linear scale mapped to [0.1 -> 0, 0.9 -> max] for smooth partial credit.
  const ratio = Math.max(0, Math.min(1, (combined - 0.1) / 0.8));
  return Math.round(maxPoints * ratio * 100) / 100;
}

function enforceGradingGuard(item: any, proposedScore: number, proposedFeedback: string) {
  const maxPoints = Number(item.maxPoints || 0);
  const studentAnswer = String(item.studentAnswer || "");
  const modelAnswer = String(item.modelAnswer || "");
  const safeScore = Math.max(0, Math.min(Number(proposedScore || 0), maxPoints));
  if (maxPoints <= 0) return { score: 0, feedback: "لا توجد درجة مخصصة لهذا السؤال." };
  if (isNonAnswer(studentAnswer)) {
    return { score: 0, feedback: "لم يقدم الطالب إجابة قابلة للتصحيح لهذا السؤال." };
  }
  if (!normalizeArabicText(modelAnswer)) {
    return { score: 0, feedback: "لا توجد إجابة نموذجية محفوظة لهذا السؤال؛ يحتاج مراجعة المعلم." };
  }
  const stats = overlapStats(studentAnswer, modelAnswer);
  const exactShortMatch = stats.modelWords.length <= 4 && (
    normalizeArabicText(studentAnswer) === normalizeArabicText(modelAnswer)
    || normalizeArabicText(studentAnswer).includes(normalizeArabicText(modelAnswer))
    || normalizeArabicText(modelAnswer).includes(normalizeArabicText(studentAnswer))
  );
  if (!exactShortMatch && stats.common.length === 0 && safeScore > 0) {
    return { score: 0, feedback: "الإجابة لا تحتوي على عناصر يمكن ربطها بالإجابة النموذجية." };
  }
  // Trust the AI teacher's judgment more: allow up to +35% of maxPoints above the
  // deterministic floor so a fair essay marker can award nuanced partial credit
  // (e.g. half-answer -> half-marks, not quarter-marks).
  const fallback = fallbackScore(studentAnswer, modelAnswer, maxPoints);
  const upperTrust = Math.min(maxPoints, fallback + maxPoints * 0.35);
  if (!exactShortMatch && safeScore > upperTrust) {
    return {
      score: Math.round(upperTrust * 100) / 100,
      feedback: proposedFeedback || "تم ضبط الدرجة لتعكس عناصر الإجابة الفعلية.",
    };
  }
  return { score: safeScore, feedback: proposedFeedback || "تم التصحيح وفق نموذج الإجابة والمعنى الصحيح." };
}

function sameNormalizedText(a: unknown, b: unknown) {
  return normalizeArabicText(String(a ?? "")) === normalizeArabicText(String(b ?? ""));
}

function safeLocalFeedback(item: any, score: number) {
  const maxPoints = Number(item.maxPoints || 0);
  if (maxPoints <= 0) return "لا توجد درجة مخصصة لهذا السؤال.";
  if (isNonAnswer(item.studentAnswer)) return "لم يقدم الطالب إجابة قابلة للتصحيح لهذا السؤال.";
  if (!normalizeArabicText(item.modelAnswer)) return "لا توجد إجابة نموذجية محفوظة لهذا السؤال؛ يحتاج مراجعة المعلم.";
  if (item.alignmentSource === "previous_model_answer" || item.alignmentSource === "next_model_answer") {
    if (score >= maxPoints) return "إجابة صحيحة بالمعنى بعد إصلاح محاذاة الإجابة النموذجية لهذا السؤال.";
    if (score > 0) return "إجابة جزئية بعد إصلاح محاذاة الإجابة النموذجية لهذا السؤال.";
  }
  if (score >= maxPoints) return "إجابة صحيحة بالمعنى لهذا السؤال.";
  if (score > 0) return "إجابة جزئية لهذا السؤال وتم احتساب الدرجة حسب عناصر الإجابة الصحيحة.";
  return "الإجابة لا تحتوي على عناصر كافية من الإجابة النموذجية لهذا السؤال.";
}

function withAlignedModelAnswer(item: any) {
  const maxPoints = Number(item.maxPoints || 0);
  if (maxPoints <= 0 || isNonAnswer(item.studentAnswer)) return { ...item, alignmentSource: "current_model_answer" };

  const currentScore = fallbackScore(item.studentAnswer, item.modelAnswer, maxPoints);
  const previousScore = fallbackScore(item.studentAnswer, item.previousModelAnswer, maxPoints);
  const nextScore = fallbackScore(item.studentAnswer, item.nextModelAnswer, maxPoints);

  const adjacent = previousScore >= nextScore
    ? { score: previousScore, modelAnswer: item.previousModelAnswer, source: "previous_model_answer" }
    : { score: nextScore, modelAnswer: item.nextModelAnswer, source: "next_model_answer" };

  const currentModelMissing = !normalizeArabicText(item.modelAnswer);
  const strongAdjacentMatch = adjacent.score >= maxPoints * 0.6;
  const weakCurrentMatch = currentScore <= maxPoints * 0.4;
  const clearMargin = adjacent.score >= currentScore + maxPoints * 0.3;

  if (normalizeArabicText(adjacent.modelAnswer) && (
    (currentModelMissing && adjacent.score > 0)
    || (strongAdjacentMatch && weakCurrentMatch && clearMargin)
  )) {
    return {
      ...item,
      modelAnswer: adjacent.modelAnswer,
      originalModelAnswer: item.modelAnswer,
      alignmentSource: adjacent.source,
      alignmentScores: { current: currentScore, previous: previousScore, next: nextScore },
    };
  }

  return {
    ...item,
    alignmentSource: "current_model_answer",
    alignmentScores: { current: currentScore, previous: previousScore, next: nextScore },
  };
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
    // essays: Array<{ questionId: string, answerId?: string, question: string, studentAnswer: string, modelAnswer: string, maxPoints: number }>

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

    const trimForLog = (value: unknown, max = 900) => {
      const text = String(value ?? "");
      return text.length > max ? `${text.slice(0, max)}…` : text;
    };

    const logExamTrace = async (stage: string, payload: Record<string, unknown>) => {
      if (!attemptId) return;
      try {
        await sb.from("exam_attempt_debug_logs").insert({
          stage,
          student_id: attempt?.student_id || null,
          exam_id: attempt?.exam_id || exam?.id || null,
          attempt_id: attemptId,
          payload,
        });
      } catch (error) {
        console.warn("grade-essay trace log skipped", JSON.stringify({
          stage,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    };


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
          .in("question_type", ["short_answer", "essay", "fill_blank"])
          .order("order_index", { ascending: true })
          .order("id", { ascending: true }),
        sb.from("exam_answers").select("id, question_id, answer_text").eq("attempt_id", attemptId),
      ]);

      const answerByQuestion = new Map((answers || []).map((answer: any) => [answer.question_id, answer]));
      effectiveEssays = (questions || []).map((question: any, index: number, orderedQuestions: any[]) => {
        const answer: any = answerByQuestion.get(question.id);
        return {
          answerId: answer?.id,
          questionId: question.id,
          questionOrder: question.order_index,
          question: question.question_text,
          studentAnswer: answer?.answer_text || "",
          modelAnswer: question.correct_answer || "",
          previousModelAnswer: orderedQuestions[index - 1]?.correct_answer || "",
          nextModelAnswer: orderedQuestions[index + 1]?.correct_answer || "",
          maxPoints: Number(question.marks || 0),
        };
      }).filter((item: any) => item.answerId && item.maxPoints > 0);
    }

    if (!effectiveEssays || !Array.isArray(effectiveEssays) || effectiveEssays.length === 0) {
      return new Response(JSON.stringify({ scores: {}, feedback: {} }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    effectiveEssays = effectiveEssays.map((item: any) => ({
      ...item,
      questionId: String(item?.questionId || item?.question_id || ""),
      answerId: item?.answerId || item?.answer_id || null,
      maxPoints: Number(item?.maxPoints || item?.max_points || 0),
    })).filter((item: any) => item.questionId);

    const itemKey = (item: any) => String(item?.questionId || item?.question_id || "");
    const essaysByQuestionId = new Map((effectiveEssays || []).filter((item: any) => item?.questionId).map((item: any) => [String(item.questionId), item]));
    const essaysByAnswerId = new Map((effectiveEssays || []).filter((item: any) => item?.answerId).map((item: any) => [String(item.answerId), item]));

    const resolveResultItem = (resultItem: any) => {
      const questionId = resultItem?.questionId || resultItem?.question_id;
      if (questionId && essaysByQuestionId.has(String(questionId))) return essaysByQuestionId.get(String(questionId));
      const answerId = resultItem?.answerId || resultItem?.answer_id;
      if (answerId && essaysByAnswerId.has(String(answerId))) return essaysByAnswerId.get(String(answerId));
      return null;
    };

    const buildPrompt = (items: any[]) => items.map((e: any) => `
معرف السؤال: ${e.questionId}
معرف الإجابة: ${e.answerId || "غير محفوظ"}
${e.questionOrder !== undefined ? `ترتيب السؤال للعرض فقط: ${e.questionOrder}` : ""}
نص السؤال: ${e.question}
الإجابة النموذجية: ${e.modelAnswer}
إجابة الطالب: ${e.studentAnswer}
الدرجة القصوى: ${e.maxPoints}
`).join("\n---\n");

    const systemPrompt = `أنت معلم عربي خبير ومصحّح امتحانات محترف، تخاطب الطالب مباشرةً بأسلوب إنساني دافئ وكأنك جالس بجواره تشرح له تصحيح ورقته.

## دورك في التصحيح
- صحّح كل سؤال باستقلال تام عن غيره؛ لا تنقل الدرجة أو الملاحظة أو نص إجابة الطالب بين الأسئلة أبداً.
- امنح الدرجة كاملة إذا كانت إجابة الطالب صحيحة بالمعنى ولو بصياغة مختلفة أو أسلوب مختصر.
- اقبل طرق الحل المختلفة إذا وصلت لنفس النتيجة الصحيحة، ولا تعاقب الطالب على اختلاف الأسلوب.
- امنح درجة جزئية دقيقة عند الإجابة الناقصة حسب العناصر الصحيحة فعلياً.
- الدرجة بين 0 والدرجة القصوى، ويجوز استخدام كسور عشرية عادلة.
- إذا كانت إجابة الطالب فارغة أو "لا أعرف / مش عارف / معرفش / لا أدري" أو ما يماثلها، فالدرجة صفر دائماً.
- أعد نفس questionId و answerId حرفياً، ولا تعتمد أبداً على ترتيب أو موضع السؤال.

## أسلوب الملاحظة (feedback) — إلزامي لكل سؤال
اكتب ملاحظة غنية باللغة العربية الفصحى المبسّطة، تخاطب الطالب بضمير المخاطب ("أنت"، "إجابتك"، "لاحظ")، وتشعره أن معلماً حقيقياً يصحّح له لا نظاماً آلياً.

اجعل الملاحظة **مختلفة تماماً في كل سؤال**، مبنيةً على نص السؤال وإجابة الطالب والإجابة النموذجية معاً، وليست عبارات محفوظة أو مكررة.

### إذا كانت الإجابة صحيحة (درجة كاملة):
- ابدأ بـ "✅ إجابتك صحيحة" ثم عبارة تشجيع طبيعية متنوّعة (مثل: أحسنت، ممتاز، أداء رائع، واضح أنك فهمت الفكرة، استمر بهذا المستوى) — غيّر التشجيع في كل سؤال.
- اشرح **لماذا** هذه الإجابة صحيحة علمياً/منطقياً في جملة أو جملتين.
- اذكر المعلومة أو القاعدة الأساسية المرتبطة بالسؤال من الدرس.
- أضف معلومة إضافية مفيدة أو طريقة سريعة للتذكّر إن أمكن.

### إذا كانت الإجابة خاطئة (صفر):
- ابدأ بـ "❌ إجابتك غير صحيحة" بأسلوب لطيف غير جارح.
- اذكر **الإجابة الصحيحة** بوضوح.
- اشرح **لماذا** إجابة الطالب خاطئة تحديداً، وأين وقع في الخطأ (سوء فهم للمفهوم؟ خلط بين مصطلحين؟ نسيان شرط؟).
- اشرح **لماذا** الإجابة النموذجية صحيحة.
- إن كان الخطأ ناتجاً عن تشابه بين مفهومين، وضّح الفرق بينهما.
- اذكر خطأً شائعاً يقع فيه الطلاب في هذا السؤال إن وجد.
- اختم بنصيحة عملية قصيرة تشجّع الطالب على المحاولة مرة أخرى.

### إذا كانت الإجابة جزئية:
- ابدأ بـ "🟡 إجابتك جزئية" مع تقدير الجزء الصحيح.
- اذكر ما أصاب فيه الطالب تحديداً، وما نقص من إجابته.
- أكمل له العنصر أو العناصر المفقودة.
- اربط بينها لتكوّن الصورة الكاملة، واختم بتوجيه لتحسين الإجابة.

## قواعد جودة الملاحظة
- طول الملاحظة مناسب: عادةً 3–7 جمل (لا فقرة واحدة قصيرة جافة، ولا مقال طويل مرهق).
- استخدم فقرات قصيرة أو أسطر بسيطة مفصولة عند الحاجة.
- اجعل اللغة مناسبة لعمر طالب المرحلة الدراسية للسؤال.
- اربط الإجابة بمحتوى الدرس أو القاعدة العامة كلما أمكن.
- اذكر مثالاً بسيطاً أو مقارنة أو تبسيطاً حين يخدم الفهم.
- لا تكرر نفس العبارات بين الأسئلة، ولا تستخدم قوالب جامدة.
- ممنوع منعاً باتاً كتابة ملاحظة عامة مثل "إجابة صحيحة" أو "إجابة خاطئة" فقط دون شرح.`;

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
                    questionId: { type: "string" },
                    answerId: { type: "string" },
                      studentAnswer: { type: "string" },
                      correctAnswer: { type: "string" },
                    score: { type: "number" },
                      maxScore: { type: "number" },
                    feedback: { type: "string", description: "ملاحظة تصحيح غنية بأسلوب معلم عربي خبير: تشرح لماذا الإجابة صحيحة أو خاطئة، تذكر الإجابة الصحيحة عند الخطأ، تربط بالدرس، تعطي مثالاً أو نصيحة، وتشجّع الطالب. مختلفة في كل سؤال، وليست عبارة عامة قصيرة." },
                  },
                  required: ["questionId", "studentAnswer", "correctAnswer", "score", "feedback"],
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

    const parseAiResults = async (response: Response) => {
      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall) {
        const parsed = JSON.parse(toolCall.function.arguments || "{}");
        return Array.isArray(parsed.results) ? parsed.results : [];
      }
      const content = String(data.choices?.[0]?.message?.content || "").replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      if (!content) return [];
      const parsed = JSON.parse(content);
      return Array.isArray(parsed.results) ? parsed.results : [];
    };

    const clampScore = (value: any, maxPoints: number) => Math.max(0, Math.min(Number(value || 0), Number(maxPoints || 0)));

    const scores: Record<string, number> = {};
    const feedback: Record<string, string> = {};

    const gradeOneStoredItem = async (item: any) => {
      const key = itemKey(item);
      const gradingItem = withAlignedModelAnswer(item);
      await logExamTrace("grade_essay.item.started", {
        question_id: item.questionId,
        question_order: item.questionOrder ?? null,
        answer_id: item.answerId,
        student_answer: trimForLog(item.studentAnswer),
        correct_answer: trimForLog(gradingItem.modelAnswer),
        original_correct_answer: gradingItem.originalModelAnswer ? trimForLog(gradingItem.originalModelAnswer) : null,
        alignment_source: gradingItem.alignmentSource,
        alignment_scores: gradingItem.alignmentScores || null,
        max_score: Number(item.maxPoints || 0),
      });
      const earlyGuard = enforceGradingGuard(gradingItem, 0, "");
      if (earlyGuard.score === 0 && (isNonAnswer(gradingItem.studentAnswer) || !normalizeArabicText(gradingItem.modelAnswer))) {
        scores[key] = 0;
        feedback[key] = earlyGuard.feedback;
        await logExamTrace("grade_essay.item.guard_zero", {
          question_id: item.questionId,
          question_order: item.questionOrder ?? null,
          answer_id: item.answerId,
          reason: isNonAnswer(gradingItem.studentAnswer) ? "non_answer" : "missing_model_answer",
          student_answer: trimForLog(item.studentAnswer),
          correct_answer: trimForLog(gradingItem.modelAnswer),
          score: 0,
          max_score: Number(item.maxPoints || 0),
        });
        return;
      }
      try {
        const result = await callGeminiWithFallback({
          apiKey: GEMINI_API_KEY,
          models: settings.models_to_try,
          body: {
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: buildPrompt([gradingItem]) },
            ],
            tools,
            tool_choice: { type: "function", function: { name: "grade_essays" } },
          },
          fallbackDelayMs: settings.fallback_delay_ms,
        });
        if (!result.ok) return;
        const [r] = await parseAiResults(result.response);
        if (!r) return;
        const returnedQuestionId = String(r.questionId || r.question_id || "");
        const returnedAnswerId = String(r.answerId || r.answer_id || "");
        const returnedStudentAnswer = String(r.studentAnswer || r.student_answer || "");
        const returnedCorrectAnswer = String(r.correctAnswer || r.correct_answer || "");
        const questionMatches = returnedQuestionId === String(item.questionId);
        const answerMatches = !item.answerId || !returnedAnswerId || returnedAnswerId === String(item.answerId);
        const studentAnswerMatches = sameNormalizedText(returnedStudentAnswer, gradingItem.studentAnswer);
        const correctAnswerMatches = sameNormalizedText(returnedCorrectAnswer, gradingItem.modelAnswer);
        if (!questionMatches || !answerMatches || !studentAnswerMatches || !correctAnswerMatches) {
          await logExamTrace("grade_essay.item.rejected_mismatch", {
            expected_question_id: item.questionId,
            returned_question_id: returnedQuestionId || null,
            expected_answer_id: item.answerId,
            returned_answer_id: returnedAnswerId || null,
            question_order: item.questionOrder ?? null,
            expected_student_answer: trimForLog(gradingItem.studentAnswer),
            returned_student_answer: trimForLog(returnedStudentAnswer),
            expected_correct_answer: trimForLog(gradingItem.modelAnswer),
            original_correct_answer: gradingItem.originalModelAnswer ? trimForLog(gradingItem.originalModelAnswer) : null,
            alignment_source: gradingItem.alignmentSource,
            alignment_scores: gradingItem.alignmentScores || null,
            returned_correct_answer: trimForLog(returnedCorrectAnswer),
            student_answer_matches: studentAnswerMatches,
            correct_answer_matches: correctAnswerMatches,
            rejected_feedback: trimForLog(r.feedback),
            rejected_score: r.score ?? null,
          });
          return;
        }
        // Stored attempts are updated by the locally known answerId/questionId only.
        // The model never gets permission to remap a score/feedback to another row.
        const guarded = enforceGradingGuard(
          gradingItem,
          clampScore(r.score, Number(item.maxPoints || 0)),
          "",
        );
        scores[key] = guarded.score;
        const aiFeedback = String(r.feedback || "").trim();
        // Preserve the AI's rich, teacher-style feedback. Only fall back to the
        // deterministic local message when the model returned nothing usable.
        feedback[key] = aiFeedback.length >= 20 ? aiFeedback : safeLocalFeedback(gradingItem, guarded.score);
        await logExamTrace("grade_essay.item.graded", {
          question_id: item.questionId,
          question_order: item.questionOrder ?? null,
          answer_id: item.answerId,
          student_answer: trimForLog(item.studentAnswer),
          correct_answer: trimForLog(gradingItem.modelAnswer),
          original_correct_answer: gradingItem.originalModelAnswer ? trimForLog(gradingItem.originalModelAnswer) : null,
          alignment_source: gradingItem.alignmentSource,
          alignment_scores: gradingItem.alignmentScores || null,
          ai_feedback: trimForLog(feedback[key]),
          score: scores[key],
          max_score: Number(item.maxPoints || 0),
        });
      } catch (error) {
        console.warn("single essay grading failed; using deterministic fallback", JSON.stringify({ questionId: item.questionId || null, answerId: item.answerId || null, error: error instanceof Error ? error.message : String(error) }));
      }
    };

    if (attemptId) {
      for (const item of effectiveEssays) {
        await gradeOneStoredItem(item);
      }
    } else {
      const result = await callGeminiWithFallback({
        apiKey: GEMINI_API_KEY,
        models: settings.models_to_try,
        body: {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: buildPrompt(effectiveEssays) },
          ],
          tools,
          tool_choice: { type: "function", function: { name: "grade_essays" } },
        },
        fallbackDelayMs: settings.fallback_delay_ms,
      });

      if (result.ok) {
        const results = await parseAiResults(result.response);
        results.forEach((r: any) => {
          const essayItem = resolveResultItem(r);
          if (!essayItem) return;
          const returnedStudentAnswer = String(r.studentAnswer || r.student_answer || "");
          const returnedCorrectAnswer = String(r.correctAnswer || r.correct_answer || "");
          if (!sameNormalizedText(returnedStudentAnswer, essayItem.studentAnswer) || !sameNormalizedText(returnedCorrectAnswer, essayItem.modelAnswer)) return;
          const key = itemKey(essayItem);
          const guarded = enforceGradingGuard(
            essayItem,
            clampScore(r.score, Number(essayItem.maxPoints || r.score || 0)),
            "",
          );
          scores[key] = guarded.score;
          const aiFeedback = String(r.feedback || "").trim();
          feedback[key] = aiFeedback.length >= 20 ? aiFeedback : safeLocalFeedback(essayItem, guarded.score);
        });
      } else {
        console.warn("grade-essay provider unavailable; using deterministic fallback", JSON.stringify({ status: result.status, error: result.lastError || null }));
      }
    }

    for (const item of effectiveEssays) {
      const key = itemKey(item);
      if (scores[key] === undefined) {
        const gradingItem = withAlignedModelAnswer(item);
        scores[key] = fallbackScore(gradingItem.studentAnswer, gradingItem.modelAnswer, Number(gradingItem.maxPoints || 0));
        feedback[key] = scores[key] > 0
          ? safeLocalFeedback(gradingItem, scores[key])
          : "الإجابة لا تحتوي على عناصر كافية من الإجابة النموذجية.";
        await logExamTrace("grade_essay.item.deterministic", {
          question_id: item.questionId,
          question_order: item.questionOrder ?? null,
          answer_id: item.answerId,
          student_answer: trimForLog(item.studentAnswer),
          correct_answer: trimForLog(gradingItem.modelAnswer),
          original_correct_answer: gradingItem.originalModelAnswer ? trimForLog(gradingItem.originalModelAnswer) : null,
          alignment_source: gradingItem.alignmentSource,
          alignment_scores: gradingItem.alignmentScores || null,
          ai_feedback: trimForLog(feedback[key]),
          score: scores[key],
          max_score: Number(item.maxPoints || 0),
        });
      }
    }

    if (attemptId && attempt && exam) {
      for (const item of effectiveEssays) {
        const key = itemKey(item);
        const gradingItem = withAlignedModelAnswer(item);
        const score = Number(scores[key] || 0);
        let updateQuery = sb
          .from("exam_answers")
          .update({
            marks_awarded: score,
            is_correct: score >= Number(item.maxPoints || 0),
            ai_feedback: feedback[key] || "تم التصحيح بالذكاء الاصطناعي وفق نموذج الإجابة والمعنى الصحيح.",
          })
          .eq("id", item.answerId);
        if (item.questionId) updateQuery = updateQuery.eq("question_id", item.questionId);
        const { error: updateError } = await updateQuery;
        if (updateError) throw updateError;
        await logExamTrace("grade_essay.item.stored", {
          question_id: item.questionId,
          question_order: item.questionOrder ?? null,
          answer_id: item.answerId,
          student_answer: trimForLog(item.studentAnswer),
          correct_answer: trimForLog(gradingItem.modelAnswer),
          original_correct_answer: gradingItem.originalModelAnswer ? trimForLog(gradingItem.originalModelAnswer) : null,
          alignment_source: gradingItem.alignmentSource,
          alignment_scores: gradingItem.alignmentScores || null,
          ai_feedback: trimForLog(feedback[key]),
          score,
          max_score: Number(item.maxPoints || 0),
        });
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
          passed: maxScore > 0 ? percentage >= 50 : false,
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

    return new Response(JSON.stringify({ scores, feedback, results: effectiveEssays.map((item: any) => {
      const key = itemKey(item);
      return {
        question_id: item.questionId,
        answer_id: item.answerId || null,
        student_answer: item.studentAnswer || "",
        correct_answer: withAlignedModelAnswer(item).modelAnswer || "",
        original_correct_answer: withAlignedModelAnswer(item).originalModelAnswer || null,
        alignment_source: withAlignedModelAnswer(item).alignmentSource,
        feedback: feedback[key] || null,
        score: scores[key] ?? null,
        max_score: Number(item.maxPoints || 0),
      };
    }) }), {
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

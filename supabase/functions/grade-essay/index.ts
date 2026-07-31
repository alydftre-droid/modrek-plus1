// Smart Exam Grading v4 — rich teacher-style feedback for EVERY question type.
//
// For every answer (mcq / true_false / fill_blank / short_answer / essay) the
// AI returns three independent sections stored in `exam_answers.ai_feedback`
// as a JSON string of shape:
//   { "v":1, "notes":"...", "explanation":"...", "extra":"..." }
//
// - notes:       analysis of the student's specific answer (why right/wrong,
//                what's missing, what to watch for).
// - explanation: a real teaching explanation of the underlying concept /
//                lesson, not just "the correct answer is X".
// - extra:       a memorable additional fact / rule / mnemonic.
//
// For written questions the AI also proposes a score (guarded by deterministic
// bounds). For objective questions the score already set by the RPC is
// preserved untouched; only the feedback is enriched.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { loadAiSettings, callGeminiWithFallback, resolveGeminiApiKey } from "../_shared/aiSettings.ts";
import { getVerifiedUserFromAuthHeader } from "../_shared/auth.ts";
import {
  buildFallbackFeedback,
  caseDirective,
  classifyCase,
  CASE_LABEL_AR,
  type FeedbackItem,
} from "../_shared/feedbackEngine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const WRITTEN_TYPES = new Set(["short_answer", "essay", "fill_blank"]);
const OBJECTIVE_TYPES = new Set(["mcq", "true_false"]);

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

const ARABIC_STOP_WORDS = new Set([
  "من", "في", "على", "علي", "عن", "الى", "الي", "ان", "إن", "أن", "هو", "هي", "هما", "هم", "هن",
  "هذا", "هذه", "ذلك", "تلك", "الذي", "التي", "الذين", "او", "أو", "و", "ثم", "كما", "كل", "اي", "أي",
  "لا", "لم", "لن", "ما", "مع", "بين", "عند", "اذا", "إذا", "كان", "كانت", "يكون", "تكون", "قد", "لقد",
  "حتى", "حتي", "فقط", "غير", "بعد", "قبل", "خلال", "له", "لها", "به", "بها", "فيها",
]);

function tokenize(value: string) {
  return normalizeArabicText(value).split(" ")
    .filter((w) => w.length >= 3 && !ARABIC_STOP_WORDS.has(w));
}

function overlap(a: string, b: string) {
  const aw = [...new Set(tokenize(a))];
  const bw = [...new Set(tokenize(b))];
  if (!aw.length || !bw.length) return { common: 0, aCov: 0, bCov: 0 };
  const common = aw.filter((w) => bw.includes(w)).length;
  return { common, aCov: common / aw.length, bCov: common / bw.length };
}

const NON_ANSWER = /^(\?|0|لا|لم|مش|معرفش|ماعرفش|مدري|لا اعرف|لا ادري|لا اعلم|مش عارف|مش فاكر|لم اجب|بدون اجابه)/;
function isNonAnswer(v: string) {
  const n = normalizeArabicText(v);
  if (!n) return true;
  return NON_ANSWER.test(n) && tokenize(n).length <= 2;
}

function writtenFallbackScore(student: string, model: string, max: number) {
  if (!max || isNonAnswer(student) || !normalizeArabicText(model)) return 0;
  const a = normalizeArabicText(student);
  const m = normalizeArabicText(model);
  if (a === m) return max;
  const s = overlap(a, m);
  if (s.common === 0) return 0;
  if (s.bCov >= 0.85) return max;
  if (s.bCov >= 0.6) return Math.round(max * 0.75 * 100) / 100;
  if (s.bCov >= 0.35) return Math.round(max * 0.5 * 100) / 100;
  if (s.bCov >= 0.2) return Math.round(max * 0.3 * 100) / 100;
  return 0;
}

function encodeFeedback(parts: { notes?: string; explanation?: string; extra?: string }) {
  return JSON.stringify({
    v: 1,
    notes: (parts.notes || "").trim(),
    explanation: (parts.explanation || "").trim(),
    extra: (parts.extra || "").trim(),
  });
}

function trimText(v: unknown, max = 220) {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function detectConcept(item: any): string {
  const source = normalizeArabicText(`${item.question || ""} ${item.modelAnswer || ""} ${item.questionExplanation || ""}`);
  const concepts: Array<[RegExp, string]> = [
    [/وضوء|الوضوء|طهاره|طهارة|حدث اصغر|حدث اكبر|غسل|تيمم/, "الطهارة والوضوء"],
    [/صلاه|صلاة|قبله|قبلة|ركوع|سجود|تكبير|الفاتحه|الفاتحة/, "الصلاة وشروط صحتها"],
    [/زكاه|زكاة|نصاب|حول|صدقه|صدقة/, "الزكاة وأحكامها"],
    [/صيام|رمضان|فطر|مفطرات|نيه|نية|قدر/, "الصيام وأحكامه"],
    [/حج|عمره|احرام|طواف|عرفه|عرفة|مزدلفه|رمي الجمرات/, "الحج والعمرة"],
    [/ايمان|اسلام|الشهادتين|اركان الاسلام|اركان الايمان/, "أركان الإسلام والإيمان"],
    [/قران|قرآن|تلاوه|تلاوة|اداب|آداب/, "آداب القرآن والعبادة"],
  ];
  const found = concepts.find(([pattern]) => pattern.test(source));
  if (found) return found[1];
  return tokenize(`${item.question || ""} ${item.modelAnswer || ""}`).slice(0, 4).join(" ") || "الفكرة الأساسية في الدرس";
}

function conceptExplanation(item: any): string {
  const concept = detectConcept(item);
  const q = trimText(item.question, 220);
  const model = trimText(item.modelAnswer, 260);
  const teacher = trimText(item.questionExplanation, 360);
  if (teacher && teacher.length >= 80) {
    return `${teacher}\n\nيرتبط هذا بالسؤال لأن المطلوب ليس حفظ عبارة منفصلة، بل فهم القاعدة التي تجعل «${model || concept}» هي الفكرة الصحيحة داخل هذا الموضع من الدرس. عندما تربط السؤال بالقاعدة ستستطيع تمييز الإجابة حتى لو تغيّر نص السؤال أو ترتيب الاختيارات.`;
  }
  if (concept.includes("الطهارة")) {
    return `يدور السؤال حول ${concept}. الطهارة هي المدخل العملي لصحة كثير من العبادات، والوضوء يرفع الحدث الأصغر ويجعل المسلم مهيأً للصلاة. لذلك عند أي سؤال في هذا الباب يجب أن تفرق بين ما يرفع الحدث الأصغر كالوضوء، وما يرتبط بالحدث الأكبر كالغسل، وما يكون بديلاً عند العجز كالتيمم. فهم هذا التفريق يجعلك تعرف لماذا تكون الإجابة «${model}» مناسبة هنا.`;
  }
  if (concept.includes("الصلاة")) {
    return `الفكرة هنا من باب ${concept}. الصلاة لا تُفهم كحركات فقط، بل عبادة لها شروط وأركان وهيئات؛ فالشرط يكون قبل الصلاة أو ملازماً لها مثل الطهارة واستقبال القبلة، أما الركن فهو جزء داخل الصلاة لا تصح بدونه. لذلك ركّز في صيغة السؤال: هل يسأل عن شرط، أم ركن، أم حكم؟ هذا التفريق هو الذي يقودك إلى «${model}».`;
  }
  if (concept.includes("الزكاة")) {
    return `السؤال مرتبط بباب ${concept}. الزكاة عبادة مالية لها ضوابط، وأهم ما يميّزها وجود النصاب والحول في أموال معينة، وليست مجرد صدقة اختيارية. عندما يظهر في السؤال لفظ مثل النصاب أو الحول أو المال الزائد عن الحاجة، فهذه علامات تقودك إلى حكم الزكاة وتفسر لماذا تكون «${model}» هي الفكرة المطلوبة.`;
  }
  if (concept.includes("الصيام")) {
    return `المفهوم الأساسي هنا هو ${concept}. الصيام ليس الامتناع عن الطعام والشراب فقط، بل عبادة لها نية ووقت ومفطرات ورخص. لذلك يجب الانتباه إلى الكلمات التي تبيّن الحكم: هل السؤال عن شرط الوجوب، أم مبطل من مبطلات الصيام، أم رخصة مثل المرض والسفر؟ بهذا الفهم تصبح «${model}» مرتبطة بالقاعدة لا بمجرد الحفظ.`;
  }
  if (concept.includes("الحج")) {
    return `يدور السؤال حول ${concept}. الحج عبادة لها أركان وواجبات ومواقيت، وبعض الألفاظ فيها متقاربة مثل الإحرام والطواف والوقوف بعرفة والسعي. عند المراجعة اربط كل عمل بمكانه وزمنه وحكمه: هل هو ركن لا يتم الحج بدونه، أم واجب يجبر بدم، أم سنة؟ هذا الربط يوضح لماذا تكون «${model}» هي الإجابة المناسبة للسؤال: «${q}».`;
  }
  return `الفكرة التعليمية في هذا السؤال هي ${concept}. لا تتعامل مع «${model || q}» كعبارة تحفظها فقط، بل اسأل نفسك: ما القاعدة التي تجعلها صحيحة؟ وما الكلمة المفتاحية في السؤال التي تشير إليها؟ عندما تفهم العلاقة بين السؤال والقاعدة ستستطيع حل أسئلة مشابهة حتى لو جاءت بصياغة مختلفة أو باختيارات قريبة من بعضها.`;
}

function extraInfo(item: any): string {
  const concept = detectConcept(item);
  if (concept.includes("الطهارة")) return "تذكّر دائماً: الحدث الأصغر يرفعه الوضوء، والحدث الأكبر يحتاج إلى الغسل، والتيمم بديل عند العجز عن استعمال الماء.";
  if (concept.includes("الصلاة")) return "قاعدة مفيدة: الشرط يكون مطلوباً قبل الدخول في الصلاة، أما الركن فهو جزء من الصلاة نفسها ولا تصح الصلاة بتركه عمداً.";
  if (concept.includes("الزكاة")) return "هل تعلم؟ اجتماع النصاب والحول هو العلامة الأهم في كثير من مسائل زكاة المال، لذلك ضع تحتهما خطاً عند قراءة السؤال.";
  if (concept.includes("الصيام")) return "معلومة مهمة: في مسائل الصيام فرّق بين شرط الوجوب، ومبطلات الصيام، والرخص؛ فهذا التفريق يمنع أغلب الأخطاء.";
  if (concept.includes("الحج")) return "تذكّر دائماً: الوقوف بعرفة هو الركن الأعظم في الحج، والإحرام هو نية الدخول في النسك وليس مجرد لبس ملابس الإحرام.";
  return "تذكّر دائماً: لا تحفظ الإجابة وحدها؛ احفظ معها سبب صحتها وكلمة السؤال التي دلت عليها، فهكذا تثبت المعلومة.";
}

// Deterministic local feedback used only when the AI provider fails or returns
// a weak/duplicated note. Delegates to the smart feedback engine so the note is
// case-aware (blank / partial / concept-mix / off-topic / ...) and varied.
// NOTE: scoring is NOT touched here — `score` is read-only input.
function localFeedback(item: any, score: number): string {
  const built = buildFallbackFeedback(item as FeedbackItem, Number(score || 0));
  return encodeFeedback({ notes: built.notes, explanation: built.explanation, extra: built.extra });
}


function pickOption(options: any[], id: string | null | undefined) {
  if (!id || !Array.isArray(options)) return null;
  return options.find((o) => String(o.id) === String(id)) || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { attemptId } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const sb = createClient(supabaseUrl, supabaseServiceKey);

    const caller = await getVerifiedUserFromAuthHeader(supabaseUrl, supabaseAnonKey, req.headers.get("Authorization"));
    if (!caller?.id) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!attemptId) {
      return new Response(JSON.stringify({ error: "attemptId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: attempt, error: attErr } = await sb
      .from("exam_attempts").select("*, exams(*)").eq("id", attemptId).maybeSingle();
    if (attErr || !attempt) {
      return new Response(JSON.stringify({ error: "محاولة غير صالحة" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const exam = (attempt as any).exams;
    if (attempt.student_id !== caller.id && exam?.teacher_id !== caller.id) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const [{ data: questions }, { data: answers }] = await Promise.all([
      sb.from("exam_questions")
        .select("id, question_text, question_type, correct_answer, explanation, marks, order_index")
        .eq("exam_id", attempt.exam_id)
        .neq("question_type", "section")
        .order("order_index", { ascending: true })
        .order("id", { ascending: true }),
      sb.from("exam_answers")
        .select("id, question_id, answer_text, selected_option_ids, marks_awarded, is_correct")
        .eq("attempt_id", attemptId),
    ]);

    const questionIds = (questions || []).map((q: any) => q.id);
    const { data: opts } = await sb.from("exam_question_options")
      .select("id, question_id, option_text, is_correct")
      .in("question_id", questionIds.length ? questionIds : ["00000000-0000-0000-0000-000000000000"]);

    const optsByQ = new Map<string, any[]>();
    (opts || []).forEach((o: any) => {
      const arr = optsByQ.get(o.question_id) || [];
      arr.push(o);
      optsByQ.set(o.question_id, arr);
    });
    const ansByQ = new Map((answers || []).map((a: any) => [a.question_id, a]));

    type Item = {
      questionId: string;
      answerId: string | null;
      questionType: string;
      question: string;
      questionExplanation: string;
      studentAnswer: string;
      modelAnswer: string;
      maxPoints: number;
      isObjective: boolean;
      currentScore: number;
      allOptionsText: string;
    };

    const items: Item[] = (questions || []).map((q: any) => {
      const a: any = ansByQ.get(q.id);
      const type = String(q.question_type || "");
      const qOptions = optsByQ.get(q.id) || [];
      let studentAnswerText = "";
      let modelAnswerText = String(q.correct_answer || "").trim();
      let allOptionsText = "";
      if (type === "mcq" || type === "true_false") {
        const selectedIds: string[] = a?.selected_option_ids || [];
        const picked = qOptions.filter((o) => selectedIds.includes(o.id));
        studentAnswerText = picked.map((o) => o.option_text).join(" | ");
        const correctOpts = qOptions.filter((o) => o.is_correct);
        if (correctOpts.length) modelAnswerText = correctOpts.map((o) => o.option_text).join(" | ");
        allOptionsText = qOptions.map((o, i) => `${i + 1}) ${o.option_text}${o.is_correct ? " [صحيح]" : ""}`).join("\n");
      } else {
        studentAnswerText = String(a?.answer_text || "").trim();
      }
      const isObjective = OBJECTIVE_TYPES.has(type);
      return {
        questionId: q.id,
        answerId: a?.id || null,
        questionType: type,
        question: String(q.question_text || ""),
        questionExplanation: String(q.explanation || "").trim(),
        studentAnswer: studentAnswerText,
        modelAnswer: modelAnswerText,
        maxPoints: Number(q.marks || 0),
        isObjective,
        currentScore: Number(a?.marks_awarded || 0),
        allOptionsText,
      };
    }).filter((it) => it.answerId);

    if (items.length === 0) {
      return new Response(JSON.stringify({ scores: {}, feedback: {} }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `أنت مُصحِّح خبير ومعلّم عربي محترف داخل منصة تعليمية. المطلوب ليس قول "صح" أو "خطأ"، وليس إعادة كتابة إجابة الطالب. المطلوب أن تشرح للطالب لماذا صحّت إجابته أو لماذا أخطأ، ثم تثبّت المعلومة في ذهنه مثل معلّم يراجع معه السؤال بعد الامتحان.

## الإخراج لكل سؤال (إلزامي)
لكل سؤال يجب أن تُرجع الحقول التالية:
- questionId, answerId: كما وردت لك حرفياً.
- score: للأسئلة المكتوبة فقط (short_answer / essay / fill_blank)؛ للأسئلة الموضوعية (mcq / true_false) اترك score = -1 لأن الدرجة محسوبة تلقائياً.
- notes: تحليل عميق لإجابة الطالب تحديداً.
- explanation: شرح تعليمي حقيقي للمفهوم في السؤال (وليس مجرد إعادة كتابة الإجابة الصحيحة).
- extra: معلومة إضافية أو قاعدة أو تذكرة تثبت الفكرة في ذهن الطالب.

## قواعد الجودة العامة
- اكتب بأسلوب معلم حقيقي دافئ، ليس روبوتاً، بالعربية الفصحى المبسّطة.
- كل ملاحظة يجب أن تكون **مختلفة تماماً** حسب السؤال وإجابة الطالب — ممنوع تكرار قوالب مثل "أحسنت" أو "استمر" أو "إجابة صحيحة" ثم التوقف.
- ممنوع أن تكون notes مجرد إعادة صياغة لإجابة الطالب أو الإجابة النموذجية.
- ممنوع أن تكون explanation جملة واحدة أو سطراً واحداً. يجب أن تشرح الفكرة/الدرس (مثلاً: إذا كان السؤال عن الوضوء اشرح الوضوء نفسه، وإذا عن الزكاة اشرح الزكاة).
- ممنوع أن تكرر explanation نفس نص correct_answer فقط.
- extra يجب أن تبدأ بصيغة مميّزة مثل: "هل تعلم؟" أو "معلومة مهمة:" أو "تذكّر دائماً:" أو "قاعدة مفيدة:" وتضيف قيمة معرفية جديدة (ليست تكراراً).
- إذا كانت الإجابة صحيحة لا تكتب فقط "إجابة صحيحة"؛ اشرح سبب صحة الاختيار والقاعدة التي جعلته صحيحاً.
- إذا كانت الإجابة خاطئة لا تكتفِ بذكر الصحيح؛ قارن بين إجابة الطالب والصحيح واذكر سبب الالتباس.

## حالات الإجابة الأربع عشرة (اكتب notes حسب الحالة المرسلة مع كل سؤال)
1) صحيحة بالكامل: لا تقل «إجابة صحيحة» فقط؛ وضّح لماذا صحّت وأي عناصر غطّتها، ثم ثبّت الفكرة في سطرين أو ثلاثة.
2) صحيحة ينقصها تفصيل: «إجابتك صحيحة جزئياً… لقد ذكرت… ولكن كان ينقص أيضاً…» ثم اشرح الناقص باختصار.
3) خاطئة: «يبدو أنك خلطت بين…» ثم «والإجابة الصحيحة هي…» ثم «وسبب ذلك…» مع شرح مبسط.
4) خلط بين مفهومين: بيّن أن ما كتبه يخص المفهوم الأول بينما السؤال عن الثاني، ثم اشرح الفرق بينهما بوضوح.
5) أجاب عن سؤال آخر: «إجابتك تتعلق بموضوع قريب… لكن السؤال كان يطلب… بينما إجابتك كانت عن…» وأشر إلى أنه خطأ شائع.
6) إجابة ناقصة عناصر: اذكر عدد العناصر الصحيحة بالاسم، ثم العناصر المتبقية صراحة واشرح كل ناقص بسطر.
7) إجابة طويلة بها أخطاء: ابدأ بما فيها من صواب، ثم حدّد الخطأ بدقة، ثم اكتب التصحيح.
8) تركها فارغة: «لم تقم بالإجابة… وكانت فرصة للحصول على X درجة… الإجابة الصحيحة هي…» ثم اشرح الفكرة كاملة باختصار.
9) صحيحة بصياغة ضعيفة: «الفكرة صحيحة، لكن يفضل كتابتها هكذا: …» مع بيان سبب أهمية الدقة في الامتحان.
10) مقالي: حلّل الإجابة كاملة وحدّد: ما أصاب فيه / ما أخطأ فيه / ما نسيه / كيف يكتب إجابة أفضل.
11) صح وخطأ: صحّح نص العبارة نفسها واشرح لماذا هي خاطئة، ثم اذكر الصواب والقاعدة.
12) اختيار من متعدد: اشرح لماذا اختياره غير مناسب تحديداً، ولماذا الخيار الصحيح هو الأنسب مقارنةً به.
13) سؤال حفظ (اذكر / عدّد / أركان / شروط): أضف في extra طريقة سهلة للتذكّر أو قاعدة مختصرة.
14) معلومة يكثر الخطأ فيها: ابدأ extra بـ «⚠️ انتبه:» ووضّح سبب شيوع الخطأ.

## قواعد explanation
- الشرح يشرح **الدرس/المفهوم**، ليس الاختيار فقط.
- استخدم فقرة تعليمية متكاملة (4 إلى 7 أسطر).
- ابدأ بتعريف المفهوم، ثم اذكر أركانه/شروطه/تفاصيله المهمة، ثم اربطه بواقع الطالب أو مثال بسيط.
- ممنوع أن تبدأ بـ "الإجابة الصحيحة هي..." أو "بالطبع" أو "بالتأكيد".

## قواعد extra
- سطر أو سطران فقط.
- معلومة إضافية أو قاعدة سريعة تُساعد الطالب على تذكّر الفكرة.
- ممنوع تكرارها بين الأسئلة.

## منع التكرار (إلزامي)
- لا تبدأ ملاحظتين في نفس الامتحان بنفس الجملة الافتتاحية.
- نوّع الأسلوب والافتتاحيات والأمثلة بين الأسئلة، كأن كل ملاحظة كتبها معلم أثناء تصحيح الورقة بيده.

## قواعد التصحيح (للمكتوبة فقط)
- score بين 0 والدرجة القصوى، مع كسور عشرية عادلة.
- إذا كانت الإجابة فارغة أو "لا أعرف / مش عارف" أو ما شابه → score = 0.
- إذا ذكر عناصر صحيحة جزئية → درجة جزئية عادلة (مثلاً 4 من 5 عناصر ≈ 80%).
- إذا كانت في موضوع مختلف تماماً → صفر أو قريب جداً.`;

    const buildPrompt = (batch: Item[]) => batch.map((it) => `
=== سؤال ===
questionId: ${it.questionId}
answerId: ${it.answerId}
نوع السؤال: ${it.questionType}
الدرجة القصوى: ${it.maxPoints}
${it.isObjective ? `الدرجة الحالية للطالب (لا تغيّرها): ${it.currentScore}` : ""}
نص السؤال: ${it.question}
${it.allOptionsText ? `الخيارات المتاحة:\n${it.allOptionsText}` : ""}
الإجابة النموذجية / الصحيحة: ${it.modelAnswer || "(غير متوفرة)"}
إجابة الطالب: ${it.studentAnswer || "(لم يجب)"}
${it.questionExplanation ? `شرح المعلم المخزّن (استعن به لإثراء explanation): ${it.questionExplanation}` : ""}
${caseDirective(it as unknown as FeedbackItem, classifyCase(it as unknown as FeedbackItem, Number(scores[it.questionId] ?? it.currentScore ?? 0)))}
`).join("\n");


    const tools = [{
      type: "function",
      function: {
        name: "grade_answers",
        description: "Return rich 3-part feedback (notes/explanation/extra) for every answer.",
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
                  score: { type: "number", description: "For written questions only. Use -1 for objective (mcq/true_false)." },
                  notes: { type: "string", description: "تحليل ذكي لإجابة الطالب — 3 إلى 5 أسطر." },
                  explanation: { type: "string", description: "شرح تعليمي للمفهوم في السؤال — 3 إلى 6 أسطر." },
                  extra: { type: "string", description: "معلومة إضافية / قاعدة / تذكرة تبدأ بصيغة مميزة." },
                },
                required: ["questionId", "answerId", "notes", "explanation", "extra"],
                additionalProperties: false,
              },
            },
          },
          required: ["results"],
          additionalProperties: false,
        },
      },
    }];

    const settings = await loadAiSettings(sb, "grade-essay");
    const { apiKey: GEMINI_API_KEY } = await resolveGeminiApiKey(sb, Deno.env.get("GEMINI_API_KEY") || "");

    const scores: Record<string, number> = {};
    const feedbackJson: Record<string, string> = {};

    // Preserve current objective scores by default.
    for (const it of items) {
      if (it.isObjective) scores[it.questionId] = it.currentScore;
    }

    async function callAI(batch: Item[]) {
      const result = await callGeminiWithFallback({
        apiKey: GEMINI_API_KEY,
        models: settings.models_to_try,
        body: {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: buildPrompt(batch) },
          ],
          tools,
          tool_choice: { type: "function", function: { name: "grade_answers" } },
        },
        fallbackDelayMs: settings.fallback_delay_ms,
        timeoutMs: 45_000,
      });
      if (!result.ok) return [];
      const data = await result.response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall) {
        try {
          const parsed = JSON.parse(toolCall.function.arguments || "{}");
          return Array.isArray(parsed.results) ? parsed.results : [];
        } catch { return []; }
      }
      const content = String(data.choices?.[0]?.message?.content || "").replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      if (!content) return [];
      try {
        const parsed = JSON.parse(content);
        return Array.isArray(parsed.results) ? parsed.results : [];
      } catch { return []; }
    }

    const isWeakAiFeedback = (r: any) => {
      const notes = String(r?.notes || "").trim();
      const explanation = String(r?.explanation || "").trim();
      const extra = String(r?.extra || "").trim();
      const generic = normalizeArabicText(`${notes} ${explanation}`);
      if (notes.length < 120 || explanation.length < 170 || extra.length < 35) return true;
      if (/^(✅|❌|🟡)?\s*(اجابة|إجابة)\s+(صحيحة|غير صحيحة|خطأ|جزئية)[.!؟\s]*$/i.test(notes)) return true;
      if (generic.includes("اجابه صحيحه") && notes.length < 180) return true;
      if (generic.includes("راجع الاجابه الصحيحه") && notes.length < 180) return true;
      return false;
    };

    // Batch into small chunks to force detailed per-question reasoning instead of generic one-line notes.
    const CHUNK = 4;
    for (let i = 0; i < items.length; i += CHUNK) {
      const batch = items.slice(i, i + CHUNK);
      let aiResults: any[] = [];
      try { aiResults = await callAI(batch); }
      catch (e) { console.warn("grade-essay batch failed", e); }

      const byQ = new Map(aiResults.map((r: any) => [String(r.questionId || ""), r]));
      for (const it of batch) {
        const r: any = byQ.get(it.questionId);
        if (r && !isWeakAiFeedback(r)) {
          // Score handling
          if (!it.isObjective) {
            const proposed = Number(r.score);
            let finalScore = Number.isFinite(proposed) && proposed >= 0
              ? Math.max(0, Math.min(proposed, it.maxPoints))
              : writtenFallbackScore(it.studentAnswer, it.modelAnswer, it.maxPoints);
            // Guard: nothing meaningful in common → force 0.
            if (finalScore > 0) {
              const s = overlap(it.studentAnswer, it.modelAnswer);
              if (s.common === 0 && normalizeArabicText(it.studentAnswer) !== normalizeArabicText(it.modelAnswer)) {
                finalScore = 0;
              }
            }
            if (isNonAnswer(it.studentAnswer)) finalScore = 0;
            scores[it.questionId] = Math.round(finalScore * 100) / 100;
          }
          feedbackJson[it.questionId] = encodeFeedback({
            notes: String(r.notes || "").trim(),
            explanation: String(r.explanation || "").trim(),
            extra: String(r.extra || "").trim(),
          });
        } else {
          // Fallback per item
          if (!it.isObjective) {
            scores[it.questionId] = writtenFallbackScore(it.studentAnswer, it.modelAnswer, it.maxPoints);
          }
          feedbackJson[it.questionId] = localFeedback(it, scores[it.questionId] ?? 0);
        }
      }
    }

    // Persist per-answer feedback + written scores.
    for (const it of items) {
      const payload: any = {
        ai_feedback: feedbackJson[it.questionId] || localFeedback(it, scores[it.questionId] ?? 0),
      };
      if (!it.isObjective) {
        const s = Number(scores[it.questionId] || 0);
        payload.marks_awarded = s;
        payload.is_correct = it.maxPoints > 0 && s >= it.maxPoints;
      }
      const { error: upErr } = await sb.from("exam_answers")
        .update(payload)
        .eq("id", it.answerId!)
        .eq("question_id", it.questionId);
      if (upErr) console.warn("exam_answers update failed", upErr);
    }

    // Refresh attempt totals.
    const { data: rows } = await sb.from("exam_answers").select("marks_awarded").eq("attempt_id", attemptId);
    const total = (rows || []).reduce((sum: number, r: any) => sum + Number(r.marks_awarded || 0), 0);
    const maxScore = Number(attempt.max_score || exam?.total_marks || 0);
    const percentage = maxScore > 0 ? Math.round((total / maxScore) * 10000) / 100 : 0;
    await sb.from("exam_attempts").update({
      status: "graded",
      total_score: total,
      percentage,
      passed: maxScore > 0 ? percentage >= 50 : false,
      is_graded: true,
      graded_at: new Date().toISOString(),
      graded_by: exam?.teacher_id || null,
    }).eq("id", attemptId);
    if (exam?.source !== "modrek_ai") {
      const { error: statsError } = await sb.rpc("refresh_student_exam_stats", { _student_id: attempt.student_id });
      if (statsError) console.warn("refresh_student_exam_stats skipped", statsError.message);
    }

    return new Response(JSON.stringify({
      ok: true,
      scores,
      feedback: feedbackJson,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("grade-essay error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "حدث خطأ" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

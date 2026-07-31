// ============================================================================
// Smart Feedback Engine — "معلم حقيقي" feedback for exam review.
//
// SCOPE: FEEDBACK ONLY. This module never computes, adjusts or returns a score.
// It only classifies the *pedagogical situation* of an answer and produces
// (a) a case-specific directive for the AI, and (b) a rich, varied
// deterministic fallback note when the AI is unavailable or too generic.
// ============================================================================

export type FeedbackCase =
  | "blank"              // 8  لم يجب
  | "correct_full"       // 1  صحيحة بالكامل
  | "correct_style"      // 9  صحيحة لكن الصياغة ضعيفة
  | "correct_partial"    // 2  صحيحة ينقصها تفصيل
  | "incomplete_items"   // 6  ذكر بعض العناصر فقط
  | "mixed_long"         // 7  إجابة طويلة بها صحيح وخطأ
  | "concept_mix"        // 4  خلط بين مفهومين متشابهين
  | "off_topic"          // 5  أجاب عن سؤال آخر
  | "wrong";             // 3  خاطئة

export const WRITTEN_TYPES = new Set(["short_answer", "essay", "fill_blank"]);
export const OBJECTIVE_TYPES = new Set(["mcq", "true_false"]);

export function normalizeAr(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[أإآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/[ة]/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set([
  "من","في","علي","عن","الي","ان","هو","هي","هما","هم","هن","هذا","هذه","ذلك","تلك","الذي","التي",
  "الذين","او","و","ثم","كما","كل","اي","لا","لم","لن","ما","مع","بين","عند","اذا","كان","كانت",
  "يكون","تكون","قد","لقد","حتي","فقط","غير","بعد","قبل","خلال","له","لها","به","بها","فيها","يجب",
]);

export function words(value: unknown) {
  return normalizeAr(value).split(" ").filter((w) => w.length >= 3 && !STOP.has(w));
}

export function coverage(student: unknown, model: unknown) {
  const a = [...new Set(words(student))];
  const b = [...new Set(words(model))];
  if (!a.length || !b.length) return { common: 0, precision: 0, recall: 0, aLen: a.length, bLen: b.length };
  const common = a.filter((w) => b.includes(w)).length;
  return { common, precision: common / a.length, recall: common / b.length, aLen: a.length, bLen: b.length };
}

const NON_ANSWER = /^(\?|0|لا|لم|مش|معرفش|ماعرفش|مدري|لا اعرف|لا ادري|لا اعلم|مش عارف|مش فاكر|لم اجب|بدون اجابه)/;
export function isBlankAnswer(value: unknown) {
  const n = normalizeAr(value);
  if (!n) return true;
  return NON_ANSWER.test(n) && words(n).length <= 2;
}

export interface FeedbackItem {
  questionId: string;
  questionType: string;
  question: string;
  questionExplanation?: string;
  studentAnswer: string;
  modelAnswer: string;
  maxPoints: number;
  isObjective: boolean;
  allOptionsText?: string;
}

// --- Model answer element splitting (for "ذكر 3 من 5 عناصر") -----------------
export function splitElements(model: unknown): string[] {
  const raw = String(model ?? "").trim();
  if (!raw) return [];
  const parts = raw
    .split(/\n+|[،؛;]|(?:^|\s)[-•*]\s|\s\d+[).]\s|\sو(?=[^\s]{3,})/g)
    .map((p) => p.replace(/^\s*[-•*\d).]+\s*/, "").trim())
    .filter((p) => words(p).length >= 1 && p.length >= 3);
  return parts.length > 1 ? parts.slice(0, 8) : [];
}

export function missingElements(student: unknown, model: unknown) {
  const elements = splitElements(model);
  if (!elements.length) return { elements: [] as string[], hit: [] as string[], missed: [] as string[] };
  const hit: string[] = [];
  const missed: string[] = [];
  for (const el of elements) {
    const c = coverage(student, el);
    (c.recall >= 0.5 ? hit : missed).push(el);
  }
  return { elements, hit, missed };
}

// --- Case classification -----------------------------------------------------
// score is used ONLY to read the already-computed grading outcome. It is never
// modified here.
export function classifyCase(item: FeedbackItem, score: number): FeedbackCase {
  const max = Number(item.maxPoints || 0);
  const full = max > 0 && score >= max - 1e-9;
  const partial = !full && score > 0;

  if (isBlankAnswer(item.studentAnswer)) return "blank";

  if (item.isObjective) return full ? "correct_full" : "wrong";

  const c = coverage(item.studentAnswer, item.modelAnswer);
  const { missed, elements } = missingElements(item.studentAnswer, item.modelAnswer);
  const longAnswer = words(item.studentAnswer).length >= 25;

  if (full) {
    // Correct but written loosely / very short compared to the model.
    if (c.precision < 0.35 || (c.aLen <= 3 && c.bLen >= 6)) return "correct_style";
    if (elements.length && missed.length === 1) return "correct_partial";
    return "correct_full";
  }

  if (partial) {
    if (elements.length >= 3 && missed.length >= 1) return "incomplete_items";
    if (longAnswer) return "mixed_long";
    return "correct_partial";
  }

  // Zero score.
  if (c.common === 0) {
    // Talks about the same lesson family? (shares words with the question text)
    const q = coverage(item.studentAnswer, item.question);
    if (q.common >= 2) return "off_topic";
    return "wrong";
  }
  if (c.recall > 0 && c.recall < 0.35 && c.common >= 1) return "concept_mix";
  return "wrong";
}

export const CASE_LABEL_AR: Record<FeedbackCase, string> = {
  blank: "لم يجب الطالب على السؤال",
  correct_full: "إجابة صحيحة بالكامل",
  correct_style: "الفكرة صحيحة لكن الصياغة ضعيفة أو مختصرة جداً",
  correct_partial: "إجابة صحيحة ينقصها تفصيل",
  incomplete_items: "إجابة ناقصة — ذكر بعض العناصر وترك أخرى",
  mixed_long: "إجابة طويلة فيها معلومات صحيحة وأخرى خاطئة",
  concept_mix: "خلط بين مفهومين متشابهين",
  off_topic: "أجاب عن موضوع قريب وليس عن المطلوب",
  wrong: "إجابة خاطئة",
};

// Directive appended to the AI prompt per question so the note matches the case
// instead of falling back to one repeated template.
export function caseDirective(item: FeedbackItem, c: FeedbackCase): string {
  const { missed, hit } = missingElements(item.studentAnswer, item.modelAnswer);
  const missedLine = missed.length ? `\nالعناصر التي لم يذكرها الطالب: ${missed.join(" / ")}` : "";
  const hitLine = hit.length ? `\nالعناصر التي أصاب فيها: ${hit.join(" / ")}` : "";

  const base: Record<FeedbackCase, string> = {
    blank:
      "الطالب ترك السؤال فارغاً. ابدأ بجملة تشجيعية غير مُحبِطة، وضّح أنها كانت فرصة للحصول على درجات، ثم اعرض الإجابة الصحيحة كاملة واشرح فكرتها باختصار، واختم بنصيحة عملية بأن يكتب ما يعرفه ولو جزئياً.",
    correct_full:
      "الإجابة صحيحة بالكامل. لا تكتفِ بكلمة «أحسنت»؛ وضّح لماذا اعتُبرت صحيحة وأي عناصر المطلوب غطّتها، ثم ثبّت الفكرة الأساسية في سطرين أو ثلاثة، ونبّه إلى نقطة قريبة يخطئ فيها الطلاب عادة.",
    correct_style:
      "الفكرة صحيحة لكن الصياغة ضعيفة أو مختصرة جداً. أكّد أولاً أن الفكرة صحيحة، ثم اعرض صياغة نموذجية أفضل يكتب بها الإجابة في الامتحان، واشرح لماذا الصياغة الدقيقة تحفظ له الدرجة كاملة.",
    correct_partial:
      "الإجابة صحيحة لكن ينقصها تفصيل. اذكر بالتحديد ما ذكره الطالب، ثم ما الذي كان ينقصه، ثم اشرح النقطة الناقصة باختصار." + hitLine + missedLine,
    incomplete_items:
      "الإجابة ناقصة عناصر. اذكر عدد العناصر الصحيحة التي كتبها بالاسم، ثم اذكر العناصر المتبقية صراحة واشرح كل عنصر ناقص بسطر." + hitLine + missedLine,
    mixed_long:
      "الإجابة طويلة وفيها صواب وخطأ. لا ترفضها كاملة: ابدأ بذكر المعلومات الصحيحة داخلها، ثم حدّد الخطأ بدقة، ثم اكتب التصحيح، ثم انصحه بترتيب إجابته في نقاط.",
    concept_mix:
      "الطالب خلط بين مفهومين متشابهين. وضّح: ما كتبه يخص المفهوم (أ)، بينما السؤال عن المفهوم (ب)، ثم اشرح الفرق بينهما بطريقة سهلة مع علامة تميّز بينهما في صياغة السؤال.",
    off_topic:
      "إجابة الطالب في موضوع قريب من السؤال لكنها ليست المطلوب. وضّح أن الموضوع قريب، ثم بيّن ما الذي طلبه السؤال تحديداً وما الذي أجاب عنه هو، وأشر إلى أن هذا خطأ شائع، ثم اشرح المطلوب.",
    wrong:
      "الإجابة خاطئة. ممنوع كتابة «إجابة خاطئة» فقط. ابدأ بتحديد مصدر الالتباس (يبدو أنك خلطت بين ...)، ثم اذكر الإجابة الصحيحة، ثم اشرح سبب صحتها بصورة مبسطة.",
  };

  const typeExtra =
    item.questionType === "true_false"
      ? " السؤال صح/خطأ: صحّح نص العبارة نفسها واشرح لماذا هي صحيحة أو خاطئة، ثم اذكر القاعدة."
      : item.questionType === "mcq"
      ? " السؤال اختيار من متعدد: اشرح لماذا الخيار الذي اختاره الطالب غير مناسب تحديداً، ولماذا الخيار الصحيح هو الأنسب مقارنةً به."
      : item.questionType === "essay"
      ? " السؤال مقالي: حلّل الإجابة كاملة وحدّد (ما أصاب فيه / ما أخطأ فيه / ما نسيه / كيف يكتب إجابة أفضل)."
      : item.questionType === "fill_blank"
      ? " سؤال إكمال: اشرح لماذا الكلمة الصحيحة تناسب الفراغ ولماذا كلمة الطالب لا تصلح."
      : "";

  const memoryHint = /اذكر|عدّد|عدد |ما هي|اركان|أركان|شروط|واجبات|خصائص/.test(String(item.question))
    ? " هذا سؤال يعتمد على الحفظ: أضف في extra طريقة سهلة للتذكّر (ترتيب، حرف أول، أو قاعدة مختصرة)."
    : "";

  return `حالة الإجابة: ${CASE_LABEL_AR[c]}.\nالتوجيه الإلزامي: ${base[c]}${typeExtra}${memoryHint}`;
}

// --- Deterministic varied fallback ------------------------------------------
function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}
function pick<T>(arr: T[], seed: number, salt = 0): T {
  return arr[(seed + salt) % arr.length];
}
function clip(value: unknown, max = 220) {
  const t = String(value ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

const CONCEPTS: Array<[RegExp, string, string, string]> = [
  [/وضوء|طهاره|حدث اصغر|حدث اكبر|غسل|تيمم/, "الطهارة والوضوء",
    "الطهارة هي المدخل العملي لصحة كثير من العبادات؛ الوضوء يرفع الحدث الأصغر، والغسل للحدث الأكبر، والتيمم بديل عند العجز عن الماء.",
    "تذكّر دائماً: الحدث الأصغر يرفعه الوضوء، والأكبر يحتاج غسلاً، والتيمم رخصة عند تعذّر الماء."],
  [/صلاه|قبله|ركوع|سجود|تكبير|الفاتحه/, "الصلاة وشروطها وأركانها",
    "الصلاة ليست حركات فقط؛ لها شروط تسبقها أو تلازمها كالطهارة واستقبال القبلة، وأركان داخلها لا تصح بدونها كالركوع والسجود وقراءة الفاتحة.",
    "قاعدة مفيدة: الشرط قبل الصلاة أو ملازم لها، والركن جزء داخلها لا تصح بتركه عمداً."],
  [/زكاه|نصاب|حول|صدقه/, "الزكاة وأحكامها",
    "الزكاة عبادة مالية لها ضوابط، وأهم علامتين فيها بلوغ النصاب ومرور الحول، وهي ليست صدقة اختيارية بل ركن واجب.",
    "هل تعلم؟ اجتماع «النصاب» و«الحول» هو مفتاح أغلب مسائل زكاة المال."],
  [/صيام|رمضان|مفطرات|فطر/, "الصيام وأحكامه",
    "الصيام امتناع بنيّة عن المفطرات من الفجر إلى المغرب، وله شروط وجوب ومبطلات ورخص كالمرض والسفر.",
    "معلومة مهمة: فرّق دائماً بين شرط الوجوب، والمبطل، والرخصة؛ هذا التفريق يمنع أغلب الأخطاء."],
  [/حج|عمره|احرام|طواف|عرفه|مزدلفه/, "الحج والعمرة",
    "الحج عبادة لها أركان وواجبات ومواقيت؛ الإحرام نية الدخول في النسك، والوقوف بعرفة ركنها الأعظم، ولكل عمل مكانه وزمنه وحكمه.",
    "تذكّر دائماً: الوقوف بعرفة هو الركن الأعظم، والإحرام نيّة لا مجرد ملابس."],
  [/ايمان|اسلام|الشهادتين|اركان الاسلام|اركان الايمان/, "أركان الإسلام والإيمان",
    "أركان الإسلام أعمال ظاهرة يقوم عليها بناء المسلم، وأركان الإيمان اعتقادات قلبية؛ والخلط بينهما من أكثر الأخطاء شيوعاً.",
    "طريقة سهلة للتذكر: الإسلام «عمل» (شهادة، صلاة، زكاة، صوم، حج)، والإيمان «اعتقاد» (بالله وملائكته وكتبه ورسله واليوم الآخر والقدر)."],
];

function conceptOf(item: FeedbackItem) {
  const src = normalizeAr(`${item.question} ${item.modelAnswer} ${item.questionExplanation || ""}`);
  const found = CONCEPTS.find(([re]) => re.test(src));
  if (found) return { name: found[1], teach: found[2], extra: found[3] };
  const name = words(`${item.question} ${item.modelAnswer}`).slice(0, 4).join(" ") || "الفكرة الأساسية في الدرس";
  return {
    name,
    teach: `الفكرة التعليمية هنا تدور حول «${name}». لا تحفظ الجملة وحدها، بل اسأل نفسك: ما القاعدة التي جعلتها صحيحة؟ وما الكلمة المفتاحية في السؤال التي دلّت عليها؟`,
    extra: "تذكّر دائماً: احفظ سبب صحة الإجابة مع الإجابة نفسها؛ فهكذا تثبت المعلومة وتتعرف عليها بأي صياغة.",
  };
}

const OPENERS: Record<FeedbackCase, string[]> = {
  blank: ["لم تكتب شيئاً في هذا السؤال.", "تركت هذا السؤال بلا إجابة.", "هذا السؤال مرّ عليك دون محاولة."],
  correct_full: ["أحسنت، إجابتك صحيحة تماماً.", "ممتاز، وصلت إلى المطلوب بدقة.", "إجابة موفقة ومكتملة."],
  correct_style: ["الفكرة صحيحة، لكن الصياغة تحتاج ضبطاً.", "معناك سليم، لكن طريقة الكتابة مختصرة أكثر من اللازم."],
  correct_partial: ["إجابتك صحيحة لكنها ناقصة تفصيلاً.", "أنت على الطريق الصحيح، لكن الإجابة لم تكتمل."],
  incomplete_items: ["ذكرت جزءاً من العناصر المطلوبة وتركت الباقي.", "إجابتك فيها عناصر صحيحة، لكن بعض العناصر المهمة غابت."],
  mixed_long: ["إجابتك طويلة وفيها صواب وخطأ معاً.", "كتبت كثيراً، وبعض ما كتبته صحيح وبعضه يحتاج تصحيحاً."],
  concept_mix: ["يبدو أنك خلطت بين مفهومين متشابهين.", "ما كتبته قريب من الموضوع لكنه ليس نفس المفهوم المطلوب."],
  off_topic: ["إجابتك تتعلق بموضوع قريب من السؤال وليس بالمطلوب نفسه.", "أجبت عن نقطة أخرى غير التي سأل عنها السؤال."],
  wrong: ["إجابتك لم تصل إلى المطلوب.", "هناك التباس واضح في هذه الإجابة."],
};

export function buildFallbackFeedback(item: FeedbackItem, score: number) {
  const c = classifyCase(item, score);
  const seed = hash(`${item.questionId}|${item.studentAnswer}`);
  const concept = conceptOf(item);
  const q = clip(item.question, 200);
  const model = clip(item.modelAnswer, 260) || "(غير متوفرة)";
  const student = clip(item.studentAnswer, 240);
  const { hit, missed } = missingElements(item.studentAnswer, item.modelAnswer);
  const opener = pick(OPENERS[c], seed);

  let notes = "";
  switch (c) {
    case "blank":
      notes = `${opener} وكانت فرصة للحصول على ${item.maxPoints} درجة كاملة.\n\nالسؤال كان يطلب: «${q}»، والإجابة الصحيحة هي: ${model}.\n\nحتى لو لم تكن متأكداً، اكتب ما تتذكره؛ الإجابة الجزئية تستحق درجة، أما الفراغ فلا يعطيك شيئاً.`;
      break;
    case "correct_full":
      notes = `${opener} السبب أن إجابتك «${student || model}» غطّت ما يطلبه السؤال: «${q}» دون نقص.\n\nوتذكّر دائماً أن المهم ليس اللفظ بل الفكرة: ${concept.teach}\n\nانتبه مستقبلاً إلى البدائل القريبة التي تبدو صحيحة لكنها تجيب عن سؤال آخر.`;
      break;
    case "correct_style":
      notes = `${opener} فكرتك سليمة، لكن يفضّل أن تكتبها بهذه الطريقة:\n«${model}»\n\nالصياغة الدقيقة تحفظ لك الدرجة كاملة، لأن المصحح يبحث عن العناصر المطلوبة بوضوح لا عن إشارة عامة.`;
      break;
    case "correct_partial":
      notes = `${opener} لقد ذكرت: ${hit.length ? hit.join(" و") : student}.\n\nولكن كان ينقص أيضاً: ${missed.length ? missed.join(" و") : model}.\n\nالنقطة الناقصة مهمة لأنها جزء أصيل من المطلوب في «${concept.name}»، وبدونها تبقى الصورة غير مكتملة.`;
      break;
    case "incomplete_items":
      notes = `${opener} ذكرت ${hit.length} عنصراً صحيحاً${hit.length ? `: ${hit.join(" / ")}` : ""}.\n\nوبقي ${missed.length} عنصراً مهماً: ${missed.join(" / ")}.\n\nكل عنصر من هذه العناصر له درجته، فاكتب النقاط أولاً في صورة قائمة ثم اشرحها؛ هكذا لا ينسى قلمك شيئاً.`;
      break;
    case "mixed_long":
      notes = `${opener} إجابتك تحتوي على معلومات صحيحة${hit.length ? ` مثل: ${hit.join(" / ")}` : ""}.\n\nولكن يوجد خطأ في الجزء الذي ابتعد عن المطلوب، والتصحيح هو: ${model}.\n\nالطول ليس ميزة في التصحيح؛ رتّب إجابتك في نقاط محددة واحذف ما لا علاقة له بالسؤال.`;
      break;
    case "concept_mix":
      notes = `${opener} ما كتبته «${student}» يخص جانباً آخر قريباً، بينما السؤال كان عن: «${q}».\n\nوالفرق بينهما أن المطلوب هنا هو: ${model}.\n\n${concept.teach}`;
      break;
    case "off_topic":
      notes = `${opener} السؤال كان يطلب: «${q}»، بينما إجابتك كانت عن نقطة أخرى: «${student}».\n\nوهذا خطأ شائع بين الطلاب بسبب تشابه العناوين داخل الدرس. المطلوب فعلياً هو: ${model}.\n\nاقرأ كلمة السؤال المفتاحية (اذكر / علّل / عرّف / ما الفرق) قبل أن تبدأ الكتابة.`;
      break;
    default:
      notes = item.isObjective
        ? `${opener} اخترت «${student || "بدون اختيار"}»، بينما الإجابة الصحيحة هي «${model}».\n\nسبب هذا الاختيار غالباً تشابه البدائل؛ فالخيار الذي اخترته يجيب عن فكرة قريبة لا عن المطلوب تحديداً في: «${q}».\n\n${concept.teach}`
        : `${opener} ما كتبته «${student}» لا يغطي المطلوب، والإجابة الصحيحة هي: ${model}.\n\nوسبب ذلك أن السؤال «${q}» يطلب عناصر محددة من باب «${concept.name}» وليس معنى عاماً.\n\n${concept.teach}`;
  }

  const teacherNote = String(item.questionExplanation || "").trim();
  const explanation = teacherNote.length >= 80
    ? `${teacherNote}\n\nوربط ذلك بالسؤال أن المطلوب ليس حفظ عبارة منفصلة، بل فهم القاعدة التي تجعل «${model}» هي الإجابة الصحيحة هنا، حتى لو تغيّرت صياغة السؤال.`
    : `${concept.teach}\n\nوعند تطبيق ذلك على سؤالنا «${q}» تجد أن الإجابة الصحيحة «${model}» ليست اختياراً عشوائياً، بل نتيجة مباشرة لهذه القاعدة. اربط دائماً بين الكلمة المفتاحية في السؤال والقاعدة التي تشرحها، وستستطيع حل أي صيغة مشابهة.`;

  const warnMistake = c === "concept_mix" || c === "off_topic"
    ? "⚠️ انتبه: هذه من أكثر النقاط التي يخطئ فيها الطلاب بسبب تشابه المصطلحات، فراجع الفرق بينها جيداً. "
    : "";

  return {
    case: c,
    notes,
    explanation,
    extra: `${warnMistake}${concept.extra}`,
  };
}

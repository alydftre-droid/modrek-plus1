// ============================================================================
// Modrek Plus — Answer Scope Engine (Intent → Scope → Length)
// ----------------------------------------------------------------------------
// Deterministic, model-free intent detection for the student's last message.
// It ONLY controls how long / how wide the answer should be. It never touches
// RAG, web research, safety rules, or the teaching persona.
// ============================================================================

export type AnswerIntent =
  | "FACT_LOOKUP"
  | "DEFINITION"
  | "SHORT_ANSWER"
  | "DIRECT_QUESTION"
  | "PROBLEM_SOLVING"
  | "MCQ"
  | "IMAGE_QUESTION"
  | "IMAGE_EXAM_FULL"
  | "EXPLANATION"
  | "FULL_LESSON"
  | "SUMMARY"
  | "PRACTICE"
  | "EXAM"
  | "COMPARISON"
  | "REVIEW"
  | "AMBIGUOUS";

export type AnswerScope = {
  intent: AnswerIntent;
  /** true when the full teaching/explanation style must be used. */
  expansive: boolean;
  /** short human label used in the prompt. */
  label: string;
  /** target answer size instruction (Arabic). */
  size: string;
};

const rx = {
  explainDetailed: /(اشرح|اشرحلي|إشرح|وضّ?ح|فهمني|علمني|درّسني|بالتفصيل|تفصيل|شرح كامل|اشرح لي الدرس)/,
  fullLesson: /(الدرس كامل|شرح الدرس|اشرح (لي )?الدرس|الوحدة كاملة|كل الدرس|الفصل كامل)/,
  summary: /(لخص|تلخيص|ملخص|أهم (الأفكار|النقاط)|نقاط الدرس|خلاصة)/,
  practice: /(تدريبات|تمارين|مسائل تدريب|اسئلة تدريب|أسئلة تدريب|اعمل لي (\d+ )?(اسئلة|أسئلة)|درّبني|درب?ني)/,
  exam: /(امتحان|اختبار|كويز|quiz|exam|اعمل لي امتحان)/,
  review: /(راجع|مراجعة|مراجعه)/,
  comparison: /(قارن|مقارنة|الفرق بين|إيه الفرق|ايه الفرق)/,
  definition: /(تعريف|ما هو|ما هي|ايه هو|إيه هو|إيه معنى|ايه معنى|معنى كلمة|معنى مصطلح|يعني ايه|يعني إيه|المقصود ب)/,
  lessonName: /(اسم الدرس|عنوان الدرس|الدرس الأول|الدرس الاول|كم درس|عدد الدروس|ما هي الدروس|أسماء الدروس|اسماء الدروس)/,
  problem: /(حل|احسب|أوجد|اوجد|جد قيمة|بسّط|بسط|عوّض|كم يساوي|=|\d\s*[\+\-\*\/xX×]\s*\d)/,
  howSolved: /(طريقة الحل|ازاي (حلت|نحل)|إزاي (حلت|نحل)|خطوات الحل)/,
  mcq: /(اختر|اختيار من متعدد|\(أ\)|\(ب\)|\ba\)|أي (من|الإجابات)|الإجابة الصحيحة)/,
  why: /(ليه|لماذا|علل|سبب)/,
  allQuestions: /(كل الاسئلة|كل الأسئلة|جميع الاسئلة|جميع الأسئلة|الامتحان كامل|الورقة كاملة|كل المسائل|حل الامتحان)/,
  singleQuestion: /(السؤال (الاول|الأول|الثاني|الثالث|الرابع|الخامس|رقم)|سؤال رقم|بس|فقط)/,
};

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p: any) => (p && typeof p === "object" && p.type === "text" ? String(p.text ?? "") : ""))
      .join(" ");
  }
  return "";
}

function hasImage(content: unknown): boolean {
  return Array.isArray(content) && content.some((p: any) => p && typeof p === "object" && p.type === "image_url");
}

const SCOPES: Record<AnswerIntent, { label: string; size: string; expansive: boolean }> = {
  FACT_LOOKUP: { label: "طلب معلومة محددة", size: "سطر إلى سطرين فقط: المعلومة المطلوبة فقط.", expansive: false },
  DEFINITION: { label: "طلب تعريف/معنى", size: "التعريف مباشرةً (2-4 أسطر) + مثال واحد فقط إن كان ضروريًا لفهم التعريف.", expansive: false },
  SHORT_ANSWER: { label: "سؤال قصير", size: "إجابة قصيرة مباشرة (سطر إلى ثلاثة أسطر).", expansive: false },
  DIRECT_QUESTION: { label: "سؤال مباشر", size: "إجابة مباشرة مختصرة، بدون مقدمات ولا استطراد.", expansive: false },
  PROBLEM_SOLVING: { label: "حل مسألة", size: "حل المسألة المطلوبة فقط بخطواتها الضرورية، بدون شرح الدرس ولا مسائل إضافية.", expansive: false },
  MCQ: { label: "اختيار من متعدد", size: "الإجابة الصحيحة + سبب مختصر في سطر أو سطرين.", expansive: false },
  IMAGE_QUESTION: { label: "سؤال من صورة", size: "استخرج السؤال المطلوب فقط من الصورة وأجب عنه فقط، ولا تحل بقية الأسئلة ولا تشرح الدرس.", expansive: false },
  IMAGE_EXAM_FULL: { label: "حل امتحان كامل من صورة", size: "حل كل الأسئلة الموجودة في الصورة بالترتيب، بإيجاز لكل سؤال.", expansive: true },
  COMPARISON: { label: "مقارنة", size: "جدول أو نقاط مقارنة مختصرة للفروق المطلوبة فقط.", expansive: false },
  EXPLANATION: { label: "طلب شرح", size: "شرح تعليمي كامل بأسلوب المدرس.", expansive: true },
  FULL_LESSON: { label: "شرح درس كامل", size: "شرح كامل ومنظم للدرس بأسلوب المدرس.", expansive: true },
  SUMMARY: { label: "تلخيص", size: "ملخص منظم بالنقاط فقط، بدون شرح موسّع ولا تدريبات.", expansive: false },
  PRACTICE: { label: "تدريبات", size: "التدريبات المطلوبة فقط بالعدد المطلوب.", expansive: true },
  EXAM: { label: "امتحان", size: "الامتحان المطلوب فقط.", expansive: true },
  REVIEW: { label: "مراجعة", size: "مراجعة منظمة للنقاط الأساسية.", expansive: true },
  AMBIGUOUS: { label: "طلب غير واضح", size: "اسأل سؤالًا توضيحيًا قصيرًا واحدًا فقط بدل إعطاء شرح ضخم.", expansive: false },
};

export type ScopeOptions = {
  /** force the image branch when the image is sent out-of-band (page render, region crop, upload). */
  hasImage?: boolean;
};

export function detectAnswerIntent(content: unknown, options: ScopeOptions = {}): AnswerIntent {
  const raw = textOf(content).trim();
  const t = raw.replace(/[أإآ]/g, "ا").replace(/\s+/g, " ");
  const image = hasImage(content) || options.hasImage === true;

  // An attached image means the student is asking about that image; it wins over
  // generic exam/practice wording ("حل الامتحان كامل من الصورة").
  if (image) {
    if (rx.allQuestions.test(t)) return "IMAGE_EXAM_FULL";
    if (!rx.practice.test(t) && !rx.summary.test(t)) return "IMAGE_QUESTION";
  }
  if (rx.exam.test(t)) return "EXAM";
  if (rx.practice.test(t)) return "PRACTICE";
  if (rx.summary.test(t)) return "SUMMARY";
  if (rx.review.test(t)) return "REVIEW";
  if (rx.comparison.test(t)) return "COMPARISON";
  if (rx.mcq.test(t)) return "MCQ";
  if (rx.howSolved.test(t)) return "EXPLANATION";
  if (rx.fullLesson.test(t)) return "FULL_LESSON";
  if (rx.lessonName.test(t) && !rx.explainDetailed.test(t)) return "FACT_LOOKUP";
  if (rx.explainDetailed.test(t)) {
    // "اشرح لي الصرف" (a whole subject with no lesson/idea) is genuinely ambiguous.
    if (t.length <= 18 && !/درس|قاعدة|مسال|مسأل|سؤال|قانون|وحدة/.test(t)) return "AMBIGUOUS";
    return "EXPLANATION";
  }
  if (rx.definition.test(t)) return "DEFINITION";
  if (rx.problem.test(t)) return "PROBLEM_SOLVING";
  if (rx.why.test(t)) return "SHORT_ANSWER";
  if (t.length <= 60) return "DIRECT_QUESTION";
  return "SHORT_ANSWER";
}

export function resolveAnswerScope(content: unknown, options: ScopeOptions = {}): AnswerScope {
  const intent = detectAnswerIntent(content, options);
  const s = SCOPES[intent];
  return { intent, label: s.label, size: s.size, expansive: s.expansive };
}

/** Resolve the scope from a messages array (uses the last user turn). */
export function resolveAnswerScopeFromMessages(messages: Array<{ role?: string; content?: unknown }>): AnswerScope {
  const lastUser = [...(messages || [])].reverse().find((m) => m?.role === "user");
  return resolveAnswerScope(lastUser?.content ?? "");
}

/** Prompt block that constrains scope + length without touching the persona. */
export function buildAnswerScopeBlock(scope: AnswerScope): string {
  return `## نطاق الإجابة (إلزامي — يحدد الطول والمحتوى)
- نوع الطلب المكتشف: ${scope.intent} (${scope.label}).
- الحجم المطلوب: ${scope.size}
- القاعدة الأساسية: أجب عن السؤال الذي طرحه الطالب فقط، وبالحجم المناسب للسؤال. لا تفترض أنه يريد شرحًا كاملًا لمجرد أن سؤاله من درس.
${scope.expansive
      ? `- هذا الطلب يستدعي الأسلوب التعليمي الكامل: التزم بطريقة الشرح والتنسيق المعتادة بالكامل ولا تختصر.`
      : `- ممنوع تلقائيًا (إلا إذا طلبها الطالب صراحةً أو كانت ضرورية جدًا لفهم الإجابة): شرح الدرس كاملًا، تدريبات إضافية، أمثلة كثيرة، أسئلة امتحانات، دروس مرتبطة، معلومات جانبية، مراجعة شاملة، ملخص نهائي، أو أي قسم ختامي ثابت.
- Progressive Disclosure: أعطِ الإجابة الأساسية أولًا، ثم — عند الحاجة فقط — اقتراح واحد قصير للتوسع مثل: "لو تحب، أقدر أشرحلك الدرس بالتفصيل." اقتراح واحد فقط، وليس قائمة اقتراحات.
- لا تكرر نص السؤال، ولا تعد صياغة المعلومة أكثر من مرة، ولا تكتب مقدمات.
- وجود محتوى كثير في المكتبة عن الموضوع ليس سببًا لتوسيع الإجابة.`}
${scope.intent === "IMAGE_QUESTION"
      ? `- قواعد الصور: اقرأ الصورة، حدّد السؤال الذي طلبه الطالب بالنص، أعد كتابته في سطر واحد كحد أقصى، ثم أجب عنه فقط. ممنوع حل أسئلة أخرى ظاهرة في الصورة أو شرح الدرس الذي جاءت منه.`
      : scope.intent === "IMAGE_EXAM_FULL"
        ? `- قواعد الصور: حل كل أسئلة الصورة بالترتيب مع رقم كل سؤال، وبإيجاز في كل سؤال بدون شرح الدرس.`
        : ""}
- لا تستخدم عددًا ثابتًا من الكلمات: الطول يتحدد من نية الطالب أعلاه.`;
}

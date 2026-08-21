// deno-lint-ignore-file no-explicit-any
// ============================================================================
// Modrek AI — Shared Library RAG layer
// ----------------------------------------------------------------------------
// ONE retrieval brain used by every AI surface (study assistant, exam
// generator, review assistant) so they always agree on:
//   student scope -> subject -> book -> unit/lesson -> pages -> chunks
//
// Hard rules implemented here:
//  * Multi-subject: religious (فقه/حديث/تفسير/عقيدة/نحو/صرف), literary,
//    languages and scientific subjects are all first-class.
//  * Library FIRST: everything is grounded on the real library_* tables.
//  * No cross-grade / cross-subject / cross-system leakage.
//  * Nothing is invented: when the library has no match we say so explicitly
//    and let the caller decide about a trusted external fallback.
// ============================================================================

import { normalizeAr, parseLessonRequest } from "./lessonTargeting.ts";
import { resolveOpenRouterApiKey } from "./aiSettings.ts";
import { openRouterEmbed, OPENROUTER_DEFAULT_EMBED_MODEL } from "./openrouter.ts";
import { aiEmbeddings } from "./aiProvider.ts";

// ---------------------------------------------------------------- scope ----

export interface StudentScope {
  userId: string;
  fullName: string | null;
  role: string | null;
  stageCode: string | null;      // secondary | preparatory | primary
  gradeCode: string | null;      // sec1 | sec2 | sec3 | pr1 ...
  trackCodes: string[];          // scientific | sci_science | sci_math | literary
  sectionCode: "azhar" | "general" | null;
  labels: { stage: string | null; grade: string | null; track: string | null; system: string };
}

const STAGE_ALIASES: Record<string, string> = {
  secondary: "secondary", "ثانوي": "secondary", "الثانوي": "secondary", "المرحلة الثانوية": "secondary",
  preparatory: "preparatory", "اعدادي": "preparatory", "إعدادي": "preparatory", "المرحلة الإعدادية": "preparatory",
  primary: "primary", "ابتدائي": "primary",
};

const GRADE_INDEX: Record<string, number> = {
  first: 1, "الاول": 1, "1": 1,
  second: 2, "الثاني": 2, "2": 2,
  third: 3, "الثالث": 3, "3": 3,
  fourth: 4, "4": 4, fifth: 5, "5": 5, sixth: 6, "6": 6,
};

const STAGE_GRADE_PREFIX: Record<string, string> = {
  secondary: "sec", preparatory: "pr", primary: "p",
};

function trackCodesFor(section: string | null | undefined): string[] {
  const s = normalizeAr(section || "");
  if (!s) return [];
  if (s.includes("ادبي") || s === "literary") return ["literary"];
  if (s.includes("رياضه") || s.includes("رياضة") || s === "sci_math") return ["sci_math", "scientific"];
  if (s.includes("علوم") || s === "sci_science") return ["sci_science", "scientific"];
  if (s.includes("علم") || s === "scientific") return ["scientific", "sci_science", "sci_math"];
  return [];
}

const GRADE_LABELS: Record<string, string> = {
  sec1: "الصف الأول الثانوي", sec2: "الصف الثاني الثانوي", sec3: "الصف الثالث الثانوي",
  pr1: "الصف الأول الإعدادي", pr2: "الصف الثاني الإعدادي", pr3: "الصف الثالث الإعدادي",
  p1: "الصف الأول الابتدائي", p2: "الصف الثاني الابتدائي", p3: "الصف الثالث الابتدائي",
  p4: "الصف الرابع الابتدائي", p5: "الصف الخامس الابتدائي", p6: "الصف السادس الابتدائي",
};

export async function resolveStudentScope(admin: any, userId: string): Promise<StudentScope> {
  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, role, stage, grade, section, education_type")
    .eq("id", userId)
    .maybeSingle();

  const stageCode = STAGE_ALIASES[String(profile?.stage || "")] ??
    STAGE_ALIASES[normalizeAr(profile?.stage || "")] ?? null;
  const gradeIdx = GRADE_INDEX[String(profile?.grade || "")] ?? GRADE_INDEX[normalizeAr(profile?.grade || "")] ?? null;
  const gradeCode = stageCode && gradeIdx ? `${STAGE_GRADE_PREFIX[stageCode]}${gradeIdx}` : null;
  const trackCodes = trackCodesFor(profile?.section);
  const eduRaw = normalizeAr(profile?.education_type || "");
  const sectionCode = eduRaw.includes("ازهر") || eduRaw === "azhar" ? "azhar" : eduRaw ? "general" : null;

  return {
    userId,
    fullName: profile?.full_name ?? null,
    role: profile?.role ?? null,
    stageCode,
    gradeCode,
    trackCodes,
    sectionCode,
    labels: {
      stage: stageCode === "secondary" ? "المرحلة الثانوية" : stageCode === "preparatory" ? "المرحلة الإعدادية" : stageCode === "primary" ? "المرحلة الابتدائية" : null,
      grade: gradeCode ? GRADE_LABELS[gradeCode] ?? null : null,
      track: profile?.section || null,
      system: sectionCode === "azhar" ? "أزهري" : sectionCode === "general" ? "عام" : "غير محدد",
    },
  };
}

// ------------------------------------------------------- query understanding

export type ModrekIntent =
  | "list_books" | "explain_lesson" | "summarize" | "solve_question" | "define"
  | "generate_exam" | "review" | "search_content" | "other";

export interface QueryUnderstanding {
  intent: ModrekIntent;
  subject: string | null;                       // raw Arabic subject mention
  lesson: { kind: "lesson" | "unit"; number: number } | null;
  lessonTitleHint: string | null;
  page: number | null;
  wholeCurriculum: boolean;
  refersToPrevious: boolean;                    // "اعمل عليه امتحان"
  keywords: string[];
}

// Subject vocabulary — religious + literary + languages + scientific, equal weight.
const SUBJECT_VOCAB: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: "الفقه", aliases: ["فقه", "الفقه"] },
  { canonical: "الحديث", aliases: ["حديث", "الحديث", "حديث شريف"] },
  { canonical: "التفسير", aliases: ["تفسير", "التفسير"] },
  { canonical: "التوحيد", aliases: ["توحيد", "التوحيد", "العقيده", "عقيده"] },
  { canonical: "القرآن الكريم", aliases: ["قران", "القران", "قرءان", "تجويد", "الحفظ"] },
  { canonical: "السيرة", aliases: ["السيره", "سيره"] },
  { canonical: "النحو", aliases: ["نحو", "النحو"] },
  { canonical: "الصرف", aliases: ["صرف", "الصرف"] },
  { canonical: "البلاغة", aliases: ["بلاغه", "البلاغه"] },
  { canonical: "الأدب", aliases: ["ادب", "الادب", "النصوص", "نصوص"] },
  { canonical: "اللغة العربية", aliases: ["العربي", "اللغه العربيه", "عربي", "لغه عربيه"] },
  { canonical: "اللغة الإنجليزية", aliases: ["انجليزي", "الانجليزي", "اللغه الانجليزيه", "english"] },
  { canonical: "اللغة الفرنسية", aliases: ["فرنساوي", "الفرنسيه", "اللغه الفرنسيه"] },
  { canonical: "الرياضيات", aliases: ["رياضيات", "الرياضيات", "جبر", "الجبر", "هندسه", "الهندسه", "حساب مثلثات", "تفاضل", "تكامل", "استاتيكا", "ديناميكا"] },
  { canonical: "الفيزياء", aliases: ["فيزياء", "الفيزياء"] },
  { canonical: "الكيمياء", aliases: ["كيمياء", "الكيمياء"] },
  { canonical: "الأحياء", aliases: ["احياء", "الاحياء"] },
  { canonical: "الجيولوجيا", aliases: ["جيولوجيا", "الجيولوجيا"] },
  { canonical: "العلوم", aliases: ["علوم", "العلوم"] },
  { canonical: "التاريخ", aliases: ["تاريخ", "التاريخ"] },
  { canonical: "الجغرافيا", aliases: ["جغرافيا", "الجغرافيا"] },
  { canonical: "الفلسفة", aliases: ["فلسفه", "الفلسفه", "منطق", "المنطق"] },
  { canonical: "علم النفس", aliases: ["علم النفس", "الاجتماع", "علم الاجتماع"] },
  { canonical: "الدراسات الاجتماعية", aliases: ["الدراسات", "دراسات اجتماعيه"] },
  { canonical: "التربية الدينية", aliases: ["التربيه الدينيه", "الدين"] },
  { canonical: "الحاسب الآلي", aliases: ["حاسب", "الحاسب", "كمبيوتر", "تكنولوجيا المعلومات"] },
];

export function detectSubject(text: string): string | null {
  const n = normalizeAr(text);
  let best: { canonical: string; len: number } | null = null;
  for (const entry of SUBJECT_VOCAB) {
    for (const alias of entry.aliases) {
      const a = normalizeAr(alias);
      if (a && n.includes(a) && (!best || a.length > best.len)) {
        best = { canonical: entry.canonical, len: a.length };
      }
    }
  }
  return best?.canonical ?? null;
}

const STOP_WORDS = new Set([
  "اشرح", "اشرحلي", "شرح", "لي", "من", "في", "علي", "على", "عن", "الي", "إلى", "ايه", "ما", "هو", "هي",
  "امتحان", "اختبار", "اسئله", "اسئلة", "اعمل", "انشئ", "عايز", "عاوز", "محتاج", "لو", "سمحت", "الدرس", "درس",
  "الوحده", "وحده", "الباب", "باب", "الفصل", "فصل", "كتاب", "الكتاب", "مكتبتي", "المكتبه",
]);

export function understandQuery(
  text: string,
  opts: { history?: string[]; contextSubject?: string | null } = {},
): QueryUnderstanding {
  const raw = String(text || "");
  const n = normalizeAr(raw);

  const isExam = /(امتحان|اختبار|كويز|اسئله تدريبيه|اسئله علي|quiz)/.test(n);
  const isList = /(الكتب|كتب|مكتبتي|المكتبه|المتاحه لي|عندي ايه)/.test(n) && /(ايه|ما|اعرض|قائمه|فين|عندي|موجود)/.test(n);
  const isSummary = /(لخص|تلخيص|ملخص)/.test(n);
  const isDefine = /(عرف|تعريف|يعني ايه|معني)/.test(n);
  const isSolve = /(حل|احسب|اوجد|مسال|سؤال رقم)/.test(n);
  const isReview = /(مراجعه|راجع معايا)/.test(n);
  const isExplain = /(اشرح|شرح|فهمني|وضح|ازاي|ليه)/.test(n);

  const intent: ModrekIntent = isExam
    ? "generate_exam"
    : isList
      ? "list_books"
      : isSummary
        ? "summarize"
        : isReview
          ? "review"
          : isExplain
            ? "explain_lesson"
            : isDefine
              ? "define"
              : isSolve
                ? "solve_question"
                : "search_content";

  const lesson = parseLessonRequest(raw, null);
  const pageMatch = n.match(/(?:صفحه|صفحة|ص)\s*(?:رقم\s*)?([0-9]{1,4})/);
  const page = pageMatch ? Number(pageMatch[1]) : null;
  const wholeCurriculum = /(المنهج كامل|كل المنهج|المنهج كله|المنهج بالكامل|علي المنهج)/.test(n);

  let subject = detectSubject(raw);
  const refersToPrevious = !subject && /(عليه|عليها|نفس الدرس|نفسه|ده|دي)/.test(n);

  if (!subject) {
    for (const prev of [...(opts.history || [])].reverse()) {
      const s = detectSubject(prev);
      if (s) { subject = s; break; }
    }
  }
  if (!subject && opts.contextSubject) subject = detectSubject(opts.contextSubject) || opts.contextSubject;

  let inheritedLesson = lesson;
  if (!inheritedLesson) {
    for (const prev of [...(opts.history || [])].reverse()) {
      const l = parseLessonRequest(prev, null);
      if (l) { inheritedLesson = l; break; }
    }
  }

  const keywords = [...new Set(
    n.split(/\s+/).map((w) => w.replace(/[^\u0621-\u064Aa-z0-9]/gi, "")).filter((w) => w.length >= 3 && !STOP_WORDS.has(w)),
  )].slice(0, 8);

  const titleHint = raw.match(/(?:درس|وحده|وحدة|باب|فصل)\s+([^\n،.]{2,40})/)?.[1]?.trim() || null;

  return {
    intent,
    subject,
    lesson: inheritedLesson,
    lessonTitleHint: titleHint,
    page,
    wholeCurriculum,
    refersToPrevious,
    keywords,
  };
}

// ------------------------------------------------------------- retrieval ----

export interface LibraryBookRef {
  id: string;
  title: string;
  subject: string | null;
  sub_subject: string | null;
  grade_label: string | null;
  track_label: string | null;
  education_type: string | null;
  term: string | null;
  page_count: number | null;
  access_tier: string | null;
  /** The platform currently has two upload pipelines; retrieval must read both. */
  pipeline: "library" | "knowledge";
}

export type PassageSource = "page" | "lesson_pages" | "vector" | "keyword_chunk" | "keyword_page" | "outline_sample";

export interface LibraryPassage {
  text: string;
  chunk_id: string | null;
  book_id: string;
  book_title: string;
  lesson_title: string | null;
  page_from: number | null;
  page_to: number | null;
  score: number;
  source: PassageSource;
  similarity?: number | null;
  keyword_rank?: number | null;
}

export interface LibraryLessonRef {
  id: string;
  title: string;
  kind: string | null;
  page_start: number | null;
  page_end: number | null;
  order_index: number | null;
  /** Lesson number as written in the book itself (never inferred). */
  lesson_number?: number | null;
  unit_number?: number | null;
  /** "explicit" = the book stated the number; "unknown" = do not trust position. */
  number_source?: "explicit" | "unknown";
}


/** Developer debug trace: proves the whole pipeline for a single question. */
export interface RagTrace {
  query: string;
  detected_subject: string | null;
  detected_intent: string;
  detected_lesson: { kind: string; number: number } | null;
  student: { grade: string | null; stage: string | null; section: string | null; tracks: string[] };
  books_searched: Array<{ id: string; title: string; subject: string | null }>;
  candidate_book_ids: string[];
  outline_nodes: number;
  matched_lesson: string | null;
  vector_hits: number;
  keyword_hits: number;
  page_hits: number;
  passages: Array<{ chunk_id: string | null; book_id: string; page: number | null; score: number; source: PassageSource }>;
  source_type: "library" | "external";
  duration_ms: number;
  reasons: string[];
}

export interface LibraryRagResult {
  scope: StudentScope;
  understanding: QueryUnderstanding;
  accessible_books: LibraryBookRef[];       // everything the student may read
  subject_books: LibraryBookRef[];          // narrowed to the detected subject
  selected_book: LibraryBookRef | null;
  outline: LibraryLessonRef[];              // book index (units/lessons)
  lesson: LibraryLessonRef | null;
  passages: LibraryPassage[];
  confidence: "high" | "medium" | "low" | "none";
  found: boolean;
  ambiguity: string | null;                 // clarifying question when confidence is low
  notes: string[];
  trace: RagTrace;
}


let taxonomyCache: { at: number; grades: any[]; tracks: any[]; stages: any[]; sections: any[]; subjects: any[]; subSubjects: any[] } | null = null;

async function loadTaxonomy(admin: any) {
  if (taxonomyCache && Date.now() - taxonomyCache.at < 5 * 60_000) return taxonomyCache;
  const [{ data: grades }, { data: tracks }, { data: stages }, { data: sections }, { data: subjects }, { data: subSubjects }] = await Promise.all([
    admin.from("library_grades").select("id, code, name_ar, stage_id"),
    admin.from("library_tracks").select("id, code, name_ar"),
    admin.from("library_stages").select("id, code, name_ar"),
    admin.from("library_sections").select("id, code, name_ar"),
    admin.from("library_subjects").select("id, name_ar"),
    admin.from("library_sub_subjects").select("id, name_ar"),
  ]);
  taxonomyCache = {
    at: Date.now(), grades: grades || [], tracks: tracks || [], stages: stages || [], sections: sections || [],
    subjects: subjects || [], subSubjects: subSubjects || [],
  };
  return taxonomyCache;
}

function subjectMatches(book: any, subject: string | null): boolean {
  if (!subject) return true;
  const want = normalizeAr(subject);
  const fields = [book.subject_name_ar, book.sub_subject_name, book.title].map((v: any) => normalizeAr(v || ""));
  return fields.some((f) => f && (f === want || f.includes(want) || want.includes(f)));
}

/** All READY library books this student is allowed to open, scoped to their curriculum. */
export async function listAccessibleBooks(admin: any, scope: StudentScope): Promise<LibraryBookRef[]> {
  const tax = await loadTaxonomy(admin);
  const gradeRow = tax.grades.find((g: any) => g.code === scope.gradeCode);
  const stageRow = tax.stages.find((s: any) => s.code === scope.stageCode);
  const trackIds = tax.tracks.filter((t: any) => scope.trackCodes.includes(t.code) || t.code === "none").map((t: any) => t.id);
  const allowedSectionIds = tax.sections
    .filter((s: any) => s.code === "shared" || (scope.sectionCode ? s.code === scope.sectionCode : true))
    .map((s: any) => s.id);

  // Shielding: a student whose profile resolves to neither a grade nor a stage must
  // never receive library content — otherwise the query would return every book.
  if (!gradeRow?.id && !stageRow?.id) {
    console.warn("[modrekLibraryRag] scope_unresolved_no_books", { userId: scope.userId });
    return [];
  }

  let q = admin
    .from("library_books")
    .select("id,title,subject_name_ar,sub_subject_name,term,page_count,access_tier,education_type,grade_id,track_id,stage_id,section_id")
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(200);

  if (gradeRow?.id) q = q.eq("grade_id", gradeRow.id);
  else if (stageRow?.id) q = q.eq("stage_id", stageRow.id);

  const [{ data: rows, error }, modernResult] = await Promise.all([
    q,
    (() => {
      let modern = admin
        .from("knowledge_sources")
        .select("id,title,term,grade_id,track_id,stage_id,section_id,subject_id,sub_subject_id")
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(200);
      if (gradeRow?.id) modern = modern.eq("grade_id", gradeRow.id);
      else if (stageRow?.id) modern = modern.eq("stage_id", stageRow.id);
      return modern;
    })(),
  ]);
  if (error) { console.warn("[modrekLibraryRag] books_query_failed", error.message); return []; }

  const systemLabel = scope.sectionCode === "azhar" ? "ازهر" : scope.sectionCode === "general" ? "عام" : null;

  const filtered = (rows || []).filter((b: any) => {
    // Education system isolation (أزهري vs عام) — shared / unset books stay visible.
    if (b.section_id && allowedSectionIds.length && !allowedSectionIds.includes(b.section_id)) return false;
    if (!b.section_id && systemLabel && b.education_type) {
      const e = normalizeAr(b.education_type);
      if (!e.includes("مشترك") && !e.includes(systemLabel)) return false;
    }
    // Track isolation — books with no track are shared across tracks.
    if (b.track_id) {
      // Fail closed: an unresolved/unknown student track must never expose a
      // book restricted to a different track. Trackless books stay shared.
      if (!trackIds.length) return false;
      if (!trackIds.includes(b.track_id)) return false;
    }
    return true;
  });


  // Access tier check (free is open, otherwise ask the DB).
  const out: LibraryBookRef[] = [];
  const tierCache = new Map<string, boolean>();
  const tax2 = tax;
  for (const b of filtered) {
    const tier = b.access_tier || "free";
    let allowed = tier === "free";
    if (!allowed) {
      if (tierCache.has(tier)) allowed = tierCache.get(tier)!;
      else {
        const { data: ok } = await admin.rpc("has_library_access", { _user_id: scope.userId, _tier: tier });
        allowed = ok === true;
        tierCache.set(tier, allowed);
      }
    }
    if (!allowed) continue;
    out.push({
      id: b.id,
      title: b.title,
      subject: b.subject_name_ar ?? null,
      sub_subject: b.sub_subject_name ?? null,
      grade_label: tax2.grades.find((g: any) => g.id === b.grade_id)?.name_ar ?? null,
      track_label: tax2.tracks.find((t: any) => t.id === b.track_id)?.name_ar ?? null,
      education_type: b.education_type ?? null,
      term: b.term ?? null,
      page_count: b.page_count ?? null,
      access_tier: tier,
      pipeline: "library",
    });
  }

  // The Modrek upload wizard writes to knowledge_sources/content_chunks. Older
  // assistants only queried library_books, which made a fully processed source
  // invisible and forced a false external fallback. Merge both pipelines here.
  const modernRows = modernResult?.data || [];
  if (modernResult?.error) console.warn("[modrekLibraryRag] knowledge_sources_query_failed", modernResult.error.message);
  const modernScoped = modernRows.filter((b: any) => {
    if (b.section_id && allowedSectionIds.length && !allowedSectionIds.includes(b.section_id)) return false;
    if (b.track_id) {
      if (!trackIds.length) return false;
      if (!trackIds.includes(b.track_id)) return false;
    }
    return true;
  });
  if (modernScoped.length) {
    const modernIds = modernScoped.map((b: any) => b.id);
    const { data: searchableRows, error: searchableError } = await admin
      .from("content_chunks")
      .select("source_id")
      .in("source_id", modernIds)
      .limit(5000);
    if (searchableError) console.warn("[modrekLibraryRag] knowledge_chunks_probe_failed", searchableError.message);
    const searchable = new Set((searchableRows || []).map((r: any) => String(r.source_id)));
    for (const b of modernScoped) {
      if (!searchable.has(String(b.id))) continue;
      out.push({
        id: b.id,
        title: b.title,
        subject: tax.subjects.find((s: any) => s.id === b.subject_id)?.name_ar ?? b.title ?? null,
        sub_subject: tax.subSubjects.find((s: any) => s.id === b.sub_subject_id)?.name_ar ?? null,
        grade_label: tax.grades.find((g: any) => g.id === b.grade_id)?.name_ar ?? null,
        track_label: tax.tracks.find((t: any) => t.id === b.track_id)?.name_ar ?? null,
        education_type: tax.sections.find((s: any) => s.id === b.section_id)?.name_ar ?? null,
        term: b.term != null ? String(b.term) : null,
        page_count: null,
        access_tier: "free",
        pipeline: "knowledge",
      });
    }
  }
  return out;
}

async function loadOutline(admin: any, book: LibraryBookRef): Promise<LibraryLessonRef[]> {
  if (book.pipeline === "knowledge") {
    const { data } = await admin
      .from("knowledge_lesson_index")
      .select("unit_id,title,kind,page_start,page_end,ordinal,lesson_number,unit_number,number_source")
      .eq("source_id", book.id)
      .order("ordinal", { ascending: true })
      .limit(400);
    return (data || []).map((r: any) => {
      const parsed = parseCurriculumTitle(r.title || "");
      return {
        id: r.unit_id,
        title: r.title,
        kind: r.kind ?? parsed.kind,
        page_start: r.page_start ?? null,
        page_end: r.page_end ?? null,
        order_index: r.ordinal ?? null,
        lesson_number: r.lesson_number ?? parsed.lessonNumber ?? null,
        unit_number: r.unit_number ?? parsed.unitNumber ?? null,
        number_source: (r.number_source === "explicit" || parsed.numberSource === "explicit") ? "explicit" : "unknown",
      } as LibraryLessonRef;
    });
  }
  const { data } = await admin
    .from("library_book_index")
    .select("id,title,kind,page_start,page_end,order_index,parent_id")
    .eq("book_id", book.id)
    .order("order_index", { ascending: true })
    .limit(400);
  return (data || []).map((r: any) => {
    // Legacy rows carry no numbers: derive them from the real heading text only.
    const parsed = parseCurriculumTitle(r.title || "");
    return {
      id: r.id,
      title: r.title,
      kind: r.kind ?? parsed.kind,
      page_start: r.page_start ?? null,
      page_end: r.page_end ?? null,
      order_index: r.order_index ?? null,
      lesson_number: parsed.lessonNumber,
      unit_number: parsed.unitNumber,
      number_source: parsed.numberSource,
    } as LibraryLessonRef;
  });
}

/**
 * Resolves "الدرس الثالث" to a REAL node of the book index.
 *
 * Order of truth:
 *   1. explicit title hint match,
 *   2. the number stored/written for that node ("الدرس الثالث" / "الدرس 3"),
 *   3. position inside its kind — ONLY when no node of that kind carries an
 *      explicit number (i.e. the book never numbers its lessons).
 * Otherwise it returns null: retrieval then answers honestly instead of
 * serving a different lesson.
 */
function pickLesson(outline: LibraryLessonRef[], target: { kind: "lesson" | "unit"; number: number } | null, titleHint: string | null): LibraryLessonRef | null {
  if (!outline.length) return null;
  if (titleHint) {
    const want = normalizeAr(titleHint);
    const byTitle = outline.find((o) => want.length >= 3 && normalizeAr(o.title || "").includes(want));
    if (byTitle) return byTitle;
  }
  if (!target) return null;

  const kinds = target.kind === "lesson"
    ? ["lesson", "section", "topic"]
    : ["unit", "chapter", "part"];
  const pool = outline.filter((o) => kinds.includes(String(o.kind || "").toLowerCase()));
  if (!pool.length) return null;

  // 1) the number the BOOK itself states for this node.
  const stored = pool.find((o) => {
    const n = target.kind === "lesson" ? o.lesson_number : o.unit_number;
    return o.number_source === "explicit" && Number(n) === target.number;
  });
  if (stored) return stored;

  // 2) numbers appearing inside the heading text (both digits and Arabic ordinals).
  const variants = lessonPhraseVariants(target, null).map((v) => normalizeAr(v)).filter((v) => v.length >= 4);
  const byPhrase = pool.find((o) => {
    const t = normalizeAr(o.title || "");
    return variants.some((v) => t.includes(v));
  });
  if (byPhrase) return byPhrase;

  // 3) positional fallback ONLY for books that never number their headings.
  const anyExplicit = pool.some((o) => o.number_source === "explicit");
  if (!anyExplicit && pool.length >= target.number) return pool[target.number - 1];

  return null;
}

// Real book OCR pages can be short (title pages, exercise pages); 20 chars is the
// smallest text that can still carry meaning. A higher floor silently dropped
// legitimate lesson pages and was one reason retrieval returned nothing.
const MIN_PASSAGE_CHARS = 20;


async function pagesText(admin: any, book: LibraryBookRef, from: number | null, to: number | null, limit = 8) {
  if (book.pipeline === "knowledge") {
    const { data } = await admin
      .from("content_chunks")
      .select("id,content,unit_id,metadata")
      .eq("source_id", book.id)
      .order("ordinal", { ascending: true })
      .limit(Math.max(limit * 20, 200));
    return (data || [])
      .map((r: any) => ({
        ...r,
        ocr_text: r.content,
        page_number: Number(r.metadata?.page_from ?? 0) || null,
        page_to: Number(r.metadata?.page_to ?? r.metadata?.page_from ?? 0) || null,
      }))
      .filter((p: any) => {
        if (String(p.ocr_text || "").trim().length < MIN_PASSAGE_CHARS) return false;
        const pageStart = Number(p.page_number ?? 0);
        const pageEnd = Number(p.page_to ?? pageStart);
        if (from && pageEnd && pageEnd < from) return false;
        if (to && pageStart && pageStart > to) return false;
        return true;
      })
      .slice(0, limit);
  }
  let q = admin
    .from("library_book_pages")
    .select("page_number, ocr_text")
    .eq("book_id", book.id)
    .order("page_number", { ascending: true })
    .limit(limit);
  if (from) q = q.gte("page_number", from);
  if (to) q = q.lte("page_number", to);
  const { data } = await q;
  return (data || []).filter((p: any) => String(p.ocr_text || "").trim().length >= MIN_PASSAGE_CHARS);
}

async function modernSemanticPassages(admin: any, sourceIds: string[], query: string, matchCount = 12) {
  if (!sourceIds.length) return [];
  try {
    const embedded = await aiEmbeddings({
      model: "openai/text-embedding-3-small",
      input: [query.slice(0, 8000)],
      dimensions: 768,
    });
    const vector = (embedded.data as any)?.data?.[0]?.embedding;
    if (!embedded.ok || !Array.isArray(vector) || !vector.length) return [];
    const { data, error } = await admin.rpc("modrek_hybrid_search", {
      p_query_embedding: vector,
      p_query_text: query,
      p_source_type_id: null,
      p_stage_id: null,
      p_grade_id: null,
      p_section_id: null,
      p_track_id: null,
      p_subject_id: null,
      p_source_ids: sourceIds,
      p_match_count: matchCount,
      p_min_similarity: 0.25,
    });
    if (error) { console.warn("[modrekLibraryRag] modern_vector_rpc_failed", error.message); return []; }
    return (data || []).map((r: any) => ({ ...r, id: r.chunk_id, book_id: r.source_id, page_number: r.page_from }));
  } catch (e) {
    console.warn("[modrekLibraryRag] modern_semantic_failed", String(e).slice(0, 160));
    return [];
  }
}

async function modernKeywordChunks(admin: any, sourceIds: string[], phrases: string[], limit = 10) {
  if (!sourceIds.length || !phrases.length) return [];
  const tokens = phrases.join(" ").split(/\s+/).map((v) => normalizeAr(v)).filter((v) => v.length >= 3).slice(0, 4);
  if (!tokens.length) return [];
  const orClause = tokens.map((t) => `content.ilike.%${t.replace(/[%_,()"'\\]/g, "")}%`).join(",");
  const { data, error } = await admin
    .from("content_chunks")
    .select("id,source_id,content,metadata")
    .in("source_id", sourceIds)
    .or(orClause)
    .limit(limit);
  if (error) { console.warn("[modrekLibraryRag] modern_keyword_failed", error.message); return []; }
  return (data || []).map((r: any) => ({
    ...r, book_id: r.source_id, page_number: Number(r.metadata?.page_from ?? 0) || null, rank: 0.7,
  }));
}

/** Vector search across EVERY candidate book in one round trip. */
async function semanticPassages(admin: any, bookIds: string[], query: string, matchCount = 12) {
  if (!bookIds.length) return [];
  try {
    const { apiKey } = await resolveOpenRouterApiKey(admin);
    if (!apiKey) return [];
    const emb = await openRouterEmbed({ apiKey, model: OPENROUTER_DEFAULT_EMBED_MODEL, inputs: [query.slice(0, 2000)], timeoutMs: 20_000 });
    if (!emb.ok || !emb.vectors[0]?.length) return [];
    const { data, error } = await admin.rpc("library_match_chunks_multi", {
      p_book_ids: bookIds,
      p_query_embedding: emb.vectors[0],
      p_match_count: matchCount,
    });
    if (error) {
      console.warn("[modrekLibraryRag] vector_rpc_failed", error.message);
      return [];
    }
    return (data || []) as any[];
  } catch (e) {
    console.warn("[modrekLibraryRag] semantic_failed", String(e).slice(0, 160));
    return [];
  }
}

/** Keyword + exact-phrase search over chunks (trigram index) across candidate books. */
async function keywordChunks(admin: any, bookIds: string[], phrases: string[], limit = 10) {
  if (!bookIds.length || !phrases.length) return [];
  const out: any[] = [];
  for (const phrase of phrases.slice(0, 4)) {
    const term = phrase.trim();
    if (term.length < 3) continue;
    const { data, error } = await admin.rpc("library_search_chunks_text", {
      p_book_ids: bookIds,
      p_query: term,
      p_match_count: limit,
    });
    if (error) { console.warn("[modrekLibraryRag] keyword_rpc_failed", error.message); continue; }
    for (const row of data || []) out.push({ ...row, matched_phrase: term });
    if (out.length >= limit * 2) break;
  }
  return out;
}

/** Last-resort keyword scan over raw page OCR text (books whose chunks failed). */
async function keywordPages(admin: any, bookIds: string[], keywords: string[], limit = 6) {
  const tokens = keywords.filter((k) => k.length >= 3).slice(0, 4);
  if (!tokens.length || !bookIds.length) return [];
  const orClause = tokens.map((t) => `ocr_text.ilike.%${t.replace(/[%_,()"'\\]/g, "")}%`).join(",");
  const { data } = await admin
    .from("library_book_pages")
    .select("book_id, page_number, ocr_text")
    .in("book_id", bookIds)
    .or(orClause)
    .limit(limit);
  return data || [];
}

/** Every textual form a lesson/unit request can take inside a real Arabic book. */
function lessonPhraseVariants(target: { kind: "lesson" | "unit"; number: number } | null, titleHint: string | null): string[] {
  const out: string[] = [];
  if (titleHint && titleHint.length >= 3) out.push(titleHint);
  if (!target) return out;
  const ordinals = ["", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر"];
  const words = target.kind === "lesson" ? ["الدرس", "درس"] : ["الوحدة", "الوحده", "الباب", "الفصل"];
  const ord = ordinals[target.number] || String(target.number);
  for (const w of words) {
    out.push(`${w} ${ord}`);
    out.push(`${w} ${target.number}`);
  }
  return out;
}

function lexicalOverlap(text: string, keywords: string[]): number {
  if (!keywords.length) return 0;
  const n = normalizeAr(text);
  const hits = keywords.filter((k) => k.length >= 3 && n.includes(normalizeAr(k))).length;
  return hits / keywords.length;
}

export interface RetrieveArgs {
  userId: string;
  query: string;
  history?: string[];
  contextSubject?: string | null;
  maxPassages?: number;
  scope?: StudentScope;
  /** Which AI surface asked (study / exams / chat / review) — for telemetry. */
  surface?: string;
  /** Set false to skip writing the developer telemetry row. */
  log?: boolean;
}

const MAX_CANDIDATE_BOOKS = 8;

export async function retrieveFromLibrary(admin: any, args: RetrieveArgs): Promise<LibraryRagResult> {
  const startedAt = Date.now();
  const scope = args.scope ?? await resolveStudentScope(admin, args.userId);
  const understanding = understandQuery(args.query, { history: args.history, contextSubject: args.contextSubject });
  const notes: string[] = [];
  const reasons: string[] = [];
  const maxPassages = args.maxPassages ?? 8;

  const accessible = await listAccessibleBooks(admin, scope);
  if (!scope.gradeCode) notes.push("لم يتم تحديد صف الطالب في ملفه الشخصي بدقة.");
  if (!accessible.length) reasons.push("no_accessible_books_for_scope");

  const subjectBooks = understanding.subject
    ? accessible.filter((b) => subjectMatches({ subject_name_ar: b.subject, sub_subject_name: b.sub_subject, title: b.title }, understanding.subject))
    : accessible;

  const trace: RagTrace = {
    query: String(args.query || "").slice(0, 500),
    detected_subject: understanding.subject,
    detected_intent: understanding.intent,
    detected_lesson: understanding.lesson,
    student: { grade: scope.gradeCode, stage: scope.stageCode, section: scope.sectionCode, tracks: scope.trackCodes },
    books_searched: [],
    candidate_book_ids: [],
    outline_nodes: 0,
    matched_lesson: null,
    vector_hits: 0,
    keyword_hits: 0,
    page_hits: 0,
    passages: [],
    source_type: "external",
    duration_ms: 0,
    reasons,
  };

  const finish = async (result: LibraryRagResult): Promise<LibraryRagResult> => {
    result.trace.duration_ms = Date.now() - startedAt;
    result.trace.source_type = result.found ? "library" : "external";
    result.trace.passages = result.passages.map((p) => ({
      chunk_id: p.chunk_id, book_id: p.book_id, page: p.page_from, score: Number(p.score.toFixed(4)), source: p.source,
    }));
    if (args.log !== false) await recordRagSearchLog(admin, args.surface || "modrek-ai", result);
    return result;
  };

  const base: LibraryRagResult = {
    scope, understanding,
    accessible_books: accessible,
    subject_books: subjectBooks,
    selected_book: null,
    outline: [],
    lesson: null,
    passages: [],
    confidence: "none",
    found: false,
    ambiguity: null,
    notes,
    trace,
  };

  if (understanding.intent === "list_books") {
    return await finish({ ...base, found: accessible.length > 0, confidence: accessible.length ? "high" : "none" });
  }

  if (!subjectBooks.length) {
    reasons.push(understanding.subject ? "no_book_for_detected_subject" : "library_empty_for_scope");
    if (understanding.subject && accessible.length) {
      base.notes.push(`لا يوجد كتاب لمادة "${understanding.subject}" داخل مكتبة صف الطالب.`);
      base.ambiguity = `لم أجد كتاب "${understanding.subject}" في مكتبتك. المتاح حاليًا: ${accessible.slice(0, 6).map((b) => b.subject || b.title).join("، ")}.`;
    }
    return await finish(base);
  }

  // ---- Candidate books: never only the first one. Metadata filtering already
  // narrowed the set to this student's own curriculum, so searching the top few
  // is both safe and cheap (vector + keyword run as multi-book RPCs).
  const candidates = [...subjectBooks]
    .sort((a, b) => Number(b.pipeline === "knowledge") - Number(a.pipeline === "knowledge"))
    .slice(0, MAX_CANDIDATE_BOOKS);
  const candidateIds = candidates.map((b) => b.id);
  const bookById = new Map(candidates.map((b) => [b.id, b]));
  trace.candidate_book_ids = candidateIds;
  trace.books_searched = candidates.map((b) => ({ id: b.id, title: b.title, subject: b.subject }));

  // ---- Lesson targeting: find the book whose index really contains the lesson.
  const outlines = new Map<string, LibraryLessonRef[]>();
  await Promise.all(candidates.map(async (b) => outlines.set(b.id, await loadOutline(admin, b))));

  let selected = candidates[0];
  let outline = outlines.get(selected.id) || [];
  let lesson: LibraryLessonRef | null = null;
  for (const b of candidates) {
    const o = outlines.get(b.id) || [];
    const l = pickLesson(o, understanding.lesson, understanding.lessonTitleHint);
    if (l) { selected = b; outline = o; lesson = l; break; }
  }
  trace.outline_nodes = outline.length;
  trace.matched_lesson = lesson?.title ?? null;

  const passages: LibraryPassage[] = [];
  const pushPage = (p: any, bookId: string, score: number, lessonTitle: string | null, source: PassageSource) => {
    const book = bookById.get(bookId) || selected;
    passages.push({
      text: String(p.ocr_text || p.content || "").replace(/\s+/g, " ").trim().slice(0, 1800),
      chunk_id: p.id ?? null,
      book_id: bookId,
      book_title: book.title,
      lesson_title: lessonTitle,
      page_from: p.page_number ?? null,
      page_to: p.page_number ?? null,
      score,
      source,
    });
  };

  // ---- 1) Exact page request
  if (understanding.page) {
    const rows = await pagesText(admin, selected, understanding.page, understanding.page, 2);
    rows.forEach((r: any) => pushPage(r, selected.id, 1, lesson?.title ?? null, "page"));
    trace.page_hits += rows.length;
  }

  // ---- 2) Lesson / unit page range (strongest grounding)
  if (lesson) {
    const rows = await pagesText(admin, selected, lesson.page_start, lesson.page_end, maxPassages);
    rows.forEach((r: any) => pushPage(r, selected.id, 0.98, lesson!.title, "lesson_pages"));
    trace.page_hits += rows.length;
  }

  // ---- 3) Whole-curriculum requests: sample every unit
  if (understanding.wholeCurriculum) {
    for (const node of outline.slice(0, maxPassages)) {
      const rows = await pagesText(admin, selected, node.page_start, node.page_start, 1);
      rows.forEach((r: any) => pushPage(r, selected.id, 0.8, node.title, "outline_sample"));
    }
  }

  // ---- 4) HYBRID: vector + keyword/exact-phrase ALWAYS run (in parallel),
  // not only as a fallback. Their results are merged and reranked below.
  const phrases = [
    ...lessonPhraseVariants(understanding.lesson, understanding.lessonTitleHint),
    ...(understanding.keywords.slice(0, 2)),
  ];
  const legacyIds = candidates.filter((b) => b.pipeline === "library").map((b) => b.id);
  const modernIds = candidates.filter((b) => b.pipeline === "knowledge").map((b) => b.id);
  const [legacyVector, modernVector, legacyKeywords, modernKeywords] = await Promise.all([
    semanticPassages(admin, legacyIds, args.query, 12),
    modernSemanticPassages(admin, modernIds, args.query, 12),
    keywordChunks(admin, legacyIds, phrases, 10),
    modernKeywordChunks(admin, modernIds, phrases, 10),
  ]);
  const vector = [...legacyVector, ...modernVector];
  const kwChunks = [...legacyKeywords, ...modernKeywords];
  trace.vector_hits = vector.length;
  trace.keyword_hits = kwChunks.length;

  for (const row of vector) {
    const bookId = row.book_id || selected.id;
    passages.push({
      text: String(row.content || "").replace(/\s+/g, " ").trim().slice(0, 1500),
      chunk_id: row.id ?? null,
      book_id: bookId,
      book_title: (bookById.get(bookId) || selected).title,
      lesson_title: lesson?.title ?? null,
      page_from: row.page_number ?? row.page_from ?? null,
      page_to: row.page_number ?? row.page_to ?? null,
      score: 0.5 + Number(row.similarity || 0) * 0.45,
      source: "vector",
      similarity: Number(row.similarity || 0),
    });
  }
  for (const row of kwChunks) {
    const bookId = row.book_id || selected.id;
    passages.push({
      text: String(row.content || "").replace(/\s+/g, " ").trim().slice(0, 1500),
      chunk_id: row.id ?? null,
      book_id: bookId,
      book_title: (bookById.get(bookId) || selected).title,
      lesson_title: lesson?.title ?? null,
      page_from: row.page_number ?? null,
      page_to: row.page_number ?? null,
      score: 0.55 + Number(row.rank || 0) * 0.4,
      source: "keyword_chunk",
      keyword_rank: Number(row.rank || 0),
    });
  }

  // ---- 5) Page-level keyword fallback when chunks are missing/unembedded
  if (!passages.length) {
    const kwPages = await keywordPages(admin, candidateIds, understanding.keywords, 6);
    kwPages.forEach((r: any) => pushPage(r, r.book_id, 0.45, lesson?.title ?? null, "keyword_page"));
    trace.page_hits += kwPages.length;
    if (!kwPages.length) reasons.push("no_chunks_or_pages_matched");
  }

  // ---- 6) Reranking: source weight + lexical overlap + lesson-range bonus
  const rerank = (p: LibraryPassage): number => {
    let s = p.score;
    s += lexicalOverlap(p.text, understanding.keywords) * 0.25;
    if (lesson && p.page_from && lesson.page_start && p.page_from >= lesson.page_start &&
        (!lesson.page_end || p.page_from <= lesson.page_end)) s += 0.3;
    if (p.book_id === selected.id) s += 0.05;
    return s;
  };

  const dedup = new Map<string, LibraryPassage>();
  for (const p of passages) {
    if (p.text.length < MIN_PASSAGE_CHARS) continue;
    const key = p.chunk_id ? `c:${p.chunk_id}` : `p:${p.book_id}:${p.page_from ?? "?"}:${p.text.slice(0, 40)}`;
    const scored = { ...p, score: rerank(p) };
    const prev = dedup.get(key);
    if (!prev || prev.score < scored.score) dedup.set(key, scored);
  }
  const finalPassages = [...dedup.values()].sort((a, b) => b.score - a.score).slice(0, maxPassages);

  // If the winning content lives in another candidate book, follow the evidence.
  const topBookId = finalPassages[0]?.book_id;
  if (topBookId && topBookId !== selected.id && bookById.has(topBookId)) {
    selected = bookById.get(topBookId)!;
    outline = outlines.get(topBookId) || outline;
    reasons.push("selected_book_switched_to_best_evidence");
  }

  let confidence: LibraryRagResult["confidence"] = "none";
  if (lesson && finalPassages.length) confidence = "high";
  else if (finalPassages.length >= 2) confidence = "medium";
  else if (finalPassages.length) confidence = "low";
  else if (subjectBooks.length) confidence = "low";

  let ambiguity: string | null = null;
  if (understanding.lesson && !lesson && !finalPassages.length) {
    ambiguity = outline.length
      ? `لم أتأكد من "${understanding.lesson.kind === "lesson" ? "الدرس" : "الوحدة"} رقم ${understanding.lesson.number}" في كتاب ${selected.title}. الفهرس المتاح: ${outline.slice(0, 8).map((o) => o.title).join("، ")}. أي واحد تقصد؟`
      : `كتاب ${selected.title} لم يكتمل فهرسته بعد، فلا أستطيع تحديد رقم الدرس بدقة.`;
  } else if (!understanding.subject && subjectBooks.length > 1 && !finalPassages.length && understanding.intent !== "search_content") {
    ambiguity = `تقصد أي مادة؟ المتاح في مكتبتك: ${subjectBooks.slice(0, 6).map((b) => b.subject || b.title).join("، ")}.`;
  }

  return await finish({
    ...base,
    selected_book: selected,
    outline,
    lesson,
    passages: finalPassages,
    confidence,
    found: finalPassages.length > 0,
    ambiguity,
  });
}

/** Developer telemetry: every retrieval attempt is recorded (library vs external). */
export async function recordRagSearchLog(admin: any, surface: string, result: LibraryRagResult) {
  try {
    await admin.from("modrek_search_logs").insert({
      user_id: result.scope.userId,
      role: result.scope.role,
      surface,
      query_text: result.trace.query,
      intent: result.understanding.intent,
      filters: {
        grade: result.scope.gradeCode,
        stage: result.scope.stageCode,
        section: result.scope.sectionCode,
        tracks: result.scope.trackCodes,
        subject: result.understanding.subject,
        book_id: result.selected_book?.id ?? null,
        book_title: result.selected_book?.title ?? null,
        lesson: result.lesson?.title ?? null,
      },
      tier_used: result.selected_book?.access_tier ?? null,
      results_count: result.passages.length,
      top_confidence: result.passages[0]?.score != null ? Math.min(1, Number(result.passages[0].score)) : null,
      cache_hit: false,
      duration_ms: result.trace.duration_ms,
      fallback_external: !result.found,
      trace: result.trace,
    });
  } catch (e) {
    console.warn("[modrekLibraryRag] telemetry_failed", String(e).slice(0, 200));
  }
}


// --------------------------------------------------------------- prompting --

/** Shared identity: multi-subject, library-first, never "science only". */
export const MODREK_ASSISTANT_SCOPE_RULES = `نطاق تخصصك (إلزامي):
- أنت مساعد تعليمي لجميع المواد والمراحل والشعب داخل منصة مدرك Plus: المواد الشرعية (القرآن، الحديث، الفقه، التفسير، التوحيد، السيرة)، واللغة العربية بفروعها (النحو، الصرف، البلاغة، الأدب، النصوص)، واللغات، والمواد الأدبية والاجتماعية، والمواد العلمية — كلها بنفس الكفاءة والأولوية.
- ممنوع منعًا باتًا أن تقول أو تلمّح إلى أنك "متخصص في المواد العلمية" أو أنك لا تدعم مادة معينة، وممنوع رفض سؤال بسبب نوع المادة.
- ترتيب مصادرك: (1) محتوى مكتبة Modrek AI المرفق أدناه، (2) سياق المحادثة، (3) مصادر تعليمية رسمية موثوقة (وزارة التربية والتعليم، الأزهر الشريف) — وذلك فقط عند عدم وجود المحتوى في المكتبة، مع الإشارة لذلك بجملة قصيرة.
- ممنوع اختراع اسم كتاب أو اسم درس أو ترتيب درس أو محتوى منهج غير موجود في المصادر المرفقة. لو غير متأكد اسأل الطالب سؤالًا توضيحيًا واحدًا.
- لا تسأل الطالب عن صفه أو مرحلته أو نظامه (عام/أزهري) أو شعبته؛ هذه البيانات معك بالفعل.`;

export function buildStudentScopeBlock(scope: StudentScope): string {
  return `بيانات الطالب (مؤكدة — استخدمها ولا تسأل عنها):
- الاسم: ${scope.fullName || "الطالب"}
- المرحلة: ${scope.labels.stage || "غير محددة"}
- الصف: ${scope.labels.grade || "غير محدد"}
- النظام التعليمي: ${scope.labels.system}
- الشعبة: ${scope.labels.track || "غير محددة"}`;
}

export function buildLibraryContextBlock(result: LibraryRagResult): string {
  const parts: string[] = [];

  if (result.understanding.intent === "list_books") {
    parts.push(
      result.accessible_books.length
        ? `## كتب مكتبة Modrek المتاحة لهذا الطالب (بيانات حقيقية من قاعدة البيانات — اعرضها كما هي ولا تضف كتبًا أخرى):\n` +
          result.accessible_books.map((b) => `- 📘 ${b.subject || b.title}${b.sub_subject && b.sub_subject !== b.subject ? ` (${b.sub_subject})` : ""} — ${b.title}${b.page_count ? ` — ${b.page_count} صفحة` : ""}`).join("\n")
        : `## مكتبة Modrek\nلا توجد كتب مفهرسة متاحة لصف الطالب حاليًا. أخبره بذلك بوضوح دون اختراع أسماء كتب.`,
    );
    return parts.join("\n\n");
  }

  if (result.selected_book) {
    parts.push(
      `## الكتاب المحدد من مكتبة Modrek\n` +
      `- 📘 ${result.selected_book.title}\n` +
      `- المادة: ${result.selected_book.subject || "—"}${result.selected_book.sub_subject ? ` / ${result.selected_book.sub_subject}` : ""}\n` +
      `- الصف: ${result.selected_book.grade_label || "—"} • الشعبة: ${result.selected_book.track_label || "—"} • النظام: ${result.selected_book.education_type || "—"}`,
    );
  }

  if (result.lesson) {
    parts.push(`## الدرس/الوحدة المطلوبة\n- 📖 ${result.lesson.title}${result.lesson.page_start ? ` (ص ${result.lesson.page_start}${result.lesson.page_end && result.lesson.page_end !== result.lesson.page_start ? `-${result.lesson.page_end}` : ""})` : ""}`);
  } else if (result.outline.length) {
    parts.push(`## فهرس الكتاب (المصدر الوحيد المعتمد لأسماء وترتيب الدروس)\n${result.outline.slice(0, 30).map((o, i) => `${i + 1}. ${o.title}${o.page_start ? ` — ص ${o.page_start}` : ""}`).join("\n")}`);
  }

  if (result.passages.length) {
    parts.push(
      `## محتوى مسترجع من الكتاب (المصدر الأساسي لإجابتك)\n` +
      result.passages.map((p, i) => `[${i + 1}] ${p.book_title}${p.lesson_title ? ` — ${p.lesson_title}` : ""}${p.page_from ? ` — ص ${p.page_from}` : ""}\n${p.text}`).join("\n\n"),
    );
  }

  if (result.ambiguity) parts.push(`## تنبيه ثقة منخفضة\n${result.ambiguity}\nاطرح هذا السؤال التوضيحي على الطالب قبل الشرح إذا لم يكن المحتوى المسترجع كافيًا.`);

  if (!result.found) {
    parts.push(
      `## نتيجة البحث في المكتبة: LIBRARY_RESULT = NOT_FOUND\n` +
      `لم يُعثر على محتوى مطابق داخل مكتبة Modrek لهذا السؤال. لا تخترع محتوى الكتاب؛ ` +
      `وضّح للطالب أن الدرس غير متاح في المكتبة، ثم أجب من مصدر تعليمي رسمي موثوق مع ذكر ذلك بجملة قصيرة، أو اطرح سؤالًا توضيحيًا.`,
    );
  } else {
    parts.push(`## مستوى الثقة الداخلي: ${result.confidence}`);
  }

  if (result.notes.length) parts.push(`## ملاحظات النظام\n- ${result.notes.join("\n- ")}`);

  return parts.join("\n\n");
}

// -------------------------------------------------- taxonomy id resolution --

/** Map the student's profile scope onto real library_* taxonomy row ids. */
export async function resolveLibraryTaxonomyIds(admin: any, scope: StudentScope) {
  const tax = await loadTaxonomy(admin);
  return {
    stage_id: tax.stages.find((s: any) => s.code === scope.stageCode)?.id ?? null,
    grade_id: tax.grades.find((g: any) => g.code === scope.gradeCode)?.id ?? null,
    section_id: scope.sectionCode ? tax.sections.find((s: any) => s.code === scope.sectionCode)?.id ?? null : null,
    track_id: tax.tracks.find((t: any) => scope.trackCodes.includes(t.code))?.id ?? null,
  };
}

/** Compact pipeline trace so logs prove: context -> retrieval -> chunks -> answer. */
export function logRagPipeline(fn: string, result: LibraryRagResult, extra: Record<string, unknown> = {}) {
  console.log(`[${fn}] RAG_PIPELINE`, JSON.stringify({
    step: "student_context->library_retrieval->rerank->chunks",
    student: {
      grade: result.scope.gradeCode, stage: result.scope.stageCode,
      section: result.scope.sectionCode, tracks: result.scope.trackCodes,
    },
    intent: result.understanding.intent,
    subject: result.understanding.subject,
    lesson_request: result.understanding.lesson,
    accessible_books: result.accessible_books.length,
    subject_books: result.subject_books.length,
    selected_book: result.selected_book?.title ?? null,
    outline_nodes: result.outline.length,
    matched_lesson: result.lesson?.title ?? null,
    chunks: result.passages.length,
    top_pages: result.passages.slice(0, 5).map((p) => p.page_from),
    confidence: result.confidence,
    found: result.found,
    ...extra,
  }));
}

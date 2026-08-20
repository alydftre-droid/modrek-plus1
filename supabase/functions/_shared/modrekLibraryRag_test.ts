// Tests for the unified Modrek library RAG brain.
// Covers: student scope resolution (عام/أزهر, علمي/أدبي), multi-subject detection
// (شرعية / عربية / أدبية / علمية), curriculum-shielded book access, lesson
// targeting by Arabic ordinal, and correct "not found" behaviour.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  resolveStudentScope,
  detectSubject,
  understandQuery,
  listAccessibleBooks,
  retrieveFromLibrary,
  buildStudentScopeBlock,
  buildLibraryContextBlock,
} from "./modrekLibraryRag.ts";

// ------------------------------------------------------------- stub client ---

const TAX = {
  library_stages: [
    { id: "st-sec", code: "secondary", name_ar: "المرحلة الثانوية" },
    { id: "st-pr", code: "preparatory", name_ar: "المرحلة الإعدادية" },
  ],
  library_grades: [
    { id: "g-sec1", stage_id: "st-sec", code: "sec1", name_ar: "الصف الأول الثانوي" },
    { id: "g-sec2", stage_id: "st-sec", code: "sec2", name_ar: "الصف الثاني الثانوي" },
    { id: "g-sec3", stage_id: "st-sec", code: "sec3", name_ar: "الصف الثالث الثانوي" },
    { id: "g-pr3", stage_id: "st-pr", code: "pr3", name_ar: "الصف الثالث الإعدادي" },
  ],
  library_sections: [
    { id: "sc-gen", code: "general", name_ar: "عام" },
    { id: "sc-azh", code: "azhar", name_ar: "أزهر" },
    { id: "sc-shared", code: "shared", name_ar: "مشترك (عام + أزهري)" },
  ],
  library_tracks: [
    { id: "tr-sci", code: "scientific", name_ar: "علمي" },
    { id: "tr-scisci", code: "sci_science", name_ar: "علمي علوم" },
    { id: "tr-scimath", code: "sci_math", name_ar: "علمي رياضة" },
    { id: "tr-lit", code: "literary", name_ar: "أدبي" },
    { id: "tr-none", code: "none", name_ar: "بدون شعبة" },
  ],
};

type StubData = {
  profiles: any[];
  library_books: any[];
  library_book_index?: any[];
  library_book_pages?: any[];
  knowledge_sources?: any[];
  knowledge_lesson_index?: any[];
  content_chunks?: any[];
};

function stubClient(data: StubData) {
  const tables: Record<string, any[]> = {
    ...TAX,
    profiles: data.profiles,
    library_books: data.library_books,
    library_book_index: data.library_book_index ?? [],
    library_book_pages: data.library_book_pages ?? [],
    knowledge_sources: data.knowledge_sources ?? [],
    knowledge_lesson_index: data.knowledge_lesson_index ?? [],
    content_chunks: data.content_chunks ?? [],
  };

  function makeQuery(table: string) {
    let rows = [...(tables[table] ?? [])];
    const api: any = {
      select: () => api,
      order: () => api,
      limit: () => api,
      eq: (col: string, val: unknown) => { rows = rows.filter((r) => r[col] === val); return api; },
      gte: (col: string, val: number) => { rows = rows.filter((r) => Number(r[col]) >= val); return api; },
      lte: (col: string, val: number) => { rows = rows.filter((r) => Number(r[col]) <= val); return api; },
      in: (col: string, vals: unknown[]) => { rows = rows.filter((r) => vals.includes(r[col])); return api; },
      or: (clause: string) => {
        const needles = clause.split(",").map((c) => c.split("%")[1] ?? "").filter(Boolean);
        rows = rows.filter((r) => needles.some((n) => String(r.ocr_text ?? "").includes(n)));
        return api;
      },
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (res: any) => Promise.resolve({ data: rows, error: null }).then(res),
    };
    return api;
  }

  return {
    from: (table: string) => makeQuery(table),
    // Paid tiers denied by default so tier shielding is exercised.
    rpc: (_fn: string, _args: any) => Promise.resolve({ data: false, error: null }),
  };
}

const AZHAR_LIT_SEC3 = {
  id: "u-azhar-lit",
  full_name: "طالب أزهري أدبي",
  role: "student",
  stage: "secondary",
  grade: "third",
  section: "أدبي",
  education_type: "أزهر",
};

const GENERAL_SCI_SEC2 = {
  id: "u-gen-sci",
  full_name: "طالب عام علمي",
  role: "student",
  stage: "secondary",
  grade: "second",
  section: "علمي علوم",
  education_type: "عام",
};

// ----------------------------------------------------------------- scope ----

Deno.test("scope: أزهري أدبي ثالث ثانوي resolves to sec3/azhar/literary", async () => {
  const admin = stubClient({ profiles: [AZHAR_LIT_SEC3], library_books: [] });
  const scope = await resolveStudentScope(admin, AZHAR_LIT_SEC3.id);
  assertEquals(scope.stageCode, "secondary");
  assertEquals(scope.gradeCode, "sec3");
  assertEquals(scope.sectionCode, "azhar");
  assertEquals(scope.trackCodes, ["literary"]);
  assertEquals(scope.labels.grade, "الصف الثالث الثانوي");
});

Deno.test("scope: عام علمي علوم ثاني ثانوي resolves to sec2/general/sci_science", async () => {
  const admin = stubClient({ profiles: [GENERAL_SCI_SEC2], library_books: [] });
  const scope = await resolveStudentScope(admin, GENERAL_SCI_SEC2.id);
  assertEquals(scope.gradeCode, "sec2");
  assertEquals(scope.sectionCode, "general");
  assert(scope.trackCodes.includes("sci_science"));
  assert(scope.trackCodes.includes("scientific"));
});

Deno.test("scope block never leaves the system undefined", async () => {
  const admin = stubClient({ profiles: [AZHAR_LIT_SEC3], library_books: [] });
  const block = buildStudentScopeBlock(await resolveStudentScope(admin, AZHAR_LIT_SEC3.id));
  assert(block.includes("الصف الثالث الثانوي"));
  assert(block.includes("أزهري"));
});

// --------------------------------------------------------- subject detection -

Deno.test("subject detection covers religious, Arabic, literary and scientific", () => {
  assertEquals(detectSubject("اشرح لي درس الوضوء في الفقه"), "الفقه");
  assertEquals(detectSubject("عايز أفهم التوحيد"), "التوحيد");
  assertEquals(detectSubject("اشرح النحو بتاع المبتدأ والخبر"), "النحو");
  assertEquals(detectSubject("محتاج مراجعة التاريخ"), "التاريخ");
  assertEquals(detectSubject("اشرح الفيزياء"), "الفيزياء");
  assertEquals(detectSubject("عايز أفهم البلاغة"), "البلاغة");
});

Deno.test("assistant is not science-only: religious question keeps its subject", () => {
  const u = understandQuery("اشرح لي الدرس الخامس في الحديث");
  assertEquals(u.subject, "الحديث");
  assertEquals(u.lesson?.kind, "lesson");
  assertEquals(u.lesson?.number, 5);
});

Deno.test("follow-up question inherits the subject from history", () => {
  const u = understandQuery("اشرح لي الدرس التالي", { history: ["اشرح درس الوضوء في الفقه"] });
  assertEquals(u.subject, "الفقه");
});

Deno.test("unit request is detected as unit, not lesson", () => {
  const u = understandQuery("اشرح الوحدة الثالثة في الجغرافيا");
  assertEquals(u.lesson?.kind, "unit");
  assertEquals(u.lesson?.number, 3);
});

// ------------------------------------------------------ curriculum shielding -

const BOOKS = [
  { id: "b-azh-lit", title: "الحديث - ثالثة أزهري", subject_name_ar: "الحديث", sub_subject_name: null, term: "term1", page_count: 40, access_tier: "free", education_type: "ازهر", grade_id: "g-sec3", track_id: "tr-lit", stage_id: "st-sec", section_id: "sc-azh", status: "ready" },
  { id: "b-gen-lit", title: "التاريخ - ثالثة عام", subject_name_ar: "التاريخ", sub_subject_name: null, term: "term1", page_count: 30, access_tier: "free", education_type: "عام", grade_id: "g-sec3", track_id: "tr-lit", stage_id: "st-sec", section_id: "sc-gen", status: "ready" },
  { id: "b-azh-sci", title: "الفيزياء - ثالثة أزهري علمي", subject_name_ar: "الفيزياء", sub_subject_name: null, term: "term1", page_count: 30, access_tier: "free", education_type: "ازهر", grade_id: "g-sec3", track_id: "tr-sci", stage_id: "st-sec", section_id: "sc-azh", status: "ready" },
  { id: "b-other-grade", title: "الحديث - أولى ثانوي", subject_name_ar: "الحديث", sub_subject_name: null, term: "term1", page_count: 30, access_tier: "free", education_type: "ازهر", grade_id: "g-sec1", track_id: "tr-lit", stage_id: "st-sec", section_id: "sc-azh", status: "ready" },
  { id: "b-paid", title: "الفقه المدفوع", subject_name_ar: "الفقه", sub_subject_name: null, term: "term1", page_count: 30, access_tier: "premium", education_type: "ازهر", grade_id: "g-sec3", track_id: "tr-lit", stage_id: "st-sec", section_id: "sc-azh", status: "ready" },
  { id: "b-draft", title: "كتاب غير جاهز", subject_name_ar: "الحديث", sub_subject_name: null, term: "term1", page_count: 30, access_tier: "free", education_type: "ازهر", grade_id: "g-sec3", track_id: "tr-lit", stage_id: "st-sec", section_id: "sc-azh", status: "processing" },
];

Deno.test("accessible books are shielded by grade, system, track, tier and status", async () => {
  const admin = stubClient({ profiles: [AZHAR_LIT_SEC3], library_books: BOOKS });
  const scope = await resolveStudentScope(admin, AZHAR_LIT_SEC3.id);
  const books = await listAccessibleBooks(admin, scope);
  const ids = books.map((b) => b.id);
  assert(ids.includes("b-azh-lit"), "own book must be visible");
  assert(!ids.includes("b-gen-lit"), "general-system book must be hidden from أزهر student");
  assert(!ids.includes("b-azh-sci"), "scientific-track book must be hidden from أدبي student");
  assert(!ids.includes("b-other-grade"), "other-grade book must be hidden");
  assert(!ids.includes("b-paid"), "unpaid premium book must be hidden");
  assert(!ids.includes("b-draft"), "non-ready book must be hidden");
});

Deno.test("unresolved student track fails closed for track-restricted books", async () => {
  const noTrack = { ...AZHAR_LIT_SEC3, id: "u-unknown-track", section: "غير محددة" };
  const admin = stubClient({ profiles: [noTrack], library_books: BOOKS });
  const scope = await resolveStudentScope(admin, noTrack.id);
  assertEquals(scope.trackCodes, []);
  const books = await listAccessibleBooks(admin, scope);
  assertEquals(books.some((book) => book.track_label != null), false);
});

// ---------------------------------------------------------- retrieval flow ---

const INDEX = [
  { id: "i1", book_id: "b-azh-lit", title: "الدرس الأول: النية", kind: "lesson", page_start: 1, page_end: 4, order_index: 1, parent_id: null },
  { id: "i2", book_id: "b-azh-lit", title: "الدرس الثاني: الطهارة", kind: "lesson", page_start: 5, page_end: 8, order_index: 2, parent_id: null },
  { id: "i3", book_id: "b-azh-lit", title: "الدرس الثالث: الصلاة", kind: "lesson", page_start: 9, page_end: 12, order_index: 3, parent_id: null },
  { id: "i4", book_id: "b-azh-lit", title: "الدرس الرابع: الزكاة", kind: "lesson", page_start: 13, page_end: 16, order_index: 4, parent_id: null },
  { id: "i5", book_id: "b-azh-lit", title: "الدرس الخامس: الصيام", kind: "lesson", page_start: 17, page_end: 20, order_index: 5, parent_id: null },
];

const PAGES = Array.from({ length: 20 }, (_, i) => ({
  book_id: "b-azh-lit",
  page_number: i + 1,
  ocr_text: `صفحة رقم ${i + 1} تشرح موضوع الدرس بتفصيل كافٍ لاختبار الاسترجاع داخل مكتبة مدرك بلس.`,
}));

Deno.test("retrieval targets the requested fifth lesson pages only", async () => {
  const admin = stubClient({
    profiles: [AZHAR_LIT_SEC3],
    library_books: BOOKS,
    library_book_index: INDEX,
    library_book_pages: PAGES,
  });
  const rag = await retrieveFromLibrary(admin, {
    userId: AZHAR_LIT_SEC3.id,
    query: "اشرح لي الدرس الخامس في الحديث",
  });
  assert(rag.found, "lesson five must be found");
  assertEquals(rag.selected_book?.id, "b-azh-lit");
  assertEquals(rag.lesson?.title, "الدرس الخامس: الصيام");
  assert(rag.passages.length > 0);
  for (const p of rag.passages) {
    assert((p.page_from ?? 0) >= 17 && (p.page_from ?? 0) <= 20, `page ${p.page_from} outside lesson five`);
  }
  const block = buildLibraryContextBlock(rag);
  assert(block.includes("الدرس الخامس"));
});

Deno.test("retrieval reads a ready Modrek upload from knowledge_sources/content_chunks", async () => {
  const source = {
    id: "ks-hadith-sec2", title: "كتاب الحديث الصف الثاني الثانوي", status: "ready",
    stage_id: "st-sec", grade_id: "g-sec2", section_id: "sc-gen", track_id: null,
    subject_id: "subject-hadith", sub_subject_id: null, term: 1,
  };
  const admin = stubClient({
    profiles: [GENERAL_SCI_SEC2],
    library_books: [],
    knowledge_sources: [source],
    content_chunks: [{
      id: "chunk-1", source_id: source.id, unit_id: "unit-1", ordinal: 1,
      content: "الدرس الأول في الحديث يشرح معنى الحديث الشريف ومكانته بالتفصيل.",
      metadata: { page_from: 5, page_to: 6, lesson_number: 1 },
    }],
    knowledge_lesson_index: [{
      source_id: source.id, unit_id: "unit-1", title: "الدرس الأول: الحديث الشريف",
      kind: "lesson", lesson_number: 1, unit_number: 1, page_start: 5, page_end: 6, ordinal: 1,
    }],
  });
  // Populate the taxonomy subject used by the modern pipeline.
  (TAX as any).library_subjects = [{ id: "subject-hadith", name_ar: "الحديث" }];
  (TAX as any).library_sub_subjects = [];

  const rag = await retrieveFromLibrary(admin, {
    userId: GENERAL_SCI_SEC2.id,
    query: "اشرح الدرس الأول في الحديث",
    log: false,
  });
  assertEquals(rag.found, true);
  assertEquals(rag.selected_book?.id, source.id);
  assertEquals(rag.selected_book?.pipeline, "knowledge");
  assertEquals(rag.lesson?.title, "الدرس الأول: الحديث الشريف");
  assert(rag.passages.some((p) => p.text.includes("مكانته")));
});

Deno.test("subject outside the student's library returns a clean not-found", async () => {
  const admin = stubClient({
    profiles: [AZHAR_LIT_SEC3],
    library_books: BOOKS,
    library_book_index: INDEX,
    library_book_pages: PAGES,
  });
  const rag = await retrieveFromLibrary(admin, {
    userId: AZHAR_LIT_SEC3.id,
    query: "اشرح لي درس المشتقات في التفاضل والتكامل",
  });
  assertEquals(rag.found, false);
  assertEquals(rag.passages.length, 0);
  assert(buildLibraryContextBlock(rag).length > 0, "context block must still explain the gap");
});

Deno.test("student with no resolved grade gets no cross-grade content", async () => {
  const noGrade = { ...AZHAR_LIT_SEC3, id: "u-nograde", grade: null, stage: null };
  const admin = stubClient({
    profiles: [noGrade],
    library_books: BOOKS,
    library_book_index: INDEX,
    library_book_pages: PAGES,
  });
  const scope = await resolveStudentScope(admin, noGrade.id);
  assertEquals(scope.gradeCode, null);
  const rag = await retrieveFromLibrary(admin, { userId: noGrade.id, query: "اشرح الدرس الخامس في الحديث" });
  assertEquals(rag.accessible_books.length, 0, "no book may leak when the scope is unresolved");
  assertEquals(rag.found, false);
  assert(rag.notes.some((n) => n.includes("صف")), "must warn about the missing grade");
});

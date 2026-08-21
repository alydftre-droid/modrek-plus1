// حزمة اختبارات آلية لاسترجاع الدرس الصحيح وفق الصف والشعبة والمادة.
// Run: deno test --allow-env supabase/functions/_shared/lessonTargeting_test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildScopeFilters,
  normalizeAr,
  parseLessonRequest,
  parseCurriculumTitle,
  resolveLessonTarget,
} from "./lessonTargeting.ts";

// ---------- in-memory fake Supabase client ----------

type Row = Record<string, any>;

function makeAdmin(db: Record<string, Row[]>) {
  const from = (table: string) => {
    let rows = [...(db[table] ?? [])];
    const builder: any = {
      select: () => builder,
      order: () => builder,
      eq: (col: string, val: any) => {
        rows = rows.filter((r) => r[col] === val);
        return builder;
      },
      in: (col: string, vals: any[]) => {
        rows = rows.filter((r) => vals.includes(r[col]));
        return builder;
      },
      // يحاكي or("unit_id.eq.X,metadata->>lesson_unit_id.eq.X")
      or: (expr: string) => {
        const clauses = String(expr).split(",").map((c) => c.split(".eq."));
        rows = rows.filter((r) =>
          clauses.some(([col, val]) =>
            col.includes("metadata->>")
              ? r.metadata?.[col.split("metadata->>")[1]] === val
              : r[col] === val
          )
        );
        return builder;
      },

      limit: (n: number) => Promise.resolve({ data: rows.slice(0, n), error: null }),
      then: (res: any) => Promise.resolve({ data: rows, error: null }).then(res),
    };
    return builder;
  };
  return { from };
}

// المنهج التجريبي: صف ثانٍ ثانوي علمي (رياضة) + صف ثالث، ومادتان.
const SCI2 = {
  stage_id: "sec", grade_id: "g2", section_id: "sci", track_id: "math", subject_id: "physics",
};

const db = {
  knowledge_sources: [
    { id: "src-phys-g2", status: "ready", ...SCI2 },
    // نفس المادة لكن صف مختلف — يجب ألا تُستخدم أبدًا لطالب الصف الثاني
    { id: "src-phys-g3", status: "ready", stage_id: "sec", grade_id: "g3", section_id: "sci", track_id: "math", subject_id: "physics" },
    // نفس الصف لكن شعبة أدبية
    { id: "src-hist-g2-lit", status: "ready", stage_id: "sec", grade_id: "g2", section_id: "lit", track_id: null, subject_id: "history" },
    // كتاب لم تنتهِ فهرسته
    { id: "src-phys-g2-draft", status: "processing", ...SCI2 },
  ],
  knowledge_lesson_index: [
    { source_id: "src-phys-g2", unit_id: "u-g2-l5", kind: "lesson", lesson_number: 5, unit_number: 2, title: "الدرس الخامس: قوانين نيوتن", page_start: 40, page_end: 52 },
    { source_id: "src-phys-g2", unit_id: "u-g2-l6", kind: "lesson", lesson_number: 6, unit_number: 2, title: "الدرس السادس", page_start: 53, page_end: 60 },
    { source_id: "src-phys-g2", unit_id: "u-g2-unit3", kind: "unit", unit_number: 3, lesson_number: null, title: "الوحدة الثالثة", page_start: 61, page_end: 90 },
    { source_id: "src-phys-g3", unit_id: "u-g3-l5", kind: "lesson", lesson_number: 5, unit_number: 1, title: "درس الصف الثالث الخامس", page_start: 10, page_end: 20 },
    { source_id: "src-hist-g2-lit", unit_id: "u-lit-l5", kind: "lesson", lesson_number: 5, unit_number: 1, title: "درس التاريخ الخامس", page_start: 15, page_end: 25 },
  ],
  content_chunks: [
    { id: "c1", unit_id: "u-g2-l5", source_id: "src-phys-g2", content: "قوانين نيوتن الثلاثة ..." },
    { id: "c2", unit_id: "u-g2-l5", source_id: "src-phys-g2", content: "تطبيقات على القانون الثاني ..." },
    { id: "c3", unit_id: "u-g3-l5", source_id: "src-phys-g3", content: "محتوى الصف الثالث ..." },
    { id: "c4", unit_id: "u-lit-l5", source_id: "src-hist-g2-lit", content: "محتوى التاريخ ..." },
    { id: "c5", unit_id: "u-g2-unit3", source_id: "src-phys-g2", content: "محتوى الوحدة الثالثة ..." },
    // ملاحظة: u-g2-l6 بلا أي مقاطع محتوى (حالة عدم عثور)
  ],
};

const studentG2Sci = {
  role: "student", stage_id: "sec", grade_id: "g2", section_id: "sci", track_id: "math",
};

function filtersFor(user: any, overrides: any = {}) {
  return buildScopeFilters(user, null, overrides, null);
}

// ---------- 1) تحليل السؤال العربي ----------

Deno.test("يتعرّف على «الدرس الخامس» بصيغه المختلفة", () => {
  for (const q of [
    "اشرح لي الدرس الخامس",
    "اشرح الدرس الخامس من فضلك",
    "عايز الدرس رقم 5",
    "الدرس ٥ في الفيزياء",
    "إشرح الدَّرس الخَامِس",
  ]) {
    assertEquals(parseLessonRequest(q, null), { kind: "lesson", number: 5 }, q);
  }
});

Deno.test("يفرّق بين الدرس والوحدة/الفصل", () => {
  assertEquals(parseLessonRequest("اشرح الوحدة الثالثة", null), { kind: "unit", number: 3 });
  assertEquals(parseLessonRequest("الفصل الثاني", null), { kind: "unit", number: 2 });
  assertEquals(parseLessonRequest("الدرس الثاني", null), { kind: "lesson", number: 2 });
});

Deno.test("يستخدم lesson_hint من كاشف النية عند غياب الرقم في السؤال", () => {
  assertEquals(
    parseLessonRequest("اشرح لي المحتوى", { lesson_hint: "الدرس الخامس" }),
    { kind: "lesson", number: 5 },
  );
});

Deno.test("لا يخترع رقم درس لأسئلة عامة (حالة عدم عثور)", () => {
  for (const q of ["اشرح قوانين نيوتن", "ما هو الاحتكاك؟", "امتحان شامل", ""]) {
    assertEquals(parseLessonRequest(q, null), null, q);
  }
});

Deno.test("normalizeAr يوحّد الهمزات والأرقام العربية", () => {
  assertEquals(normalizeAr("الأول"), "الاول");
  assertEquals(normalizeAr("صفحة ٥"), "صفحه 5");
});

// ---------- 2) قفل النطاق (الصف/الشعبة) ----------

Deno.test("الطالب لا يستطيع توسيع نطاقه عبر جسم الطلب", () => {
  const f = buildScopeFilters(studentG2Sci, null, { grade_id: "g3", section_id: "lit" }, null);
  assertEquals(f.grade_id, "g2");
  assertEquals(f.section_id, "sci");
  assertEquals(f._scope_locked, true);
});

Deno.test("المطور/المعلم يمكنه تجاوز النطاق", () => {
  const f = buildScopeFilters({ ...studentG2Sci, role: "admin" }, null, { grade_id: "g3" }, null);
  assertEquals(f.grade_id, "g3");
  assertEquals(f._scope_locked, false);
});

// ---------- 3) استرجاع الدرس الصحيح ----------

Deno.test("يسترجع الدرس الخامس الصحيح لطالب الصف الثاني العلمي", async () => {
  const admin = makeAdmin(db);
  const target = await resolveLessonTarget(
    admin,
    "اشرح لي الدرس الخامس",
    null,
    filtersFor(studentG2Sci, { subject_id: "physics" }),
  );
  assert(target, "expected a lesson target");
  assertEquals(target!.kind, "lesson");
  assertEquals(target!.number, 5);
  assertEquals(target!.title, "الدرس الخامس: قوانين نيوتن");
  assertEquals(target!.chunks.map((c) => c.chunk_id), ["c1", "c2"]);
  // لا يتسرب أي محتوى من صف أو شعبة أخرى
  assert(target!.chunks.every((c) => c.source_id === "src-phys-g2"));
  assertEquals(target!.chunks[0].page_from, 40);
});

Deno.test("لا يخلط بين مواد الشعبة العلمية والأدبية لنفس رقم الدرس", async () => {
  const admin = makeAdmin(db);
  const target = await resolveLessonTarget(
    admin,
    "اشرح الدرس الخامس",
    null,
    filtersFor({ ...studentG2Sci, section_id: "lit", track_id: null }, { subject_id: "history" }),
  );
  assert(target);
  assertEquals(target!.chunks[0].source_id, "src-hist-g2-lit");
});

Deno.test("يسترجع الوحدة الثالثة عند طلب وحدة لا درس", async () => {
  const admin = makeAdmin(db);
  const target = await resolveLessonTarget(
    admin,
    "اشرح الوحدة الثالثة",
    null,
    filtersFor(studentG2Sci, { subject_id: "physics" }),
  );
  assert(target);
  assertEquals(target!.kind, "unit");
  assertEquals(target!.number, 3);
  assertEquals(target!.chunks.map((c) => c.chunk_id), ["c5"]);
});

// ---------- 4) حالات عدم العثور ----------

Deno.test("عدم عثور: درس غير موجود في منهج الطالب", async () => {
  const admin = makeAdmin(db);
  const target = await resolveLessonTarget(
    admin,
    "اشرح الدرس الثاني عشر",
    null,
    filtersFor(studentG2Sci, { subject_id: "physics" }),
  );
  assertEquals(target, null);
});

Deno.test("عدم عثور: لا كتب جاهزة داخل نطاق الطالب", async () => {
  const admin = makeAdmin(db);
  const target = await resolveLessonTarget(
    admin,
    "اشرح الدرس الخامس",
    null,
    filtersFor({ ...studentG2Sci, grade_id: "g1" }, { subject_id: "physics" }),
  );
  assertEquals(target, null);
});

Deno.test("عدم عثور: مادة أخرى لا تملك فهرس دروس", async () => {
  const admin = makeAdmin(db);
  const target = await resolveLessonTarget(
    admin,
    "اشرح الدرس الخامس",
    null,
    filtersFor(studentG2Sci, { subject_id: "chemistry" }),
  );
  assertEquals(target, null);
});

Deno.test("عدم عثور: درس مفهرس لكن بلا مقاطع محتوى", async () => {
  const admin = makeAdmin(db);
  const target = await resolveLessonTarget(
    admin,
    "اشرح الدرس السادس",
    null,
    filtersFor(studentG2Sci, { subject_id: "physics" }),
  );
  assertEquals(target, null);
});

Deno.test("عدم عثور: سؤال بلا رقم درس لا يفعّل استهداف الدروس", async () => {
  const admin = makeAdmin(db);
  const target = await resolveLessonTarget(
    admin,
    "اشرح قوانين نيوتن",
    null,
    filtersFor(studentG2Sci, { subject_id: "physics" }),
  );
  assertEquals(target, null);
});

Deno.test("عدم عثور: أخطاء قاعدة البيانات تُعاد كـ null بدون رمي استثناء", async () => {
  const broken = {
    from: () => ({
      select: () => { throw new Error("db down"); },
    }),
  } as any;
  const target = await resolveLessonTarget(
    broken,
    "اشرح الدرس الخامس",
    null,
    filtersFor(studentG2Sci),
  );
  assertEquals(target, null);
});

// ---------- 4) عناوين الكتب الحقيقية: الرقم المطبوع في الكتاب ----------

Deno.test("يقرأ رقم الدرس المطبوع في العناوين الحقيقية", () => {
  for (const [title, num] of [["الحديث 1", 1], ["الحديث (3)", 3], ["التفسير 2", 2], ["الحديث الثالث", 3]] as [string, number][]) {
    const parsed = parseCurriculumTitle(title);
    assertEquals(parsed.kind, "lesson", title);
    assertEquals(parsed.lessonNumber, num, title);
    assertEquals(parsed.numberSource, "explicit", title);
  }
});

Deno.test("لا يعتبر العناوين النائبة دروسًا مرقّمة", () => {
  const parsed = parseCurriculumTitle("مقطع نصي 4");
  assert(parsed.lessonNumber === null);
  assertEquals(parsed.numberSource, "unknown");
});

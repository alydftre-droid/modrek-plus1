// deno-lint-ignore-file no-explicit-any
// Shared, testable lesson-targeting logic for Modrek AI retrieval.
// Extracted from modrek-retrieve so it can be unit-tested without network access.

export interface LessonIntentLike {
  lesson_hint?: string | null;
  book_hint?: string | null;
  page_hint?: number | null;
}

export interface ScopeUser {
  role: string | null;
  stage_id: string | null;
  grade_id: string | null;
  section_id: string | null;
  track_id: string | null;
}

export const ARABIC_ORDINALS: Record<string, number> = {
  "الاول": 1, "الأول": 1, "اول": 1, "الثاني": 2, "الثانى": 2, "الثالث": 3,
  "الرابع": 4, "الخامس": 5, "السادس": 6, "السابع": 7, "الثامن": 8,
  "التاسع": 9, "العاشر": 10, "الحادي عشر": 11, "الثاني عشر": 12,
};

export function normalizeAr(value: string): string {
  return String(value || "")
    .replace(/[\u0640\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\s+/g, " ")
    .trim();
}

// Feminine Arabic ordinals ("الوحدة الثالثة") normalize to "الثالثه", so the
// lookup table is normalized once with the same normalizer used on the query.
const NORMALIZED_ORDINALS: Record<string, number> = Object.fromEntries(
  Object.entries(ARABIC_ORDINALS).map(([k, v]) => [normalizeAr(k), v]),
);

function ordinalToNumber(token: string): number | null {
  const t = normalizeAr(token);
  const bare = t.replace(/ه$/, ""); // الثالثه -> الثالث (feminine form)
  return NORMALIZED_ORDINALS[t]
    ?? NORMALIZED_ORDINALS[bare]
    ?? NORMALIZED_ORDINALS[`ال${t}`]
    ?? NORMALIZED_ORDINALS[`ال${bare}`]
    ?? null;
}

export function parseLessonRequest(
  query: string,
  intent?: LessonIntentLike | null,
): { kind: "lesson" | "unit"; number: number } | null {
  const text = normalizeAr(`${query} ${intent?.lesson_hint ?? ""}`);
  const match = (keyword: string) => {
    const re = new RegExp(`${keyword}\\s*(?:رقم\\s*)?([0-9]{1,2}|[^0-9]{2,14}?)(?=\\s|$|\\.|،|:)`);
    const m = text.match(re);
    if (!m) return null;
    const token = m[1].trim();
    if (/^[0-9]+$/.test(token)) return Number(token);
    return ordinalToNumber(token);
  };
  const lesson = /درس/.test(text) ? match("الدرس") ?? match("درس") : null;
  if (lesson) return { kind: "lesson", number: lesson };
  const unit = /وحده|باب|فصل/.test(text)
    ? match("الوحده") ?? match("وحده") ?? match("الباب") ?? match("باب") ?? match("الفصل") ?? match("فصل")
    : null;
  if (unit) return { kind: "unit", number: unit };
  return null;
}

/**
 * SHIELDED RAG: students can never widen their curriculum scope from the body.
 */
export function buildScopeFilters(
  user: ScopeUser,
  intent: LessonIntentLike | null | undefined,
  overrides: any,
  ocr: any,
) {
  const f: Record<string, any> = {};
  const locked = user.role === "student";
  const pick = (key: "stage_id" | "grade_id" | "section_id" | "track_id") => {
    if (locked) return (user as any)[key] ?? null;
    return overrides?.[key] ?? (user as any)[key] ?? null;
  };
  const stage_id = pick("stage_id");
  const grade_id = pick("grade_id");
  const section_id = pick("section_id");
  const track_id = pick("track_id");
  if (stage_id) f.stage_id = stage_id;
  if (grade_id) f.grade_id = grade_id;
  if (section_id) f.section_id = section_id;
  if (track_id) f.track_id = track_id;
  f._scope_locked = locked;
  if (overrides?.subject_id) f.subject_id = overrides.subject_id;
  if (Array.isArray(overrides?.source_ids) && overrides.source_ids.length > 0) {
    f.source_ids = overrides.source_ids;
  }
  if (intent?.book_hint || ocr?.guessed_book) f._book_hint = intent?.book_hint ?? ocr?.guessed_book;
  if (intent?.page_hint || ocr?.guessed_page) f._page_hint = intent?.page_hint ?? ocr?.guessed_page;
  return f;
}

export interface LessonTarget {
  kind: "lesson" | "unit";
  number: number;
  title: string | null;
  chunks: any[];
}

/** Resolves "الدرس الخامس" to the real unit inside the student's own curriculum. */
export async function resolveLessonTarget(
  admin: any,
  query: string,
  intent: LessonIntentLike | null | undefined,
  filters: any,
): Promise<LessonTarget | null> {
  const asked = parseLessonRequest(query, intent);
  if (!asked) return null;
  try {
    let sourceQuery = admin.from("knowledge_sources").select("id").eq("status", "ready");
    if (filters?.grade_id) sourceQuery = sourceQuery.eq("grade_id", filters.grade_id);
    if (filters?.stage_id) sourceQuery = sourceQuery.eq("stage_id", filters.stage_id);
    if (filters?.section_id) sourceQuery = sourceQuery.eq("section_id", filters.section_id);
    if (filters?.track_id) sourceQuery = sourceQuery.eq("track_id", filters.track_id);
    if (filters?.subject_id) sourceQuery = sourceQuery.eq("subject_id", filters.subject_id);
    const { data: sources } = await sourceQuery.limit(50);
    const sourceIds = (sources ?? []).map((r: any) => r.id);
    if (!sourceIds.length) return null;

    let lessonQuery = admin.from("knowledge_lesson_index")
      .select("unit_id, kind, unit_number, lesson_number, title, page_start, page_end, source_id")
      .in("source_id", sourceIds);
    lessonQuery = asked.kind === "lesson"
      ? lessonQuery.eq("lesson_number", asked.number)
      : lessonQuery.eq("unit_number", asked.number).in("kind", ["unit", "chapter"]);
    const { data: lessons } = await lessonQuery.limit(3);
    const lesson = (lessons ?? [])[0];
    if (!lesson?.unit_id) return null;

    const { data: chunks } = await admin.from("content_chunks")
      .select("id, content, unit_id, source_id")
      .eq("unit_id", lesson.unit_id)
      .order("ordinal")
      .limit(4);

    if (!(chunks ?? []).length) return null;

    return {
      kind: asked.kind,
      number: asked.number,
      title: lesson.title ?? null,
      chunks: (chunks ?? []).map((c: any) => ({
        chunk_id: c.id,
        content: c.content,
        composite_score: 0.99,
        similarity: 0.99,
        text_rank: null,
        source_id: c.source_id,
        source_title: null,
        source_type_code: "book",
        unit_id: lesson.unit_id,
        unit_kind: lesson.kind,
        unit_title: lesson.title,
        page_from: lesson.page_start,
        page_to: lesson.page_end,
      })),
    };
  } catch (e) {
    console.warn("lesson_target_failed", e);
    return null;
  }
}

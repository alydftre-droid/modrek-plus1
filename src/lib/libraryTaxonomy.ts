import { supabase } from "@/integrations/supabase/client";

export interface LibrarySectionRow { id: string; code: string; name_ar: string; sort_order?: number | null }
export interface LibraryStageRow { id: string; code: string; name_ar: string; sort_order?: number | null }
export interface LibraryGradeRow { id: string; code: string; name_ar: string; stage_id: string; sort_order?: number | null }
export interface LibraryTrackRow { id: string; code: string; name_ar: string; sort_order?: number | null }
export interface SourceSubjectRow {
  id: string;
  name: string;
  category: string;
  section: string | null;
  stage: string;
  grade: string;
  is_active?: boolean | null;
}
export interface LibrarySubjectMapRow { id: string; source_subject_id: string | null; name_ar: string }

export interface LibraryPickerSubject {
  id: string;
  source_subject_id: string;
  name_ar: string;
  category: string;
  source_section: string | null;
}

export interface QueryDiag {
  table: string;
  filter: Record<string, unknown>;
  count: number;
  error: string | null;
  ok: boolean;
}

export function libraryStageCodeFromProfile(value: string | null | undefined) {
  const v = (value || "").trim().toLowerCase();
  if (!v) return "";
  if (v === "preparatory" || v.includes("اعداد") || v.includes("إعداد")) return "preparatory";
  if (v === "secondary" || v.includes("ثانو")) return "secondary";
  if (v === "primary" || v.includes("ابتد")) return "primary";
  return v;
}

export function sourceGradeFromLibraryGradeCode(code: string | null | undefined) {
  if (code === "pr1" || code === "sec1" || code === "p1") return "first";
  if (code === "pr2" || code === "sec2" || code === "p2") return "second";
  if (code === "pr3" || code === "sec3" || code === "p3") return "third";
  if (code === "p4") return "fourth";
  if (code === "p5") return "fifth";
  if (code === "p6") return "sixth";
  return (code || "").trim();
}

export function libraryGradeCodeFromProfile(stage: string | null | undefined, grade: string | null | undefined) {
  const stageCode = libraryStageCodeFromProfile(stage);
  const g = (grade || "").trim().toLowerCase();
  const first = ["first", "الأول", "اول", "أول", "الصف الأول", "الاول", "1"].includes(g);
  const second = ["second", "الثاني", "ثاني", "الصف الثاني", "الثانى", "2"].includes(g);
  const third = ["third", "الثالث", "ثالث", "الصف الثالث", "3"].includes(g);
  if (stageCode === "preparatory") return first ? "pr1" : second ? "pr2" : third ? "pr3" : g;
  if (stageCode === "secondary") return first ? "sec1" : second ? "sec2" : third ? "sec3" : g;
  if (stageCode === "primary") return first ? "p1" : second ? "p2" : third ? "p3" : g;
  return g;
}

export function sourceSectionFromTrackCode(trackCode: string | null | undefined) {
  if (!trackCode || trackCode === "none") return "";
  if (["scientific", "sci_science", "sci_math"].includes(trackCode)) return "scientific";
  if (trackCode === "literary") return "literary";
  return trackCode;
}

export function libraryTrackCodeFromProfile(section: string | null | undefined) {
  const s = (section || "").trim();
  if (!s) return "";
  if (["علمي علوم", "علمى علوم", "science_track"].includes(s)) return "sci_science";
  if (["علمي رياضة", "علمى رياضة", "math_track"].includes(s)) return "sci_math";
  if (["علمي", "علمى", "scientific", "science", "sci", "علم"].includes(s)) return "scientific";
  if (["أدبي", "ادبي", "أدبى", "ادبى", "literary"].includes(s)) return "literary";
  return s;
}

export function trackMatchesStudent(bookTrackCode: string | null | undefined, studentSection: string | null | undefined) {
  if (!bookTrackCode || bookTrackCode === "none") return true;
  const studentTrack = libraryTrackCodeFromProfile(studentSection);
  if (!studentTrack) return true;
  if (bookTrackCode === studentTrack) return true;
  const scientific = ["scientific", "sci_science", "sci_math"];
  return scientific.includes(bookTrackCode) && scientific.includes(studentTrack);
}

export function educationMatchesBook(bookEducationType: string | null | undefined, studentEducationType: string | null | undefined) {
  if (!bookEducationType || bookEducationType === "both") return true;
  if (!studentEducationType) return true;
  return bookEducationType === studentEducationType;
}

export function shouldShowCategoryForEducation(category: string | null | undefined, educationType: string | null | undefined) {
  const c = (category || "").trim().toLowerCase();
  if (educationType !== "عام") return true;
  return c !== "sharia" && c !== "religious";
}

function subjectMatchesSpecializedTrack(subject: SourceSubjectRow, trackCode: string | null | undefined) {
  const name = (subject.name || "").trim();
  if (trackCode === "sci_science") return !name.includes("رياضيات") && !name.includes("الرياضيات");
  if (trackCode === "sci_math") return !name.includes("أحياء") && !name.includes("احياء") && !name.includes("الأحياء");
  return true;
}

export function tracksForLibraryContext(args: {
  educationType: string;
  stageCode?: string | null;
  gradeCode?: string | null;
  sourceSubjects: SourceSubjectRow[];
  allTracks: LibraryTrackRow[];
}) {
  const { educationType, stageCode, gradeCode, sourceSubjects, allTracks } = args;
  if (stageCode !== "secondary") return [];

  const availableSections = new Set(sourceSubjects.map((s) => (s.section || "").trim()).filter(Boolean));
  const hasScientific = availableSections.has("scientific");
  const hasLiterary = availableSections.has("literary");
  const codes = new Set<string>();

  if (hasLiterary) codes.add("literary");

  if (hasScientific) {
    if (educationType === "عام" && gradeCode === "sec3") {
      codes.add("sci_science");
      codes.add("sci_math");
    } else {
      codes.add("scientific");
    }
  }

  return allTracks
    .filter((track) => codes.has(track.code))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

export async function fetchLibraryTaxonomy() {
  const [sectionsRes, stagesRes, gradesRes, tracksRes] = await Promise.all([
    supabase.from("library_sections").select("id,code,name_ar,sort_order").eq("is_active", true).order("sort_order"),
    supabase.from("library_stages").select("id,code,name_ar,sort_order").eq("is_active", true).order("sort_order"),
    supabase.from("library_grades").select("id,code,name_ar,stage_id,sort_order").eq("is_active", true).order("sort_order"),
    supabase.from("library_tracks").select("id,code,name_ar,sort_order").eq("is_active", true).order("sort_order"),
  ]);

  return {
    sections: (sectionsRes.data ?? []) as LibrarySectionRow[],
    stages: (stagesRes.data ?? []) as LibraryStageRow[],
    grades: (gradesRes.data ?? []) as LibraryGradeRow[],
    tracks: (tracksRes.data ?? []) as LibraryTrackRow[],
    diagnostics: [
      { table: "library_sections", filter: { is_active: true }, count: sectionsRes.data?.length ?? 0, error: sectionsRes.error?.message ?? null, ok: !sectionsRes.error },
      { table: "library_stages", filter: { is_active: true }, count: stagesRes.data?.length ?? 0, error: stagesRes.error?.message ?? null, ok: !stagesRes.error },
      { table: "library_grades", filter: { is_active: true }, count: gradesRes.data?.length ?? 0, error: gradesRes.error?.message ?? null, ok: !gradesRes.error },
      { table: "library_tracks", filter: { is_active: true }, count: tracksRes.data?.length ?? 0, error: tracksRes.error?.message ?? null, ok: !tracksRes.error },
    ] as QueryDiag[],
  };
}

export async function fetchSourceSubjectsForPicker(args: {
  educationType: string;
  stageCode: string;
  gradeCode: string;
  trackCode?: string | null;
}): Promise<{ rows: SourceSubjectRow[]; diag: QueryDiag }> {
  const sourceGrade = sourceGradeFromLibraryGradeCode(args.gradeCode);
  const sourceSection = sourceSectionFromTrackCode(args.trackCode);
  let q = supabase
    .from("subjects")
    .select("id,name,category,section,stage,grade,is_active")
    .eq("is_active", true)
    .eq("stage", args.stageCode)
    .eq("grade", sourceGrade)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (sourceSection) q = q.eq("section", sourceSection);

  const { data, error } = await q;
  const filtered = ((data ?? []) as SourceSubjectRow[])
    .filter((row) => shouldShowCategoryForEducation(row.category, args.educationType))
    .filter((row) => subjectMatchesSpecializedTrack(row, args.trackCode));

  return {
    rows: filtered,
    diag: {
      table: "subjects",
      filter: { is_active: true, stage: args.stageCode, grade: sourceGrade, section: sourceSection || "(any)", education_type: args.educationType },
      count: filtered.length,
      error: error?.message ?? null,
      ok: !error,
    },
  };
}

export async function mapSourceSubjectsToLibrarySubjects(sourceSubjects: SourceSubjectRow[]) {
  const sourceIds = sourceSubjects.map((s) => s.id);
  if (sourceIds.length === 0) return { rows: [] as LibraryPickerSubject[], diag: { table: "library_subjects", filter: { source_subject_id: "IN()" }, count: 0, error: null, ok: true } as QueryDiag };

  const { data, error } = await supabase
    .from("library_subjects")
    .select("id,source_subject_id,name_ar")
    .in("source_subject_id", sourceIds)
    .eq("is_active", true);

  const bySourceId = new Map(((data ?? []) as LibrarySubjectMapRow[]).map((row) => [row.source_subject_id, row]));
  const rows = sourceSubjects
    .map((source) => {
      const mapped = bySourceId.get(source.id);
      if (!mapped?.id) return null;
      return {
        id: mapped.id,
        source_subject_id: source.id,
        name_ar: mapped.name_ar || source.name,
        category: source.category,
        source_section: source.section,
      } satisfies LibraryPickerSubject;
    })
    .filter(Boolean) as LibraryPickerSubject[];

  return {
    rows,
    diag: {
      table: "library_subjects",
      filter: { source_subject_id: `IN(${sourceIds.length} source subjects)`, is_active: true },
      count: rows.length,
      error: error?.message ?? null,
      ok: !error,
    } as QueryDiag,
  };
}
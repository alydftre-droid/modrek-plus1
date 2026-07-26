export type ModrekSubjectLike = {
  id: string;
  name_ar: string;
  code?: string | null;
  stage_id?: string | null;
  grade_id?: string | null;
  section_id?: string | null;
  curriculum_track?: string | null;
  source_category?: string | null;
};

export type ModrekSectionLike = { id: string; code: string };

export const MODREK_SCIENTIFIC_TRACK_CODES = new Set(["scientific", "sci_science", "sci_math"]);

export function normalizeModrekSubjectLabel(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ًٌٍَُِّْـ\s\p{P}\p{S}]+/gu, "");
}

export function isNoTrackCode(code: string | null | undefined) {
  return !code || code === "none";
}

export function subjectTrackMatches(subject: ModrekSubjectLike, selectedTrackCode: string | null | undefined) {
  if (isNoTrackCode(selectedTrackCode)) return true;
  if (!subject.curriculum_track) return true;
  if (selectedTrackCode === "literary") return subject.curriculum_track === "literary";
  if (MODREK_SCIENTIFIC_TRACK_CODES.has(selectedTrackCode || "")) return subject.curriculum_track === "scientific";
  return subject.curriculum_track === selectedTrackCode;
}

export function subjectScopeMatches(
  subject: ModrekSubjectLike,
  scope: {
    stageId?: string;
    gradeId?: string;
    sectionId?: string;
    selectedSectionCode?: string | null;
    selectedTrackCode?: string | null;
    sectionCodeById: Map<string, string>;
  },
) {
  if (scope.stageId && subject.stage_id && subject.stage_id !== scope.stageId) return false;
  if (scope.gradeId && subject.grade_id && subject.grade_id !== scope.gradeId) return false;

  if (scope.sectionId && subject.section_id && subject.section_id !== scope.sectionId) {
    const subjectSectionCode = scope.sectionCodeById.get(subject.section_id);
    if (subjectSectionCode !== "shared" && scope.selectedSectionCode !== "shared") return false;
  }

  return subjectTrackMatches(subject, scope.selectedTrackCode);
}

function subjectPreferenceScore(subject: ModrekSubjectLike, selectedTrackCode: string | null | undefined, selectedSectionId?: string | null) {
  let score = 0;
  if (selectedSectionId && subject.section_id === selectedSectionId) score += 120;
  if (!subject.curriculum_track) score += 100;
  if (selectedTrackCode === "literary" && subject.curriculum_track === "literary") score += 80;
  if (MODREK_SCIENTIFIC_TRACK_CODES.has(selectedTrackCode || "") && subject.curriculum_track === "scientific") score += 80;
  if (subject.source_category && !["دروس", "امتحانات"].includes(subject.source_category)) score += 10;
  if (subject.code && !subject.code.startsWith("core_")) score += 2;
  return score;
}

export function dedupeModrekSubjects<T extends ModrekSubjectLike>(list: T[], selectedTrackCode?: string | null, selectedSectionId?: string | null): T[] {
  const byName = new Map<string, T>();
  const scores = new Map<string, number>();

  for (const subject of list) {
    const nameKey = normalizeModrekSubjectLabel(subject.name_ar);
    const sectionKey = selectedSectionId || subject.section_id || "";
    const scopeKey = [subject.stage_id || "", subject.grade_id || "", sectionKey, nameKey].join("|");
    const score = subjectPreferenceScore(subject, selectedTrackCode, selectedSectionId);
    const previousScore = scores.get(scopeKey);
    if (!byName.has(scopeKey) || previousScore === undefined || score > previousScore) {
      byName.set(scopeKey, subject);
      scores.set(scopeKey, score);
    }
  }

  return Array.from(byName.values()).sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar"));
}

export function areEquivalentModrekSubjects(
  a: ModrekSubjectLike | null | undefined,
  b: ModrekSubjectLike | null | undefined,
) {
  if (!a || !b) return false;
  if (normalizeModrekSubjectLabel(a.name_ar) !== normalizeModrekSubjectLabel(b.name_ar)) return false;
  if (a.stage_id && b.stage_id && a.stage_id !== b.stage_id) return false;
  if (a.grade_id && b.grade_id && a.grade_id !== b.grade_id) return false;
  if (a.section_id && b.section_id && a.section_id !== b.section_id) return false;
  return true;
}
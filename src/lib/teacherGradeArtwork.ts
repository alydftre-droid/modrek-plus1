/**
 * Maps a (category, stage, grade) triple to a custom 3D illustration asset.
 * Pure UI helper. No business logic. No data side effects.
 */
import { stageKeyFromValue, gradeKeyFromArabicLabel } from "@/lib/teacherSubjectUtils";

// Prep
import prepScience1 from "@/assets/grades/prep-science-1.jpg";
import prepScience2 from "@/assets/grades/prep-science-2.jpg";
import prepScience3 from "@/assets/grades/prep-science-3.jpg";
import prepStudies1 from "@/assets/grades/prep-studies-1.jpg";
import prepStudies2 from "@/assets/grades/prep-studies-2.jpg";
import prepStudies3 from "@/assets/grades/prep-studies-3.jpg";
import prepMath1 from "@/assets/grades/prep-math-1.jpg";
import prepMath2 from "@/assets/grades/prep-math-2.jpg";
import prepMath3 from "@/assets/grades/prep-math-3.jpg";
import prepArabic1 from "@/assets/grades/prep-arabic-1.jpg";
import prepArabic2 from "@/assets/grades/prep-arabic-2.jpg";
import prepArabic3 from "@/assets/grades/prep-arabic-3.jpg";
import prepEnglish1 from "@/assets/grades/prep-english-1.jpg";
import prepEnglish2 from "@/assets/grades/prep-english-2.jpg";
import prepEnglish3 from "@/assets/grades/prep-english-3.jpg";
import prepSharia1 from "@/assets/grades/prep-sharia-1.jpg";
import prepSharia2 from "@/assets/grades/prep-sharia-2.jpg";
import prepSharia3 from "@/assets/grades/prep-sharia-3.jpg";
import secSharia1 from "@/assets/grades/sec-sharia-1.jpg";
import secSharia2 from "@/assets/grades/sec-sharia-2.jpg";
import secSharia3 from "@/assets/grades/sec-sharia-3.jpg";

// Secondary
import secPhysics1 from "@/assets/grades/sec-physics-1.jpg";
import secPhysics2 from "@/assets/grades/sec-physics-2.jpg";
import secPhysics3 from "@/assets/grades/sec-physics-3.jpg";
import secChem1 from "@/assets/grades/sec-chem-1.jpg";
import secChem2 from "@/assets/grades/sec-chem-2.jpg";
import secChem3 from "@/assets/grades/sec-chem-3.jpg";
import secBio1 from "@/assets/grades/sec-bio-1.jpg";
import secBio2 from "@/assets/grades/sec-bio-2.jpg";
import secBio3 from "@/assets/grades/sec-bio-3.jpg";
import secHistory1 from "@/assets/grades/sec-history-1.jpg";
import secHistory2 from "@/assets/grades/sec-history-2.jpg";
import secHistory3 from "@/assets/grades/sec-history-3.jpg";
import secGeo1 from "@/assets/grades/sec-geo-1.jpg";
import secGeo2 from "@/assets/grades/sec-geo-2.jpg";
import secGeo3 from "@/assets/grades/sec-geo-3.jpg";
import secMath1 from "@/assets/grades/sec-math-1.jpg";
import secMath2 from "@/assets/grades/sec-math-2.jpg";
import secMath3 from "@/assets/grades/sec-math-3.jpg";
import secArabic1 from "@/assets/grades/sec-arabic-1.jpg";
import secArabic2 from "@/assets/grades/sec-arabic-2.jpg";
import secArabic3 from "@/assets/grades/sec-arabic-3.jpg";
import secEnglish1 from "@/assets/grades/sec-english-1.jpg";
import secEnglish2 from "@/assets/grades/sec-english-2.jpg";
import secEnglish3 from "@/assets/grades/sec-english-3.jpg";

type SubjectKey =
  | "science"
  | "studies"
  | "math"
  | "arabic"
  | "english"
  | "sharia"
  | "physics"
  | "chemistry"
  | "bio"
  | "history"
  | "geography";

const PREP_MAP: Partial<Record<SubjectKey, [string, string, string]>> = {
  science: [prepScience1, prepScience2, prepScience3],
  studies: [prepStudies1, prepStudies2, prepStudies3],
  math: [prepMath1, prepMath2, prepMath3],
  arabic: [prepArabic1, prepArabic2, prepArabic3],
  english: [prepEnglish1, prepEnglish2, prepEnglish3],
  sharia: [prepSharia1, prepSharia2, prepSharia3],
};

const SEC_MAP: Partial<Record<SubjectKey, [string, string, string]>> = {
  physics: [secPhysics1, secPhysics2, secPhysics3],
  chemistry: [secChem1, secChem2, secChem3],
  bio: [secBio1, secBio2, secBio3],
  history: [secHistory1, secHistory2, secHistory3],
  geography: [secGeo1, secGeo2, secGeo3],
  math: [secMath1, secMath2, secMath3],
  arabic: [secArabic1, secArabic2, secArabic3],
  english: [secEnglish1, secEnglish2, secEnglish3],
  sharia: [secSharia1, secSharia2, secSharia3],
};

function resolveSubjectKey(raw: string): SubjectKey | null {
  const v = (raw || "").trim();
  if (!v) return null;
  if (v.includes("فيزياء")) return "physics";
  if (v.includes("كيمياء")) return "chemistry";
  if (v.includes("أحياء") || v.includes("احياء")) return "bio";
  if (v.includes("تاريخ")) return "history";
  if (v.includes("جغراف")) return "geography";
  if (v.includes("رياض")) return "math";
  if (v.includes("العربية") || v.includes("عربي")) return "arabic";
  if (v.includes("إنجليزي") || v.includes("انجليزي") || v.toLowerCase().includes("english")) return "english";
  if (v.includes("دراسات") || v.includes("اجتماع")) return "studies";
  if (v.includes("علوم") || v.toLowerCase() === "science" || v === "integrated_science") return "science";
  if (v.includes("شرعي") || v.includes("إسلامي") || v.includes("اسلامي") || v.includes("دين") || v.toLowerCase() === "sharia" || v.toLowerCase() === "religious") return "sharia";
  return null;
}

function gradeIndex(grade: string): number {
  const g = (grade || "").trim();
  const key = gradeKeyFromArabicLabel(g) || g;
  if (key === "first" || g.includes("الأول") || g.includes("الاول")) return 0;
  if (key === "second" || g.includes("الثاني")) return 1;
  if (key === "third" || g.includes("الثالث")) return 2;
  return 0;
}

/**
 * Returns the artwork URL for a teacher's (subject + stage + grade) combo,
 * or null if no custom artwork exists for that combination.
 */
export function getGradeArtwork(
  category: string,
  stage: string,
  grade: string,
): string | null {
  const subject = resolveSubjectKey(category);
  if (!subject) return null;
  const stageKey = stageKeyFromValue(stage) || stage;
  const idx = gradeIndex(grade);
  const isPrep = stageKey === "preparatory" || (grade || "").includes("الإعدادي") || (grade || "").includes("الاعدادي");
  const isSec = stageKey === "secondary" || (grade || "").includes("الثانوي");
  const map = isPrep ? PREP_MAP : isSec ? SEC_MAP : null;
  if (!map) return null;
  const tuple = map[subject];
  if (!tuple) return null;
  return tuple[idx] || tuple[0];
}

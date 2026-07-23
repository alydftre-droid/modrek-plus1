import { supabase } from "@/integrations/supabase/client";

export type SystemTerm = "term1" | "term2";

export function normalizeGradeForTermSystem(grade?: string | null) {
  const value = (grade || "").trim().toLowerCase();

  if (!value) return "";
  if (value === "1" || value === "first" || value.includes("الأول") || value.includes("الاول")) return "1";
  if (value === "2" || value === "second" || value.includes("الثاني")) return "2";
  if (value === "3" || value === "third" || value.includes("الثالث")) return "3";

  return value;
}

export async function getCurrentTermForStageGrade(stage?: string | null, grade?: string | null) {
  const term = await getCurrentTermForStageGradeStrict(stage, grade);
  return term || "term1";
}

export async function getCurrentTermForStageGradeStrict(stage?: string | null, grade?: string | null): Promise<SystemTerm | null> {
  if (!stage || !grade) return "term1";

  const normalizedGrade = normalizeGradeForTermSystem(grade);
  const { data, error } = await supabase
    .from("system_terms")
    .select("current_term")
    .eq("stage", stage)
    .eq("grade", normalizedGrade)
    .maybeSingle();

  if (error) {
    console.warn("Failed to load current system term", { stage, grade, error });
    return null;
  }

  const term = data?.current_term;
  return term === "term1" || term === "term2" ? term : null;
}

export async function getCurrentTermForSubject(subjectId?: string | null) {
  if (!subjectId) return "term1";

  const { data } = await supabase
    .from("subjects")
    .select("stage, grade")
    .eq("id", subjectId)
    .maybeSingle();

  if (!data) return "term1";

  return getCurrentTermForStageGrade(data.stage, data.grade);
}
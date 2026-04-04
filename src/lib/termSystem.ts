import { supabase } from "@/integrations/supabase/client";

export function normalizeGradeForTermSystem(grade?: string | null) {
  const value = (grade || "").trim().toLowerCase();

  if (!value) return "";
  if (value === "1" || value === "first" || value.includes("الأول") || value.includes("الاول")) return "1";
  if (value === "2" || value === "second" || value.includes("الثاني")) return "2";
  if (value === "3" || value === "third" || value.includes("الثالث")) return "3";

  return value;
}

export async function getCurrentTermForStageGrade(stage?: string | null, grade?: string | null) {
  if (!stage || !grade) return "term1";

  const normalizedGrade = normalizeGradeForTermSystem(grade);
  const { data } = await supabase
    .from("system_terms")
    .select("current_term")
    .eq("stage", stage)
    .eq("grade", normalizedGrade)
    .maybeSingle();

  return (data?.current_term as string) || "term1";
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
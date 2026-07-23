import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeGradeForTermSystem } from "@/lib/termSystem";

interface TermInfo {
  stage: string;
  grade: string;
  current_term: string;
}

export function useCurrentTerm(stage?: string, grade?: string) {
  return useQuery({
    queryKey: ["current-term", stage, grade],
    queryFn: async () => {
      if (!stage || !grade) return null;
      const normalizedGrade = normalizeGradeForTermSystem(grade);
      const { data } = await supabase
        .from("system_terms")
        .select("current_term")
        .eq("stage", stage)
        .eq("grade", normalizedGrade)
        .maybeSingle();
      return (data?.current_term as string) || "term1";
    },
    enabled: !!stage && !!grade,
    staleTime: 60 * 1000,
  });
}

export function useAllTerms() {
  return useQuery({
    queryKey: ["all-terms"],
    queryFn: async () => {
      const { data } = await supabase
        .from("system_terms")
        .select("*")
        .order("stage")
        .order("grade");
      return (data as TermInfo[]) || [];
    },
    staleTime: 60 * 1000,
  });
}

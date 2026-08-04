import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buildSubjectCatalogIndex,
  filterAssignmentsByCatalog,
  type SubjectCatalogRow,
} from "@/lib/teacherCatalogFiltering";
import type { TeacherAssignmentLike } from "@/lib/teacherAssignments";

/** Single query: the real (stage → grade → subject) curriculum map. */
export function useSubjectCatalogIndex() {
  const query = useQuery({
    queryKey: ["subject-catalog-index"],
    queryFn: async (): Promise<SubjectCatalogRow[]> => {
      const { data } = await supabase
        .from("subjects")
        .select("category, stage, grade, name")
        .eq("is_active", true);
      return (data || []) as SubjectCatalogRow[];
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const index = useMemo(() => buildSubjectCatalogIndex(query.data), [query.data]);
  return { index, isLoading: query.isLoading };
}

/**
 * Keeps only the teacher assignments whose (subject + stage + grade) combination
 * really exists inside the platform curriculum, so no empty subject/grade cards show up.
 */
export function useCatalogFilteredAssignments<T extends TeacherAssignmentLike>(assignments: T[]) {
  const { index, isLoading } = useSubjectCatalogIndex();
  const filtered = useMemo(
    () => (isLoading ? assignments : filterAssignmentsByCatalog(assignments, index)),
    [assignments, index, isLoading],
  );
  return { assignments: filtered, isLoading };
}

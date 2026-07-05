import { supabase } from "@/integrations/supabase/client";

export function reportTeacherScopedStudentIds(sourceTable: string, studentIds: Array<string | null | undefined>, context: Record<string, unknown> = {}) {
  const ids = Array.from(new Set(studentIds.filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return;

  void supabase.rpc("report_test_student_query_result" as any, {
    _source_table: sourceTable,
    _student_ids: ids,
    _context: context,
  });
}
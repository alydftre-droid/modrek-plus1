CREATE OR REPLACE FUNCTION public.diagnose_student_group_exam_visibility(_group_id uuid, _sub_subject_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  exam_id uuid,
  title text,
  visibility_status text,
  reason_code text,
  reason text,
  source_file text,
  source_function text,
  requested_group_id uuid,
  exam_group_id uuid,
  exam_subject_id uuid,
  requested_subject_id uuid,
  normalized_target_section text,
  normalized_target_education_type text,
  student_section text,
  student_education_type text,
  term_matches boolean,
  target_matches boolean,
  in_broadcast_scope boolean,
  sub_subject_matches boolean,
  is_published boolean,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH debug_rows AS (
    SELECT *
    FROM public.debug_student_group_exam_visibility(_group_id, _sub_subject_id)
  )
  SELECT * FROM debug_rows
  UNION ALL
  SELECT
    NULL::uuid AS exam_id,
    NULL::text AS title,
    'hidden'::text AS visibility_status,
    'diagnostic_returned_no_candidates'::text AS reason_code,
    'لم يجد التشخيص أي امتحان مرشح لنفس المعلم/المرحلة/الصف/المادة. هذا يعني أن الامتحان محفوظ على مجموعة أو مادة أو معلم مختلف عن المجموعة التي فتحها الطالب، أو أن الامتحان غير مربوط بمجموعة أصلاً.'::text AS reason,
    'src/hooks/useExamMutations.ts:resolveSiblingGroupForExam + database:function public.get_student_group_exam_catalog'::text AS source_file,
    'diagnose_student_group_exam_visibility:no_exam_candidates'::text AS source_function,
    _group_id AS requested_group_id,
    NULL::uuid AS exam_group_id,
    NULL::uuid AS exam_subject_id,
    (
      SELECT cg.subject_id
      FROM public.content_groups cg
      WHERE cg.id = _group_id
      LIMIT 1
    ) AS requested_subject_id,
    NULL::text AS normalized_target_section,
    NULL::text AS normalized_target_education_type,
    (
      SELECT public.normalize_content_section(p.section)
      FROM public.profiles p
      WHERE p.id = auth.uid()
      LIMIT 1
    ) AS student_section,
    (
      SELECT p.education_type
      FROM public.profiles p
      WHERE p.id = auth.uid()
      LIMIT 1
    ) AS student_education_type,
    NULL::boolean AS term_matches,
    NULL::boolean AS target_matches,
    NULL::boolean AS in_broadcast_scope,
    NULL::boolean AS sub_subject_matches,
    NULL::boolean AS is_published,
    NULL::text AS status
  WHERE NOT EXISTS (SELECT 1 FROM debug_rows);
$function$;

REVOKE ALL ON FUNCTION public.diagnose_student_group_exam_visibility(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.diagnose_student_group_exam_visibility(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.diagnose_student_group_exam_visibility(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
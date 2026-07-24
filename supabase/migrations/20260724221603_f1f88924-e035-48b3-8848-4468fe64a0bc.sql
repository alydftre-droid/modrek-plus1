GRANT EXECUTE ON FUNCTION public.term_item_matches_current_system_term(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_teacher_target_group(uuid, uuid, uuid) TO authenticated, service_role;

DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.normalize_content_section(text)'::regprocedure,
    'public.normalize_content_education_type(text)'::regprocedure,
    'public.content_effective_section(text,uuid,uuid)'::regprocedure,
    'public.exam_effective_section(text,uuid,uuid)'::regprocedure,
    'public.content_target_matches_student(text,uuid,uuid,uuid,text)'::regprocedure,
    'public.exam_target_matches_student(uuid,text,text,uuid,uuid)'::regprocedure
  ] LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;
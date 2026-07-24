GRANT EXECUTE ON FUNCTION public.term_item_matches_current_system_term(uuid, uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.group_matches_current_system_term(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exam_target_matches_student(uuid, text, text) TO anon, authenticated, service_role;
revoke execute on function public.modrek_repair_lesson_index(uuid) from anon, authenticated;
revoke execute on function public.modrek_rebuild_lessons_from_text(uuid) from anon, authenticated;
revoke execute on function public.modrek_extract_heading_number(text) from anon, public;
grant execute on function public.modrek_repair_lesson_index(uuid) to service_role;
grant execute on function public.modrek_rebuild_lessons_from_text(uuid) to service_role;
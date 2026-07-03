CREATE OR REPLACE FUNCTION public.get_modrek_library_bootstrap()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_modrek_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN jsonb_build_object(
    'types', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.sort_order, t.name_ar)
      FROM public.knowledge_source_types t
      WHERE t.is_active = true
    ), '[]'::jsonb),
    'stages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name_ar', s.name_ar, 'code', s.code) ORDER BY s.sort_order, s.name_ar)
      FROM public.library_stages s
      WHERE s.is_active = true
    ), '[]'::jsonb),
    'grades', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name_ar', g.name_ar, 'code', g.code, 'stage_id', g.stage_id) ORDER BY g.sort_order, g.name_ar)
      FROM public.library_grades g
      WHERE g.is_active = true
    ), '[]'::jsonb),
    'sections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', sec.id, 'name_ar', sec.name_ar, 'code', sec.code) ORDER BY sec.sort_order, sec.name_ar)
      FROM public.library_sections sec
      WHERE sec.is_active = true
    ), '[]'::jsonb),
    'tracks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', tr.id, 'name_ar', tr.name_ar, 'code', tr.code) ORDER BY tr.sort_order, tr.name_ar)
      FROM public.library_tracks tr
      WHERE tr.is_active = true
    ), '[]'::jsonb),
    'subjects', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', sub.id, 'name_ar', sub.name_ar, 'code', sub.code, 'stage_id', sub.stage_id, 'section_id', sub.section_id) ORDER BY sub.sort_order, sub.name_ar)
      FROM public.library_subjects sub
      WHERE sub.is_active = true
    ), '[]'::jsonb),
    'subSubjects', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', ss.id, 'name_ar', ss.name_ar, 'code', ss.code, 'subject_id', ss.subject_id) ORDER BY ss.sort_order, ss.name_ar)
      FROM public.library_sub_subjects ss
      WHERE ss.is_active = true
    ), '[]'::jsonb),
    'sources', COALESCE((
      SELECT jsonb_agg(to_jsonb(src) ORDER BY src.created_at DESC)
      FROM public.knowledge_sources src
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_modrek_library_bootstrap() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_modrek_library_bootstrap() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_modrek_library_bootstrap() IS 'Production bootstrap payload for Modrek AI Library admin page; secured by is_modrek_admin.';

NOTIFY pgrst, 'reload schema';
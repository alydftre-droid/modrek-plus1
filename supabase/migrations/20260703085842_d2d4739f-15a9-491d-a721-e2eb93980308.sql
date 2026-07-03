CREATE OR REPLACE FUNCTION public.is_modrek_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = 'admin'::public.app_role
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _user_id
      AND (
        p.role = 'admin'
        OR lower(coalesce(p.email, '')) IN ('aliana200713@gmail.com', 'alyedaft@gmail.com')
      )
  )
$$;

REVOKE ALL ON FUNCTION public.is_modrek_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_modrek_admin(uuid) TO authenticated, service_role;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'library_stages','library_sections','library_grades','library_tracks',
    'library_subjects','library_sub_subjects',
    'knowledge_source_types','knowledge_sources','knowledge_source_versions',
    'knowledge_units','storage_assets','knowledge_source_assets',
    'ai_providers','ai_models','processing_jobs','processing_events',
    'content_chunks','knowledge_tags','knowledge_tag_map'
  ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS admin_full_%1$I ON public.%1$I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "admin_full_%1$s" ON public.%1$I;', t);
    EXECUTE format(
      'CREATE POLICY "modrek_admin_full_%1$s" ON public.%1$I FOR ALL TO authenticated
       USING (public.is_modrek_admin(auth.uid()))
       WITH CHECK (public.is_modrek_admin(auth.uid()));',
      t
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS "modrek_library_admin_read" ON storage.objects;
DROP POLICY IF EXISTS "modrek_library_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "modrek_library_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "modrek_library_admin_delete" ON storage.objects;

CREATE POLICY "modrek_library_admin_read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'modrek-library' AND public.is_modrek_admin(auth.uid()));

CREATE POLICY "modrek_library_admin_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'modrek-library' AND public.is_modrek_admin(auth.uid()));

CREATE POLICY "modrek_library_admin_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'modrek-library' AND public.is_modrek_admin(auth.uid()))
WITH CHECK (bucket_id = 'modrek-library' AND public.is_modrek_admin(auth.uid()));

CREATE POLICY "modrek_library_admin_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'modrek-library' AND public.is_modrek_admin(auth.uid()));
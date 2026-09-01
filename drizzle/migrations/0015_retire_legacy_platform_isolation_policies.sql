-- Tenant V2 regression fix
--
-- The legacy V1 isolation layer (platform_isolation_* RESTRICTIVE policies)
-- decides visibility by comparing "which teacher platform does the actor own or
-- belong to". Once a teacher owns a teacher_platform, user_platform_id(teacher)
-- becomes that platform, while an official Modrek Plus student has NULL, so the
-- restrictive policy hid every row owned by that teacher from official students
-- (teacher_profiles photo/video, assignments, groups) and blocked inserts into
-- student_teacher_choices ("خطأ في اختيار المعلم").
--
-- Tenant V2 (tenant_id + tenant_isolation_* RESTRICTIVE policies) is now the
-- single source of truth for cross-platform isolation, so the V1 layer is
-- retired. Tables without a tenant_id column get an equivalent tenant gate
-- derived from their parent row.

-- 1) Tenant-derived gates for child tables that carry no tenant_id column.
CREATE OR REPLACE FUNCTION public.tenant_source_visible(_source_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _source_id IS NULL OR public.tenant_row_visible(
    (SELECT s.tenant_id FROM public.knowledge_sources s WHERE s.id = _source_id))
$$;

CREATE OR REPLACE FUNCTION public.tenant_book_visible(_book_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _book_id IS NULL OR public.tenant_row_visible(
    (SELECT b.tenant_id FROM public.library_books b WHERE b.id = _book_id))
$$;

REVOKE ALL ON FUNCTION public.tenant_source_visible(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tenant_book_visible(uuid) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS tenant_isolation_knowledge_source_versions ON public.knowledge_source_versions;
CREATE POLICY tenant_isolation_knowledge_source_versions ON public.knowledge_source_versions
  AS RESTRICTIVE FOR ALL TO public
  USING (public.tenant_source_visible(source_id))
  WITH CHECK (public.tenant_source_visible(source_id));

DROP POLICY IF EXISTS tenant_isolation_library_book_index ON public.library_book_index;
CREATE POLICY tenant_isolation_library_book_index ON public.library_book_index
  AS RESTRICTIVE FOR ALL TO public
  USING (public.tenant_book_visible(book_id))
  WITH CHECK (public.tenant_book_visible(book_id));

DROP POLICY IF EXISTS tenant_isolation_library_book_sections ON public.library_book_sections;
CREATE POLICY tenant_isolation_library_book_sections ON public.library_book_sections
  AS RESTRICTIVE FOR ALL TO public
  USING (public.tenant_book_visible(book_id))
  WITH CHECK (public.tenant_book_visible(book_id));

-- 2) Retire every legacy V1 restrictive policy.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND policyname LIKE 'platform_isolation%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

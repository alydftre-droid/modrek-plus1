-- =========================================================
-- Teacher Platforms (multi-tenant layer inside Modrek Plus)
-- Official platform == NULL platform. Additive only.
-- =========================================================

CREATE TABLE public.teacher_platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  brand_color TEXT,
  owner_teacher_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT teacher_platforms_slug_key UNIQUE (slug),
  CONSTRAINT teacher_platforms_status_chk CHECK (status IN ('active','suspended','archived')),
  CONSTRAINT teacher_platforms_slug_chk CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])$')
);

GRANT SELECT ON public.teacher_platforms TO authenticated;
GRANT SELECT ON public.teacher_platforms TO anon;
GRANT ALL ON public.teacher_platforms TO service_role;
ALTER TABLE public.teacher_platforms ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.teacher_platform_subjects (
  platform_id UUID NOT NULL REFERENCES public.teacher_platforms(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (platform_id, subject_id)
);

GRANT SELECT ON public.teacher_platform_subjects TO authenticated;
GRANT SELECT ON public.teacher_platform_subjects TO anon;
GRANT ALL ON public.teacher_platform_subjects TO service_role;
ALTER TABLE public.teacher_platform_subjects ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.platform_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id UUID NOT NULL REFERENCES public.teacher_platforms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  member_role TEXT NOT NULL DEFAULT 'student',
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_memberships_user_key UNIQUE (user_id),
  CONSTRAINT platform_memberships_role_chk CHECK (member_role IN ('teacher','student')),
  CONSTRAINT platform_memberships_status_chk CHECK (status IN ('active','suspended'))
);

GRANT SELECT ON public.platform_memberships TO authenticated;
GRANT ALL ON public.platform_memberships TO service_role;
ALTER TABLE public.platform_memberships ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.platform_reserved_slugs (
  slug TEXT PRIMARY KEY
);
GRANT SELECT ON public.platform_reserved_slugs TO authenticated;
GRANT SELECT ON public.platform_reserved_slugs TO anon;
GRANT ALL ON public.platform_reserved_slugs TO service_role;
ALTER TABLE public.platform_reserved_slugs ENABLE ROW LEVEL SECURITY;

INSERT INTO public.platform_reserved_slugs(slug) VALUES
  ('www'),('app'),('admin'),('api'),('auth'),('teacher'),('teachers'),('student'),('students'),
  ('cdn'),('mail'),('notify'),('support'),('help'),('docs'),('blog'),('dev'),('staging'),
  ('preview'),('id-preview'),('modrek'),('modrekplus'),('plus'),('ai'),('library'),('exam'),
  ('exams'),('wallet'),('pay'),('billing'),('static'),('assets'),('files'),('storage'),
  ('supabase'),('vercel'),('test'),('demo'),('platform'),('platforms');

CREATE INDEX idx_teacher_platforms_owner ON public.teacher_platforms(owner_teacher_id);
CREATE INDEX idx_teacher_platforms_status ON public.teacher_platforms(status);
CREATE INDEX idx_platform_memberships_platform ON public.platform_memberships(platform_id);
CREATE INDEX idx_platform_memberships_user ON public.platform_memberships(user_id);
CREATE INDEX idx_teacher_platform_subjects_subject ON public.teacher_platform_subjects(subject_id);

-- =========================================================
-- Core tenancy helpers (SECURITY DEFINER, stable)
-- =========================================================

CREATE OR REPLACE FUNCTION public.user_platform_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT tp.id FROM public.teacher_platforms tp
      WHERE tp.owner_teacher_id = _user_id AND tp.status <> 'archived' LIMIT 1),
    (SELECT pm.platform_id FROM public.platform_memberships pm
      WHERE pm.user_id = _user_id AND pm.status = 'active' LIMIT 1)
  )
$$;

CREATE OR REPLACE FUNCTION public.platform_scope_ok(_owner_id UUID, _viewer_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_platform_id(_owner_id) IS NOT DISTINCT FROM public.user_platform_id(_viewer_id)
$$;

CREATE OR REPLACE FUNCTION public.platform_subject_ok(_subject_id UUID, _viewer_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p UUID;
BEGIN
  p := public.user_platform_id(_viewer_id);
  IF p IS NULL THEN RETURN TRUE; END IF;
  IF _subject_id IS NULL THEN RETURN TRUE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.teacher_platform_subjects tps
    WHERE tps.platform_id = p AND tps.subject_id = _subject_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_platform_by_slug(_slug TEXT)
RETURNS TABLE (
  id UUID, name TEXT, slug TEXT, description TEXT, logo_url TEXT,
  brand_color TEXT, owner_teacher_id UUID, teacher_name TEXT, status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tp.id, tp.name, tp.slug, tp.description, tp.logo_url, tp.brand_color,
         tp.owner_teacher_id, pr.full_name, tp.status
  FROM public.teacher_platforms tp
  LEFT JOIN public.profiles pr ON pr.id = tp.owner_teacher_id
  WHERE tp.slug = lower(trim(_slug)) AND tp.status = 'active'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_platform_by_slug(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_by_slug(TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.my_platform()
RETURNS TABLE (
  id UUID, name TEXT, slug TEXT, logo_url TEXT, brand_color TEXT,
  owner_teacher_id UUID, status TEXT, member_role TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tp.id, tp.name, tp.slug, tp.logo_url, tp.brand_color, tp.owner_teacher_id, tp.status,
         CASE WHEN tp.owner_teacher_id = auth.uid() THEN 'teacher' ELSE COALESCE(pm.member_role,'student') END
  FROM public.teacher_platforms tp
  LEFT JOIN public.platform_memberships pm ON pm.platform_id = tp.id AND pm.user_id = auth.uid()
  WHERE tp.id = public.user_platform_id(auth.uid())
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.my_platform() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_platform() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.platform_join_as_student(_slug TEXT)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_platform UUID;
  v_existing UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT id INTO v_platform FROM public.teacher_platforms
   WHERE slug = lower(trim(_slug)) AND status = 'active';
  IF v_platform IS NULL THEN RAISE EXCEPTION 'platform_not_found'; END IF;

  IF EXISTS (SELECT 1 FROM public.teacher_platforms WHERE owner_teacher_id = auth.uid()) THEN
    RETURN v_platform;
  END IF;

  IF public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin_cannot_join_platform';
  END IF;

  SELECT platform_id INTO v_existing FROM public.platform_memberships WHERE user_id = auth.uid();
  IF v_existing IS NOT NULL THEN
    IF v_existing <> v_platform THEN RAISE EXCEPTION 'user_belongs_to_another_platform'; END IF;
    RETURN v_platform;
  END IF;

  INSERT INTO public.platform_memberships(platform_id, user_id, member_role)
  VALUES (v_platform, auth.uid(), 'student');

  RETURN v_platform;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_join_as_student(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_join_as_student(TEXT) TO authenticated, service_role;

-- =========================================================
-- Admin management RPCs
-- =========================================================

CREATE OR REPLACE FUNCTION public.admin_create_teacher_platform(
  _name TEXT, _slug TEXT, _owner_teacher_id UUID, _subject_ids UUID[],
  _description TEXT DEFAULT NULL, _logo_url TEXT DEFAULT NULL, _brand_color TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug TEXT := lower(trim(_slug));
  v_id UUID;
  v_subject UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF coalesce(trim(_name),'') = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  IF EXISTS (SELECT 1 FROM public.platform_reserved_slugs WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'slug_reserved';
  END IF;
  IF EXISTS (SELECT 1 FROM public.teacher_platforms WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'slug_taken';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _owner_teacher_id AND role = 'teacher') THEN
    RAISE EXCEPTION 'owner_must_be_teacher';
  END IF;
  IF EXISTS (SELECT 1 FROM public.teacher_platforms WHERE owner_teacher_id = _owner_teacher_id AND status <> 'archived') THEN
    RAISE EXCEPTION 'teacher_already_owns_platform';
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_memberships WHERE user_id = _owner_teacher_id) THEN
    RAISE EXCEPTION 'teacher_already_member_of_platform';
  END IF;

  INSERT INTO public.teacher_platforms(name, slug, description, logo_url, brand_color, owner_teacher_id, created_by)
  VALUES (trim(_name), v_slug, _description, _logo_url, _brand_color, _owner_teacher_id, auth.uid())
  RETURNING id INTO v_id;

  IF _subject_ids IS NOT NULL THEN
    FOREACH v_subject IN ARRAY _subject_ids LOOP
      INSERT INTO public.teacher_platform_subjects(platform_id, subject_id)
      VALUES (v_id, v_subject) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  INSERT INTO public.platform_memberships(platform_id, user_id, member_role)
  VALUES (v_id, _owner_teacher_id, 'teacher')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_create_teacher_platform(TEXT,TEXT,UUID,UUID[],TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_teacher_platform(TEXT,TEXT,UUID,UUID[],TEXT,TEXT,TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_update_teacher_platform(
  _platform_id UUID, _name TEXT DEFAULT NULL, _description TEXT DEFAULT NULL,
  _logo_url TEXT DEFAULT NULL, _brand_color TEXT DEFAULT NULL, _subject_ids UUID[] DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subject UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;

  UPDATE public.teacher_platforms SET
    name = COALESCE(NULLIF(trim(COALESCE(_name,'')),''), name),
    description = COALESCE(_description, description),
    logo_url = COALESCE(_logo_url, logo_url),
    brand_color = COALESCE(_brand_color, brand_color),
    updated_at = now()
  WHERE id = _platform_id;

  IF _subject_ids IS NOT NULL THEN
    DELETE FROM public.teacher_platform_subjects
     WHERE platform_id = _platform_id AND subject_id <> ALL (_subject_ids);
    FOREACH v_subject IN ARRAY _subject_ids LOOP
      INSERT INTO public.teacher_platform_subjects(platform_id, subject_id)
      VALUES (_platform_id, v_subject) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_teacher_platform(UUID,TEXT,TEXT,TEXT,TEXT,UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_teacher_platform(UUID,TEXT,TEXT,TEXT,TEXT,UUID[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_platform_status(_platform_id UUID, _status TEXT)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF _status NOT IN ('active','suspended','archived') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  UPDATE public.teacher_platforms SET status = _status, updated_at = now() WHERE id = _platform_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_platform_status(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_platform_status(UUID,TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_list_teacher_platforms()
RETURNS TABLE (
  id UUID, name TEXT, slug TEXT, description TEXT, logo_url TEXT, brand_color TEXT,
  status TEXT, owner_teacher_id UUID, teacher_name TEXT, teacher_email TEXT,
  subject_names TEXT[], subject_ids UUID[], student_count BIGINT, created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tp.id, tp.name, tp.slug, tp.description, tp.logo_url, tp.brand_color, tp.status,
         tp.owner_teacher_id, pr.full_name, pr.email,
         COALESCE((SELECT array_agg(DISTINCT s.name) FROM public.teacher_platform_subjects tps
                    JOIN public.subjects s ON s.id = tps.subject_id
                   WHERE tps.platform_id = tp.id), ARRAY[]::TEXT[]),
         COALESCE((SELECT array_agg(tps.subject_id) FROM public.teacher_platform_subjects tps
                   WHERE tps.platform_id = tp.id), ARRAY[]::UUID[]),
         (SELECT count(*) FROM public.platform_memberships pm
           WHERE pm.platform_id = tp.id AND pm.member_role = 'student' AND pm.status = 'active'),
         tp.created_at
  FROM public.teacher_platforms tp
  LEFT JOIN public.profiles pr ON pr.id = tp.owner_teacher_id
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY tp.created_at DESC
$$;
REVOKE ALL ON FUNCTION public.admin_list_teacher_platforms() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_teacher_platforms() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_list_platform_students(_platform_id UUID)
RETURNS TABLE (user_id UUID, full_name TEXT, email TEXT, student_code TEXT, joined_at TIMESTAMPTZ, status TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pm.user_id, pr.full_name, pr.email, pr.student_code, pm.joined_at, pm.status
  FROM public.platform_memberships pm
  LEFT JOIN public.profiles pr ON pr.id = pm.user_id
  WHERE pm.platform_id = _platform_id AND pm.member_role = 'student'
    AND public.has_role(auth.uid(), 'admin')
  ORDER BY pm.joined_at DESC
$$;
REVOKE ALL ON FUNCTION public.admin_list_platform_students(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_platform_students(UUID) TO authenticated, service_role;

-- =========================================================
-- RLS policies for the new tables
-- =========================================================

CREATE POLICY "Admins manage platforms" ON public.teacher_platforms
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members read own platform" ON public.teacher_platforms
  FOR SELECT TO authenticated
  USING (id = public.user_platform_id(auth.uid()));

CREATE POLICY "Admins manage platform subjects" ON public.teacher_platform_subjects
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members read own platform subjects" ON public.teacher_platform_subjects
  FOR SELECT TO authenticated
  USING (platform_id = public.user_platform_id(auth.uid()));

CREATE POLICY "Admins manage memberships" ON public.platform_memberships
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users read own membership" ON public.platform_memberships
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Platform teacher reads own platform memberships" ON public.platform_memberships
  FOR SELECT TO authenticated
  USING (platform_id = public.user_platform_id(auth.uid()));

CREATE POLICY "Reserved slugs readable" ON public.platform_reserved_slugs
  FOR SELECT TO authenticated USING (true);

-- =========================================================
-- Tenant isolation applied to existing student/teacher policies
-- (additive: conditions are neutral for official users)
-- =========================================================

DROP POLICY IF EXISTS "Authenticated can view accessible current-term content" ON public.content;
CREATE POLICY "Authenticated can view accessible current-term content" ON public.content
  FOR SELECT TO authenticated
  USING (
    COALESCE(is_active, true)
    AND COALESCE(type, '') <> 'student_library'
    AND term_item_matches_current_system_term(subject_id, group_id, term)
    AND content_target_matches_student(education_type, subject_id, group_id, auth.uid(), target_section)
    AND public.platform_scope_ok(uploaded_by, auth.uid())
    AND public.platform_subject_ok(subject_id, auth.uid())
  );

DROP POLICY IF EXISTS "Anon can view free preview current-term content" ON public.content;
CREATE POLICY "Anon can view free preview current-term content" ON public.content
  FOR SELECT TO anon
  USING (
    COALESCE(is_active, true)
    AND COALESCE(is_free_preview, false) = true
    AND COALESCE(type, '') <> 'student_library'
    AND term_item_matches_current_system_term(subject_id, group_id, term)
    AND public.user_platform_id(uploaded_by) IS NULL
  );

DROP POLICY IF EXISTS "Anyone can view active current-term groups" ON public.content_groups;
CREATE POLICY "Anyone can view active current-term groups" ON public.content_groups
  FOR SELECT TO anon, authenticated
  USING (
    is_active = true
    AND group_matches_current_system_term(subject_id, term)
    AND CASE
      WHEN auth.uid() IS NULL THEN public.user_platform_id(COALESCE(teacher_id, created_by)) IS NULL
      ELSE public.platform_scope_ok(COALESCE(teacher_id, created_by), auth.uid())
           AND public.platform_subject_ok(subject_id, auth.uid())
    END
  );

DROP POLICY IF EXISTS "Students view subscribed current-term exams" ON public.exams;
CREATE POLICY "Students view subscribed current-term exams" ON public.exams
  FOR SELECT TO authenticated
  USING (
    is_published = true
    AND status = 'published'::exam_status
    AND group_id IS NOT NULL
    AND term_item_matches_current_system_term(subject_id, group_id, term)
    AND EXISTS (
      SELECT 1 FROM public.student_group_purchases sgp
      WHERE sgp.group_id = exams.group_id AND sgp.student_id = auth.uid()
    )
    AND exam_target_matches_student(auth.uid(), target_section, target_education_type, subject_id, group_id)
    AND public.platform_scope_ok(teacher_id, auth.uid())
  );

DROP POLICY IF EXISTS "Teachers can view linked non-test student profiles" ON public.profiles;
CREATE POLICY "Teachers can view linked non-test student profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    role = 'student'
    AND NOT is_test_student(id)
    AND public.platform_scope_ok(id, auth.uid())
    AND (
      EXISTS (
        SELECT 1 FROM public.student_teacher_choices stc
        WHERE stc.student_id = profiles.id AND stc.teacher_id = auth.uid()
          AND NOT is_test_student(stc.student_id)
      )
      OR EXISTS (
        SELECT 1 FROM public.student_group_purchases sgp
        JOIN public.content_groups cg ON cg.id = sgp.group_id
        WHERE sgp.student_id = profiles.id
          AND COALESCE(cg.teacher_id, cg.created_by) = auth.uid()
          AND NOT is_test_student(sgp.student_id)
      )
      OR EXISTS (
        SELECT 1 FROM public.teacher_messages tm
        WHERE tm.student_id = profiles.id AND tm.teacher_id = auth.uid()
          AND NOT is_test_student(tm.student_id)
      )
    )
  );

DROP POLICY IF EXISTS "Subjects are viewable by everyone" ON public.subjects;
CREATE POLICY "Subjects are viewable by everyone" ON public.subjects
  FOR SELECT TO anon, authenticated
  USING (auth.uid() IS NULL OR public.platform_subject_ok(id, auth.uid()));

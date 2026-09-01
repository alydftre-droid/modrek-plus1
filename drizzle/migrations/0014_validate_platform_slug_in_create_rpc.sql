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
  v_slug TEXT := lower(trim(coalesce(_slug, '')));
  v_id UUID;
  v_subject UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF coalesce(trim(_name),'') = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  -- Validate the slug format up front so the caller gets a clear error instead of
  -- a raw teacher_platforms_slug_chk constraint violation.
  IF v_slug !~ '^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])$' THEN
    RAISE EXCEPTION 'slug_invalid';
  END IF;
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
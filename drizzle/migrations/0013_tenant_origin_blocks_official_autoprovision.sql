-- Tenant V2 hardening: an account created on a teacher platform must never be
-- auto-provisioned as an official Modrek Plus account.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS origin_tenant_slug text;

CREATE OR REPLACE FUNCTION public.tenant_signup_origin_slug(_uid uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_slug text;
BEGIN
  SELECT NULLIF(btrim(origin_tenant_slug), '') INTO v_slug
  FROM public.profiles WHERE id = _uid;
  IF v_slug IS NOT NULL THEN RETURN lower(v_slug); END IF;

  BEGIN
    SELECT NULLIF(btrim(u.raw_user_meta_data ->> 'tenant_slug'), '')
      INTO v_slug
    FROM auth.users u WHERE u.id = _uid;
  EXCEPTION WHEN others THEN v_slug := NULL;
  END;

  IF v_slug IS NULL THEN RETURN 'official'; END IF;
  RETURN lower(v_slug);
END;
$$;

REVOKE ALL ON FUNCTION public.tenant_signup_origin_slug(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_signup_origin_slug(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tenant_activate_session(_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sid uuid;
  v_tenant public.tenants;
  v_account public.tenant_accounts;
  v_profile_role text;
  v_origin text;
  v_has_teacher_tenant boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  v_sid := public.current_auth_session_id();

  SELECT * INTO v_tenant FROM public.tenants
   WHERE slug = lower(trim(COALESCE(_slug, 'official'))) LIMIT 1;
  IF v_tenant.id IS NULL THEN RAISE EXCEPTION 'tenant_not_found'; END IF;
  IF v_tenant.status <> 'active' THEN RAISE EXCEPTION 'tenant_suspended'; END IF;

  SELECT * INTO v_account FROM public.tenant_accounts
   WHERE tenant_id = v_tenant.id AND auth_user_id = v_uid LIMIT 1;

  -- Official platform keeps its historical behaviour for accounts that were
  -- actually created on Modrek Plus. An account whose origin is a teacher
  -- platform is NEVER auto-provisioned here.
  IF v_account.id IS NULL AND v_tenant.tenant_type = 'official' THEN
    v_origin := public.tenant_signup_origin_slug(v_uid);
    SELECT EXISTS (
      SELECT 1 FROM public.tenant_accounts a
      JOIN public.tenants t ON t.id = a.tenant_id AND t.tenant_type = 'teacher'
      WHERE a.auth_user_id = v_uid AND a.status = 'active'
    ) INTO v_has_teacher_tenant;

    IF v_origin IS DISTINCT FROM 'official' OR v_has_teacher_tenant THEN
      RAISE EXCEPTION 'no_account_on_tenant';
    END IF;

    SELECT COALESCE(role, 'student') INTO v_profile_role FROM public.profiles WHERE id = v_uid;
    IF v_profile_role IS NULL THEN RAISE EXCEPTION 'no_account_on_tenant'; END IF;
    INSERT INTO public.tenant_accounts(tenant_id, auth_user_id, role, status, full_name)
    SELECT v_tenant.id, v_uid,
           (CASE WHEN v_profile_role IN ('admin','teacher','student','support')
                 THEN v_profile_role ELSE 'student' END)::public.app_role,
           'active', p.full_name
    FROM public.profiles p WHERE p.id = v_uid
    ON CONFLICT (tenant_id, auth_user_id) DO NOTHING;
    SELECT * INTO v_account FROM public.tenant_accounts
     WHERE tenant_id = v_tenant.id AND auth_user_id = v_uid LIMIT 1;
  END IF;

  IF v_account.id IS NULL THEN RAISE EXCEPTION 'no_account_on_tenant'; END IF;
  IF v_account.status <> 'active' THEN RAISE EXCEPTION 'account_suspended'; END IF;

  DELETE FROM public.tenant_session_contexts WHERE session_id = v_sid;
  INSERT INTO public.tenant_session_contexts(session_id, auth_user_id, tenant_id, tenant_account_id, expires_at)
  VALUES (v_sid, v_uid, v_tenant.id, v_account.id, now() + interval '30 days');

  RETURN jsonb_build_object(
    'tenant_id', v_tenant.id,
    'tenant_type', v_tenant.tenant_type,
    'slug', v_tenant.slug,
    'account_id', v_account.id,
    'role', v_account.role,
    'full_name', v_account.full_name,
    'education_type', v_account.education_type,
    'stage', v_account.stage,
    'grade', v_account.grade,
    'section', v_account.section
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.tenant_register_student(
  _slug text,
  _full_name text,
  _education_type text DEFAULT NULL::text,
  _stage text DEFAULT NULL::text,
  _grade text DEFAULT NULL::text,
  _section text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant public.tenants;
  v_cfg public.tenant_teacher_config;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_tenant FROM public.tenants WHERE slug = lower(trim(_slug)) LIMIT 1;
  IF v_tenant.id IS NULL OR v_tenant.status <> 'active' THEN RAISE EXCEPTION 'tenant_not_found'; END IF;
  IF v_tenant.tenant_type <> 'teacher' THEN RAISE EXCEPTION 'invalid_tenant'; END IF;

  SELECT * INTO v_cfg FROM public.tenant_teacher_config WHERE tenant_id = v_tenant.id;
  IF v_cfg.tenant_id IS NOT NULL THEN
    IF _education_type IS NOT NULL AND array_length(v_cfg.education_types, 1) > 0
       AND NOT (_education_type = ANY (v_cfg.education_types)) THEN
      RAISE EXCEPTION 'education_type_not_allowed';
    END IF;
    IF _stage IS NOT NULL AND array_length(v_cfg.stages, 1) > 0
       AND NOT (_stage = ANY (v_cfg.stages)) THEN
      RAISE EXCEPTION 'stage_not_allowed';
    END IF;
    IF _grade IS NOT NULL AND array_length(v_cfg.grades, 1) > 0
       AND NOT (_grade = ANY (v_cfg.grades)) THEN
      RAISE EXCEPTION 'grade_not_allowed';
    END IF;
  END IF;

  INSERT INTO public.tenant_accounts(tenant_id, auth_user_id, role, status, full_name, education_type, stage, grade, section)
  VALUES (v_tenant.id, v_uid, 'student', 'active', _full_name, _education_type, _stage, _grade, _section)
  ON CONFLICT (tenant_id, auth_user_id) DO NOTHING;

  -- Remember where this account was born: it can never become an official
  -- Modrek Plus account by simply visiting modrekplus.com.
  UPDATE public.profiles
     SET origin_tenant_slug = COALESCE(NULLIF(btrim(origin_tenant_slug), ''), v_tenant.slug)
   WHERE id = v_uid;

  RETURN public.tenant_activate_session(v_tenant.slug);
END;
$$;
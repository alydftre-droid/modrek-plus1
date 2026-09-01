-- Tenant V2: authentication isolation core.
-- hostname -> resolve tenant -> authorize session/account for tenant -> query by tenant_id

CREATE OR REPLACE FUNCTION public.official_tenant_id()
RETURNS uuid LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT '00000000-0000-4000-8000-000000000001'::uuid
$$;

-- Current auth session identifier (falls back to the user id when the
-- access token carries no session_id claim).
CREATE OR REPLACE FUNCTION public.current_auth_session_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_sid text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  BEGIN
    v_sid := nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'session_id', '');
  EXCEPTION WHEN others THEN v_sid := NULL;
  END;
  IF v_sid IS NULL THEN RETURN auth.uid(); END IF;
  RETURN v_sid::uuid;
EXCEPTION WHEN others THEN RETURN auth.uid();
END;
$$;

-- Tenant authorized for THIS request's session. NULL when no tenant session
-- context was activated (i.e. plain official browsing).
CREATE OR REPLACE FUNCTION public.current_request_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT c.tenant_id
  FROM public.tenant_session_contexts c
  JOIN public.tenant_accounts a ON a.id = c.tenant_account_id AND a.status = 'active'
  JOIN public.tenants t ON t.id = c.tenant_id AND t.status = 'active'
  WHERE c.session_id = public.current_auth_session_id()
    AND c.auth_user_id = auth.uid()
    AND (c.expires_at IS NULL OR c.expires_at > now())
  LIMIT 1
$$;

-- Tenant every row of this request must belong to. Defaults to official so the
-- official platform keeps working exactly as before.
CREATE OR REPLACE FUNCTION public.effective_request_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(public.current_request_tenant_id(), public.official_tenant_id())
$$;

-- Row-level tenant gate used by RESTRICTIVE policies.
CREATE OR REPLACE FUNCTION public.tenant_row_visible(_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(_tenant_id, public.official_tenant_id()) = public.effective_request_tenant_id()
      OR (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'))
$$;

-- ---------------------------------------------------------------------------
-- Policies for the tenant V2 tables (created without policies = locked).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tenants public read active" ON public.tenants;
CREATE POLICY "tenants public read active" ON public.tenants
  FOR SELECT USING (status = 'active');
DROP POLICY IF EXISTS "tenants admin manage" ON public.tenants;
CREATE POLICY "tenants admin manage" ON public.tenants
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "tenant_accounts read own" ON public.tenant_accounts;
CREATE POLICY "tenant_accounts read own" ON public.tenant_accounts
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "tenant_accounts admin manage" ON public.tenant_accounts;
CREATE POLICY "tenant_accounts admin manage" ON public.tenant_accounts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "tenant_session_contexts read own" ON public.tenant_session_contexts;
CREATE POLICY "tenant_session_contexts read own" ON public.tenant_session_contexts
  FOR SELECT TO authenticated USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "tenant_teacher_config public read" ON public.tenant_teacher_config;
CREATE POLICY "tenant_teacher_config public read" ON public.tenant_teacher_config
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "tenant_teacher_config admin manage" ON public.tenant_teacher_config;
CREATE POLICY "tenant_teacher_config admin manage" ON public.tenant_teacher_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- Public tenant resolution (branding only, no authorization value).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_tenant_public(_slug text)
RETURNS TABLE (
  tenant_id uuid, tenant_type text, slug text, name text, status text,
  logo_url text, brand_color text, description text, owner_teacher_id uuid
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT t.id, t.tenant_type, t.slug, COALESCE(tp.name, t.name), t.status,
         tp.logo_url, tp.brand_color, tp.description, tp.owner_teacher_id
  FROM public.tenants t
  LEFT JOIN public.teacher_platforms tp ON tp.tenant_id = t.id
  WHERE t.slug = lower(trim(COALESCE(_slug, 'official')))
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.resolve_tenant_public(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_tenant_public(text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Session activation: the ONLY way a session becomes authorized for a tenant.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_activate_session(_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sid uuid;
  v_tenant public.tenants;
  v_account public.tenant_accounts;
  v_profile_role text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  v_sid := public.current_auth_session_id();

  SELECT * INTO v_tenant FROM public.tenants
   WHERE slug = lower(trim(COALESCE(_slug, 'official'))) LIMIT 1;
  IF v_tenant.id IS NULL THEN RAISE EXCEPTION 'tenant_not_found'; END IF;
  IF v_tenant.status <> 'active' THEN RAISE EXCEPTION 'tenant_suspended'; END IF;

  SELECT * INTO v_account FROM public.tenant_accounts
   WHERE tenant_id = v_tenant.id AND auth_user_id = v_uid LIMIT 1;

  -- Official platform keeps its historical behaviour: any existing Modrek Plus
  -- profile is an official account. Teacher tenants NEVER auto-provision.
  IF v_account.id IS NULL AND v_tenant.tenant_type = 'official' THEN
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
REVOKE ALL ON FUNCTION public.tenant_activate_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_activate_session(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tenant_end_session()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  DELETE FROM public.tenant_session_contexts
   WHERE session_id = public.current_auth_session_id() AND auth_user_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.tenant_end_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_end_session() TO authenticated, service_role;

-- Explicit registration inside a teacher tenant (no auto-join anywhere).
CREATE OR REPLACE FUNCTION public.tenant_register_student(
  _slug text, _full_name text, _education_type text DEFAULT NULL,
  _stage text DEFAULT NULL, _grade text DEFAULT NULL, _section text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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

  RETURN public.tenant_activate_session(v_tenant.slug);
END;
$$;
REVOKE ALL ON FUNCTION public.tenant_register_student(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_register_student(text, text, text, text, text, text) TO authenticated, service_role;

-- Auto-join is dead: keep the old RPC callable but make it refuse.
CREATE OR REPLACE FUNCTION public.platform_join_as_student(_slug text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'auto_join_disabled';
END;
$$;

-- Link every teacher platform to a tenant row.
INSERT INTO public.tenants (tenant_type, slug, name, status, teacher_platform_id)
SELECT 'teacher', tp.slug, tp.name,
       CASE WHEN tp.status = 'active' THEN 'active' ELSE 'suspended' END, tp.id
FROM public.teacher_platforms tp
WHERE NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.teacher_platform_id = tp.id)
  AND NOT EXISTS (SELECT 1 FROM public.tenants t2 WHERE t2.slug = tp.slug);

UPDATE public.teacher_platforms tp
   SET tenant_id = t.id
  FROM public.tenants t
 WHERE t.teacher_platform_id = tp.id AND tp.tenant_id IS DISTINCT FROM t.id;

-- Platform owner gets a teacher tenant_account in his own tenant.
INSERT INTO public.tenant_accounts (tenant_id, auth_user_id, role, status, full_name)
SELECT t.id, tp.owner_teacher_id, 'teacher', 'active', p.full_name
FROM public.tenants t
JOIN public.teacher_platforms tp ON tp.id = t.teacher_platform_id
LEFT JOIN public.profiles p ON p.id = tp.owner_teacher_id
WHERE tp.owner_teacher_id IS NOT NULL
ON CONFLICT (tenant_id, auth_user_id) DO NOTHING;

-- Existing platform memberships become explicit tenant accounts (no new access).
INSERT INTO public.tenant_accounts (tenant_id, auth_user_id, role, status, full_name)
SELECT t.id, pm.user_id, 'student', COALESCE(pm.status, 'active'), p.full_name
FROM public.platform_memberships pm
JOIN public.tenants t ON t.teacher_platform_id = pm.platform_id
LEFT JOIN public.profiles p ON p.id = pm.user_id
ON CONFLICT (tenant_id, auth_user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.tenant_teacher_config_for_slug(_slug text)
RETURNS TABLE (tenant_id uuid, education_types text[], stages text[], grades text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT c.tenant_id, c.education_types, c.stages, c.grades
  FROM public.tenant_teacher_config c
  JOIN public.tenants t ON t.id = c.tenant_id
  WHERE t.slug = lower(trim(_slug)) AND t.status = 'active'
$$;
REVOKE ALL ON FUNCTION public.tenant_teacher_config_for_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_teacher_config_for_slug(text) TO anon, authenticated, service_role;
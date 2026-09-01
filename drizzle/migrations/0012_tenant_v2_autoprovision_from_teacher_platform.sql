-- Tenant V2: every teacher platform is backed by a real tenant row, its owner
-- teacher account, and a registration config. Keeps teacher_platforms as
-- branding/admin config only — never the authorization source.
CREATE OR REPLACE FUNCTION public.tenant_sync_from_teacher_platform()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE teacher_platform_id = NEW.id;

  IF v_tenant_id IS NULL THEN
    INSERT INTO public.tenants (tenant_type, slug, name, status, teacher_platform_id)
    VALUES ('teacher', NEW.slug, NEW.name, COALESCE(NEW.status, 'active'), NEW.id)
    ON CONFLICT (slug) DO UPDATE
      SET name = EXCLUDED.name,
          status = EXCLUDED.status,
          teacher_platform_id = EXCLUDED.teacher_platform_id,
          updated_at = now()
    RETURNING id INTO v_tenant_id;
  ELSE
    UPDATE public.tenants
       SET slug = NEW.slug,
           name = NEW.name,
           status = COALESCE(NEW.status, 'active'),
           updated_at = now()
     WHERE id = v_tenant_id;
  END IF;

  UPDATE public.teacher_platforms SET tenant_id = v_tenant_id
   WHERE id = NEW.id AND tenant_id IS DISTINCT FROM v_tenant_id;

  INSERT INTO public.tenant_accounts (tenant_id, auth_user_id, role, status, full_name)
  SELECT v_tenant_id, NEW.owner_teacher_id, 'teacher', 'active', p.full_name
  FROM public.profiles p
  WHERE p.id = NEW.owner_teacher_id
  ON CONFLICT (tenant_id, auth_user_id) DO UPDATE
    SET role = 'teacher', status = 'active', updated_at = now();

  INSERT INTO public.tenant_teacher_config (tenant_id, owner_teacher_id)
  VALUES (v_tenant_id, NEW.owner_teacher_id)
  ON CONFLICT (tenant_id) DO UPDATE
    SET owner_teacher_id = EXCLUDED.owner_teacher_id, updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_sync_from_teacher_platform_trg ON public.teacher_platforms;
CREATE TRIGGER tenant_sync_from_teacher_platform_trg
AFTER INSERT OR UPDATE OF slug, name, status, owner_teacher_id ON public.teacher_platforms
FOR EACH ROW EXECUTE FUNCTION public.tenant_sync_from_teacher_platform();

REVOKE ALL ON FUNCTION public.tenant_sync_from_teacher_platform() FROM PUBLIC;
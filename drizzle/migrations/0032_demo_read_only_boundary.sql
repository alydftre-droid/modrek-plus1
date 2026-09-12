CREATE OR REPLACE FUNCTION public.current_user_is_demo()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid; flagged boolean;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN RETURN false; END IF;
  SELECT COALESCE(p.is_demo, false) INTO flagged FROM public.profiles p WHERE p.id = uid;
  IF COALESCE(flagged, false) THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM public.demo_accounts d WHERE d.user_id = uid);
END; $$;

REVOKE ALL ON FUNCTION public.current_user_is_demo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_demo() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_not_demo()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.current_user_is_demo() THEN
    RAISE EXCEPTION 'DEMO_READ_ONLY: حساب المعاينة يعمل بوضع المشاهدة فقط ولا يمكنه إجراء تغييرات.' USING ERRCODE = '42501';
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.assert_not_demo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_not_demo() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.block_demo_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.current_user_is_demo() THEN
    RAISE EXCEPTION 'DEMO_READ_ONLY: حساب المعاينة يعمل بوضع المشاهدة فقط ولا يمكنه إجراء تغييرات. (%.% / %)',
      TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END; $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relispartition
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS zzz_demo_read_only ON public.%I', r.relname);
    EXECUTE format('CREATE TRIGGER zzz_demo_read_only BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.block_demo_write()', r.relname);
    EXECUTE format('DROP TRIGGER IF EXISTS zzz_demo_read_only_truncate ON public.%I', r.relname);
    EXECUTE format('CREATE TRIGGER zzz_demo_read_only_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.block_demo_write()', r.relname);
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.attach_demo_read_only_guard()
RETURNS event_trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    IF obj.command_tag = 'CREATE TABLE' AND obj.object_type = 'table' AND obj.schema_name = 'public' THEN
      BEGIN
        EXECUTE format('CREATE TRIGGER zzz_demo_read_only BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH STATEMENT EXECUTE FUNCTION public.block_demo_write()', obj.object_identity);
        EXECUTE format('CREATE TRIGGER zzz_demo_read_only_truncate BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION public.block_demo_write()', obj.object_identity);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END;
    END IF;
  END LOOP;
END; $$;

DROP EVENT TRIGGER IF EXISTS zzz_demo_read_only_autoattach;
CREATE EVENT TRIGGER zzz_demo_read_only_autoattach ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE') EXECUTE FUNCTION public.attach_demo_read_only_guard();
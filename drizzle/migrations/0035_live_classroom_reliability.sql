GRANT SELECT, INSERT ON public.live_session_messages TO authenticated;
GRANT ALL ON public.live_session_messages TO service_role;

DO $$
BEGIN
  IF to_regprocedure('public.block_demo_write()') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS zzz_demo_read_only ON public.live_session_messages';
    EXECUTE 'CREATE TRIGGER zzz_demo_read_only BEFORE INSERT OR UPDATE OR DELETE ON public.live_session_messages FOR EACH ROW EXECUTE FUNCTION public.block_demo_write()';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
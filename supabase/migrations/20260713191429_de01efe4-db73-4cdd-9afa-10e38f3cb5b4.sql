DO $$
DECLARE tbl record;
BEGIN
  FOR tbl IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'library%'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl.relname);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl.relname);
  END LOOP;
END $$;

-- Public-readable reference tables can also be read by anon (taxonomy).
GRANT SELECT ON public.library_stages TO anon;
GRANT SELECT ON public.library_tracks TO anon;
GRANT SELECT ON public.library_subjects TO anon;
GRANT SELECT ON public.library_grades TO anon;
GRANT SELECT ON public.library_sub_subjects TO anon;
GRANT SELECT ON public.library_sections TO anon;
GRANT SELECT ON public.library_access_tiers TO anon;

-- Force PostgREST to reload its schema cache immediately.
NOTIFY pgrst, 'reload schema';
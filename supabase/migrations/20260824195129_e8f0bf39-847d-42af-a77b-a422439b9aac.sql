DO $do$
DECLARE
  r record;
  v_in_names text;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           pg_get_function_arguments(p.oid) AS full_args,
           pg_get_function_identity_arguments(p.oid) AS ident_args,
           pg_get_function_result(p.oid) AS result,
           p.provolatile,
           p.proargnames,
           p.proargmodes
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
      AND pg_get_functiondef(p.oid) LIKE '%assert_admin_caller%_impl%'
      AND pg_get_function_result(p.oid) LIKE 'TABLE(%'
  LOOP
    -- input arguments only (skip OUT / TABLE columns)
    SELECT COALESCE(string_agg(quote_ident(nm), ', ' ORDER BY ord), '')
      INTO v_in_names
    FROM (
      SELECT n AS nm, i AS ord
      FROM unnest(r.proargnames) WITH ORDINALITY AS a(n, i)
      WHERE r.proargmodes IS NULL
         OR (r.proargmodes::text[])[i] IN ('i', 'b', 'v')
    ) s;

    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql %s SECURITY DEFINER SET search_path = public AS $wrap$ BEGIN PERFORM public.assert_admin_caller(); RETURN QUERY SELECT * FROM public.%I(%s); END; $wrap$',
      r.proname, r.full_args, r.result,
      CASE WHEN r.provolatile = 's' THEN 'STABLE' ELSE '' END,
      r.proname || '_impl', v_in_names);

    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.ident_args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', r.proname, r.ident_args);
  END LOOP;
END $do$;
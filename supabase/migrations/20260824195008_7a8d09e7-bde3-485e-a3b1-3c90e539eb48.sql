-- Shared admin gate
CREATE OR REPLACE FUNCTION public.assert_admin_caller()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_admin_caller() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_admin_caller() TO authenticated, service_role;

DO $do$
DECLARE
  r record;
  v_args text;
  v_call text;
  v_ret text;
  v_new text;
  v_body text;
  v_vol text;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           pg_get_function_arguments(p.oid) AS full_args,
           pg_get_function_result(p.oid) AS result,
           p.provolatile,
           COALESCE(array_to_string(ARRAY(
             SELECT quote_ident(n) FROM unnest(p.proargnames) AS n
           ), ', '), '') AS arg_names,
           pg_get_function_identity_arguments(p.oid) AS ident_args,
           p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.prosecdef
      AND p.proname IN (
        'admin_set_withdrawal_schedule','audit_test_student_visibility',
        'get_developer_student_progress_monthly','get_developer_student_video_progress',
        'get_developer_teacher_courses','get_developer_teacher_group_details',
        'get_developer_teacher_logs','get_developer_teacher_overview',
        'get_developer_teacher_profile','get_developer_teacher_students',
        'get_developer_teacher_students_by_grade','get_developer_teacher_subs_by_grade',
        'get_developer_teacher_wallet_monthly'
      )
  LOOP
    v_args := r.full_args;
    v_call := r.arg_names;
    v_ret  := r.result;
    v_vol  := CASE WHEN r.provolatile = 's' THEN 'STABLE' ELSE '' END;

    -- 1) move the original implementation aside and lock it down
    EXECUTE format('ALTER FUNCTION %s RENAME TO %I', r.sig, r.proname || '_impl');

    -- 2) recreate the public name as a guarded wrapper
    IF v_ret ILIKE 'TABLE(%' OR v_ret ILIKE 'SETOF%' THEN
      v_body := format(
        'BEGIN PERFORM public.assert_admin_caller(); RETURN QUERY SELECT * FROM public.%I(%s); END;',
        r.proname || '_impl', v_call);
    ELSIF v_ret ILIKE 'void' THEN
      v_body := format(
        'BEGIN PERFORM public.assert_admin_caller(); PERFORM public.%I(%s); END;',
        r.proname || '_impl', v_call);
    ELSE
      v_body := format(
        'BEGIN PERFORM public.assert_admin_caller(); RETURN public.%I(%s); END;',
        r.proname || '_impl', v_call);
    END IF;

    v_new := format(
      'CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql %s SECURITY DEFINER SET search_path = public AS $wrap$ %s $wrap$',
      r.proname, v_args, v_ret, v_vol, v_body);
    EXECUTE v_new;

    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
                   r.proname, r.ident_args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role',
                   r.proname, r.ident_args);
  END LOOP;

  -- lock down every relocated implementation
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.proname LIKE '%\_impl'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $do$;

-- record_admin_wallet_deposit_request is an internal bookkeeping helper called
-- by admin RPCs / triggers; it must not be callable from the app at all.
DO $do2$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.proname = 'record_admin_wallet_deposit_request'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $do2$;

-- audit_test_student_visibility is used by the developer test-students page,
-- so it keeps its guarded wrapper (created above) for authenticated admins.
DO $mig$
DECLARE
  r record;
  d text;
  n text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.prosrc ILIKE '%@gmail.com%'
  LOOP
    d := r.def;
    d := replace(d, $$OR v_email IN ('alyedaft@gmail.com', 'aliana200713@gmail.com')$$, 'OR false');
    d := replace(d, $$OR lower(COALESCE(auth.jwt() ->> 'email', '')) IN ('alyedaft@gmail.com', 'aliana200713@gmail.com')$$, 'OR false');
    d := replace(d, $$OR COALESCE(auth.jwt() ->> 'email', '') = 'alyedaft@gmail.com'$$, 'OR false');
    d := replace(d, $$AND v_actor_email <> 'alyedaft@gmail.com'$$, 'AND true');
    d := replace(d, $$(SELECT lower(u.email) FROM auth.users u WHERE u.id = auth.uid()) = 'alyedaft@gmail.com'$$, 'false');
    d := replace(d, $$AND lower(coalesce(p.email, '')) = 'alyedaft@gmail.com'$$, 'AND false');
    d := replace(d, $$jsonb_build_object('email', 'alyedaft@gmail.com')$$, $$jsonb_build_object('role', 'service_role')$$);
    d := replace(d, $$WHERE p.email = 'alyedaft@gmail.com'$$, $$WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin'::public.app_role)$$);

    IF d ILIKE '%@gmail.com%' THEN
      RAISE EXCEPTION 'unhandled hardcoded email remains in %', r.proname;
    END IF;

    IF d <> r.def THEN
      EXECUTE d;
    END IF;
  END LOOP;

  SELECT string_agg(p.proname, ', ') INTO n
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.prosrc ILIKE '%@gmail.com%';

  IF n IS NOT NULL THEN
    RAISE EXCEPTION 'email allowlist still present in: %', n;
  END IF;
END
$mig$;
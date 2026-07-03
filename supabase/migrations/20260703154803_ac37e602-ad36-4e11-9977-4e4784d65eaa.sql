CREATE OR REPLACE FUNCTION public.resolve_developer_test_student(
  _target_user_id uuid DEFAULT NULL,
  _test_account_code text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  email text,
  is_test_account boolean,
  test_account_code text,
  full_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.email,
    p.is_test_account,
    p.test_account_code,
    p.full_name
  FROM public.profiles p
  WHERE p.is_test_account = true
    AND (
      (_target_user_id IS NOT NULL AND p.id = _target_user_id)
      OR (_target_user_id IS NULL AND _test_account_code IS NOT NULL AND p.test_account_code = _test_account_code)
    )
  ORDER BY p.test_account_code ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_developer_test_student(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_developer_test_student(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_developer_test_student(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
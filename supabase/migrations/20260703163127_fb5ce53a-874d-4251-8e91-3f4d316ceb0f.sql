-- Repair developer test student auth identities created by the original seed.
-- The initial direct seed inserted auth.users rows but did not create auth.identities rows,
-- which makes the Auth API unable to locate/sign in those accounts reliably.
WITH test_profiles AS (
  SELECT
    p.id,
    p.email,
    p.full_name,
    p.test_account_code
  FROM public.profiles p
  WHERE p.is_test_account = true
    AND p.test_account_code IS NOT NULL
    AND p.email LIKE '%@test.modrek.local'
), repaired_users AS (
  UPDATE auth.users u
  SET
    email_confirmed_at = COALESCE(u.email_confirmed_at, now()),
    raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    raw_user_meta_data = COALESCE(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
      'full_name', tp.full_name,
      'is_test_account', true,
      'test_account_code', tp.test_account_code
    ),
    updated_at = now()
  FROM test_profiles tp
  WHERE u.id = tp.id
  RETURNING u.id, u.email, tp.full_name, tp.test_account_code
)
INSERT INTO auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  ru.id::text,
  ru.id,
  jsonb_build_object(
    'sub', ru.id::text,
    'email', ru.email,
    'email_verified', true,
    'full_name', ru.full_name,
    'is_test_account', true,
    'test_account_code', ru.test_account_code
  ),
  'email',
  NULL,
  now(),
  now()
FROM repaired_users ru
WHERE NOT EXISTS (
  SELECT 1
  FROM auth.identities i
  WHERE i.user_id = ru.id
    AND i.provider = 'email'
);

-- Ensure every existing test profile still has its student role and wallet.
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'student'::public.app_role
FROM public.profiles p
WHERE p.is_test_account = true
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.wallets (user_id, balance)
SELECT p.id, 10000
FROM public.profiles p
WHERE p.is_test_account = true
ON CONFLICT (user_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
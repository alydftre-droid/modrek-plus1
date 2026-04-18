
-- Recreate admin user in auth.users with the same ID
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  aud,
  role,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token
)
VALUES (
  'deb11e5f-5eb6-4971-a636-aa2017a31465',
  '00000000-0000-0000-0000-000000000000',
  'alyedaft@gmail.com',
  crypt('301165Aa#', gen_salt('bf')),
  now(),
  'authenticated',
  'authenticated',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name": "علي محمد علي", "role": "admin"}'::jsonb,
  now(),
  now(),
  '',
  ''
)
ON CONFLICT (id) DO UPDATE SET
  encrypted_password = crypt('301165Aa#', gen_salt('bf')),
  email_confirmed_at = now(),
  updated_at = now();

-- Also ensure identity record exists
INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  provider,
  identity_data,
  last_sign_in_at,
  created_at,
  updated_at
)
VALUES (
  'deb11e5f-5eb6-4971-a636-aa2017a31465',
  'deb11e5f-5eb6-4971-a636-aa2017a31465',
  'alyedaft@gmail.com',
  'email',
  '{"sub": "deb11e5f-5eb6-4971-a636-aa2017a31465", "email": "alyedaft@gmail.com", "email_verified": true}'::jsonb,
  now(),
  now(),
  now()
)
ON CONFLICT (provider, provider_id) DO NOTHING;

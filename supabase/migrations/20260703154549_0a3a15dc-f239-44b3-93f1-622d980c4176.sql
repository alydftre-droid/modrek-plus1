ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS test_account_code text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_test_account_code_key
  ON public.profiles (test_account_code)
  WHERE test_account_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_is_test_account_idx
  ON public.profiles (is_test_account)
  WHERE is_test_account = true;

NOTIFY pgrst, 'reload schema';
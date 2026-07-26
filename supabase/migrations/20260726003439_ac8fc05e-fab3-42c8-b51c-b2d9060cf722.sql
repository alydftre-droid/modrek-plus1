
ALTER TABLE public.teacher_requests
  ADD COLUMN IF NOT EXISTS terms_version text,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS teacher_terms_version text,
  ADD COLUMN IF NOT EXISTS teacher_terms_accepted_at timestamptz;

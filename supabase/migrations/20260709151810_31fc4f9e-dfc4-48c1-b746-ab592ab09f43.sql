ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS target_section text,
  ADD COLUMN IF NOT EXISTS target_education_type text;
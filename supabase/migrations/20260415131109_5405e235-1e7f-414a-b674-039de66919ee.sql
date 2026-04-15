ALTER TABLE public.teacher_assignments
ADD COLUMN IF NOT EXISTS education_type text DEFAULT NULL;
-- Add education_type to teacher_requests (for Arabic teachers: عام or أزهر)
ALTER TABLE public.teacher_requests
ADD COLUMN IF NOT EXISTS education_type text DEFAULT NULL;

-- Add education_type to content (عام, أزهر, or both)
ALTER TABLE public.content
ADD COLUMN IF NOT EXISTS education_type text DEFAULT NULL;

-- Add education_type to content_groups (عام, أزهر, or both)
ALTER TABLE public.content_groups
ADD COLUMN IF NOT EXISTS education_type text DEFAULT NULL;
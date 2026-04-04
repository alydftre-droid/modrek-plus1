
-- Create system_terms table
CREATE TABLE public.system_terms (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stage text NOT NULL,
  grade text NOT NULL,
  current_term text NOT NULL DEFAULT 'term1',
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE(stage, grade)
);

-- Enable RLS
ALTER TABLE public.system_terms ENABLE ROW LEVEL SECURITY;

-- Everyone can read term settings
CREATE POLICY "Anyone can read term settings"
  ON public.system_terms FOR SELECT
  USING (true);

-- Only admins can modify
CREATE POLICY "Admins can manage term settings"
  ON public.system_terms FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add term column to content
ALTER TABLE public.content ADD COLUMN IF NOT EXISTS term text NOT NULL DEFAULT 'term1';

-- Add term column to content_groups
ALTER TABLE public.content_groups ADD COLUMN IF NOT EXISTS term text NOT NULL DEFAULT 'term1';

-- Add term column to exams
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS term text NOT NULL DEFAULT 'term1';

-- Add term column to ai_lessons
ALTER TABLE public.ai_lessons ADD COLUMN IF NOT EXISTS term text NOT NULL DEFAULT 'term1';

-- Seed default term settings for all stages/grades
INSERT INTO public.system_terms (stage, grade, current_term) VALUES
  ('preparatory', '1', 'term1'),
  ('preparatory', '2', 'term1'),
  ('preparatory', '3', 'term1'),
  ('secondary', '1', 'term1'),
  ('secondary', '2', 'term1'),
  ('secondary', '3', 'term1')
ON CONFLICT (stage, grade) DO NOTHING;

-- Add platform_settings key for maintenance
INSERT INTO public.platform_settings (key, value) VALUES
  ('maintenance_mode', 'false'),
  ('maintenance_message', 'المنصة تحت الصيانة حالياً، يرجى المحاولة لاحقاً')
ON CONFLICT DO NOTHING;

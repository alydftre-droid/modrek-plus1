
-- 1) Fix Azhar teacher "عينيو" - mark as أزهر in both tables
UPDATE public.teacher_requests
SET education_type = 'أزهر'
WHERE full_name = 'عينيو' AND assigned_category = 'المواد العربية';

UPDATE public.teacher_assignments
SET education_type = 'أزهر'
WHERE teacher_id = '225113b1-f462-4df0-a63c-cf048ca5210b';

-- 2) Backfill missing education_type as 'عام' for all approved teachers without one
UPDATE public.teacher_requests
SET education_type = 'عام'
WHERE status = 'approved' AND (education_type IS NULL OR education_type = '');

-- 3) Sync teacher_assignments.education_type from teacher_requests where missing
UPDATE public.teacher_assignments ta
SET education_type = tr.education_type
FROM public.teacher_requests tr
WHERE ta.teacher_id = tr.user_id
  AND tr.status = 'approved'
  AND (ta.education_type IS NULL OR ta.education_type = '')
  AND tr.education_type IS NOT NULL;

-- 4) Add Mathematics subject for Literary section (secondary stage) - all 3 grades
INSERT INTO public.subjects (name, stage, grade, section, category, is_active)
VALUES
  ('الرياضيات', 'secondary', 'first', 'literary', 'math', true),
  ('الرياضيات', 'secondary', 'second', 'literary', 'math', true),
  ('الرياضيات', 'secondary', 'third', 'literary', 'math', true)
ON CONFLICT DO NOTHING;

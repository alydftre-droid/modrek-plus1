
-- Deactivate phys/chem/bio for first secondary
UPDATE public.subjects
SET is_active = false, updated_at = now()
WHERE stage = 'secondary'
  AND grade = 'first'
  AND section = 'scientific'
  AND name IN ('الفيزياء', 'الكيمياء', 'الأحياء');

-- Move الرياضيات from science → math (first secondary scientific)
UPDATE public.subjects
SET category = 'math', updated_at = now()
WHERE stage = 'secondary'
  AND grade = 'first'
  AND section = 'scientific'
  AND name = 'الرياضيات'
  AND category = 'science';

-- Insert new integrated science subject (if not already present)
INSERT INTO public.subjects (name, category, stage, grade, section, description, is_active)
SELECT 'العلوم المتكاملة', 'science', 'secondary', 'first', 'scientific',
       'مادة العلوم المتكاملة للصف الأول الثانوي', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.subjects
  WHERE stage = 'secondary' AND grade = 'first' AND section = 'scientific'
    AND name = 'العلوم المتكاملة'
);

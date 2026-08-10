-- 1) Add التاريخ as a real subject for secondary / second / scientific
INSERT INTO public.subjects (name, description, stage, grade, section, category, is_active)
SELECT 'التاريخ', 'مادة التاريخ للصف الثاني الثانوي - الشعبة العلمية', 'secondary', 'second', 'scientific', 'science', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.subjects
  WHERE name = 'التاريخ' AND stage = 'secondary' AND grade = 'second'
    AND section = 'scientific' AND category = 'science'
);

-- 2) Soft-disable الأحياء ONLY for this exact configuration
UPDATE public.subjects
SET is_active = false
WHERE name = 'الأحياء'
  AND stage = 'secondary'
  AND grade = 'second'
  AND section = 'scientific'
  AND category = 'science';
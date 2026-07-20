UPDATE public.subject_default_prices category_price
SET updated_at = now()
WHERE category_price.shared_subject_id IS NULL
  AND category_price.category = 'arabic'
  AND category_price.subject_name IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.subject_default_prices subject_price
    WHERE subject_price.shared_subject_id IS NULL
      AND subject_price.category = category_price.category
      AND subject_price.stage = category_price.stage
      AND subject_price.grade = category_price.grade
      AND subject_price.education_type = category_price.education_type
      AND subject_price.subject_name IS NOT NULL
      AND subject_price.updated_at >= category_price.updated_at
  );
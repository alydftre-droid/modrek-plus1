CREATE OR REPLACE FUNCTION public.apply_subject_default_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage text;
  v_grade text;
  v_section text;
  v_category text;
  v_name text;
  v_edu text;
  v_price numeric;
  v_teacher_id uuid;
BEGIN
  SELECT stage, grade, section, category, name
    INTO v_stage, v_grade, v_section, v_category, v_name
  FROM public.subjects
  WHERE id = NEW.subject_id;

  IF v_stage IS NULL THEN
    RETURN NEW;
  END IF;

  v_teacher_id := COALESCE(NEW.teacher_id, NEW.created_by);
  v_edu := NULLIF(NEW.education_type, '');

  IF v_edu IS NULL AND v_teacher_id IS NOT NULL AND v_category IN ('arabic', 'religious', 'sharia') THEN
    SELECT ta.education_type
      INTO v_edu
    FROM public.teacher_assignments ta
    WHERE ta.teacher_id = v_teacher_id
      AND ta.stage = v_stage
      AND ta.grade = v_grade
      AND ta.education_type IS NOT NULL
      AND (
        ta.category = v_category
        OR (v_category = 'arabic' AND ta.category IN ('arabic', 'المواد العربية', 'لغة عربية', 'اللغة العربية'))
        OR (v_category IN ('religious', 'sharia') AND ta.category IN ('religious', 'sharia', 'المواد الشرعية'))
      )
    ORDER BY ta.updated_at DESC NULLS LAST, ta.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_edu IS NULL AND v_category IN ('religious', 'sharia') THEN
    v_edu := 'أزهر';
  END IF;

  IF v_edu IS NOT NULL THEN
    NEW.education_type := v_edu;
  END IF;

  v_edu := COALESCE(v_edu, 'both');

  SELECT price INTO v_price
  FROM public.subject_default_prices
  WHERE stage = v_stage
    AND grade = v_grade
    AND (
      category = v_category
      OR (category IN ('religious', 'sharia') AND v_category IN ('religious', 'sharia'))
    )
    AND (section IS NULL OR COALESCE(section, '') = COALESCE(v_section, ''))
    AND (
      education_type = v_edu
      OR education_type = 'both'
      OR (v_edu = 'both' AND education_type IN ('عام', 'أزهر'))
    )
    AND (subject_name IS NULL OR subject_name = v_name)
  ORDER BY
    (subject_name = v_name) DESC NULLS LAST,
    (section IS NOT NULL AND COALESCE(section, '') = COALESCE(v_section, '')) DESC,
    (education_type = v_edu) DESC,
    updated_at DESC
  LIMIT 1;

  IF v_price IS NOT NULL THEN
    NEW.price := v_price;
    NEW.price_approved := true;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_subject_default_price() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_subject_default_price() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
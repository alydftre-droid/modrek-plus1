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
  v_shared_subject_id uuid;
  v_edu text;
  v_price numeric;
  v_teacher_id uuid;
BEGIN
  SELECT stage, grade, section, category, name, shared_subject_id
    INTO v_stage, v_grade, v_section, v_category, v_name, v_shared_subject_id
  FROM public.subjects
  WHERE id = NEW.subject_id;

  IF v_stage IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.price_requires_education_split(v_category, v_name) THEN
    v_shared_subject_id := COALESCE(v_shared_subject_id, public.ensure_shared_subject(v_category, v_name));

    SELECT sdp.price INTO v_price
    FROM public.subject_default_prices sdp
    WHERE sdp.stage = v_stage
      AND sdp.grade = v_grade
      AND sdp.shared_subject_id = v_shared_subject_id
    ORDER BY sdp.updated_at DESC
    LIMIT 1;

    IF v_price IS NOT NULL THEN
      NEW.price := v_price;
      NEW.price_approved := true;
    END IF;

    NEW.education_type := COALESCE(NULLIF(NEW.education_type, ''), 'both');
    RETURN NEW;
  END IF;

  v_teacher_id := COALESCE(NEW.teacher_id, NEW.created_by);
  v_edu := NULLIF(NEW.education_type, '');

  IF v_edu IS NULL AND v_teacher_id IS NOT NULL THEN
    SELECT ta.education_type
      INTO v_edu
    FROM public.teacher_assignments ta
    WHERE ta.teacher_id = v_teacher_id
      AND (
        ta.stage = v_stage
        OR (v_stage = 'secondary' AND ta.stage IN ('secondary', 'ثانوي', 'الثانوي', 'المرحلة الثانوية'))
        OR (v_stage = 'preparatory' AND ta.stage IN ('preparatory', 'إعدادي', 'اعدادي', 'الإعدادي', 'المرحلة الإعدادية'))
      )
      AND (
        ta.grade = v_grade
        OR (v_grade = 'first' AND ta.grade IN ('first', '1', 'الأول', 'اول', 'الصف الأول', 'الصف الأول الثانوي', 'الصف الأول الإعدادي'))
        OR (v_grade = 'second' AND ta.grade IN ('second', '2', 'الثاني', 'ثاني', 'الصف الثاني', 'الصف الثاني الثانوي', 'الصف الثاني الإعدادي'))
        OR (v_grade = 'third' AND ta.grade IN ('third', '3', 'الثالث', 'ثالث', 'الصف الثالث', 'الصف الثالث الثانوي', 'الصف الثالث الإعدادي'))
      )
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

  SELECT price INTO v_price
  FROM public.subject_default_prices
  WHERE shared_subject_id IS NULL
    AND stage = v_stage
    AND grade = v_grade
    AND (
      category = v_category
      OR (category IN ('religious', 'sharia') AND v_category IN ('religious', 'sharia'))
    )
    AND (section IS NULL OR COALESCE(section, '') = COALESCE(v_section, ''))
    AND education_type = v_edu
    AND (subject_name IS NULL OR subject_name = v_name)
  ORDER BY
    updated_at DESC,
    (subject_name = v_name) DESC NULLS LAST
  LIMIT 1;

  IF v_price IS NOT NULL THEN
    NEW.price := v_price;
    NEW.price_approved := true;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_subject_default_price() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_subject_default_price() TO authenticated, service_role;
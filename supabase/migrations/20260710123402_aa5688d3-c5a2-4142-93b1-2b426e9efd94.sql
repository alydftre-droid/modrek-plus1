CREATE OR REPLACE FUNCTION public.price_requires_education_split(p_category text, p_subject_name text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_category IS NULL AND p_subject_name IS NULL THEN false
    WHEN public.normalize_price_scope_text(p_category) IN ('arabic','religious','sharia') THEN true
    WHEN public.normalize_price_scope_text(p_category) LIKE '%عربي%' THEN true
    WHEN public.normalize_price_scope_text(p_category) LIKE '%شرعي%' THEN true
    WHEN public.normalize_price_scope_text(p_subject_name) LIKE '%عربي%' THEN true
    WHEN public.normalize_price_scope_text(p_subject_name) LIKE '%شرعي%' THEN true
    WHEN public.normalize_price_scope_text(p_subject_name) IN (
      'اللغه العربيه','النحو','الصرف','البلاغه','الادب','الادب والنصوص','النصوص','القراءه','الاملاء','التعبير',
      'القران الكريم','القران','التفسير','الحديث','التوحيد','السيره','الفقه','الفقه الشافعي','الميراث'
    ) THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.price_requires_education_split(p_category text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.price_requires_education_split(p_category, NULL);
$$;

CREATE OR REPLACE FUNCTION public.resolve_shared_subject_key(p_category text, p_subject_name text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  c text := public.normalize_price_scope_text(p_category);
  n text := public.normalize_price_scope_text(p_subject_name);
BEGIN
  IF public.price_requires_education_split(p_category, p_subject_name) THEN
    RETURN NULL;
  END IF;

  IF c IN ('math', 'mathematics') OR n LIKE '%رياض%' THEN
    RETURN 'math';
  END IF;

  IF c = 'english' OR n LIKE '%انجليز%' OR n LIKE '%english%' THEN
    RETURN 'english';
  END IF;

  IF c = 'french' OR n LIKE '%فرنس%' OR n LIKE '%french%' THEN
    RETURN 'french';
  END IF;

  IF c = 'integrated_science' OR n LIKE '%متكام%' THEN
    RETURN 'integrated_science';
  END IF;

  IF c IN ('studies', 'social') THEN
    RETURN 'social_studies';
  END IF;

  IF c IN ('literary', 'history_geo', 'history', 'geography') THEN
    IF n LIKE '%تاريخ%' THEN
      RETURN 'history';
    END IF;
    IF n LIKE '%جغراف%' THEN
      RETURN 'geography';
    END IF;
    IF n LIKE '%فلسف%' THEN
      RETURN 'philosophy';
    END IF;
    IF n LIKE '%نفس%' THEN
      RETURN 'psychology';
    END IF;
    RETURN 'literary';
  END IF;

  IF c IN ('science', 'scientific') THEN
    IF n LIKE '%فيز%' THEN
      RETURN 'physics';
    END IF;
    IF n LIKE '%كيمي%' THEN
      RETURN 'chemistry';
    END IF;
    IF n LIKE '%احياء%' OR n LIKE '%احيا%' OR n LIKE '%بيولوج%' THEN
      RETURN 'biology';
    END IF;
    IF n LIKE '%جيولوج%' THEN
      RETURN 'geology';
    END IF;
    RETURN 'science';
  END IF;

  IF c <> '' THEN
    RETURN c || CASE WHEN n <> '' THEN ':' || n ELSE '' END;
  END IF;

  RETURN NULL;
END;
$$;

UPDATE public.subjects s
SET shared_subject_id = NULL
WHERE public.price_requires_education_split(s.category, s.name)
  AND s.shared_subject_id IS NOT NULL;

UPDATE public.subject_default_prices sdp
SET shared_subject_id = NULL,
    education_type = CASE WHEN education_type = 'both' THEN 'أزهر' ELSE education_type END,
    updated_at = now()
WHERE public.price_requires_education_split(sdp.category, sdp.subject_name)
  AND sdp.shared_subject_id IS NOT NULL;

DELETE FROM public.shared_subjects ss
WHERE NOT EXISTS (
    SELECT 1 FROM public.subjects s WHERE s.shared_subject_id = ss.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.subject_default_prices sdp WHERE sdp.shared_subject_id = ss.id
  );

CREATE OR REPLACE FUNCTION public.apply_subject_shared_subject_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.price_requires_education_split(NEW.category, NEW.name) THEN
    NEW.shared_subject_id := NULL;
  ELSE
    NEW.shared_subject_id := public.ensure_shared_subject(NEW.category, NEW.name);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_unified_shared_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.price_requires_education_split(NEW.category, NEW.subject_name) THEN
    NEW.shared_subject_id := NULL;

    IF NEW.education_type IS NULL OR trim(NEW.education_type) = '' OR NEW.education_type = 'both' THEN
      RAISE EXCEPTION 'Arabic and Sharia prices must be scoped to عام or أزهر';
    END IF;
  ELSE
    NEW.shared_subject_id := COALESCE(NEW.shared_subject_id, public.ensure_shared_subject(NEW.category, NEW.subject_name));
    NEW.education_type := 'both';
    NEW.section := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_subject_default_price(
  p_education_type text,
  p_stage text,
  p_grade text,
  p_category text,
  p_subject_name text,
  p_price numeric
)
RETURNS TABLE(
  id uuid,
  education_type text,
  stage text,
  grade text,
  section text,
  category text,
  subject_name text,
  price numeric,
  updated_at timestamp with time zone,
  applied_groups integer,
  shared_subject_id uuid,
  shared_subject_key text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_education_type text;
  v_subject_name text;
  v_category text := trim(p_category);
  v_is_admin boolean;
  v_shared_subject_id uuid;
BEGIN
  v_is_admin := COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false)
    OR COALESCE(auth.jwt() ->> 'email', '') = 'alyedaft@gmail.com';

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can manage subject prices';
  END IF;

  IF p_stage IS NULL OR trim(p_stage) = '' OR p_grade IS NULL OR trim(p_grade) = '' OR v_category = '' THEN
    RAISE EXCEPTION 'Missing required price scope';
  END IF;

  IF p_price IS NULL OR p_price < 0 THEN
    RAISE EXCEPTION 'Invalid price';
  END IF;

  v_subject_name := NULLIF(trim(COALESCE(p_subject_name, '')), '');

  IF public.price_requires_education_split(v_category, v_subject_name) THEN
    v_education_type := p_education_type;

    IF v_education_type IS NULL OR trim(v_education_type) = '' OR v_education_type = 'both' THEN
      RAISE EXCEPTION 'Arabic and Sharia prices must be scoped to عام or أزهر';
    END IF;

    SELECT sdp.id INTO v_id
    FROM public.subject_default_prices sdp
    WHERE sdp.shared_subject_id IS NULL
      AND sdp.education_type = v_education_type
      AND sdp.stage = p_stage
      AND sdp.grade = p_grade
      AND sdp.section IS NULL
      AND sdp.category = v_category
      AND sdp.subject_name IS NOT DISTINCT FROM v_subject_name
    LIMIT 1;

    IF v_id IS NULL THEN
      INSERT INTO public.subject_default_prices (
        education_type, stage, grade, section, category, subject_name, price, created_by, shared_subject_id
      ) VALUES (
        v_education_type, p_stage, p_grade, NULL, v_category, v_subject_name, p_price, auth.uid(), NULL
      )
      RETURNING subject_default_prices.id INTO v_id;
    ELSE
      UPDATE public.subject_default_prices sdp
         SET price = p_price,
             updated_at = now(),
             created_by = COALESCE(sdp.created_by, auth.uid())
       WHERE sdp.id = v_id;
    END IF;
  ELSE
    v_education_type := 'both';
    v_shared_subject_id := public.ensure_shared_subject(v_category, v_subject_name);

    SELECT sdp.id INTO v_id
    FROM public.subject_default_prices sdp
    WHERE sdp.stage = p_stage
      AND sdp.grade = p_grade
      AND sdp.shared_subject_id = v_shared_subject_id
    LIMIT 1;

    IF v_id IS NULL THEN
      INSERT INTO public.subject_default_prices (
        education_type, stage, grade, section, category, subject_name, price, created_by, shared_subject_id
      ) VALUES (
        v_education_type, p_stage, p_grade, NULL, v_category, v_subject_name, p_price, auth.uid(), v_shared_subject_id
      )
      RETURNING subject_default_prices.id INTO v_id;
    ELSE
      UPDATE public.subject_default_prices sdp
         SET price = p_price,
             education_type = 'both',
             section = NULL,
             shared_subject_id = v_shared_subject_id,
             updated_at = now(),
             created_by = COALESCE(sdp.created_by, auth.uid())
       WHERE sdp.id = v_id;
    END IF;
  END IF;

  RETURN QUERY
  SELECT sdp.id, sdp.education_type, sdp.stage, sdp.grade, sdp.section,
         sdp.category, sdp.subject_name, sdp.price, sdp.updated_at, 0::int,
         sdp.shared_subject_id, ss.key
  FROM public.subject_default_prices sdp
  LEFT JOIN public.shared_subjects ss ON ss.id = sdp.shared_subject_id
  WHERE sdp.id = v_id;
END;
$$;

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
    (subject_name = v_name) DESC NULLS LAST,
    updated_at DESC
  LIMIT 1;

  IF v_price IS NOT NULL THEN
    NEW.price := v_price;
    NEW.price_approved := true;
  END IF;

  RETURN NEW;
END;
$$;
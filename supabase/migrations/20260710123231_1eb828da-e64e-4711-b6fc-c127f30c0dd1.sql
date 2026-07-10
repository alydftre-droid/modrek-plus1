-- Root fix: shared subject identity for unified subscription pricing

CREATE TABLE IF NOT EXISTS public.shared_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  category text NOT NULL,
  display_name text NOT NULL,
  is_education_split boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.shared_subjects TO anon, authenticated;
GRANT ALL ON public.shared_subjects TO service_role;

ALTER TABLE public.shared_subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read shared subjects" ON public.shared_subjects;
CREATE POLICY "Anyone can read shared subjects"
ON public.shared_subjects
FOR SELECT
USING (true);

DROP TRIGGER IF EXISTS trg_shared_subjects_updated ON public.shared_subjects;
CREATE TRIGGER trg_shared_subjects_updated
BEFORE UPDATE ON public.shared_subjects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS shared_subject_id uuid REFERENCES public.shared_subjects(id);

ALTER TABLE public.subject_default_prices
  ADD COLUMN IF NOT EXISTS shared_subject_id uuid REFERENCES public.shared_subjects(id);

CREATE OR REPLACE FUNCTION public.normalize_price_scope_text(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT trim(
    regexp_replace(
      replace(replace(replace(replace(replace(lower(coalesce(p_value, '')), 'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا'), 'ى', 'ي'), 'ة', 'ه'),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.price_requires_education_split(p_category text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_category IS NULL THEN false
    WHEN public.normalize_price_scope_text(p_category) IN ('arabic','religious','sharia') THEN true
    WHEN public.normalize_price_scope_text(p_category) LIKE '%عربي%' THEN true
    WHEN public.normalize_price_scope_text(p_category) LIKE '%شرعي%' THEN true
    ELSE false
  END;
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
  IF public.price_requires_education_split(c) THEN
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

CREATE OR REPLACE FUNCTION public.shared_subject_display_name(p_key text, p_category text DEFAULT NULL, p_subject_name text DEFAULT NULL)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_key
    WHEN 'math' THEN 'الرياضيات'
    WHEN 'english' THEN 'اللغة الإنجليزية'
    WHEN 'french' THEN 'اللغة الفرنسية'
    WHEN 'integrated_science' THEN 'العلوم المتكاملة'
    WHEN 'social_studies' THEN 'الدراسات الاجتماعية'
    WHEN 'history' THEN 'التاريخ'
    WHEN 'geography' THEN 'الجغرافيا'
    WHEN 'philosophy' THEN 'الفلسفة'
    WHEN 'psychology' THEN 'علم النفس'
    WHEN 'physics' THEN 'الفيزياء'
    WHEN 'chemistry' THEN 'الكيمياء'
    WHEN 'biology' THEN 'الأحياء'
    WHEN 'geology' THEN 'الجيولوجيا'
    WHEN 'science' THEN 'العلوم'
    ELSE COALESCE(NULLIF(trim(p_subject_name), ''), NULLIF(trim(p_category), ''), p_key)
  END;
$$;

CREATE OR REPLACE FUNCTION public.shared_subject_category(p_key text, p_category text DEFAULT NULL)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_key
    WHEN 'math' THEN 'math'
    WHEN 'english' THEN 'english'
    WHEN 'french' THEN 'french'
    WHEN 'integrated_science' THEN 'integrated_science'
    WHEN 'social_studies' THEN 'studies'
    WHEN 'history' THEN 'literary'
    WHEN 'geography' THEN 'literary'
    WHEN 'philosophy' THEN 'literary'
    WHEN 'psychology' THEN 'literary'
    WHEN 'physics' THEN 'science'
    WHEN 'chemistry' THEN 'science'
    WHEN 'biology' THEN 'science'
    WHEN 'geology' THEN 'science'
    WHEN 'science' THEN 'science'
    ELSE COALESCE(NULLIF(trim(p_category), ''), p_key)
  END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_shared_subject(p_category text, p_subject_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_id uuid;
BEGIN
  v_key := public.resolve_shared_subject_key(p_category, p_subject_name);

  IF v_key IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.shared_subjects (key, category, display_name, is_education_split)
  VALUES (
    v_key,
    public.shared_subject_category(v_key, p_category),
    public.shared_subject_display_name(v_key, p_category, p_subject_name),
    false
  )
  ON CONFLICT (key) DO UPDATE
    SET category = EXCLUDED.category,
        display_name = COALESCE(NULLIF(public.shared_subjects.display_name, ''), EXCLUDED.display_name),
        is_education_split = false,
        updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_shared_subject(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_shared_subject(text, text) TO service_role;

INSERT INTO public.shared_subjects (key, category, display_name, is_education_split)
SELECT DISTINCT
  public.resolve_shared_subject_key(s.category, s.name) AS key,
  public.shared_subject_category(public.resolve_shared_subject_key(s.category, s.name), s.category) AS category,
  public.shared_subject_display_name(public.resolve_shared_subject_key(s.category, s.name), s.category, s.name) AS display_name,
  false
FROM public.subjects s
WHERE NOT public.price_requires_education_split(s.category)
  AND public.resolve_shared_subject_key(s.category, s.name) IS NOT NULL
ON CONFLICT (key) DO UPDATE
  SET category = EXCLUDED.category,
      display_name = EXCLUDED.display_name,
      is_education_split = false,
      updated_at = now();

UPDATE public.subjects s
SET shared_subject_id = ss.id
FROM public.shared_subjects ss
WHERE NOT public.price_requires_education_split(s.category)
  AND ss.key = public.resolve_shared_subject_key(s.category, s.name)
  AND s.shared_subject_id IS DISTINCT FROM ss.id;

UPDATE public.subjects s
SET shared_subject_id = NULL
WHERE public.price_requires_education_split(s.category)
  AND s.shared_subject_id IS NOT NULL;

UPDATE public.subject_default_prices sdp
SET shared_subject_id = public.ensure_shared_subject(sdp.category, sdp.subject_name)
WHERE NOT public.price_requires_education_split(sdp.category);

UPDATE public.subject_default_prices sdp
SET shared_subject_id = NULL
WHERE public.price_requires_education_split(sdp.category);

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY stage, grade, shared_subject_id
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
         ) AS rn
  FROM public.subject_default_prices
  WHERE shared_subject_id IS NOT NULL
)
DELETE FROM public.subject_default_prices sdp
USING ranked r
WHERE sdp.id = r.id
  AND r.rn > 1;

UPDATE public.subject_default_prices sdp
SET education_type = 'both',
    section = NULL,
    category = ss.category,
    subject_name = CASE
      WHEN ss.key IN ('math', 'english', 'french', 'integrated_science', 'social_studies', 'science') THEN NULL
      ELSE ss.display_name
    END,
    updated_at = now()
FROM public.shared_subjects ss
WHERE sdp.shared_subject_id = ss.id
  AND (
    sdp.education_type IS DISTINCT FROM 'both'
    OR sdp.section IS NOT NULL
    OR sdp.category IS DISTINCT FROM ss.category
  );

DROP INDEX IF EXISTS public.subject_default_prices_unique;
DROP INDEX IF EXISTS public.subject_default_prices_shared_unique;
DROP INDEX IF EXISTS public.subject_default_prices_split_unique;

CREATE UNIQUE INDEX subject_default_prices_shared_unique
  ON public.subject_default_prices (stage, grade, shared_subject_id)
  WHERE shared_subject_id IS NOT NULL;

CREATE UNIQUE INDEX subject_default_prices_split_unique
  ON public.subject_default_prices (education_type, stage, grade, section, category, subject_name) NULLS NOT DISTINCT
  WHERE shared_subject_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_subjects_shared_subject_id
  ON public.subjects (shared_subject_id)
  WHERE shared_subject_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.apply_subject_shared_subject_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.price_requires_education_split(NEW.category) THEN
    NEW.shared_subject_id := NULL;
  ELSE
    NEW.shared_subject_id := public.ensure_shared_subject(NEW.category, NEW.name);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_subject_shared_subject_id ON public.subjects;
CREATE TRIGGER trg_apply_subject_shared_subject_id
BEFORE INSERT OR UPDATE OF category, name
ON public.subjects
FOR EACH ROW
EXECUTE FUNCTION public.apply_subject_shared_subject_id();

CREATE OR REPLACE FUNCTION public.enforce_unified_shared_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.price_requires_education_split(NEW.category) THEN
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

DROP TRIGGER IF EXISTS trg_enforce_unified_shared_price ON public.subject_default_prices;
CREATE TRIGGER trg_enforce_unified_shared_price
BEFORE INSERT OR UPDATE OF education_type, section, category, subject_name, shared_subject_id
ON public.subject_default_prices
FOR EACH ROW
EXECUTE FUNCTION public.enforce_unified_shared_price();

DROP FUNCTION IF EXISTS public.get_subject_default_prices(text, text, text);
CREATE FUNCTION public.get_subject_default_prices(
  p_education_type text,
  p_stage text,
  p_grade text
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
  shared_subject_id uuid,
  shared_subject_key text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sdp.id,
    sdp.education_type,
    sdp.stage,
    sdp.grade,
    sdp.section,
    sdp.category,
    sdp.subject_name,
    sdp.price,
    sdp.updated_at,
    sdp.shared_subject_id,
    ss.key AS shared_subject_key
  FROM public.subject_default_prices sdp
  LEFT JOIN public.shared_subjects ss ON ss.id = sdp.shared_subject_id
  WHERE sdp.stage = p_stage
    AND sdp.grade = p_grade
    AND (
      sdp.shared_subject_id IS NOT NULL
      OR sdp.education_type IN (p_education_type, 'both')
    )
  ORDER BY sdp.updated_at DESC;
$$;

DROP FUNCTION IF EXISTS public.set_subject_default_price(text, text, text, text, text, numeric);
CREATE FUNCTION public.set_subject_default_price(
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

  IF public.price_requires_education_split(v_category) THEN
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

  IF NOT public.price_requires_education_split(v_category) THEN
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

DROP TRIGGER IF EXISTS trg_apply_subject_default_price ON public.content_groups;
CREATE TRIGGER trg_apply_subject_default_price
BEFORE INSERT OR UPDATE OF subject_id, education_type
ON public.content_groups
FOR EACH ROW
EXECUTE FUNCTION public.apply_subject_default_price();

REVOKE ALL ON FUNCTION public.get_subject_default_prices(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_subject_default_price(text, text, text, text, text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_subject_default_price() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_subject_shared_subject_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_subject_default_prices(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_subject_default_price(text, text, text, text, text, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_subject_default_price() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_subject_shared_subject_id() TO authenticated, service_role;
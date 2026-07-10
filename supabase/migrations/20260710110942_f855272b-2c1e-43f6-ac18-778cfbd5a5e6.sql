
-- 1) Helper: does this category require education_type separation? (Arabic + Sharia only)
CREATE OR REPLACE FUNCTION public.price_requires_education_split(p_category text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_category IS NULL THEN false
    WHEN lower(trim(p_category)) IN ('arabic','religious','sharia') THEN true
    WHEN p_category ILIKE '%عربي%' THEN true
    WHEN p_category ILIKE '%شرعي%' THEN true
    ELSE false
  END;
$$;

-- 2) Merge any legacy per-education-type rows for shared categories into a single 'both' row.
--    Keep the most recently updated price. Preserve created_at from earliest row.
WITH shared AS (
  SELECT *
  FROM public.subject_default_prices
  WHERE NOT public.price_requires_education_split(category)
    AND education_type <> 'both'
),
grouped AS (
  SELECT
    stage, grade, section, category, subject_name,
    (ARRAY_AGG(price ORDER BY updated_at DESC))[1]      AS latest_price,
    MIN(created_at)                                     AS earliest_created,
    MAX(updated_at)                                     AS latest_updated,
    (ARRAY_AGG(created_by ORDER BY updated_at DESC))[1] AS latest_created_by
  FROM shared
  GROUP BY stage, grade, section, category, subject_name
),
del AS (
  DELETE FROM public.subject_default_prices sdp
  USING shared s
  WHERE sdp.id = s.id
  RETURNING sdp.id
)
INSERT INTO public.subject_default_prices
  (education_type, stage, grade, section, category, subject_name, price, created_at, updated_at, created_by)
SELECT 'both', g.stage, g.grade, g.section, g.category, g.subject_name,
       g.latest_price, g.earliest_created, g.latest_updated, g.latest_created_by
FROM grouped g
ON CONFLICT (education_type, stage, grade, section, category, subject_name) DO UPDATE
SET price = EXCLUDED.price,
    updated_at = EXCLUDED.updated_at,
    created_by = COALESCE(public.subject_default_prices.created_by, EXCLUDED.created_by);

-- 3) DB-level guarantee: on every insert/update, force education_type='both' for shared categories.
--    Arabic/Sharia keep whatever caller passed (they legitimately differ per education type).
CREATE OR REPLACE FUNCTION public.enforce_unified_shared_price()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.price_requires_education_split(NEW.category) THEN
    NEW.education_type := 'both';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_unified_shared_price ON public.subject_default_prices;
CREATE TRIGGER trg_enforce_unified_shared_price
BEFORE INSERT OR UPDATE OF education_type, category
ON public.subject_default_prices
FOR EACH ROW
EXECUTE FUNCTION public.enforce_unified_shared_price();

-- 4) Harden the RPC too, so shared categories always go to the 'both' bucket regardless of what the client sends.
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
  applied_groups integer
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
BEGIN
  v_is_admin := COALESCE(has_role(auth.uid(), 'admin'::app_role), false)
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

  -- Unified pricing: shared subjects always land on 'both'; only Arabic/Sharia keep education split.
  IF public.price_requires_education_split(v_category) THEN
    v_education_type := p_education_type;
  ELSE
    v_education_type := 'both';
  END IF;

  SELECT sdp.id INTO v_id
  FROM public.subject_default_prices sdp
  WHERE sdp.education_type = v_education_type
    AND sdp.stage = p_stage
    AND sdp.grade = p_grade
    AND sdp.section IS NULL
    AND sdp.category = v_category
    AND sdp.subject_name IS NOT DISTINCT FROM v_subject_name
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.subject_default_prices (
      education_type, stage, grade, section, category, subject_name, price, created_by
    ) VALUES (
      v_education_type, p_stage, p_grade, NULL, v_category, v_subject_name, p_price, auth.uid()
    )
    RETURNING subject_default_prices.id INTO v_id;
  ELSE
    UPDATE public.subject_default_prices sdp
       SET price = p_price,
           updated_at = now(),
           created_by = COALESCE(sdp.created_by, auth.uid())
     WHERE sdp.id = v_id;
  END IF;

  RETURN QUERY
  SELECT sdp.id, sdp.education_type, sdp.stage, sdp.grade, sdp.section,
         sdp.category, sdp.subject_name, sdp.price, sdp.updated_at, 0::int
  FROM public.subject_default_prices sdp
  WHERE sdp.id = v_id;
END;
$$;

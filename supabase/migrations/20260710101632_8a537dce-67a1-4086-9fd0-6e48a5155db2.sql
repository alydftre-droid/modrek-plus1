-- Stop developer price changes from rewriting prices on already-created groups.
-- Existing group prices are historical purchase prices and must remain unchanged.
CREATE OR REPLACE FUNCTION public.apply_default_price_to_existing_groups(
  p_education_type text,
  p_stage text,
  p_grade text,
  p_section text,
  p_category text,
  p_subject_name text,
  p_price numeric
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  v_is_admin := COALESCE(has_role(auth.uid(), 'admin'::app_role), false)
    OR COALESCE(auth.jwt() ->> 'email', '') = 'alyedaft@gmail.com';

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can apply default prices';
  END IF;

  -- Historical groups keep their own saved price. The new official price
  -- is applied only by trg_apply_subject_default_price when a group is inserted.
  RETURN 0;
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
RETURNS TABLE (
  id uuid,
  education_type text,
  stage text,
  grade text,
  section text,
  category text,
  subject_name text,
  price numeric,
  updated_at timestamptz,
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

  IF lower(v_category) IN ('arabic', 'religious', 'sharia') OR v_category ILIKE '%عربي%' OR v_category ILIKE '%شرعي%' THEN
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
      education_type,
      stage,
      grade,
      section,
      category,
      subject_name,
      price,
      created_by
    ) VALUES (
      v_education_type,
      p_stage,
      p_grade,
      NULL,
      v_category,
      v_subject_name,
      p_price,
      auth.uid()
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
    0::integer AS applied_groups
  FROM public.subject_default_prices sdp
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
  v_edu text;
  v_price numeric;
BEGIN
  SELECT stage, grade, section, category, name
    INTO v_stage, v_grade, v_section, v_category, v_name
  FROM public.subjects
  WHERE id = NEW.subject_id;

  IF v_stage IS NULL THEN
    RETURN NEW;
  END IF;

  v_edu := COALESCE(NULLIF(NEW.education_type, ''), 'both');

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

DROP TRIGGER IF EXISTS trg_apply_subject_default_price ON public.content_groups;
CREATE TRIGGER trg_apply_subject_default_price
BEFORE INSERT OR UPDATE OF subject_id, education_type ON public.content_groups
FOR EACH ROW EXECUTE FUNCTION public.apply_subject_default_price();

REVOKE ALL ON FUNCTION public.set_subject_default_price(text, text, text, text, text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_default_price_to_existing_groups(text, text, text, text, text, text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_subject_default_price() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_subject_default_price(text, text, text, text, text, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_default_price_to_existing_groups(text, text, text, text, text, text, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_subject_default_price() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
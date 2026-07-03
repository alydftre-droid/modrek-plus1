REVOKE INSERT, UPDATE, DELETE ON public.subject_default_prices FROM anon;
GRANT SELECT ON public.subject_default_prices TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subject_default_prices TO authenticated;
GRANT ALL ON public.subject_default_prices TO service_role;

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
  v_count integer;
  v_is_admin boolean;
BEGIN
  v_is_admin := COALESCE(has_role(auth.uid(), 'admin'::app_role), false)
    OR COALESCE(auth.jwt() ->> 'email', '') = 'alyedaft@gmail.com';

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can apply default prices';
  END IF;

  UPDATE public.content_groups cg
     SET price = p_price, price_approved = true
    FROM public.subjects s
   WHERE cg.subject_id = s.id
     AND s.stage = p_stage
     AND s.grade = p_grade
     AND (
       s.category = p_category
       OR (p_category IN ('religious', 'sharia') AND s.category IN ('religious', 'sharia'))
     )
     AND (p_section IS NULL OR p_section = '' OR COALESCE(s.section,'') = COALESCE(p_section,''))
     AND (p_subject_name IS NULL OR p_subject_name = '' OR s.name = p_subject_name)
     AND (
       p_education_type = 'both'
       OR cg.education_type = p_education_type
       OR cg.education_type IS NULL
     );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
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
  v_applied integer := 0;
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

  SELECT public.apply_default_price_to_existing_groups(
    v_education_type,
    p_stage,
    p_grade,
    NULL,
    v_category,
    v_subject_name,
    p_price
  ) INTO v_applied;

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
    v_applied
  FROM public.subject_default_prices sdp
  WHERE sdp.id = v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_subject_default_price(text, text, text, text, text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_default_price_to_existing_groups(text, text, text, text, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_subject_default_price(text, text, text, text, text, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_default_price_to_existing_groups(text, text, text, text, text, text, numeric) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
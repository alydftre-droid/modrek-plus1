
-- Add optional subject_name to allow per-subject pricing (e.g. الفيزياء vs الكيمياء both share category='science')
ALTER TABLE public.subject_default_prices ADD COLUMN IF NOT EXISTS subject_name text;

-- Replace unique index to include subject_name
DROP INDEX IF EXISTS public.subject_default_prices_unique;
CREATE UNIQUE INDEX subject_default_prices_unique
  ON public.subject_default_prices (
    education_type, stage, grade,
    COALESCE(section,''), category, COALESCE(subject_name,'')
  );

-- Update trigger to prefer a name-specific match, falling back to a category-wide one
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

  v_edu := COALESCE(NEW.education_type, '');

  SELECT price INTO v_price
  FROM public.subject_default_prices
  WHERE stage = v_stage
    AND grade = v_grade
    AND category = v_category
    AND COALESCE(section,'') = COALESCE(v_section,'')
    AND (
      education_type = v_edu
      OR (v_edu = '' AND education_type IN ('عام','أزهر'))
    )
    AND (subject_name IS NULL OR subject_name = v_name)
  ORDER BY (subject_name = v_name) DESC NULLS LAST, (education_type = v_edu) DESC
  LIMIT 1;

  IF v_price IS NOT NULL THEN
    NEW.price := v_price;
    NEW.price_approved := true;
  END IF;

  RETURN NEW;
END;
$$;

-- Helper RPC to bulk-update prices on existing content_groups for a given pricing scope
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
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can apply default prices';
  END IF;

  UPDATE public.content_groups cg
     SET price = p_price, price_approved = true
    FROM public.subjects s
   WHERE cg.subject_id = s.id
     AND s.stage = p_stage
     AND s.grade = p_grade
     AND s.category = p_category
     AND COALESCE(s.section,'') = COALESCE(p_section,'')
     AND (p_subject_name IS NULL OR p_subject_name = '' OR s.name = p_subject_name)
     AND (
       cg.education_type = p_education_type
       OR (cg.education_type IS NULL)
     );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


-- Default subject prices set by the developer/admin
CREATE TABLE IF NOT EXISTS public.subject_default_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  education_type text NOT NULL,
  stage text NOT NULL,
  grade text NOT NULL,
  section text,
  category text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

-- Unique per scope (NULL section treated distinctly via coalesce)
CREATE UNIQUE INDEX IF NOT EXISTS subject_default_prices_unique
  ON public.subject_default_prices (education_type, stage, grade, COALESCE(section,''), category);

ALTER TABLE public.subject_default_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read subject prices" ON public.subject_default_prices;
CREATE POLICY "Anyone can read subject prices" ON public.subject_default_prices FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage subject prices" ON public.subject_default_prices;
CREATE POLICY "Admins manage subject prices" ON public.subject_default_prices
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_subject_default_prices_updated ON public.subject_default_prices;
CREATE TRIGGER trg_subject_default_prices_updated
BEFORE UPDATE ON public.subject_default_prices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to force the default price on content_groups when one exists.
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
  v_edu text;
  v_price numeric;
BEGIN
  SELECT stage, grade, section, category
    INTO v_stage, v_grade, v_section, v_category
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
  ORDER BY (education_type = v_edu) DESC
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

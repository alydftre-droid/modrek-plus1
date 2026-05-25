CREATE OR REPLACE FUNCTION public.bundle_category_matches_subject(
  _category_key text,
  _subject_category text,
  _subject_name text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $function$
DECLARE
  v_key text := lower(coalesce(trim(_category_key), ''));
  v_cat text := lower(coalesce(trim(_subject_category), ''));
  v_name text := coalesce(trim(_subject_name), '');
BEGIN
  IF v_key = '' THEN
    RETURN false;
  END IF;

  CASE v_key
    WHEN 'arabic' THEN
      RETURN v_cat = 'arabic';
    WHEN 'religious' THEN
      RETURN v_cat IN ('religious', 'sharia');
    WHEN 'english' THEN
      RETURN v_cat = 'english';
    WHEN 'math' THEN
      RETURN v_cat = 'math' OR v_name LIKE '%رياضيات%';
    WHEN 'science' THEN
      RETURN v_cat IN ('science', 'integrated_science') AND (v_name LIKE '%علوم%' OR v_name LIKE '%العلوم%');
    WHEN 'integrated_science' THEN
      RETURN v_cat IN ('integrated_science', 'science') AND v_name LIKE '%العلوم المتكاملة%';
    WHEN 'social' THEN
      RETURN v_cat IN ('social', 'studies') AND v_name LIKE '%دراسات%';
    WHEN 'history_geo' THEN
      RETURN v_cat = 'literary' AND (v_name LIKE '%تاريخ%' OR v_name LIKE '%جغرافيا%');
    WHEN 'history' THEN
      RETURN v_cat = 'literary' AND v_name LIKE '%تاريخ%';
    WHEN 'geography' THEN
      RETURN v_cat = 'literary' AND v_name LIKE '%جغرافيا%';
    WHEN 'scientific' THEN
      RETURN (
        v_cat IN ('scientific', 'science', 'math')
        AND (
          v_name LIKE '%فيزياء%'
          OR v_name LIKE '%كيمياء%'
          OR v_name LIKE '%أحياء%'
          OR v_name LIKE '%احياء%'
          OR v_name LIKE '%رياضيات%'
        )
      );
    WHEN 'physics' THEN
      RETURN v_cat IN ('scientific', 'science') AND v_name LIKE '%فيزياء%';
    WHEN 'chemistry' THEN
      RETURN v_cat IN ('scientific', 'science') AND v_name LIKE '%كيمياء%';
    WHEN 'biology' THEN
      RETURN v_cat IN ('scientific', 'science') AND (v_name LIKE '%أحياء%' OR v_name LIKE '%احياء%');
    ELSE
      RETURN false;
  END CASE;
END;
$function$;
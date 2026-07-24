CREATE OR REPLACE FUNCTION public.normalize_content_section(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  WITH cleaned AS (
    SELECT lower(
      replace(
        replace(
          replace(
            replace(
              regexp_replace(btrim(COALESCE(_value, '')), '[ًٌٍَُِّْـ]', '', 'g'),
              'أ', 'ا'
            ),
            'إ', 'ا'
          ),
          'آ', 'ا'
        ),
        'ى', 'ي'
      )
    ) AS v
  )
  SELECT CASE
    WHEN v = '' THEN NULL
    WHEN v IN ('both', 'all', 'كل', 'الكل', 'الجميع', 'علمي + ادبي', 'علمي+ادبي') THEN NULL
    WHEN v IN (
      'scientific', 'science', 'sci', 'scientific section', 'science section',
      'علمي', 'علمى', 'علم', 'العلمي', 'القسم العلمي', 'الشعبة العلمية', 'الشعبه العلميه',
      'شعبة علمي', 'شعبه علمي', 'علمي علوم', 'علمى علوم', 'علوم', 'علمي رياضة', 'علمى رياضة', 'رياضة', 'رياضيات'
    ) THEN 'scientific'
    WHEN v IN (
      'literary', 'arts', 'art', 'adabi', 'adaby',
      'ادبي', 'ادبى', 'الادبي', 'القسم الادبي', 'الشعبة الادبية', 'الشعبه الادبيه',
      'شعبة ادبي', 'شعبه ادبي'
    ) THEN 'literary'
    WHEN v LIKE '%علمي%' OR v LIKE '%علوم%' OR v LIKE '%رياض%' THEN 'scientific'
    WHEN v LIKE '%ادبي%' OR v LIKE '%literary%' OR v LIKE '%arts%' OR v LIKE '%adab%' THEN 'literary'
    ELSE v
  END
  FROM cleaned
$function$;

REVOKE EXECUTE ON FUNCTION public.normalize_content_section(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_content_section(text) TO authenticated, service_role, supabase_read_only_user;
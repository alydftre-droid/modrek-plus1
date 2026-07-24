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
            regexp_replace(btrim(COALESCE(_value, '')), '[ًٌٍَُِّْـ]', '', 'g'),
            'أ', 'ا'
          ),
          'إ', 'ا'
        ),
        'آ', 'ا'
      )
    ) AS v
  )
  SELECT CASE
    WHEN v = '' THEN NULL
    WHEN v IN ('both', 'all', 'كل', 'الكل', 'الجميع', 'علمي + ادبي', 'علمي+ادبي') THEN NULL
    WHEN v IN ('scientific', 'science', 'sci', 'علمي', 'علمى', 'علمي علوم', 'علمى علوم', 'علوم', 'علمي رياضة', 'علمى رياضة', 'رياضة', 'رياضيات') THEN 'scientific'
    WHEN v IN ('literary', 'ادبي', 'ادبى', 'الادبي') THEN 'literary'
    ELSE v
  END
  FROM cleaned
$function$;

NOTIFY pgrst, 'reload schema';
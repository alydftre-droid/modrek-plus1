CREATE OR REPLACE FUNCTION public.normalize_content_section(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT lower(
      regexp_replace(
        replace(replace(replace(replace(trim(coalesce(_value, '')), 'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا'), 'ى', 'ي'),
        '\s+',
        ' ',
        'g'
      )
    ) AS v
  )
  SELECT CASE
    WHEN v = '' OR v IN ('both', 'all', 'كل', 'الكل', 'الجميع', 'عام وازهر', 'ازهر وعام') THEN NULL
    WHEN v IN (
      'scientific', 'science', 'sci', 'scientific section', 'science section',
      'علمي', 'علم', 'العلمي', 'القسم العلمي', 'الشعبه العلميه', 'الشعبة العلمية',
      'شعبة علمي', 'شعبه علمي', 'علمي علوم', 'علوم', 'علمي رياضه', 'رياضه', 'رياضيات'
    ) THEN 'scientific'
    WHEN v IN (
      'literary', 'arts', 'art', 'adabi', 'adaby',
      'ادبي', 'الادبي', 'القسم الادبي', 'الشعبه الادبيه', 'الشعبة الادبية',
      'شعبة ادبي', 'شعبه ادبي'
    ) THEN 'literary'
    WHEN v LIKE '%علمي%' OR v LIKE '%علوم%' OR v LIKE '%رياض%' OR v LIKE '%scient%' OR v LIKE '%science%' THEN 'scientific'
    WHEN v LIKE '%ادبي%' OR v LIKE '%literary%' OR v LIKE '%arts%' OR v LIKE '%adab%' THEN 'literary'
    ELSE trim(_value)
  END
  FROM normalized;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_content_section(text) TO anon, authenticated, service_role;

UPDATE public.content
SET target_section = public.normalize_content_section(target_section)
WHERE target_section IS NOT NULL
  AND target_section IS DISTINCT FROM public.normalize_content_section(target_section);

UPDATE public.exams
SET target_section = public.normalize_content_section(target_section)
WHERE target_section IS NOT NULL
  AND target_section IS DISTINCT FROM public.normalize_content_section(target_section);

UPDATE public.subjects
SET section = public.normalize_content_section(section)
WHERE section IS NOT NULL
  AND public.normalize_content_section(section) IN ('scientific', 'literary')
  AND section IS DISTINCT FROM public.normalize_content_section(section);

UPDATE public.teacher_assignments
SET section = public.normalize_content_section(section)
WHERE section IS NOT NULL
  AND public.normalize_content_section(section) IN ('scientific', 'literary')
  AND section IS DISTINCT FROM public.normalize_content_section(section);

NOTIFY pgrst, 'reload schema';
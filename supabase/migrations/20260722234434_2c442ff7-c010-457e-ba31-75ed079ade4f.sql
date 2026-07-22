CREATE OR REPLACE FUNCTION public.smart_exam_text_score(_answer text, _model text, _max_score numeric)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  a text := public.normalize_exam_grading_text(_answer);
  m text := public.normalize_exam_grading_text(_model);
  a_meaningful text[] := ARRAY[]::text[];
  m_meaningful text[] := ARRAY[]::text[];
  a_numbers text[] := ARRAY[]::text[];
  m_numbers text[] := ARRAY[]::text[];
  common_count integer := 0;
  a_count integer := 0;
  m_count integer := 0;
  answer_coverage numeric := 0;
  model_coverage numeric := 0;
  combined numeric := 0;
  word text;
  a_words text[];
  m_words text[];
BEGIN
  IF coalesce(_max_score, 0) <= 0 OR a = '' OR m = '' THEN RETURN 0; END IF;
  IF public.is_exam_non_answer(_answer) THEN RETURN 0; END IF;

  IF public.normalize_exam_semantic_token(a) = public.normalize_exam_semantic_token(m) THEN
    RETURN round(_max_score::numeric, 2);
  END IF;

  a_meaningful := public.exam_meaningful_tokens(_answer);
  m_meaningful := public.exam_meaningful_tokens(_model);
  a_count := cardinality(a_meaningful);
  m_count := cardinality(m_meaningful);

  a_words := regexp_split_to_array(a, '\s+');
  m_words := regexp_split_to_array(m, '\s+');
  FOREACH word IN ARRAY a_words LOOP
    IF word ~ '^[0-9]+$' THEN a_numbers := array_append(a_numbers, word); END IF;
  END LOOP;
  FOREACH word IN ARRAY m_words LOOP
    IF word ~ '^[0-9]+$' THEN m_numbers := array_append(m_numbers, word); END IF;
  END LOOP;

  IF m_count = 0 OR a_count = 0 THEN RETURN 0; END IF;
  IF a = m THEN RETURN round(_max_score::numeric, 2); END IF;

  IF m_count <= 4 AND (position(a in m) > 0 OR position(m in a) > 0) THEN
    IF cardinality(m_numbers) > 0 AND cardinality(a_numbers) > 0 AND NOT (a_numbers && m_numbers) THEN
      RETURN 0;
    END IF;
    RETURN round(_max_score::numeric, 2);
  END IF;

  FOREACH word IN ARRAY a_meaningful LOOP
    IF word = ANY(m_meaningful) THEN common_count := common_count + 1; END IF;
  END LOOP;
  IF common_count = 0 THEN RETURN 0; END IF;

  answer_coverage := common_count::numeric / a_count::numeric;
  model_coverage := common_count::numeric / m_count::numeric;

  -- A single shared generic word (e.g. a name title) is not evidence of a correct answer.
  IF common_count <= 1 AND model_coverage < 0.35 THEN RETURN 0; END IF;
  IF model_coverage < 0.18 AND answer_coverage < 0.75 THEN RETURN 0; END IF;

  -- Fair fallback: prioritize covered required elements, then reward concise answers
  -- that list mostly correct items. This makes 4/5 or 5/6 list answers score close
  -- to their true proportion without rewarding unrelated keyword stuffing.
  combined := least(1, greatest(model_coverage, (model_coverage * 0.75) + (least(answer_coverage, 1) * 0.25)));

  IF cardinality(m_numbers) > 0 AND cardinality(a_numbers) > 0 AND NOT (a_numbers && m_numbers) THEN
    combined := least(combined, 0.20);
  END IF;

  RETURN round((CASE
    WHEN combined >= 0.88 AND model_coverage >= 0.75 THEN _max_score
    WHEN combined >= 0.72 THEN _max_score * 0.80
    WHEN combined >= 0.52 THEN _max_score * 0.60
    WHEN combined >= 0.32 THEN _max_score * 0.40
    WHEN combined >= 0.20 THEN _max_score * 0.20
    ELSE 0 END)::numeric, 2);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.smart_exam_text_score(text, text, numeric) TO public, anon, authenticated, service_role;
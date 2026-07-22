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
      RETURN round((_max_score * 0.25)::numeric, 2);
    END IF;
    RETURN round(_max_score::numeric, 2);
  END IF;

  FOREACH word IN ARRAY a_meaningful LOOP
    IF word = ANY(m_meaningful) THEN common_count := common_count + 1; END IF;
  END LOOP;
  IF common_count = 0 THEN RETURN 0; END IF;

  answer_coverage := common_count::numeric / a_count::numeric;
  model_coverage := common_count::numeric / m_count::numeric;

  -- Fair fallback: model coverage is the main score driver. This prevents an
  -- unrelated answer with one shared word from receiving a large mark, while
  -- still giving near-proportional credit for missing-list items.
  combined := least(1, (model_coverage * 0.90) + (least(answer_coverage, 1) * 0.10));

  IF cardinality(m_numbers) > 0 AND cardinality(a_numbers) > 0 AND NOT (a_numbers && m_numbers) THEN
    combined := least(combined, 0.30);
  END IF;

  RETURN round((CASE
    WHEN combined >= 0.92 AND model_coverage >= 0.85 THEN _max_score
    WHEN combined >= 0.75 THEN _max_score * 0.80
    WHEN combined >= 0.55 THEN _max_score * 0.60
    WHEN combined >= 0.35 THEN _max_score * 0.40
    WHEN combined >= 0.20 THEN _max_score * 0.20
    ELSE 0 END)::numeric, 2);
END;
$function$;

CREATE OR REPLACE FUNCTION public.exam_text_feedback(_answer text, _model text, _score numeric, _max_score numeric)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.exam_text_feedback(_answer, _model, _score, _max_score, 'current_model_answer');
END;
$function$;

CREATE OR REPLACE FUNCTION public.exam_text_feedback(_answer text, _model text, _score numeric, _max_score numeric, _alignment_source text DEFAULT 'current_model_answer'::text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  ratio numeric := CASE WHEN COALESCE(_max_score, 0) > 0 THEN COALESCE(_score, 0) / COALESCE(_max_score, 0) ELSE 0 END;
  model_preview text := left(COALESCE(trim(_model), ''), 220);
BEGIN
  IF COALESCE(_max_score, 0) <= 0 THEN
    RETURN 'لا توجد درجة مخصصة لهذا السؤال.';
  END IF;
  IF public.is_exam_non_answer(_answer) THEN
    IF COALESCE(trim(_answer), '') = '' THEN
      RETURN 'لم تقدم إجابة لهذا السؤال، لذلك لم تُحتسب درجة. حاول في المرة القادمة كتابة أي عناصر تتذكرها حتى تحصل على درجة جزئية عند وجود جزء صحيح.';
    END IF;
    RETURN 'إجابتك لا تحتوي على معلومات قابلة للتصحيح لهذا السؤال، لذلك الدرجة صفر. راجع المطلوب في السؤال ثم اكتب العناصر المرتبطة به مباشرة.';
  END IF;
  IF COALESCE(trim(_model), '') = '' THEN
    RETURN 'لا توجد إجابة نموذجية محفوظة لهذا السؤال؛ لذلك يحتاج إلى مراجعة المعلم حتى لا تُظلم في الدرجة.';
  END IF;
  IF ratio >= 0.999 THEN
    RETURN '✅ إجابتك صحيحة بالمعنى. لقد وصلت للفكرة المطلوبة وغطّت إجابتك عناصر الإجابة النموذجية الأساسية: «' || model_preview || '». استمر بنفس الدقة في صياغة إجاباتك.';
  END IF;
  IF ratio >= 0.55 THEN
    RETURN '🟡 إجابتك جزئية وقريبة من المطلوب. ذكرت بعض العناصر الصحيحة، لكن الإجابة النموذجية تتضمن عناصر أوضح/أكمل مثل: «' || model_preview || '». أضف العناصر الناقصة في المرة القادمة لتحصل على الدرجة الكاملة.';
  END IF;
  IF ratio > 0 THEN
    RETURN '🟡 حصلت على جزء من الدرجة لأن إجابتك تضمنت نقطة صحيحة، لكنها لم تغطِّ أغلب المطلوب. راجع الإجابة النموذجية: «' || model_preview || '»، وركّز على كتابة العناصر الأساسية مباشرة دون كلام بعيد عن السؤال.';
  END IF;
  RETURN '❌ إجابتك غير كافية لهذا السؤال. الإجابة الصحيحة تدور حول: «' || model_preview || '». يبدو أن إجابتك لم تتناول العناصر المطلوبة، لذلك راجع الفكرة ثم أعد التدريب عليها.';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.smart_exam_text_score(text, text, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exam_text_feedback(text, text, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exam_text_feedback(text, text, numeric, numeric, text) TO authenticated, service_role;
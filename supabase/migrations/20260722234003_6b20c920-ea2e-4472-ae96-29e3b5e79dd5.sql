DROP FUNCTION IF EXISTS public.exam_text_feedback(text, text, numeric, numeric, text);

CREATE OR REPLACE FUNCTION public.exam_text_feedback(_answer text, _model text, _score numeric, _max_score numeric, _alignment_source text)
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

GRANT EXECUTE ON FUNCTION public.exam_text_feedback(text, text, numeric, numeric, text) TO authenticated, service_role;
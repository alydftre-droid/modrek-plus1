CREATE OR REPLACE FUNCTION public.normalize_exam_semantic_token(_word text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  w text := public.normalize_exam_grading_text(_word);
BEGIN
  w := regexp_replace(w, '^(و|ف|ب|ك|ل)(?=[[:alpha:]ء-ي]{3,})', '');
  w := regexp_replace(w, '^ال(?=[[:alpha:]ء-ي]{3,})', '');
  w := regexp_replace(w, '(ه|ها|هم|نا|ات|ين|ون)$', '');

  IF w IN ('salah','salat','sala','prayer','pray','صلاه','صلا','صلوات','مصلي','يصلي') THEN RETURN 'صلاه'; END IF;
  IF w IN ('wudu','wudhu','wodo','ablution','tahara','purity','وضوء','وضو','توضا','يتوضا','طهاره','طاهر','حدث','الحدث','نجاسه','نجس') THEN RETURN 'طهاره'; END IF;
  IF w IN ('ghusl','ghosl','غسل','اغتسال') THEN RETURN 'غسل'; END IF;
  IF w IN ('qibla','qiblah','kaaba','kaabah','قبله','كعبه') THEN RETURN 'قبله'; END IF;
  IF w IN ('niyyah','niya','intention','intent','نيه','ني','نوي','ينوي') THEN RETURN 'نيه'; END IF;
  IF w IN ('fard','farida','obligation','obligatory','فرض','فريضه','واجب','واجبه') THEN RETURN 'فرض'; END IF;
  IF w IN ('year','aam','hawl','sanah','sana','عام','حول','سنه') THEN RETURN 'عام'; END IF;
  IF w IN ('arafah','arafa','عرفه','عرف') THEN RETURN 'عرفه'; END IF;
  IF w IN ('zakat','zakah','زكاه','زكا') THEN RETURN 'زكاه'; END IF;
  IF w IN ('sawm','fasting','fast','صيام','صوم') THEN RETURN 'صيام'; END IF;
  IF w IN ('hajj','haj','حج') THEN RETURN 'حج'; END IF;
  IF w IN ('allah','god','lord','الله','رب','ربه','ربك','الرب') THEN RETURN 'الله'; END IF;
  IF w IN ('صلة','صله','تقرب','قرب','تقويه','تقوي','علاقه') THEN RETURN 'صله_الله'; END IF;
  IF w IN ('khushu','خشوع','خاشع','تدبر','طمأنينه','سكينه') THEN RETURN 'خشوع'; END IF;
  IF w IN ('محبه','الفه','تعاون','ترابط','تكافل') THEN RETURN 'محبه'; END IF;
  IF w IN ('نظام','انضباط','انتظام') THEN RETURN 'انضباط'; END IF;

  RETURN w;
END;
$$;

WITH text_answers AS (
  SELECT
    ea.id AS answer_id,
    ea.attempt_id,
    ea.answer_text,
    q.correct_answer,
    COALESCE(q.marks, 0) AS max_score,
    public.smart_exam_text_score(ea.answer_text, q.correct_answer, COALESCE(q.marks, 0)) AS new_score
  FROM public.exam_answers ea
  JOIN public.exam_questions q ON q.id = ea.question_id
  JOIN public.exam_attempts at ON at.id = ea.attempt_id
  JOIN public.exams e ON e.id = q.exam_id
  WHERE q.question_type::text IN ('short_answer','fill_blank','essay')
    AND e.group_id IS NOT NULL
    AND at.status IN ('submitted'::public.exam_attempt_status, 'graded'::public.exam_attempt_status)
), repaired AS (
  UPDATE public.exam_answers ea
  SET marks_awarded = ta.new_score,
      is_correct = ta.new_score >= ta.max_score,
      auto_graded = COALESCE(trim(ta.correct_answer), '') <> '',
      ai_feedback = public.exam_text_feedback(ta.answer_text, ta.correct_answer, ta.new_score, ta.max_score)
  FROM text_answers ta
  WHERE ea.id = ta.answer_id
  RETURNING ea.attempt_id
), totals AS (
  SELECT ea.attempt_id, COALESCE(sum(ea.marks_awarded), 0) AS total_score, COALESCE(sum(q.marks), 0) AS max_score
  FROM public.exam_answers ea
  JOIN public.exam_questions q ON q.id = ea.question_id AND q.question_type::text <> 'section'
  WHERE ea.attempt_id IN (SELECT DISTINCT attempt_id FROM repaired)
  GROUP BY ea.attempt_id
), updated_attempts AS (
  UPDATE public.exam_attempts at
  SET total_score = totals.total_score,
      max_score = CASE WHEN COALESCE(at.max_score, 0) > 0 THEN at.max_score ELSE totals.max_score END,
      percentage = CASE WHEN COALESCE(CASE WHEN COALESCE(at.max_score, 0) > 0 THEN at.max_score ELSE totals.max_score END, 0) > 0 THEN round((totals.total_score / (CASE WHEN COALESCE(at.max_score, 0) > 0 THEN at.max_score ELSE totals.max_score END)) * 100, 2) ELSE 0 END,
      passed = totals.total_score >= COALESCE((SELECT pass_marks FROM public.exams e WHERE e.id = at.exam_id), 0),
      updated_at = now()
  FROM totals
  WHERE totals.attempt_id = at.id
  RETURNING at.id, at.student_id, at.exam_id
), audit AS (
  SELECT attempt_id, count(*) AS repaired_count
  FROM repaired
  GROUP BY attempt_id
)
INSERT INTO public.exam_attempt_debug_logs(stage, student_id, exam_id, attempt_id, payload)
SELECT
  'repair.text_grading_final_semantic_normalization',
  ua.student_id,
  ua.exam_id,
  ua.id,
  jsonb_build_object(
    'repaired_count', audit.repaired_count,
    'mapping_strategy', 'exam_answers.question_id -> exam_questions.id',
    'uses_question_id', true,
    'uses_array_index', false,
    'fixed_terms', jsonb_build_array('Salah', 'Ghusl', 'Niyyah', 'Aam', 'Arafah')
  )
FROM audit
JOIN updated_attempts ua ON ua.id = audit.attempt_id;

REVOKE ALL ON FUNCTION public.normalize_exam_semantic_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_exam_semantic_token(text) TO authenticated, service_role;
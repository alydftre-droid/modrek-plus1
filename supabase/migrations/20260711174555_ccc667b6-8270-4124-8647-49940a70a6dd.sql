
CREATE OR REPLACE FUNCTION public.increment_voice_usage(p_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.voice_answers
    SET usage_count = usage_count + 1,
        last_used_at = now()
    WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION public.increment_voice_usage(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_voice_usage(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.voice_answers_find_similar(
  p_normalized TEXT,
  p_subject_id UUID,
  p_grade TEXT,
  p_threshold REAL DEFAULT 0.85
)
RETURNS TABLE (
  id UUID,
  answer_text TEXT,
  audio_url TEXT,
  voice TEXT,
  model TEXT,
  source TEXT,
  citations JSONB,
  similarity REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id, v.answer_text, v.audio_url, v.voice, v.model, v.source, v.citations,
         similarity(v.question_normalized, p_normalized) AS similarity
    FROM public.voice_answers v
   WHERE (p_subject_id IS NULL OR v.subject_id = p_subject_id)
     AND (p_grade IS NULL OR v.grade = p_grade)
     AND similarity(v.question_normalized, p_normalized) >= p_threshold
   ORDER BY similarity DESC
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.voice_answers_find_similar(TEXT, UUID, TEXT, REAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.voice_answers_find_similar(TEXT, UUID, TEXT, REAL) TO service_role;

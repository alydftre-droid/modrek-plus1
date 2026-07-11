
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.voice_answers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  question_normalized TEXT NOT NULL,
  question_hash TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  audio_bytes INTEGER,
  voice TEXT,
  model TEXT,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  stage TEXT,
  grade TEXT,
  section TEXT,
  lesson_hint TEXT,
  keywords TEXT[],
  source TEXT NOT NULL DEFAULT 'library',
  citations JSONB,
  usage_count INTEGER NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS voice_answers_scope_hash_uidx
  ON public.voice_answers (question_hash, COALESCE(subject_id::text, ''), COALESCE(grade, ''), COALESCE(lesson_hint, ''));

CREATE INDEX IF NOT EXISTS voice_answers_norm_trgm_idx
  ON public.voice_answers USING gin (question_normalized gin_trgm_ops);

CREATE INDEX IF NOT EXISTS voice_answers_subject_idx
  ON public.voice_answers (subject_id, grade);

GRANT SELECT ON public.voice_answers TO authenticated;
GRANT ALL ON public.voice_answers TO service_role;

ALTER TABLE public.voice_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Voice answers readable by authenticated"
  ON public.voice_answers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage voice answers"
  ON public.voice_answers FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.voice_answers_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS voice_answers_touch_trg ON public.voice_answers;
CREATE TRIGGER voice_answers_touch_trg
  BEFORE UPDATE ON public.voice_answers
  FOR EACH ROW EXECUTE FUNCTION public.voice_answers_touch();

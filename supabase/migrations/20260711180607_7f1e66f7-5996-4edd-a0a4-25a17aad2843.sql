ALTER TABLE public.voice_answers
  ADD COLUMN IF NOT EXISTS speech_text TEXT,
  ADD COLUMN IF NOT EXISTS voice_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS audio_duration_seconds NUMERIC,
  ADD COLUMN IF NOT EXISTS audio_quality TEXT NOT NULL DEFAULT 'openrouter-gemini-tts-hd',
  ADD COLUMN IF NOT EXISTS audio_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS record_type TEXT NOT NULL DEFAULT 'voice_answer';

CREATE INDEX IF NOT EXISTS voice_answers_record_scope_idx
  ON public.voice_answers (record_type, subject_id, grade, lesson_hint);

CREATE INDEX IF NOT EXISTS voice_answers_audio_storage_path_idx
  ON public.voice_answers (audio_storage_path);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'exam_difficulty'
  ) THEN
    CREATE TYPE public.exam_difficulty AS ENUM ('easy', 'medium', 'hard');
  END IF;
END $$;

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS difficulty public.exam_difficulty NOT NULL DEFAULT 'medium';

ALTER TABLE public.exam_questions
  ADD COLUMN IF NOT EXISTS difficulty public.exam_difficulty NOT NULL DEFAULT 'medium';

NOTIFY pgrst, 'reload schema';
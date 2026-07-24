-- Force a real DDL change to invalidate PostgREST schema cache across all replicas
ALTER TABLE public.content ADD COLUMN IF NOT EXISTS target_section text;
COMMENT ON COLUMN public.content.target_section IS 'Target section for content targeting: scientific, literary, or NULL for both. Cache-refresh marker: 2026-07-24T17:00Z';

-- Also ensure exams has it (used by ExamSettings)
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS target_section text;

-- Force PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
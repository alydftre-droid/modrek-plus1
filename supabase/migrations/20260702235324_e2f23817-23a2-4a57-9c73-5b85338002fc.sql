
ALTER TYPE public.knowledge_unit_kind ADD VALUE IF NOT EXISTS 'part';
ALTER TYPE public.knowledge_unit_kind ADD VALUE IF NOT EXISTS 'paragraph';
ALTER TYPE public.knowledge_unit_kind ADD VALUE IF NOT EXISTS 'heading';
ALTER TYPE public.knowledge_unit_kind ADD VALUE IF NOT EXISTS 'definition';
ALTER TYPE public.knowledge_unit_kind ADD VALUE IF NOT EXISTS 'formula';
ALTER TYPE public.knowledge_unit_kind ADD VALUE IF NOT EXISTS 'example';
ALTER TYPE public.knowledge_unit_kind ADD VALUE IF NOT EXISTS 'exercise';
ALTER TYPE public.knowledge_unit_kind ADD VALUE IF NOT EXISTS 'note';
ALTER TYPE public.knowledge_unit_kind ADD VALUE IF NOT EXISTS 'objective';
ALTER TYPE public.knowledge_unit_kind ADD VALUE IF NOT EXISTS 'table';
ALTER TYPE public.knowledge_unit_kind ADD VALUE IF NOT EXISTS 'figure';
ALTER TYPE public.knowledge_unit_kind ADD VALUE IF NOT EXISTS 'image';
ALTER TYPE public.knowledge_unit_kind ADD VALUE IF NOT EXISTS 'equation';
ALTER TYPE public.knowledge_unit_kind ADD VALUE IF NOT EXISTS 'answer';

ALTER TYPE public.processing_job_kind ADD VALUE IF NOT EXISTS 'detect';
ALTER TYPE public.processing_job_kind ADD VALUE IF NOT EXISTS 'extract_text';
ALTER TYPE public.processing_job_kind ADD VALUE IF NOT EXISTS 'structure';
ALTER TYPE public.processing_job_kind ADD VALUE IF NOT EXISTS 'extract_knowledge';

DO $$ BEGIN
  CREATE TYPE public.pipeline_stage AS ENUM (
    'uploaded','queued','detecting','ocr','text_extraction',
    'structure_analysis','knowledge_extraction','embedding',
    'indexing','completed','failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.knowledge_units
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'ar',
  ADD COLUMN IF NOT EXISTS word_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS formula_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(4,3);

ALTER TABLE public.knowledge_source_versions
  ADD COLUMN IF NOT EXISTS pipeline_stage public.pipeline_stage NOT NULL DEFAULT 'uploaded',
  ADD COLUMN IF NOT EXISTS progress_pct INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extracted_text TEXT,
  ADD COLUMN IF NOT EXISTS extracted_language TEXT,
  ADD COLUMN IF NOT EXISTS page_count INTEGER,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS pipeline_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pipeline_completed_at TIMESTAMPTZ;

ALTER TABLE public.processing_jobs
  ADD COLUMN IF NOT EXISTS progress_pct INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stage_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_processing_jobs_ready
  ON public.processing_jobs(next_run_at)
  WHERE status IN ('pending','retrying');

CREATE INDEX IF NOT EXISTS idx_units_version_kind ON public.knowledge_units(version_id, kind);
CREATE INDEX IF NOT EXISTS idx_chunks_version ON public.content_chunks(version_id);

CREATE OR REPLACE FUNCTION public.modrek_claim_next_job()
RETURNS SETOF public.processing_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.processing_jobs j
  SET status = 'running',
      started_at = now(),
      attempts = j.attempts + 1,
      updated_at = now()
  WHERE j.id = (
    SELECT id FROM public.processing_jobs
    WHERE status IN ('pending','retrying')
      AND next_run_at <= now()
    ORDER BY priority DESC, stage_order ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING *;
END $$;

REVOKE ALL ON FUNCTION public.modrek_claim_next_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.modrek_claim_next_job() TO service_role;

CREATE OR REPLACE FUNCTION public.modrek_enqueue_stage(
  p_version_id UUID,
  p_kind public.processing_job_kind,
  p_stage_order INTEGER,
  p_input JSONB DEFAULT '{}'::jsonb,
  p_asset_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_id UUID;
  v_job_id UUID;
BEGIN
  SELECT source_id INTO v_source_id FROM public.knowledge_source_versions WHERE id = p_version_id;
  INSERT INTO public.processing_jobs
    (source_id, version_id, asset_id, kind, status, input, stage_order, priority)
  VALUES
    (v_source_id, p_version_id, p_asset_id, p_kind, 'pending', p_input, p_stage_order, 100)
  RETURNING id INTO v_job_id;
  RETURN v_job_id;
END $$;

REVOKE ALL ON FUNCTION public.modrek_enqueue_stage(UUID,public.processing_job_kind,INTEGER,JSONB,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.modrek_enqueue_stage(UUID,public.processing_job_kind,INTEGER,JSONB,UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.modrek_log_event(
  p_job_id UUID, p_level TEXT, p_message TEXT, p_data JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.processing_events(job_id, level, message, data)
  VALUES (p_job_id, p_level, p_message, p_data)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.modrek_log_event(UUID,TEXT,TEXT,JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.modrek_log_event(UUID,TEXT,TEXT,JSONB) TO service_role;

INSERT INTO public.ai_providers (code, name, is_active)
VALUES ('openai','OpenAI', true), ('google','Google', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.ai_models (provider_id, code, name, use_case, context_tokens, is_default, is_active, metadata)
SELECT p.id, 'openai/text-embedding-3-small', 'Text Embedding 3 Small (768d)', 'embedding'::ai_model_use_case,
       8192, true, true, jsonb_build_object('dimensions', 768)
FROM public.ai_providers p WHERE p.code='openai'
ON CONFLICT DO NOTHING;

INSERT INTO public.ai_models (provider_id, code, name, use_case, context_tokens, is_default, is_active, metadata)
SELECT p.id, 'google/gemini-2.5-flash', 'Gemini 2.5 Flash (multimodal)', 'multimodal'::ai_model_use_case,
       1000000, true, true, '{}'::jsonb
FROM public.ai_providers p WHERE p.code='google'
ON CONFLICT DO NOTHING;

INSERT INTO public.ai_models (provider_id, code, name, use_case, context_tokens, is_default, is_active, metadata)
SELECT p.id, 'google/gemini-2.5-pro', 'Gemini 2.5 Pro (vision OCR)', 'ocr'::ai_model_use_case,
       1000000, true, true, '{}'::jsonb
FROM public.ai_providers p WHERE p.code='google'
ON CONFLICT DO NOTHING;

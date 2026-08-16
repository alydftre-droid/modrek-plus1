-- 1) Version-level resilience fields
ALTER TABLE public.knowledge_source_versions
  ADD COLUMN IF NOT EXISTS credits_blocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS credits_blocked_reason TEXT,
  ADD COLUMN IF NOT EXISTS failed_pages JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2) Per-page state (resume + failed-only retry)
CREATE TABLE IF NOT EXISTS public.knowledge_page_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version_id UUID NOT NULL REFERENCES public.knowledge_source_versions(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  page_to INTEGER,
  extraction_status TEXT NOT NULL DEFAULT 'pending',
  ocr_status TEXT NOT NULL DEFAULT 'not_needed',
  chunk_status TEXT NOT NULL DEFAULT 'pending',
  embedding_status TEXT NOT NULL DEFAULT 'pending',
  extractor TEXT,
  char_count INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_category TEXT,
  error_message TEXT,
  content_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_page_state_version_page_uidx
  ON public.knowledge_page_state(version_id, page_number);
CREATE INDEX IF NOT EXISTS knowledge_page_state_status_idx
  ON public.knowledge_page_state(version_id, extraction_status);

GRANT SELECT ON public.knowledge_page_state TO authenticated;
GRANT ALL ON public.knowledge_page_state TO service_role;
ALTER TABLE public.knowledge_page_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read page state"
  ON public.knowledge_page_state FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3) Lesson index (query understanding: "الدرس الخامس")
CREATE TABLE IF NOT EXISTS public.knowledge_lesson_index (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES public.knowledge_source_versions(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.knowledge_units(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'lesson',
  unit_number INTEGER,
  lesson_number INTEGER,
  title TEXT NOT NULL,
  normalized_title TEXT,
  page_start INTEGER,
  page_end INTEGER,
  ordinal INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_lesson_index_version_idx
  ON public.knowledge_lesson_index(version_id, ordinal);
CREATE INDEX IF NOT EXISTS knowledge_lesson_index_lookup_idx
  ON public.knowledge_lesson_index(source_id, kind, lesson_number, unit_number);

GRANT SELECT ON public.knowledge_lesson_index TO authenticated;
GRANT ALL ON public.knowledge_lesson_index TO service_role;
ALTER TABLE public.knowledge_lesson_index ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read lesson index"
  ON public.knowledge_lesson_index FOR SELECT TO authenticated
  USING (true);

-- 4) updated_at triggers
CREATE OR REPLACE FUNCTION public.modrek_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_knowledge_page_state_touch ON public.knowledge_page_state;
CREATE TRIGGER trg_knowledge_page_state_touch
  BEFORE UPDATE ON public.knowledge_page_state
  FOR EACH ROW EXECUTE FUNCTION public.modrek_touch_updated_at();

DROP TRIGGER IF EXISTS trg_knowledge_lesson_index_touch ON public.knowledge_lesson_index;
CREATE TRIGGER trg_knowledge_lesson_index_touch
  BEFORE UPDATE ON public.knowledge_lesson_index
  FOR EACH ROW EXECUTE FUNCTION public.modrek_touch_updated_at();

-- 5) Admin summary of a version's page pipeline
CREATE OR REPLACE FUNCTION public.modrek_version_page_summary(p_version_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'total_pages', COALESCE(v.page_count, 0),
    'tracked_pages', COUNT(ps.id),
    'done_pages', COUNT(ps.id) FILTER (WHERE ps.extraction_status = 'done'),
    'failed_pages', COUNT(ps.id) FILTER (WHERE ps.extraction_status = 'failed'),
    'pending_pages', COUNT(ps.id) FILTER (WHERE ps.extraction_status IN ('pending','running')),
    'chars', COALESCE(SUM(ps.char_count), 0),
    'credits_blocked_at', v.credits_blocked_at,
    'credits_blocked_reason', v.credits_blocked_reason,
    'pipeline_stage', v.pipeline_stage,
    'progress_pct', v.progress_pct,
    'error_message', v.error_message,
    'started_at', v.pipeline_started_at,
    'updated_at', v.updated_at
  )
  INTO v_result
  FROM public.knowledge_source_versions v
  LEFT JOIN public.knowledge_page_state ps ON ps.version_id = v.id
  WHERE v.id = p_version_id
  GROUP BY v.id;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.modrek_version_page_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.modrek_version_page_summary(UUID) TO authenticated, service_role;

-- 6) Retry ONLY failed pages, and clear a credit block
CREATE OR REPLACE FUNCTION public.modrek_retry_failed_pages(p_version_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requeued INTEGER := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.knowledge_source_versions
     SET credits_blocked_at = NULL,
         credits_blocked_reason = NULL,
         error_message = NULL,
         updated_at = now()
   WHERE id = p_version_id;

  UPDATE public.knowledge_page_state
     SET extraction_status = 'pending',
         error_category = NULL,
         error_message = NULL,
         updated_at = now()
   WHERE version_id = p_version_id
     AND extraction_status = 'failed';

  WITH requeued AS (
    UPDATE public.processing_jobs
       SET status = 'pending',
           attempts = 0,
           error = NULL,
           next_run_at = now(),
           finished_at = NULL,
           updated_at = now()
     WHERE version_id = p_version_id
       AND status = 'failed'
     RETURNING id
  )
  SELECT COUNT(*) INTO v_requeued FROM requeued;

  RETURN jsonb_build_object('success', true, 'requeued_jobs', v_requeued);
END;
$$;

REVOKE ALL ON FUNCTION public.modrek_retry_failed_pages(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.modrek_retry_failed_pages(UUID) TO authenticated, service_role;
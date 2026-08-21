-- Lesson identity hardening for Modrek AI library indexing
ALTER TABLE public.knowledge_lesson_index
  ADD COLUMN IF NOT EXISTS number_source text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS parent_unit_id uuid;

CREATE INDEX IF NOT EXISTS knowledge_lesson_index_source_lesson_idx
  ON public.knowledge_lesson_index (source_id, lesson_number);
CREATE INDEX IF NOT EXISTS knowledge_lesson_index_source_unit_idx
  ON public.knowledge_lesson_index (source_id, unit_number);

-- Chunks must be retrievable by the lesson they belong to (not only page range)
CREATE INDEX IF NOT EXISTS content_chunks_lesson_unit_idx
  ON public.content_chunks ((metadata->>'lesson_unit_id'));
CREATE INDEX IF NOT EXISTS content_chunks_lesson_number_idx
  ON public.content_chunks (source_id, ((metadata->>'lesson_number')::int));

-- Re-index backlog: any ready version whose lesson index is empty or whose chunks
-- carry no lesson linkage gets its structure/chunk stages re-queued.
CREATE OR REPLACE FUNCTION public.modrek_reindex_lessons_backlog(p_limit int DEFAULT 20)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_rec record;
BEGIN
  FOR v_rec IN
    SELECT v.id AS version_id, v.source_id
    FROM public.knowledge_source_versions v
    WHERE EXISTS (SELECT 1 FROM public.content_chunks c WHERE c.version_id = v.id)
      AND (
        NOT EXISTS (SELECT 1 FROM public.knowledge_lesson_index l WHERE l.version_id = v.id)
        OR NOT EXISTS (
          SELECT 1 FROM public.content_chunks c
          WHERE c.version_id = v.id AND c.metadata ? 'lesson_unit_id'
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.processing_jobs j
        WHERE j.version_id = v.id AND j.status IN ('pending','running','retrying')
      )
    ORDER BY v.updated_at DESC
    LIMIT p_limit
  LOOP
    INSERT INTO public.processing_jobs (version_id, kind, status, priority, payload)
    VALUES (v_rec.version_id, 'chunk', 'pending', 45, jsonb_build_object('reason', 'lesson_reindex'));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.modrek_reindex_lessons_backlog(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.modrek_reindex_lessons_backlog(int) TO service_role;
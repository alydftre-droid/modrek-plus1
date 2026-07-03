
-- =========================================================
-- Phase 3: Modrek AI Retrieval Engine — schema & functions
-- =========================================================

-- 1) Full-text search on content_chunks (Arabic + simple fallback)
ALTER TABLE public.content_chunks
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(content, '')), 'A')
  ) STORED;

CREATE INDEX IF NOT EXISTS content_chunks_search_tsv_idx
  ON public.content_chunks USING gin (search_tsv);

CREATE INDEX IF NOT EXISTS content_chunks_source_idx
  ON public.content_chunks (source_id);
CREATE INDEX IF NOT EXISTS content_chunks_version_idx
  ON public.content_chunks (version_id);

-- Faster taxonomy filtering
CREATE INDEX IF NOT EXISTS knowledge_sources_taxonomy_idx
  ON public.knowledge_sources (source_type_id, stage_id, grade_id, section_id, track_id, subject_id);
CREATE INDEX IF NOT EXISTS knowledge_units_version_idx
  ON public.knowledge_units (version_id);
CREATE INDEX IF NOT EXISTS knowledge_units_pages_idx
  ON public.knowledge_units (version_id, page_from, page_to);

-- 2) Retrieval cache
CREATE TABLE IF NOT EXISTS public.modrek_search_cache (
  query_hash text PRIMARY KEY,
  query_text text NOT NULL,
  intent text,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL,
  hits int NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.modrek_search_cache TO authenticated;
GRANT ALL ON public.modrek_search_cache TO service_role;
ALTER TABLE public.modrek_search_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cache read for authenticated" ON public.modrek_search_cache
  FOR SELECT TO authenticated USING (true);

-- 3) Retrieval logs (analytics)
CREATE TABLE IF NOT EXISTS public.modrek_search_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  role text,
  query_text text NOT NULL,
  intent text,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  tier_used text,
  results_count int NOT NULL DEFAULT 0,
  top_confidence numeric(6,4),
  cache_hit boolean NOT NULL DEFAULT false,
  duration_ms int,
  fallback_external boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.modrek_search_logs TO authenticated;
GRANT ALL ON public.modrek_search_logs TO service_role;
ALTER TABLE public.modrek_search_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insert own log" ON public.modrek_search_logs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "admins read logs" ON public.modrek_search_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS modrek_search_logs_created_idx
  ON public.modrek_search_logs (created_at DESC);

-- 4) Hybrid search function (vector + FTS + metadata filters)
CREATE OR REPLACE FUNCTION public.modrek_hybrid_search(
  p_query_embedding vector(768),
  p_query_text text,
  p_source_type_id uuid DEFAULT NULL,
  p_stage_id uuid DEFAULT NULL,
  p_grade_id uuid DEFAULT NULL,
  p_section_id uuid DEFAULT NULL,
  p_track_id uuid DEFAULT NULL,
  p_subject_id uuid DEFAULT NULL,
  p_source_ids uuid[] DEFAULT NULL,
  p_match_count int DEFAULT 12,
  p_min_similarity float DEFAULT 0.35
)
RETURNS TABLE (
  chunk_id uuid,
  source_id uuid,
  version_id uuid,
  unit_id uuid,
  content text,
  ordinal int,
  chunk_metadata jsonb,
  similarity float,
  text_rank float,
  composite_score float,
  source_title text,
  source_type_code text,
  source_type_priority int,
  source_publication_year int,
  unit_kind text,
  unit_title text,
  page_from int,
  page_to int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ts tsquery;
BEGIN
  IF p_query_text IS NOT NULL AND length(trim(p_query_text)) > 0 THEN
    v_ts := websearch_to_tsquery('simple', p_query_text);
  END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT
      c.id                       AS chunk_id,
      c.source_id,
      c.version_id,
      c.unit_id,
      c.content,
      c.ordinal,
      c.metadata                 AS chunk_metadata,
      1 - (c.embedding <=> p_query_embedding)              AS similarity,
      CASE
        WHEN v_ts IS NULL THEN 0
        ELSE ts_rank(c.search_tsv, v_ts)
      END                        AS text_rank,
      ks.title                   AS source_title,
      kst.code                   AS source_type_code,
      kst.sort_order             AS source_type_priority,
      ks.publication_year        AS source_publication_year,
      ku.kind::text              AS unit_kind,
      ku.title                   AS unit_title,
      ku.page_from,
      ku.page_to
    FROM public.content_chunks c
    JOIN public.knowledge_sources ks              ON ks.id = c.source_id
    JOIN public.knowledge_source_types kst        ON kst.id = ks.source_type_id
    LEFT JOIN public.knowledge_units ku           ON ku.id = c.unit_id
    WHERE
      (p_source_type_id IS NULL OR ks.source_type_id = p_source_type_id)
      AND (p_stage_id   IS NULL OR ks.stage_id   = p_stage_id)
      AND (p_grade_id   IS NULL OR ks.grade_id   = p_grade_id)
      AND (p_section_id IS NULL OR ks.section_id = p_section_id)
      AND (p_track_id   IS NULL OR ks.track_id   = p_track_id)
      AND (p_subject_id IS NULL OR ks.subject_id = p_subject_id)
      AND (p_source_ids IS NULL OR ks.id = ANY(p_source_ids))
      AND (
        (1 - (c.embedding <=> p_query_embedding)) >= p_min_similarity
        OR (v_ts IS NOT NULL AND c.search_tsv @@ v_ts)
      )
  )
  SELECT
    r.chunk_id, r.source_id, r.version_id, r.unit_id, r.content, r.ordinal, r.chunk_metadata,
    r.similarity, r.text_rank,
    -- Composite score: 0.65 semantic + 0.20 text + 0.10 priority + 0.05 recency
    (0.65 * r.similarity
     + 0.20 * LEAST(r.text_rank, 1.0)
     + 0.10 * (1.0 / GREATEST(r.source_type_priority, 1))
     + 0.05 * CASE
                WHEN r.source_publication_year IS NULL THEN 0
                ELSE LEAST(1.0, GREATEST(0.0, (r.source_publication_year - 2015)::float / 15.0))
              END
    )::float AS composite_score,
    r.source_title, r.source_type_code, r.source_type_priority, r.source_publication_year,
    r.unit_kind, r.unit_title, r.page_from, r.page_to
  FROM ranked r
  ORDER BY composite_score DESC
  LIMIT p_match_count;
END;
$$;

REVOKE ALL ON FUNCTION public.modrek_hybrid_search(vector, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid[], int, float) FROM public;
GRANT EXECUTE ON FUNCTION public.modrek_hybrid_search(vector, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid[], int, float) TO authenticated, service_role;

-- 5) Cleanup expired cache
CREATE OR REPLACE FUNCTION public.modrek_search_cache_cleanup()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.modrek_search_cache WHERE expires_at < now();
$$;

-- Schedule cleanup every 5 minutes (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('modrek-search-cache-cleanup');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule(
  'modrek-search-cache-cleanup',
  '*/5 * * * *',
  $$ SELECT public.modrek_search_cache_cleanup(); $$
);

-- Update trigger for cache
CREATE OR REPLACE FUNCTION public.modrek_touch_cache()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS modrek_search_cache_touch ON public.modrek_search_cache;
CREATE TRIGGER modrek_search_cache_touch
  BEFORE UPDATE ON public.modrek_search_cache
  FOR EACH ROW EXECUTE FUNCTION public.modrek_touch_cache();

CREATE OR REPLACE FUNCTION public.modrek_hybrid_search(
  p_query_embedding vector, p_query_text text, p_source_type_id uuid DEFAULT NULL::uuid, p_stage_id uuid DEFAULT NULL::uuid,
  p_grade_id uuid DEFAULT NULL::uuid, p_section_id uuid DEFAULT NULL::uuid, p_track_id uuid DEFAULT NULL::uuid, p_subject_id uuid DEFAULT NULL::uuid,
  p_source_ids uuid[] DEFAULT NULL::uuid[], p_match_count integer DEFAULT 12, p_min_similarity double precision DEFAULT 0.35)
RETURNS TABLE(chunk_id uuid, source_id uuid, version_id uuid, unit_id uuid, content text, ordinal integer,
  chunk_metadata jsonb, similarity double precision, text_rank double precision, composite_score double precision,
  source_title text, source_type_code text, source_type_priority integer, source_publication_year integer,
  unit_kind text, unit_title text, page_from integer, page_to integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
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
      (1 - (c.embedding <=> p_query_embedding))::double precision AS similarity,
      CASE
        WHEN v_ts IS NULL THEN 0::double precision
        ELSE ts_rank(c.search_tsv, v_ts)::double precision
      END                        AS text_rank,
      ks.title                   AS source_title,
      kst.code                   AS source_type_code,
      kst.sort_order             AS source_type_priority,
      ks.publication_year        AS source_publication_year,
      ku.kind::text              AS unit_kind,
      ku.title                   AS unit_title,
      ku.page_from::integer      AS page_from,
      ku.page_to::integer        AS page_to
    FROM public.content_chunks c
    JOIN public.knowledge_sources ks              ON ks.id = c.source_id
    JOIN public.knowledge_source_types kst        ON kst.id = ks.source_type_id
    LEFT JOIN public.knowledge_units ku           ON ku.id = c.unit_id
    WHERE
      (p_source_type_id IS NULL OR ks.source_type_id = p_source_type_id)
      AND (p_stage_id   IS NULL OR ks.stage_id   = p_stage_id)
      AND (p_grade_id   IS NULL OR ks.grade_id   = p_grade_id)
      AND (p_section_id IS NULL OR ks.section_id = p_section_id)
      AND (p_track_id   IS NULL OR ks.track_id IS NULL OR ks.track_id = p_track_id)
      AND (p_subject_id IS NULL OR public.modrek_subjects_equivalent(ks.subject_id, p_subject_id))
      AND (p_source_ids IS NULL OR ks.id = ANY(p_source_ids))
      AND (
        (1 - (c.embedding <=> p_query_embedding)) >= p_min_similarity
        OR (v_ts IS NOT NULL AND c.search_tsv @@ v_ts)
      )
  )
  SELECT
    r.chunk_id, r.source_id, r.version_id, r.unit_id, r.content, r.ordinal::integer, r.chunk_metadata,
    r.similarity::double precision, r.text_rank::double precision,
    (0.65 * r.similarity
     + 0.20 * LEAST(r.text_rank, 1.0)
     + 0.10 * (1.0 / GREATEST(r.source_type_priority, 1))
     + 0.05 * CASE
                WHEN r.source_publication_year IS NULL THEN 0
                ELSE LEAST(1.0, GREATEST(0.0, (r.source_publication_year - 2015)::float / 15.0))
              END
    )::float AS composite_score,
    r.source_title, r.source_type_code, r.source_type_priority::integer, r.source_publication_year::integer,
    r.unit_kind, r.unit_title, r.page_from::integer, r.page_to::integer
  FROM ranked r
  ORDER BY composite_score DESC
  LIMIT p_match_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.modrek_hybrid_search(vector,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid[],integer,double precision) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.modrek_hybrid_search(vector,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid[],integer,double precision) TO service_role, authenticated;
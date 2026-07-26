CREATE INDEX IF NOT EXISTS idx_knowledge_sources_track_universal
  ON public.knowledge_sources (track_id, grade_id, subject_id);

CREATE INDEX IF NOT EXISTS idx_library_subjects_equivalent_name
  ON public.library_subjects (grade_id, section_id, name_ar)
  WHERE is_active = true;

CREATE OR REPLACE FUNCTION public.modrek_subjects_equivalent(_left uuid, _right uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _left IS NULL OR _right IS NULL THEN true
    WHEN _left = _right THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.library_subjects a
      JOIN public.library_subjects b ON b.id = _right
      WHERE a.id = _left
        AND regexp_replace(lower(replace(replace(replace(replace(coalesce(a.name_ar, ''), 'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا'), 'ى', 'ي')), '[[:space:][:punct:]]+', '', 'g') =
            regexp_replace(lower(replace(replace(replace(replace(coalesce(b.name_ar, ''), 'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا'), 'ى', 'ي')), '[[:space:][:punct:]]+', '', 'g')
        AND (a.stage_id IS NULL OR b.stage_id IS NULL OR a.stage_id = b.stage_id)
        AND (a.grade_id IS NULL OR b.grade_id IS NULL OR a.grade_id = b.grade_id)
        AND (a.section_id IS NULL OR b.section_id IS NULL OR a.section_id = b.section_id)
    )
  END
$$;

REVOKE ALL ON FUNCTION public.modrek_subjects_equivalent(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.modrek_subjects_equivalent(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.modrek_hybrid_search(p_query_embedding vector, p_query_text text, p_source_type_id uuid DEFAULT NULL::uuid, p_stage_id uuid DEFAULT NULL::uuid, p_grade_id uuid DEFAULT NULL::uuid, p_section_id uuid DEFAULT NULL::uuid, p_track_id uuid DEFAULT NULL::uuid, p_subject_id uuid DEFAULT NULL::uuid, p_source_ids uuid[] DEFAULT NULL::uuid[], p_match_count integer DEFAULT 12, p_min_similarity double precision DEFAULT 0.35)
 RETURNS TABLE(chunk_id uuid, source_id uuid, version_id uuid, unit_id uuid, content text, ordinal integer, chunk_metadata jsonb, similarity double precision, text_rank double precision, composite_score double precision, source_title text, source_type_code text, source_type_priority integer, source_publication_year integer, unit_kind text, unit_title text, page_from integer, page_to integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      AND (p_track_id   IS NULL OR ks.track_id IS NULL OR ks.track_id = p_track_id)
      AND (p_subject_id IS NULL OR public.modrek_subjects_equivalent(ks.subject_id, p_subject_id))
      AND (p_source_ids IS NULL OR ks.id = ANY(p_source_ids))
      AND (
        (1 - (c.embedding <=> p_query_embedding)) >= p_min_similarity
        OR (v_ts IS NOT NULL AND c.search_tsv @@ v_ts)
      )
  )
  SELECT
    r.chunk_id, r.source_id, r.version_id, r.unit_id, r.content, r.ordinal, r.chunk_metadata,
    r.similarity, r.text_rank,
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
$function$;

REVOKE ALL ON FUNCTION public.modrek_hybrid_search(vector, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid[], int, float) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.modrek_hybrid_search(vector, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid[], int, float) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_modrek_library_bootstrap()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_modrek_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN jsonb_build_object(
    'types', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.sort_order, t.name_ar)
      FROM public.knowledge_source_types t
      WHERE t.is_active = true
    ), '[]'::jsonb),
    'stages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name_ar', s.name_ar, 'code', s.code) ORDER BY s.sort_order, s.name_ar)
      FROM public.library_stages s
      WHERE s.is_active = true
    ), '[]'::jsonb),
    'grades', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name_ar', g.name_ar, 'code', g.code, 'stage_id', g.stage_id) ORDER BY g.sort_order, g.name_ar)
      FROM public.library_grades g
      WHERE g.is_active = true
    ), '[]'::jsonb),
    'sections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', sec.id, 'name_ar', sec.name_ar, 'code', sec.code) ORDER BY sec.sort_order, sec.name_ar)
      FROM public.library_sections sec
      WHERE sec.is_active = true
    ), '[]'::jsonb),
    'tracks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', tr.id, 'name_ar', tr.name_ar, 'code', tr.code) ORDER BY tr.sort_order, tr.name_ar)
      FROM public.library_tracks tr
      WHERE tr.is_active = true
    ), '[]'::jsonb),
    'subjects', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', sub.id,
          'name_ar', sub.name_ar,
          'code', sub.code,
          'stage_id', sub.stage_id,
          'grade_id', sub.grade_id,
          'section_id', sub.section_id,
          'curriculum_track', sub.curriculum_track,
          'source_subject_id', sub.source_subject_id,
          'source_category', sub.source_category
        )
        ORDER BY sub.sort_order, sub.name_ar, sub.curriculum_track NULLS FIRST
      )
      FROM public.library_subjects sub
      WHERE sub.is_active = true
        AND NOT EXISTS (
          SELECT 1
          FROM public.library_subjects better
          WHERE better.is_active = true
            AND better.id <> sub.id
            AND coalesce(better.stage_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(sub.stage_id, '00000000-0000-0000-0000-000000000000'::uuid)
            AND coalesce(better.grade_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(sub.grade_id, '00000000-0000-0000-0000-000000000000'::uuid)
            AND coalesce(better.section_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(sub.section_id, '00000000-0000-0000-0000-000000000000'::uuid)
            AND coalesce(better.curriculum_track, '') = coalesce(sub.curriculum_track, '')
            AND regexp_replace(lower(replace(replace(replace(replace(coalesce(better.name_ar, ''), 'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا'), 'ى', 'ي')), '[[:space:][:punct:]]+', '', 'g') =
                regexp_replace(lower(replace(replace(replace(replace(coalesce(sub.name_ar, ''), 'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا'), 'ى', 'ي')), '[[:space:][:punct:]]+', '', 'g')
            AND (
              CASE WHEN better.source_category IN ('دروس','امتحانات') THEN 1 ELSE 0 END,
              better.sort_order,
              better.id::text
            ) < (
              CASE WHEN sub.source_category IN ('دروس','امتحانات') THEN 1 ELSE 0 END,
              sub.sort_order,
              sub.id::text
            )
        )
    ), '[]'::jsonb),
    'subSubjects', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', ss.id, 'name_ar', ss.name_ar, 'code', ss.code, 'subject_id', ss.subject_id) ORDER BY ss.sort_order, ss.name_ar)
      FROM public.library_sub_subjects ss
      WHERE ss.is_active = true
    ), '[]'::jsonb),
    'sources', COALESCE((
      SELECT jsonb_agg(to_jsonb(src) ORDER BY src.created_at DESC)
      FROM public.knowledge_sources src
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_modrek_library_bootstrap() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_modrek_library_bootstrap() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
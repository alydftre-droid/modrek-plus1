CREATE OR REPLACE FUNCTION public.admin_set_content_free_preview(
  _content_id uuid,
  _is_free_preview boolean
)
RETURNS TABLE(updated_count integer, updated_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_claims jsonb := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_source public.content%ROWTYPE;
  v_group record;
  v_related_group_ids uuid[] := ARRAY[]::uuid[];
  v_updated_ids uuid[] := ARRAY[]::uuid[];
  v_sub_name text := '';
BEGIN
  IF COALESCE(v_claims->>'role', '') <> 'service_role'
     AND (v_actor IS NULL OR NOT public.has_role(v_actor, 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Only admins can change free preview state' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_source
  FROM public.content
  WHERE id = _content_id
    AND COALESCE(is_active, true) = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Content item not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_source.group_id IS NOT NULL THEN
    SELECT
      cg.id,
      cg.title,
      cg.month_label,
      cg.term,
      cg.teacher_id,
      cg.created_by,
      s.name AS subject_name,
      s.stage,
      s.grade,
      s.category
    INTO v_group
    FROM public.content_groups cg
    LEFT JOIN public.subjects s ON s.id = cg.subject_id
    WHERE cg.id = v_source.group_id;

    IF FOUND THEN
      SELECT COALESCE(array_agg(DISTINCT cg2.id), ARRAY[v_source.group_id]::uuid[])
      INTO v_related_group_ids
      FROM public.content_groups cg2
      LEFT JOIN public.subjects s2 ON s2.id = cg2.subject_id
      WHERE COALESCE(cg2.is_active, true) = true
        AND cg2.term IS NOT DISTINCT FROM v_group.term
        AND (
          cg2.teacher_id IS NOT DISTINCT FROM v_group.teacher_id
          OR cg2.created_by IS NOT DISTINCT FROM v_group.created_by
        )
        AND (
          (
            NULLIF(trim(COALESCE(v_group.month_label, '')), '') IS NOT NULL
            AND cg2.month_label IS NOT DISTINCT FROM v_group.month_label
          )
          OR (
            NULLIF(trim(COALESCE(v_group.month_label, '')), '') IS NULL
            AND trim(COALESCE(cg2.title, '')) = trim(COALESCE(v_group.title, ''))
          )
        )
        AND (
          v_group.subject_name IS NULL
          OR (
            trim(lower(COALESCE(s2.name, ''))) = trim(lower(COALESCE(v_group.subject_name, '')))
            AND s2.stage IS NOT DISTINCT FROM v_group.stage
            AND s2.grade IS NOT DISTINCT FROM v_group.grade
            AND s2.category IS NOT DISTINCT FROM v_group.category
          )
        );
    ELSE
      v_related_group_ids := ARRAY[v_source.group_id]::uuid[];
    END IF;
  END IF;

  IF v_source.group_id IS NOT NULL AND COALESCE(array_length(v_related_group_ids, 1), 0) = 0 THEN
    v_related_group_ids := ARRAY[v_source.group_id]::uuid[];
  END IF;

  v_sub_name := trim(COALESCE(v_source.sub_subject, ''));

  WITH updated AS (
    UPDATE public.content c
    SET is_free_preview = _is_free_preview,
        updated_at = now()
    WHERE COALESCE(c.is_active, true) = true
      AND c.file_url = v_source.file_url
      AND c.type = v_source.type
      AND c.uploaded_by IS NOT DISTINCT FROM v_source.uploaded_by
      AND c.term IS NOT DISTINCT FROM v_source.term
      AND (
        (v_source.group_id IS NULL AND c.group_id IS NULL)
        OR (v_source.group_id IS NOT NULL AND c.group_id = ANY(v_related_group_ids))
      )
      AND (
        (v_source.sub_subject_id IS NULL AND v_sub_name = '' AND c.sub_subject_id IS NULL AND trim(COALESCE(c.sub_subject, '')) = '')
        OR (v_source.sub_subject_id IS NOT NULL AND c.sub_subject_id = v_source.sub_subject_id)
        OR (v_sub_name <> '' AND trim(COALESCE(c.sub_subject, '')) = v_sub_name)
      )
    RETURNING c.id
  )
  SELECT count(*)::integer, COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO updated_count, updated_ids
  FROM updated;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_content_free_preview(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_content_free_preview(uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prevent_non_admin_free_preview_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims jsonb := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
BEGIN
  IF OLD.is_free_preview IS DISTINCT FROM NEW.is_free_preview
     AND COALESCE(v_claims->>'role', '') <> 'service_role'
     AND NOT COALESCE(public.has_role(auth.uid(), 'admin'::public.app_role), false) THEN
    RAISE EXCEPTION 'Only admins can change free preview state' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_non_admin_free_preview_change ON public.content;
CREATE TRIGGER trg_prevent_non_admin_free_preview_change
BEFORE UPDATE OF is_free_preview ON public.content
FOR EACH ROW
EXECUTE FUNCTION public.prevent_non_admin_free_preview_change();
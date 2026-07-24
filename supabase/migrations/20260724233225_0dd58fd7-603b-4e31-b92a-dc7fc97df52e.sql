
DROP FUNCTION IF EXISTS public.content_effective_section(text, uuid, uuid);
DROP FUNCTION IF EXISTS public.exam_effective_section(text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.content_effective_section(
  _content_target_section text,
  _content_subject_id uuid,
  _content_group_id uuid DEFAULT NULL
) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.normalize_content_section(
    COALESCE(
      NULLIF(TRIM(_content_target_section), ''),
      (SELECT NULLIF(TRIM(s.section), '') FROM public.subjects s WHERE s.id = _content_subject_id),
      (SELECT NULLIF(TRIM(cg.section_name), '') FROM public.content_groups cg WHERE cg.id = _content_group_id)
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.exam_effective_section(
  _exam_target_section text,
  _exam_subject_id uuid,
  _exam_group_id uuid DEFAULT NULL
) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.normalize_content_section(
    COALESCE(
      NULLIF(TRIM(_exam_target_section), ''),
      (SELECT NULLIF(TRIM(s.section), '') FROM public.subjects s WHERE s.id = _exam_subject_id),
      (SELECT NULLIF(TRIM(cg.section_name), '') FROM public.content_groups cg WHERE cg.id = _exam_group_id)
    )
  )
$$;

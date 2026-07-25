DROP FUNCTION IF EXISTS public.admin_switch_system_terms(uuid[], text);

CREATE OR REPLACE FUNCTION public.admin_switch_system_terms(
  _target_term text,
  _term_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_authorized boolean := false;
  v_updated_count integer := 0;
  v_rows jsonb := '[]'::jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF _target_term NOT IN ('term1', 'term2') THEN
    RAISE EXCEPTION 'invalid_target_term';
  END IF;

  IF _term_ids IS NULL OR array_length(_term_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_terms_selected';
  END IF;

  SELECT
    public.has_role(v_caller, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = v_caller
        AND lower(coalesce(p.email, '')) = 'alyedaft@gmail.com'
    )
  INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH updated AS (
    UPDATE public.system_terms st
    SET current_term = _target_term,
        updated_at = now(),
        updated_by = v_caller
    WHERE st.id = ANY(_term_ids)
    RETURNING st.id, st.stage, st.grade, st.current_term, st.updated_at
  )
  SELECT count(*)::integer,
         coalesce(jsonb_agg(to_jsonb(updated) ORDER BY updated.stage, updated.grade), '[]'::jsonb)
  INTO v_updated_count, v_rows
  FROM updated;

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_updated_count,
    'terms', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_switch_system_terms(text, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_switch_system_terms(text, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_switch_system_terms(text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_switch_system_terms(text, uuid[]) TO service_role;

NOTIFY pgrst, 'reload schema';
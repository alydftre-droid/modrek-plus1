CREATE OR REPLACE FUNCTION public.admin_list_student_deposits(
  _search text DEFAULT NULL,
  _status text DEFAULT NULL,
  _method text DEFAULT NULL,
  _grade text DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL,
  _min_amount numeric DEFAULT NULL,
  _max_amount numeric DEFAULT NULL,
  _limit integer DEFAULT 25,
  _offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q text := NULLIF(btrim(COALESCE(_search, '')), '');
  lim integer := LEAST(GREATEST(COALESCE(_limit, 25), 1), 200);
  off integer := GREATEST(COALESCE(_offset, 0), 0);
  total_count bigint := 0;
  rows_json jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH filtered AS (
    SELECT d.id, d.created_at
    FROM public.deposit_requests d
    LEFT JOIN public.profiles p ON p.id = d.student_id
    WHERE (_status IS NULL OR _status = 'all' OR d.status = _status)
      AND (_method IS NULL OR _method = 'all' OR COALESCE(d.payment_method, '') = _method)
      AND (_grade IS NULL OR _grade = 'all' OR COALESCE(p.grade, '') = _grade)
      AND (_from IS NULL OR d.created_at >= _from)
      AND (_to IS NULL OR d.created_at <= _to)
      AND (_min_amount IS NULL OR d.amount >= _min_amount)
      AND (_max_amount IS NULL OR d.amount <= _max_amount)
      AND (
        q IS NULL
        OR p.full_name ILIKE '%' || q || '%'
        OR COALESCE(p.email, '') ILIKE '%' || q || '%'
        OR COALESCE(p.phone, '') ILIKE '%' || q || '%'
        OR COALESCE(p.student_code, '') ILIKE '%' || q || '%'
        OR COALESCE(p.grade, '') ILIKE '%' || q || '%'
        OR COALESCE(d.phone_number, '') ILIKE '%' || q || '%'
        OR COALESCE(d.recharge_code, '') ILIKE '%' || q || '%'
        OR COALESCE(d.payment_method, '') ILIKE '%' || q || '%'
        OR COALESCE(d.deposit_type, '') ILIKE '%' || q || '%'
        OR d.status ILIKE '%' || q || '%'
        OR replace(d.id::text, '-', '') ILIKE '%' || replace(lower(q), 'dp-', '') || '%'
        OR d.amount::text ILIKE q || '%'
        OR to_char(d.created_at, 'YYYY-MM-DD HH24:MI') ILIKE '%' || q || '%'
        OR to_char(d.created_at, 'DD/MM/YYYY') ILIKE '%' || q || '%'
      )
  )
  SELECT
    (SELECT COUNT(*) FROM filtered),
    COALESCE((
      SELECT jsonb_agg(row_to_json(t)::jsonb)
      FROM (
        SELECT
          d.id, d.student_id, d.amount, d.status, d.payment_method, d.deposit_type,
          d.phone_number, d.receipt_url, d.recharge_code, d.notes, d.admin_message,
          d.rejection_reason, d.processed_by, d.processed_at, d.created_at, d.updated_at,
          d.wallet_adjustment_id,
          p.full_name AS student_name,
          p.email AS student_email,
          p.phone AS student_phone,
          p.avatar_url AS student_avatar,
          p.student_code,
          p.stage AS student_stage,
          p.grade AS student_grade,
          p.section AS student_section,
          p.education_type AS student_education_type,
          p.is_test_account,
          admin_p.full_name AS processed_by_name,
          (SELECT COUNT(*) FROM public.financial_audit_logs fal
            WHERE fal.metadata->>'deposit_request_id' = d.id::text) AS audit_events
        FROM (SELECT id, created_at FROM filtered ORDER BY created_at DESC LIMIT lim OFFSET off) pg
        JOIN public.deposit_requests d ON d.id = pg.id
        LEFT JOIN public.profiles p ON p.id = d.student_id
        LEFT JOIN public.profiles admin_p ON admin_p.id = d.processed_by
        ORDER BY d.created_at DESC
      ) t
    ), '[]'::jsonb)
  INTO total_count, rows_json;

  RETURN jsonb_build_object('total', total_count, 'rows', rows_json);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_student_deposits(text, text, text, text, timestamptz, timestamptz, numeric, numeric, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_student_deposits(text, text, text, text, timestamptz, timestamptz, numeric, numeric, integer, integer) TO authenticated;
-- Statistics for the admin student-wallet dashboard
CREATE OR REPLACE FUNCTION public.admin_student_deposit_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'total', COUNT(*),
    'pending', COUNT(*) FILTER (WHERE status = 'pending'),
    'approved', COUNT(*) FILTER (WHERE status IN ('approved','processed')),
    'rejected', COUNT(*) FILTER (WHERE status = 'rejected'),
    'cancelled', COUNT(*) FILTER (WHERE status IN ('cancelled','expired')),
    'total_amount', COALESCE(SUM(amount), 0),
    'approved_amount', COALESCE(SUM(amount) FILTER (WHERE status IN ('approved','processed')), 0),
    'pending_amount', COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0),
    'credited_today', COALESCE(SUM(amount) FILTER (
      WHERE status IN ('approved','processed')
        AND COALESCE(processed_at, created_at) >= date_trunc('day', now())), 0),
    'credited_week', COALESCE(SUM(amount) FILTER (
      WHERE status IN ('approved','processed')
        AND COALESCE(processed_at, created_at) >= date_trunc('week', now())), 0),
    'credited_month', COALESCE(SUM(amount) FILTER (
      WHERE status IN ('approved','processed')
        AND COALESCE(processed_at, created_at) >= date_trunc('month', now())), 0),
    'avg_review_minutes', COALESCE(ROUND(AVG(
      EXTRACT(EPOCH FROM (processed_at - created_at)) / 60
    ) FILTER (WHERE processed_at IS NOT NULL), 1), 0)
  )
  INTO result
  FROM public.deposit_requests;

  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_student_deposit_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_student_deposit_stats() TO authenticated;

-- Paginated + searchable listing
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

  CREATE TEMP TABLE IF NOT EXISTS _dep_filtered (id uuid) ON COMMIT DROP;
  DELETE FROM _dep_filtered;

  INSERT INTO _dep_filtered (id)
  SELECT d.id
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
      OR d.id::text ILIKE '%' || replace(lower(q), 'dp-', '') || '%'
      OR replace(d.id::text, '-', '') ILIKE '%' || replace(lower(q), 'dp-', '') || '%'
      OR d.amount::text ILIKE q || '%'
      OR to_char(d.created_at, 'YYYY-MM-DD HH24:MI') ILIKE '%' || q || '%'
      OR to_char(d.created_at, 'DD/MM/YYYY') ILIKE '%' || q || '%'
    );

  SELECT COUNT(*) INTO total_count FROM _dep_filtered;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO rows_json
  FROM (
    SELECT
      d.id,
      d.student_id,
      d.amount,
      d.status,
      d.payment_method,
      d.deposit_type,
      d.phone_number,
      d.receipt_url,
      d.recharge_code,
      d.notes,
      d.admin_message,
      d.rejection_reason,
      d.processed_by,
      d.processed_at,
      d.created_at,
      d.updated_at,
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
    FROM _dep_filtered f
    JOIN public.deposit_requests d ON d.id = f.id
    LEFT JOIN public.profiles p ON p.id = d.student_id
    LEFT JOIN public.profiles admin_p ON admin_p.id = d.processed_by
    ORDER BY d.created_at DESC
    LIMIT lim OFFSET off
  ) t;

  RETURN jsonb_build_object('total', total_count, 'rows', rows_json);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_student_deposits(text, text, text, text, timestamptz, timestamptz, numeric, numeric, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_student_deposits(text, text, text, text, timestamptz, timestamptz, numeric, numeric, integer, integer) TO authenticated;

-- Single deposit request detail
CREATE OR REPLACE FUNCTION public.admin_get_student_deposit(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'request', to_jsonb(d),
    'student', jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'email', p.email,
      'phone', p.phone,
      'avatar_url', p.avatar_url,
      'student_code', p.student_code,
      'stage', p.stage,
      'grade', p.grade,
      'section', p.section,
      'education_type', p.education_type,
      'is_banned', p.is_banned,
      'is_test_account', p.is_test_account,
      'created_at', p.created_at
    ),
    'processed_by_name', admin_p.full_name,
    'wallet_balance', (SELECT w.balance FROM public.wallets w WHERE w.user_id = d.student_id),
    'adjustment', (SELECT to_jsonb(wa) FROM public.wallet_adjustments wa WHERE wa.id = d.wallet_adjustment_id),
    'student_deposits', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', x.id, 'amount', x.amount, 'status', x.status,
        'created_at', x.created_at, 'processed_at', x.processed_at
      ) ORDER BY x.created_at), '[]'::jsonb)
      FROM public.deposit_requests x
      WHERE x.student_id = d.student_id
    ),
    'audit_logs', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', fal.id,
        'action', fal.action,
        'amount', fal.amount,
        'reason', fal.reason,
        'metadata', fal.metadata,
        'old_value', fal.old_value,
        'new_value', fal.new_value,
        'created_at', fal.created_at,
        'actor_name', ap.full_name
      ) ORDER BY fal.created_at DESC), '[]'::jsonb)
      FROM public.financial_audit_logs fal
      LEFT JOIN public.profiles ap ON ap.id = fal.actor_id
      WHERE fal.metadata->>'deposit_request_id' = d.id::text
         OR (fal.metadata->>'student_id' = d.student_id::text AND fal.created_at >= d.created_at - interval '1 minute')
    )
  )
  INTO result
  FROM public.deposit_requests d
  LEFT JOIN public.profiles p ON p.id = d.student_id
  LEFT JOIN public.profiles admin_p ON admin_p.id = d.processed_by
  WHERE d.id = _id;

  IF result IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_student_deposit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_student_deposit(uuid) TO authenticated;
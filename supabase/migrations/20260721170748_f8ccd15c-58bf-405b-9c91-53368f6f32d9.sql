
-- Enhanced teacher wallet listing: base on user_roles (all teachers), auto-materialize wallet rows on read,
-- add phone and teacher_code search, exclude test accounts.

CREATE OR REPLACE FUNCTION public.admin_list_teacher_wallets(
  _search text DEFAULT NULL,
  _limit  integer DEFAULT 100,
  _offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_rows jsonb;
  v_total int;
  v_q text := NULLIF(btrim(COALESCE(_search, '')), '');
BEGIN
  IF NOT has_role(v_caller, 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  -- Auto-create wallet for any teacher missing a wallet row (idempotent).
  INSERT INTO public.teacher_wallets (teacher_id, balance, frozen_balance, total_earned, current_period)
  SELECT ur.user_id, 0, 0, 0, to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM')
  FROM public.user_roles ur
  LEFT JOIN public.teacher_wallets tw ON tw.teacher_id = ur.user_id
  WHERE ur.role = 'teacher' AND tw.teacher_id IS NULL
  ON CONFLICT (teacher_id) DO NOTHING;

  WITH base AS (
    SELECT tw.teacher_id,
           COALESCE(p.full_name, 'معلم') AS name,
           p.email,
           p.phone,
           p.teacher_code,
           tw.balance,
           tw.frozen_balance,
           tw.total_earned,
           tw.current_period,
           tw.updated_at,
           (SELECT COUNT(*) FROM public.teacher_withdrawal_requests wr
              WHERE wr.teacher_id = tw.teacher_id AND wr.status = 'pending') AS pending_requests
    FROM public.teacher_wallets tw
    JOIN public.user_roles ur ON ur.user_id = tw.teacher_id AND ur.role = 'teacher'
    LEFT JOIN public.profiles p ON p.id = tw.teacher_id
    WHERE COALESCE(p.is_test_account, false) = false
      AND (
        v_q IS NULL
        OR p.full_name ILIKE '%'||v_q||'%'
        OR p.email     ILIKE '%'||v_q||'%'
        OR p.phone     ILIKE '%'||v_q||'%'
        OR p.teacher_code ILIKE '%'||v_q||'%'
        OR tw.teacher_id::text = v_q
      )
  )
  SELECT COUNT(*) INTO v_total FROM base;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total_earned DESC NULLS LAST), '[]'::jsonb)
  INTO v_rows FROM (
    SELECT * FROM (
      SELECT tw.teacher_id,
             COALESCE(p.full_name, 'معلم') AS name,
             p.email,
             p.phone,
             p.teacher_code,
             tw.balance,
             tw.frozen_balance,
             tw.total_earned,
             tw.current_period,
             tw.updated_at,
             (SELECT COUNT(*) FROM public.teacher_withdrawal_requests wr
                WHERE wr.teacher_id = tw.teacher_id AND wr.status = 'pending') AS pending_requests
      FROM public.teacher_wallets tw
      JOIN public.user_roles ur ON ur.user_id = tw.teacher_id AND ur.role = 'teacher'
      LEFT JOIN public.profiles p ON p.id = tw.teacher_id
      WHERE COALESCE(p.is_test_account, false) = false
        AND (
          v_q IS NULL
          OR p.full_name ILIKE '%'||v_q||'%'
          OR p.email     ILIKE '%'||v_q||'%'
          OR p.phone     ILIKE '%'||v_q||'%'
          OR p.teacher_code ILIKE '%'||v_q||'%'
          OR tw.teacher_id::text = v_q
        )
      ORDER BY tw.total_earned DESC NULLS LAST, tw.balance DESC NULLS LAST
      LIMIT GREATEST(_limit, 1) OFFSET GREATEST(_offset, 0)
    ) y
  ) x;

  RETURN jsonb_build_object('success', true, 'total', v_total, 'rows', v_rows);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_list_teacher_wallets(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_teacher_wallets(text, integer, integer) TO authenticated, service_role;


-- Seed hour/minute settings if missing
INSERT INTO public.platform_settings (key, value)
VALUES ('withdrawal_open_hour', '9'), ('withdrawal_open_minute', '0'), ('withdrawal_last_release_at', '')
ON CONFLICT (key) DO NOTHING;

-- Upgraded auto-archive: run only at (or after) the configured Cairo time,
-- and only once per configured day.
CREATE OR REPLACE FUNCTION public.auto_archive_if_due()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_day int;
  v_hour int;
  v_minute int;
  v_now_cairo timestamptz := (now() AT TIME ZONE 'Africa/Cairo')::timestamptz;
  v_today_cairo date := (now() AT TIME ZONE 'Africa/Cairo')::date;
  v_last text;
  v_last_date date;
  v_count int := 0;
  r record;
  v_manual text;
BEGIN
  SELECT COALESCE(NULLIF(value,'')::int, 25) INTO v_day
    FROM public.platform_settings WHERE key = 'withdrawal_open_day';
  SELECT COALESCE(NULLIF(value,'')::int, 9) INTO v_hour
    FROM public.platform_settings WHERE key = 'withdrawal_open_hour';
  SELECT COALESCE(NULLIF(value,'')::int, 0) INTO v_minute
    FROM public.platform_settings WHERE key = 'withdrawal_open_minute';
  SELECT value INTO v_manual
    FROM public.platform_settings WHERE key = 'withdrawal_manual_state';

  -- If admin manually stopped withdrawals, do NOT auto-archive
  IF v_manual = 'closed' THEN
    RETURN jsonb_build_object('success', true, 'archived_count', 0, 'skipped', 'manual_closed');
  END IF;

  -- Only on the target day
  IF EXTRACT(DAY FROM v_today_cairo)::int <> COALESCE(v_day, 25) THEN
    RETURN jsonb_build_object('success', true, 'archived_count', 0, 'skipped', 'wrong_day');
  END IF;

  -- Only after configured time
  IF (EXTRACT(HOUR FROM v_now_cairo)::int * 60 + EXTRACT(MINUTE FROM v_now_cairo)::int)
     < (COALESCE(v_hour, 9) * 60 + COALESCE(v_minute, 0)) THEN
    RETURN jsonb_build_object('success', true, 'archived_count', 0, 'skipped', 'before_time');
  END IF;

  -- Only once per day
  SELECT value INTO v_last FROM public.platform_settings WHERE key = 'withdrawal_last_release_at';
  IF v_last IS NOT NULL AND v_last <> '' THEN
    BEGIN
      v_last_date := (v_last::timestamptz AT TIME ZONE 'Africa/Cairo')::date;
    EXCEPTION WHEN OTHERS THEN v_last_date := NULL;
    END;
    IF v_last_date IS NOT NULL AND v_last_date = v_today_cairo THEN
      RETURN jsonb_build_object('success', true, 'archived_count', 0, 'skipped', 'already_run_today');
    END IF;
  END IF;

  FOR r IN SELECT teacher_id FROM public.teacher_wallets WHERE frozen_balance > 0 LOOP
    PERFORM public.archive_teacher_period(r.teacher_id);
    v_count := v_count + 1;
  END LOOP;

  -- Record last run
  INSERT INTO public.platform_settings (key, value)
  VALUES ('withdrawal_last_release_at', now()::text)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  RETURN jsonb_build_object('success', true, 'archived_count', v_count, 'ran_at', now());
END;
$function$;

-- Also record last release when admin triggers manual release
CREATE OR REPLACE FUNCTION public.archive_all_teachers_period()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_count int := 0;
  r record;
BEGIN
  IF NOT has_role(v_caller, 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  FOR r IN SELECT teacher_id FROM public.teacher_wallets WHERE frozen_balance > 0 LOOP
    PERFORM public.archive_teacher_period(r.teacher_id);
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.platform_settings (key, value)
  VALUES ('withdrawal_last_release_at', now()::text)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  RETURN jsonb_build_object('success', true, 'archived_count', v_count, 'ran_at', now());
END;
$function$;

-- Admin dashboard stats for withdrawal panel
CREATE OR REPLACE FUNCTION public.admin_get_withdrawal_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF NOT has_role(v_caller, 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'total_available', COALESCE((SELECT SUM(balance) FROM public.teacher_wallets), 0),
    'total_frozen', COALESCE((SELECT SUM(frozen_balance) FROM public.teacher_wallets), 0),
    'total_teachers', COALESCE((SELECT COUNT(*) FROM public.teacher_wallets), 0),
    'teachers_with_frozen', COALESCE((SELECT COUNT(*) FROM public.teacher_wallets WHERE frozen_balance > 0), 0),
    'pending_requests', COALESCE((SELECT COUNT(*) FROM public.teacher_withdrawal_requests WHERE status = 'pending'), 0),
    'pending_amount', COALESCE((SELECT SUM(amount) FROM public.teacher_withdrawal_requests WHERE status = 'pending'), 0),
    'approved_total', COALESCE((SELECT SUM(amount) FROM public.teacher_withdrawal_requests WHERE status = 'approved'), 0),
    'approved_count', COALESCE((SELECT COUNT(*) FROM public.teacher_withdrawal_requests WHERE status = 'approved'), 0),
    'rejected_count', COALESCE((SELECT COUNT(*) FROM public.teacher_withdrawal_requests WHERE status = 'rejected'), 0),
    'last_release_at', (SELECT value FROM public.platform_settings WHERE key = 'withdrawal_last_release_at'),
    'archives_this_month', COALESCE((
      SELECT COUNT(*) FROM public.teacher_monthly_archives
      WHERE archived_at >= date_trunc('month', now() AT TIME ZONE 'Africa/Cairo')
    ), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_withdrawal_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_withdrawal_dashboard() TO authenticated;


-- 1) DISABLE any automated (pg_cron) monthly withdrawal release.
-- Archiving becomes fully manual (admin-triggered only).
DO $$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='cron') THEN
    FOR r IN
      EXECUTE 'SELECT jobname FROM cron.job
                WHERE jobname ILIKE ''%withdrawal%''
                   OR jobname ILIKE ''%monthly_release%''
                   OR jobname ILIKE ''%financial_release%''
                   OR command  ILIKE ''%process_scheduled_withdrawal_release%''
                   OR command  ILIKE ''%archive_all_teachers_period%''
                   OR command  ILIKE ''%auto_archive_if_due%'''
    LOOP
      EXECUTE format('SELECT cron.unschedule(%L)', r.jobname);
    END LOOP;
  END IF;
END$$;

-- Neutralize the scheduled function so if anything still calls it, it becomes a no-op.
CREATE OR REPLACE FUNCTION public.process_scheduled_withdrawal_release()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN jsonb_build_object(
    'success', true,
    'skipped', true,
    'reason', 'auto-release disabled — admin must trigger manually'
  );
END;
$$;

-- Record the operating mode so the UI can display it.
INSERT INTO public.platform_settings (key, value, updated_at)
VALUES ('withdrawal_release_mode', 'manual', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- 2) NEW: aggregate history summary across ALL teachers for each period.
CREATE OR REPLACE FUNCTION public.admin_monthly_history_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_rows jsonb;
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.period_label DESC), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT tma.period_label,
           COUNT(DISTINCT tma.teacher_id)          AS teachers,
           COALESCE(SUM(tma.total_earned), 0)      AS total_earned,
           COALESCE(SUM(tma.total_subscribers), 0) AS total_subscribers,
           COALESCE(SUM(tma.total_groups), 0)      AS total_groups,
           MAX(tma.archived_at)                    AS last_archived_at
    FROM public.teacher_monthly_archives tma
    GROUP BY tma.period_label
  ) x;

  RETURN jsonb_build_object('success', true, 'rows', v_rows);
END;
$$;

-- 3) NEW: per-teacher breakdown for a given period (for drill-in view).
CREATE OR REPLACE FUNCTION public.admin_monthly_period_teachers(_period_label text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_rows jsonb;
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total_earned DESC), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT tma.teacher_id,
           COALESCE(p.full_name, 'معلم')            AS teacher_name,
           p.email                                  AS teacher_email,
           tma.total_earned,
           tma.total_subscribers,
           tma.total_groups,
           tma.commission_rate,
           tma.breakdown,
           tma.archived_at
    FROM public.teacher_monthly_archives tma
    LEFT JOIN public.profiles p ON p.id = tma.teacher_id
    WHERE tma.period_label = _period_label
  ) x;

  RETURN jsonb_build_object('success', true, 'period_label', _period_label, 'rows', v_rows);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_monthly_history_summary() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_monthly_period_teachers(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_scheduled_withdrawal_release() TO service_role;


-- Isolate developer monthly closing from teacher wallet archiving.
-- The developer "Monthly Closing" button must ONLY snapshot the admin
-- overview dashboard. Teacher monthly archives are handled by a separate
-- teacher-scoped button and must NOT run here.

CREATE OR REPLACE FUNCTION public.admin_close_financial_month(_notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_period_start timestamptz;
  v_period_start_text text;
  v_cal_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'Africa/Cairo');
  v_end timestamptz := now();
  v_snapshot jsonb;
  v_id uuid;
  v_period_label text;
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  SELECT value INTO v_period_start_text FROM public.platform_settings WHERE key = 'financial_period_start_at';
  BEGIN v_period_start := COALESCE(v_period_start_text::timestamptz, v_cal_month_start);
  EXCEPTION WHEN others THEN v_period_start := v_cal_month_start; END;

  v_snapshot := public._admin_build_financial_snapshot(v_period_start, v_end);
  v_period_label := to_char(v_period_start AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD')
                    || ' → ' ||
                    to_char(v_end AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD');

  INSERT INTO public.admin_overview_snapshots (
    period_label, snapshot, notes, created_by,
    kind, period_start, period_end, is_closing
  ) VALUES (
    v_period_label, v_snapshot, _notes, v_caller,
    'closing', v_period_start, v_end, true
  ) RETURNING id INTO v_id;

  -- NOTE: intentionally does NOT call archive_all_teachers_period().
  -- Teacher wallet archiving is a separate operation triggered by its own admin button.

  INSERT INTO public.platform_settings (key, value)
  VALUES ('financial_period_start_at', v_end::text)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  INSERT INTO public.platform_settings (key, value)
  VALUES ('financial_last_close_at', v_end::text)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'id', v_id,
    'period_label', v_period_label,
    'period_start', v_period_start,
    'period_end', v_end,
    'scope', 'developer_overview_only'
  );
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_close_financial_month(
  _notes text DEFAULT NULL::text,
  _period_month integer DEFAULT NULL::integer,
  _period_year integer DEFAULT NULL::integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_period_start timestamptz;
  v_period_start_text text;
  v_cal_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'Africa/Cairo');
  v_end timestamptz := now();
  v_snapshot jsonb;
  v_id uuid;
  v_period_label text;
  v_ar_months text[] := ARRAY['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  SELECT value INTO v_period_start_text FROM public.platform_settings WHERE key = 'financial_period_start_at';
  BEGIN v_period_start := COALESCE(v_period_start_text::timestamptz, v_cal_month_start);
  EXCEPTION WHEN others THEN v_period_start := v_cal_month_start; END;

  v_snapshot := public._admin_build_financial_snapshot(v_period_start, v_end);

  IF _period_month IS NOT NULL AND _period_year IS NOT NULL
     AND _period_month BETWEEN 1 AND 12 AND _period_year BETWEEN 2020 AND 2100 THEN
    v_period_label := v_ar_months[_period_month] || ' ' || _period_year::text;
    v_snapshot := v_snapshot
      || jsonb_build_object(
           'manual_period', jsonb_build_object(
             'month', _period_month,
             'year', _period_year,
             'label', v_period_label,
             'executed_at', v_end
           )
         );
  ELSE
    v_period_label := to_char(v_period_start AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD')
                      || ' → ' ||
                      to_char(v_end AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD');
  END IF;

  INSERT INTO public.admin_overview_snapshots (
    period_label, snapshot, notes, created_by,
    kind, period_start, period_end, is_closing
  ) VALUES (
    v_period_label, v_snapshot, _notes, v_caller,
    'closing', v_period_start, v_end, true
  ) RETURNING id INTO v_id;

  -- NOTE: intentionally does NOT call archive_all_teachers_period().
  -- Teacher wallet archiving is handled by a separate admin action.

  INSERT INTO public.platform_settings (key, value)
  VALUES ('financial_period_start_at', v_end::text)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  INSERT INTO public.platform_settings (key, value)
  VALUES ('financial_last_close_at', v_end::text)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'id', v_id,
    'period_label', v_period_label,
    'period_start', v_period_start,
    'period_end', v_end,
    'manual_month', _period_month,
    'manual_year', _period_year,
    'scope', 'developer_overview_only'
  );
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_close_financial_month(text) FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_close_financial_month(text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_close_financial_month(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_close_financial_month(text, integer, integer) TO authenticated;

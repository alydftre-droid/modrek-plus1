
-- 1) Extend admin_set_withdrawal_schedule to accept manual month/year override for teacher closing notification
DROP FUNCTION IF EXISTS public.admin_set_withdrawal_schedule(int, int, int, text);

CREATE OR REPLACE FUNCTION public.admin_set_withdrawal_schedule(
  _day integer,
  _hour integer,
  _minute integer,
  _manual_state text DEFAULT 'auto',
  _month integer DEFAULT NULL,
  _year integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_email text := lower(COALESCE(auth.jwt() ->> 'email', ''));
  v_day integer := LEAST(GREATEST(COALESCE(_day, 25), 1), 28);
  v_hour integer := LEAST(GREATEST(COALESCE(_hour, 9), 0), 23);
  v_minute integer := LEAST(GREATEST(COALESCE(_minute, 0), 0), 59);
  v_state text := CASE WHEN COALESCE(_manual_state, 'auto') = 'closed' THEN 'closed' ELSE 'auto' END;
  v_month integer := CASE WHEN _month IS NOT NULL THEN LEAST(GREATEST(_month, 1), 12) ELSE NULL END;
  v_year integer := CASE WHEN _year IS NOT NULL THEN LEAST(GREATEST(_year, 2020), 2100) ELSE NULL END;
  v_cairo_now timestamp := now() AT TIME ZONE 'Africa/Cairo';
  v_next_ts timestamp;
  v_next_key text;
BEGIN
  IF v_caller IS NULL OR NOT (
    public.has_role(v_caller, 'admin'::public.app_role)
    OR v_email IN ('alyedaft@gmail.com', 'aliana200713@gmail.com')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  v_next_ts := make_timestamp(
    EXTRACT(YEAR FROM v_cairo_now)::int,
    EXTRACT(MONTH FROM v_cairo_now)::int,
    v_day, v_hour, v_minute, 0
  );
  IF v_next_ts <= v_cairo_now THEN
    v_next_ts := (v_next_ts + interval '1 month')::timestamp;
  END IF;
  v_next_key := to_char(v_next_ts, 'YYYY-MM-DD HH24:MI');

  INSERT INTO public.platform_settings (key, value, updated_at)
  VALUES
    ('withdrawal_open_day', v_day::text, now()),
    ('withdrawal_open_hour', v_hour::text, now()),
    ('withdrawal_open_minute', v_minute::text, now()),
    ('withdrawal_manual_state', v_state, now()),
    ('withdrawal_release_mode', 'scheduled', now()),
    ('withdrawal_next_release_at_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'), now()),
    ('withdrawal_next_release_key', v_next_key, now()),
    ('withdrawal_schedule_saved_at', now()::text, now())
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = now();

  IF v_month IS NOT NULL AND v_year IS NOT NULL THEN
    INSERT INTO public.platform_settings (key, value, updated_at)
    VALUES
      ('withdrawal_notification_month', v_month::text, now()),
      ('withdrawal_notification_year', v_year::text, now())
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();
  END IF;

  INSERT INTO public.financial_audit_logs (actor_id, action, new_value, reason, metadata)
  VALUES (
    v_caller,
    'withdrawal_schedule_saved',
    jsonb_build_object(
      'day', v_day, 'hour', v_hour, 'minute', v_minute,
      'manual_state', v_state,
      'notification_month', v_month,
      'notification_year', v_year,
      'next_release_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'next_release_key', v_next_key
    ),
    'Withdrawal closing schedule saved by admin',
    jsonb_build_object('source', 'admin_set_withdrawal_schedule')
  );

  RETURN jsonb_build_object(
    'success', true,
    'day', v_day, 'hour', v_hour, 'minute', v_minute,
    'manual_state', v_state,
    'notification_month', v_month,
    'notification_year', v_year,
    'next_release_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'),
    'next_release_key', v_next_key
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_withdrawal_schedule(int, int, int, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_withdrawal_schedule(int, int, int, text, int, int) TO authenticated, service_role;

-- 2) Trigger to send "wallet opened" notification when frozen_release transaction is inserted,
-- honoring the admin's manual month/year override from platform_settings.
CREATE OR REPLACE FUNCTION public._notify_teacher_frozen_release()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_month_override text;
  v_year_override text;
  v_period_meta text;
  v_display_label text;
BEGIN
  IF NEW.transaction_type IS DISTINCT FROM 'frozen_release' THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_month_override FROM public.platform_settings WHERE key = 'withdrawal_notification_month';
  SELECT value INTO v_year_override  FROM public.platform_settings WHERE key = 'withdrawal_notification_year';

  IF v_month_override IS NOT NULL AND v_month_override <> ''
     AND v_year_override IS NOT NULL AND v_year_override <> '' THEN
    v_display_label := lpad(v_month_override, 2, '0') || '-' || v_year_override;
  ELSE
    v_period_meta := COALESCE(
      NEW.metadata->>'period_label',
      to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM')
    );
    -- period_label is YYYY-MM; format as MM-YYYY for display
    v_display_label := split_part(v_period_meta, '-', 2) || '-' || split_part(v_period_meta, '-', 1);
  END IF;

  BEGIN
    INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent)
    VALUES (
      NEW.teacher_id,
      '✅ تم فتح السحب لشهر ' || v_display_label,
      'تم نقل أرباح الشهر إلى الرصيد المتاح للسحب: ' || NEW.amount::text || ' جنيه، وتم حفظ نسخة أرشيفية كاملة للمحفظة.',
      'wallet',
      '/teacher/wallet',
      false,
      true
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never fail the wallet transaction because of notification errors
    NULL;
  END;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_teacher_frozen_release ON public.teacher_wallet_transactions;
CREATE TRIGGER trg_notify_teacher_frozen_release
AFTER INSERT ON public.teacher_wallet_transactions
FOR EACH ROW
EXECUTE FUNCTION public._notify_teacher_frozen_release();

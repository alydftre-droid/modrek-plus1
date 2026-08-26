-- 1) Helper: current withdrawal-requests window state
CREATE OR REPLACE FUNCTION public.get_withdrawal_requests_window()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'state',        COALESCE((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_requests_state'), 'auto'),
    'open_at',      (SELECT value FROM public.platform_settings WHERE key = 'withdrawal_requests_open_at'),
    'notice',       (SELECT value FROM public.platform_settings WHERE key = 'withdrawal_notice_message'),
    'open_day',     COALESCE((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_open_day'), '25'),
    'manual_state', COALESCE((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_manual_state'), 'auto'),
    'now_cairo',    to_char((now() AT TIME ZONE 'Africa/Cairo'), 'YYYY-MM-DD HH24:MI')
  );
$$;

REVOKE ALL ON FUNCTION public.get_withdrawal_requests_window() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_withdrawal_requests_window() TO authenticated, service_role;

-- 2) Boolean gate used by UI and the insert guard
CREATE OR REPLACE FUNCTION public.is_withdrawal_requests_open()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state text;
  v_open_at text;
  v_manual text;
  v_open_day int;
  v_now timestamp;
  v_target timestamp;
BEGIN
  SELECT value INTO v_state FROM public.platform_settings WHERE key = 'withdrawal_requests_state';
  SELECT value INTO v_open_at FROM public.platform_settings WHERE key = 'withdrawal_requests_open_at';
  SELECT value INTO v_manual FROM public.platform_settings WHERE key = 'withdrawal_manual_state';
  SELECT COALESCE(NULLIF(value, ''), '25') INTO v_open_day FROM public.platform_settings WHERE key = 'withdrawal_open_day';
  v_open_day := COALESCE(v_open_day, 25);
  v_now := (now() AT TIME ZONE 'Africa/Cairo');

  IF v_state = 'open' THEN RETURN true; END IF;
  IF v_state = 'closed' THEN RETURN false; END IF;

  IF v_state = 'scheduled' THEN
    IF v_open_at IS NULL OR v_open_at = '' THEN RETURN false; END IF;
    BEGIN
      v_target := to_timestamp(v_open_at, 'YYYY-MM-DD HH24:MI')::timestamp;
    EXCEPTION WHEN OTHERS THEN
      RETURN false;
    END;
    RETURN v_now >= v_target;
  END IF;

  -- legacy auto behaviour
  IF v_manual = 'open' THEN RETURN true; END IF;
  IF v_manual = 'closed' THEN RETURN false; END IF;
  RETURN EXTRACT(DAY FROM v_now)::int >= v_open_day;
END;
$$;

REVOKE ALL ON FUNCTION public.is_withdrawal_requests_open() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_withdrawal_requests_open() TO authenticated, service_role;

-- 3) Developer-only setter
CREATE OR REPLACE FUNCTION public.admin_set_withdrawal_requests_window(
  _state text,
  _open_at text DEFAULT NULL,
  _notice text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state text := lower(COALESCE(NULLIF(trim(_state), ''), 'auto'));
  v_open_at text := NULLIF(trim(COALESCE(_open_at, '')), '');
BEGIN
  PERFORM public.assert_admin_caller();

  IF v_state NOT IN ('auto', 'open', 'closed', 'scheduled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'حالة غير صحيحة');
  END IF;

  IF v_state = 'scheduled' THEN
    IF v_open_at IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'يجب تحديد تاريخ ووقت الفتح');
    END IF;
    BEGIN
      PERFORM to_timestamp(v_open_at, 'YYYY-MM-DD HH24:MI');
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('success', false, 'error', 'صيغة التاريخ غير صحيحة');
    END;
  END IF;

  INSERT INTO public.platform_settings (key, value)
  VALUES ('withdrawal_requests_state', v_state)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  INSERT INTO public.platform_settings (key, value)
  VALUES ('withdrawal_requests_open_at', COALESCE(v_open_at, ''))
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  IF _notice IS NOT NULL THEN
    INSERT INTO public.platform_settings (key, value)
    VALUES ('withdrawal_notice_message', trim(_notice))
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'state', v_state,
    'open_at', v_open_at,
    'is_open', public.is_withdrawal_requests_open()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_withdrawal_requests_window(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_withdrawal_requests_window(text, text, text) TO authenticated, service_role;

-- 4) Defense in depth: block teacher inserts while withdrawals are closed
CREATE OR REPLACE FUNCTION public.enforce_withdrawal_request_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NOT public.is_withdrawal_requests_open() THEN
    RAISE EXCEPTION 'WITHDRAWALS_CLOSED';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_withdrawal_request_window ON public.teacher_withdrawal_requests;
CREATE TRIGGER trg_enforce_withdrawal_request_window
BEFORE INSERT ON public.teacher_withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_withdrawal_request_window();
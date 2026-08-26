CREATE OR REPLACE FUNCTION public.get_withdrawal_requests_window()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state text := COALESCE((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_requests_state'), 'auto');
  v_open_at_text text := NULLIF((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_requests_open_at'), '');
  v_notice text := COALESCE((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_notice_message'), '');
  v_open_day int := COALESCE(NULLIF((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_open_day'), '')::int, 25);
  v_manual text := COALESCE((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_manual_state'), 'auto');
  v_now_cairo timestamp := now() AT TIME ZONE 'Africa/Cairo';
  v_open_at timestamp;
  v_is_open boolean := false;
BEGIN
  IF v_open_at_text IS NOT NULL THEN
    BEGIN
      v_open_at := to_timestamp(v_open_at_text, 'YYYY-MM-DD HH24:MI')::timestamp;
    EXCEPTION WHEN OTHERS THEN
      v_open_at := NULL;
    END;
  END IF;

  v_is_open := CASE
    WHEN v_state = 'open' THEN true
    WHEN v_state = 'closed' THEN false
    WHEN v_state = 'scheduled' THEN v_open_at IS NOT NULL AND v_now_cairo >= v_open_at
    WHEN v_manual = 'open' THEN true
    WHEN v_manual = 'closed' THEN false
    ELSE EXTRACT(DAY FROM v_now_cairo)::int >= v_open_day
  END;

  RETURN jsonb_build_object(
    'state', v_state,
    'open_at', v_open_at_text,
    'notice', v_notice,
    'open_day', v_open_day,
    'manual_state', v_manual,
    'now_cairo', to_char(v_now_cairo, 'YYYY-MM-DD HH24:MI'),
    'is_open', v_is_open
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_withdrawal_requests_window() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_withdrawal_requests_window() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_withdrawal_requests_open()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((public.get_withdrawal_requests_window()->>'is_open')::boolean, false)
$$;

REVOKE ALL ON FUNCTION public.is_withdrawal_requests_open() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_withdrawal_requests_open() TO authenticated, service_role;

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
  v_parsed timestamp;
BEGIN
  PERFORM public.assert_admin_caller();

  IF v_state NOT IN ('auto', 'open', 'closed', 'scheduled') THEN
    RAISE EXCEPTION 'INVALID_WITHDRAWAL_STATE';
  END IF;

  IF v_state = 'scheduled' THEN
    IF v_open_at IS NULL OR v_open_at !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' THEN
      RAISE EXCEPTION 'INVALID_WITHDRAWAL_OPEN_AT';
    END IF;
    v_parsed := to_timestamp(v_open_at, 'YYYY-MM-DD HH24:MI')::timestamp;
    IF to_char(v_parsed, 'YYYY-MM-DD HH24:MI') <> v_open_at THEN
      RAISE EXCEPTION 'INVALID_WITHDRAWAL_OPEN_AT';
    END IF;
  END IF;

  INSERT INTO public.platform_settings (key, value)
  VALUES ('withdrawal_requests_state', v_state)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  INSERT INTO public.platform_settings (key, value)
  VALUES ('withdrawal_requests_open_at', CASE WHEN v_state = 'scheduled' THEN v_open_at ELSE '' END)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  IF _notice IS NOT NULL THEN
    INSERT INTO public.platform_settings (key, value)
    VALUES ('withdrawal_notice_message', trim(_notice))
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  END IF;

  RETURN jsonb_build_object('success', true, 'window', public.get_withdrawal_requests_window());
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_withdrawal_requests_window(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_withdrawal_requests_window(text, text, text) TO authenticated, service_role;

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
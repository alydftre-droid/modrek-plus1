-- Correct the permanent recharge-code deposit logging implementation.

CREATE OR REPLACE FUNCTION public.record_recharge_code_deposit_request(
  _user_id uuid,
  _code_id uuid,
  _used_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric;
  v_code_text text;
  v_masked text;
BEGIN
  SELECT amount, code
  INTO v_amount, v_code_text
  FROM public.recharge_codes
  WHERE id = _code_id;

  IF v_amount IS NULL THEN
    RETURN;
  END IF;

  IF v_code_text IS NULL THEN
    v_masked := NULL;
  ELSIF length(v_code_text) > 4 THEN
    v_masked := substr(v_code_text, 1, 2)
      || repeat('*', greatest(length(v_code_text) - 4, 1))
      || substr(v_code_text, length(v_code_text) - 1, 2);
  ELSE
    v_masked := repeat('*', length(v_code_text));
  END IF;

  INSERT INTO public.deposit_requests (
    student_id,
    amount,
    payment_method,
    status,
    deposit_type,
    recharge_code_id,
    recharge_code,
    processed_at,
    notes
  ) VALUES (
    _user_id,
    v_amount,
    'recharge_code',
    'approved',
    'recharge_code',
    _code_id,
    v_masked,
    COALESCE(_used_at, now()),
    'إيداع تلقائي عبر كود شحن'
  )
  ON CONFLICT (student_id, recharge_code_id) WHERE recharge_code_id IS NOT NULL DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.record_recharge_code_deposit_request(uuid, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_recharge_code_deposit_request(uuid, uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.record_recharge_code_deposit_request(uuid, uuid, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_recharge_code_deposit_request(uuid, uuid, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_recharge_code_deposit_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.record_recharge_code_deposit_request(NEW.user_id, NEW.code_id, NEW.used_at);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_recharge_code_deposit_request() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_recharge_code_deposit_request() FROM anon;
REVOKE ALL ON FUNCTION public.ensure_recharge_code_deposit_request() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_recharge_code_deposit_request() TO service_role;

DROP TRIGGER IF EXISTS trg_ensure_recharge_code_deposit_request ON public.recharge_code_uses;
CREATE TRIGGER trg_ensure_recharge_code_deposit_request
AFTER INSERT ON public.recharge_code_uses
FOR EACH ROW
EXECUTE FUNCTION public.ensure_recharge_code_deposit_request();

CREATE OR REPLACE FUNCTION public.redeem_recharge_code(_user_id uuid, _code_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code_id uuid;
  v_amount numeric;
  v_is_active boolean;
  v_current_uses int;
  v_max_uses int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح بتنفيذ العملية');
  END IF;

  SELECT id, amount, is_active, current_uses, max_uses
  INTO v_code_id, v_amount, v_is_active, v_current_uses, v_max_uses
  FROM public.recharge_codes
  WHERE code = _code_text
  FOR UPDATE;

  IF v_code_id IS NULL OR NOT v_is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'كود غير صالح أو منتهي');
  END IF;

  IF v_current_uses >= v_max_uses THEN
    RETURN jsonb_build_object('success', false, 'error', 'تم استخدام هذا الكود بالكامل');
  END IF;

  BEGIN
    INSERT INTO public.recharge_code_uses (code_id, user_id)
    VALUES (v_code_id, _user_id);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'لقد استخدمت هذا الكود من قبل');
  END;

  INSERT INTO public.wallets (user_id, balance)
  VALUES (_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.wallets
  SET balance = balance + v_amount,
      updated_at = now()
  WHERE user_id = _user_id;

  UPDATE public.recharge_codes
  SET current_uses = current_uses + 1
  WHERE id = v_code_id;

  PERFORM public.record_recharge_code_deposit_request(_user_id, v_code_id, now());

  RETURN jsonb_build_object('success', true, 'amount', v_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_recharge_code(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_recharge_code(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.redeem_recharge_code(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_recharge_code(uuid, text) TO service_role;

-- Backfill any existing successful code uses that still do not have a deposit row.
INSERT INTO public.deposit_requests (
  student_id,
  amount,
  payment_method,
  status,
  deposit_type,
  recharge_code_id,
  recharge_code,
  processed_at,
  created_at,
  notes
)
SELECT
  u.user_id,
  c.amount,
  'recharge_code',
  'approved',
  'recharge_code',
  u.code_id,
  CASE
    WHEN c.code IS NULL THEN NULL
    WHEN length(c.code) > 4 THEN substr(c.code, 1, 2) || repeat('*', greatest(length(c.code) - 4, 1)) || substr(c.code, length(c.code) - 1, 2)
    ELSE repeat('*', length(c.code))
  END,
  COALESCE(u.used_at, now()),
  COALESCE(u.used_at, now()),
  'إيداع تلقائي عبر كود شحن'
FROM public.recharge_code_uses u
JOIN public.recharge_codes c ON c.id = u.code_id
LEFT JOIN public.deposit_requests d
  ON d.student_id = u.user_id
 AND d.recharge_code_id = u.code_id
WHERE d.id IS NULL
ON CONFLICT (student_id, recharge_code_id) WHERE recharge_code_id IS NOT NULL DO NOTHING;
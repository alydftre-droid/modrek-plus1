ALTER TABLE public.deposit_requests ALTER COLUMN phone_number DROP NOT NULL;
ALTER TABLE public.deposit_requests ALTER COLUMN receipt_url DROP NOT NULL;

ALTER TABLE public.deposit_requests
  ADD COLUMN IF NOT EXISTS deposit_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS recharge_code_id uuid REFERENCES public.recharge_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recharge_code text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS wallet_adjustment_id uuid REFERENCES public.wallet_adjustments(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_deposit_recharge_code_use
  ON public.deposit_requests (student_id, recharge_code_id)
  WHERE recharge_code_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_deposit_wallet_adjustment
  ON public.deposit_requests (wallet_adjustment_id)
  WHERE wallet_adjustment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deposit_requests_student_created
  ON public.deposit_requests (student_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.normalize_deposit_request_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();

  IF NEW.deposit_type IS NULL OR btrim(NEW.deposit_type) = '' THEN
    NEW.deposit_type := CASE
      WHEN NEW.recharge_code_id IS NOT NULL OR NEW.payment_method = 'recharge_code' THEN 'recharge_code'
      WHEN NEW.wallet_adjustment_id IS NOT NULL OR NEW.payment_method = 'admin_manual' THEN 'admin_manual'
      ELSE 'manual'
    END;
  END IF;

  IF NEW.status IS NULL OR btrim(NEW.status) = '' THEN
    NEW.status := 'pending';
  END IF;

  IF NEW.payment_method IS NULL OR btrim(NEW.payment_method) = '' THEN
    NEW.payment_method := CASE
      WHEN NEW.deposit_type = 'recharge_code' THEN 'recharge_code'
      WHEN NEW.deposit_type = 'admin_manual' THEN 'admin_manual'
      ELSE 'manual'
    END;
  END IF;

  IF NEW.deposit_type IN ('recharge_code', 'admin_manual') AND NEW.status = 'approved' AND NEW.processed_at IS NULL THEN
    NEW.processed_at := COALESCE(NEW.created_at, now());
  END IF;

  IF NEW.deposit_type = 'recharge_code' AND (NEW.notes IS NULL OR btrim(NEW.notes) = '') THEN
    NEW.notes := 'إيداع تلقائي عبر كود شحن';
  ELSIF NEW.deposit_type = 'admin_manual' AND (NEW.notes IS NULL OR btrim(NEW.notes) = '') THEN
    NEW.notes := 'إعادة شحن تلقائي من الإدارة';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_deposit_request_record ON public.deposit_requests;
CREATE TRIGGER trg_normalize_deposit_request_record
BEFORE INSERT OR UPDATE ON public.deposit_requests
FOR EACH ROW
EXECUTE FUNCTION public.normalize_deposit_request_record();

REVOKE ALL ON FUNCTION public.normalize_deposit_request_record() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_deposit_request_record() FROM anon;
REVOKE ALL ON FUNCTION public.normalize_deposit_request_record() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_deposit_request_record() TO service_role;

CREATE OR REPLACE FUNCTION public.record_recharge_code_deposit_request(
  _user_id uuid,
  _code_id uuid,
  _used_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    created_at,
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
SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.record_admin_wallet_deposit_request(_adjustment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_adjustment record;
BEGIN
  SELECT id, student_id, admin_id, amount, type, reason, created_at
  INTO v_adjustment
  FROM public.wallet_adjustments
  WHERE id = _adjustment_id;

  IF v_adjustment.id IS NULL OR v_adjustment.type <> 'add' THEN
    RETURN;
  END IF;

  INSERT INTO public.deposit_requests (
    student_id,
    amount,
    payment_method,
    status,
    deposit_type,
    wallet_adjustment_id,
    processed_by,
    processed_at,
    created_at,
    notes,
    admin_message
  ) VALUES (
    v_adjustment.student_id,
    v_adjustment.amount,
    'admin_manual',
    'approved',
    'admin_manual',
    v_adjustment.id,
    v_adjustment.admin_id,
    COALESCE(v_adjustment.created_at, now()),
    COALESCE(v_adjustment.created_at, now()),
    COALESCE(NULLIF(btrim(v_adjustment.reason), ''), 'إعادة شحن تلقائي من الإدارة'),
    COALESCE(NULLIF(btrim(v_adjustment.reason), ''), 'إعادة شحن تلقائي من الإدارة')
  )
  ON CONFLICT (wallet_adjustment_id) WHERE wallet_adjustment_id IS NOT NULL DO UPDATE
  SET amount = EXCLUDED.amount,
      status = 'approved',
      deposit_type = 'admin_manual',
      payment_method = 'admin_manual',
      processed_by = EXCLUDED.processed_by,
      processed_at = EXCLUDED.processed_at,
      notes = EXCLUDED.notes,
      admin_message = EXCLUDED.admin_message,
      updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.record_admin_wallet_deposit_request(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_admin_wallet_deposit_request(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.record_admin_wallet_deposit_request(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_admin_wallet_deposit_request(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_admin_wallet_deposit_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.record_admin_wallet_deposit_request(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_admin_wallet_deposit_request() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_admin_wallet_deposit_request() FROM anon;
REVOKE ALL ON FUNCTION public.ensure_admin_wallet_deposit_request() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_admin_wallet_deposit_request() TO service_role;

DROP TRIGGER IF EXISTS trg_ensure_admin_wallet_deposit_request ON public.wallet_adjustments;
CREATE TRIGGER trg_ensure_admin_wallet_deposit_request
AFTER INSERT ON public.wallet_adjustments
FOR EACH ROW
EXECUTE FUNCTION public.ensure_admin_wallet_deposit_request();

CREATE OR REPLACE FUNCTION public.redeem_recharge_code(_user_id uuid, _code_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.admin_add_student_wallet_credit(
  _student_id uuid,
  _amount numeric,
  _reason text DEFAULT 'إعادة شحن تلقائي من الإدارة'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_adjustment_id uuid;
BEGIN
  IF v_admin_id IS NULL OR NOT public.has_role(v_admin_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح بتنفيذ العملية');
  END IF;

  IF _student_id IS NULL OR _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'بيانات الإيداع غير صحيحة');
  END IF;

  INSERT INTO public.wallets (user_id, balance)
  VALUES (_student_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.wallets
  SET balance = balance + _amount,
      updated_at = now()
  WHERE user_id = _student_id;

  INSERT INTO public.wallet_adjustments (student_id, admin_id, amount, type, reason)
  VALUES (_student_id, v_admin_id, _amount, 'add', COALESCE(NULLIF(btrim(_reason), ''), 'إعادة شحن تلقائي من الإدارة'))
  RETURNING id INTO v_adjustment_id;

  PERFORM public.record_admin_wallet_deposit_request(v_adjustment_id);

  INSERT INTO public.notifications (user_id, title, message, type, data)
  VALUES (
    _student_id,
    'تم إضافة رصيد لمحفظتك',
    'تم إضافة ' || _amount || ' جنيه إلى رصيدك بواسطة الإدارة',
    'wallet_credit',
    jsonb_build_object('amount', _amount, 'adjustment_id', v_adjustment_id)
  );

  RETURN jsonb_build_object('success', true, 'amount', _amount, 'adjustment_id', v_adjustment_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_student_wallet_credit(uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_add_student_wallet_credit(uuid, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_add_student_wallet_credit(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_student_wallet_credit(uuid, numeric, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_process_deposit_request(
  _request_id uuid,
  _action text,
  _message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_request record;
BEGIN
  IF v_admin_id IS NULL OR NOT public.has_role(v_admin_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح بتنفيذ العملية');
  END IF;

  SELECT id, student_id, amount, status
  INTO v_request
  FROM public.deposit_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'طلب الإيداع غير موجود');
  END IF;

  IF v_request.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'تمت معالجة هذا الطلب مسبقًا');
  END IF;

  IF _action = 'approve' THEN
    INSERT INTO public.wallets (user_id, balance)
    VALUES (v_request.student_id, 0)
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE public.wallets
    SET balance = balance + v_request.amount,
        updated_at = now()
    WHERE user_id = v_request.student_id;

    UPDATE public.deposit_requests
    SET status = 'approved',
        deposit_type = COALESCE(NULLIF(deposit_type, ''), 'manual'),
        processed_by = v_admin_id,
        processed_at = now(),
        admin_message = _message,
        updated_at = now()
    WHERE id = _request_id;

    INSERT INTO public.notifications (user_id, title, message, type, data)
    VALUES (
      v_request.student_id,
      'تم قبول طلب الإيداع',
      'تم إضافة ' || v_request.amount || ' جنيه إلى رصيدك',
      'deposit_approved',
      jsonb_build_object('amount', v_request.amount, 'request_id', _request_id)
    );

    RETURN jsonb_build_object('success', true, 'status', 'approved', 'amount', v_request.amount);
  ELSIF _action = 'reject' THEN
    UPDATE public.deposit_requests
    SET status = 'rejected',
        processed_by = v_admin_id,
        processed_at = now(),
        rejection_reason = _message,
        admin_message = _message,
        updated_at = now()
    WHERE id = _request_id;

    INSERT INTO public.notifications (user_id, title, message, type, data)
    VALUES (
      v_request.student_id,
      'تم رفض طلب الإيداع',
      COALESCE(NULLIF(btrim(_message), ''), 'تم رفض طلب الإيداع الخاص بك'),
      'deposit_rejected',
      jsonb_build_object('amount', v_request.amount, 'request_id', _request_id)
    );

    RETURN jsonb_build_object('success', true, 'status', 'rejected');
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'إجراء غير معروف');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_process_deposit_request(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_process_deposit_request(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_process_deposit_request(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_process_deposit_request(uuid, text, text) TO service_role;

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

INSERT INTO public.deposit_requests (
  student_id,
  amount,
  payment_method,
  status,
  deposit_type,
  wallet_adjustment_id,
  processed_by,
  processed_at,
  created_at,
  notes,
  admin_message
)
SELECT
  a.student_id,
  a.amount,
  'admin_manual',
  'approved',
  'admin_manual',
  a.id,
  a.admin_id,
  COALESCE(a.created_at, now()),
  COALESCE(a.created_at, now()),
  COALESCE(NULLIF(btrim(a.reason), ''), 'إعادة شحن تلقائي من الإدارة'),
  COALESCE(NULLIF(btrim(a.reason), ''), 'إعادة شحن تلقائي من الإدارة')
FROM public.wallet_adjustments a
LEFT JOIN public.deposit_requests d ON d.wallet_adjustment_id = a.id
WHERE a.type = 'add'
  AND d.id IS NULL
ON CONFLICT (wallet_adjustment_id) WHERE wallet_adjustment_id IS NOT NULL DO NOTHING;

UPDATE public.deposit_requests
SET deposit_type = CASE
    WHEN recharge_code_id IS NOT NULL OR payment_method = 'recharge_code' THEN 'recharge_code'
    WHEN wallet_adjustment_id IS NOT NULL OR payment_method = 'admin_manual' THEN 'admin_manual'
    ELSE 'manual'
  END,
  updated_at = now()
WHERE deposit_type IS NULL OR deposit_type = '';

REVOKE ALL ON public.deposit_requests FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deposit_requests TO authenticated;
GRANT ALL ON public.deposit_requests TO service_role;
GRANT SELECT, INSERT ON public.recharge_code_uses TO authenticated;
GRANT SELECT ON public.recharge_codes TO authenticated;
GRANT SELECT ON public.wallet_adjustments TO authenticated;
GRANT ALL ON public.wallet_adjustments TO service_role;
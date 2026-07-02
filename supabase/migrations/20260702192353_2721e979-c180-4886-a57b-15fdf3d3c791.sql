-- Permanent wallet deposit ledger repair
-- 1) Ensure every successful admin wallet add is represented in deposit_requests.
-- 2) Backfill previous admin add adjustments missing from the student deposit history.
-- 3) Keep required deposit fields normalized for all future records.

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
      WHEN NEW.payment_method = 'admin_manual' THEN 'admin_manual'
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

ALTER TABLE public.deposit_requests
  ADD COLUMN IF NOT EXISTS wallet_adjustment_id uuid REFERENCES public.wallet_adjustments(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_deposit_wallet_adjustment
  ON public.deposit_requests (wallet_adjustment_id)
  WHERE wallet_adjustment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deposit_requests_student_created
  ON public.deposit_requests (student_id, created_at DESC);

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
    updated_at,
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
    now(),
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
  IF NEW.type = 'add' THEN
    PERFORM public.record_admin_wallet_deposit_request(NEW.id);
  END IF;
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

-- Backfill previous successful admin balance additions that did not appear in student deposit history.
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
  updated_at,
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
  now(),
  COALESCE(NULLIF(btrim(a.reason), ''), 'إعادة شحن تلقائي من الإدارة'),
  COALESCE(NULLIF(btrim(a.reason), ''), 'إعادة شحن تلقائي من الإدارة')
FROM public.wallet_adjustments a
LEFT JOIN public.deposit_requests d
  ON d.wallet_adjustment_id = a.id
WHERE a.type = 'add'
  AND d.id IS NULL
ON CONFLICT (wallet_adjustment_id) WHERE wallet_adjustment_id IS NOT NULL DO NOTHING;

-- Re-run recharge-code backfill to guarantee no successful code use is missing from the unified history.
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
  updated_at,
  notes
)
SELECT
  u.user_id,
  c.amount,
  'recharge_code',
  'approved',
  'recharge_code',
  c.id,
  CASE
    WHEN c.code IS NULL THEN NULL
    WHEN length(c.code) > 4 THEN substr(c.code, 1, 2) || repeat('*', greatest(length(c.code) - 4, 1)) || substr(c.code, length(c.code) - 1, 2)
    ELSE repeat('*', length(c.code))
  END,
  COALESCE(u.used_at, now()),
  COALESCE(u.used_at, now()),
  now(),
  'إيداع تلقائي عبر كود شحن'
FROM public.recharge_code_uses u
JOIN public.recharge_codes c ON c.id = u.code_id
LEFT JOIN public.deposit_requests d
  ON d.student_id = u.user_id
 AND d.recharge_code_id = u.code_id
WHERE d.id IS NULL
ON CONFLICT (student_id, recharge_code_id) WHERE recharge_code_id IS NOT NULL DO NOTHING;

-- Keep Data API privileges explicit for the affected public tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deposit_requests TO authenticated;
GRANT ALL ON public.deposit_requests TO service_role;
GRANT SELECT ON public.wallet_adjustments TO authenticated;
GRANT ALL ON public.wallet_adjustments TO service_role;
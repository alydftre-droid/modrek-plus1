
-- Task 1: Recharge code deposit history

ALTER TABLE public.deposit_requests ALTER COLUMN phone_number DROP NOT NULL;
ALTER TABLE public.deposit_requests ALTER COLUMN receipt_url DROP NOT NULL;

ALTER TABLE public.deposit_requests
  ADD COLUMN IF NOT EXISTS deposit_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS recharge_code_id uuid REFERENCES public.recharge_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recharge_code text,
  ADD COLUMN IF NOT EXISTS notes text;

-- Prevent duplicate deposit rows for the same code redemption
CREATE UNIQUE INDEX IF NOT EXISTS uniq_deposit_recharge_per_user
  ON public.deposit_requests (student_id, recharge_code_id)
  WHERE recharge_code_id IS NOT NULL;

-- Rewrite redeem_recharge_code to be atomic and record the deposit
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
  v_masked text;
BEGIN
  -- Lock code row to serialize concurrent redemptions
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

  -- Atomic guard: unique (code_id, user_id) prevents double redemption
  BEGIN
    INSERT INTO public.recharge_code_uses (code_id, user_id) VALUES (v_code_id, _user_id);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'لقد استخدمت هذا الكود من قبل');
  END;

  -- Ensure wallet exists, then credit
  INSERT INTO public.wallets (user_id, balance) VALUES (_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets SET balance = balance + v_amount, updated_at = now()
    WHERE user_id = _user_id;

  UPDATE public.recharge_codes SET current_uses = current_uses + 1 WHERE id = v_code_id;

  -- Masked code (keep first 2 and last 2 chars) for display
  IF length(_code_text) > 4 THEN
    v_masked := substr(_code_text, 1, 2) || repeat('*', greatest(length(_code_text) - 4, 1)) || substr(_code_text, length(_code_text) - 1, 2);
  ELSE
    v_masked := repeat('*', length(_code_text));
  END IF;

  -- Record as a completed deposit (idempotent via unique index)
  INSERT INTO public.deposit_requests (
    student_id, amount, payment_method, status,
    deposit_type, recharge_code_id, recharge_code,
    processed_at, notes
  ) VALUES (
    _user_id, v_amount, 'recharge_code', 'approved',
    'recharge_code', v_code_id, v_masked,
    now(), 'إيداع تلقائي عبر كود شحن'
  )
  ON CONFLICT (student_id, recharge_code_id) WHERE recharge_code_id IS NOT NULL DO NOTHING;

  RETURN jsonb_build_object('success', true, 'amount', v_amount);
END;
$$;

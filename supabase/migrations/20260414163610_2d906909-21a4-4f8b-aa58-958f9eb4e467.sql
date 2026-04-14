
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
  v_already_used boolean;
BEGIN
  -- Find the code
  SELECT id, amount, is_active, current_uses, max_uses
  INTO v_code_id, v_amount, v_is_active, v_current_uses, v_max_uses
  FROM public.recharge_codes
  WHERE code = _code_text;

  IF v_code_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'كود غير صالح أو منتهي');
  END IF;

  IF NOT v_is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'كود غير صالح أو منتهي');
  END IF;

  IF v_current_uses >= v_max_uses THEN
    RETURN jsonb_build_object('success', false, 'error', 'تم استخدام هذا الكود بالكامل');
  END IF;

  -- Check if user already used this code
  SELECT EXISTS(
    SELECT 1 FROM public.recharge_code_uses WHERE code_id = v_code_id AND user_id = _user_id
  ) INTO v_already_used;

  IF v_already_used THEN
    RETURN jsonb_build_object('success', false, 'error', 'لقد استخدمت هذا الكود من قبل');
  END IF;

  -- Update wallet
  UPDATE public.wallets SET balance = balance + v_amount, updated_at = now() WHERE user_id = _user_id;

  -- Record usage
  INSERT INTO public.recharge_code_uses (code_id, user_id) VALUES (v_code_id, _user_id);

  -- Increment uses
  UPDATE public.recharge_codes SET current_uses = current_uses + 1 WHERE id = v_code_id;

  RETURN jsonb_build_object('success', true, 'amount', v_amount);
END;
$$;

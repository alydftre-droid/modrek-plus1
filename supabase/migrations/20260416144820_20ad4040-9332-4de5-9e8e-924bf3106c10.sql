CREATE UNIQUE INDEX IF NOT EXISTS student_group_purchases_student_group_unique_idx
ON public.student_group_purchases (student_id, group_id);

CREATE OR REPLACE FUNCTION public.purchase_group_with_wallet(p_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id uuid := auth.uid();
  v_price numeric;
  v_is_active boolean;
  v_wallet_balance numeric;
  v_purchase_id uuid;
BEGIN
  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول أولاً');
  END IF;

  SELECT price, is_active
  INTO v_price, v_is_active
  FROM public.content_groups
  WHERE id = p_group_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'المجموعة غير موجودة');
  END IF;

  IF COALESCE(v_is_active, false) = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'هذه المجموعة غير متاحة حالياً');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.student_group_purchases
    WHERE student_id = v_student_id
      AND group_id = p_group_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'أنت مشترك بالفعل في هذه المجموعة');
  END IF;

  SELECT balance
  INTO v_wallet_balance
  FROM public.wallets
  WHERE user_id = v_student_id
  FOR UPDATE;

  IF v_wallet_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'لم يتم العثور على محفظة الطالب');
  END IF;

  IF v_wallet_balance < v_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'الرصيد غير كافٍ');
  END IF;

  UPDATE public.wallets
  SET balance = balance - v_price,
      updated_at = now()
  WHERE user_id = v_student_id;

  INSERT INTO public.student_group_purchases (student_id, group_id, amount_paid)
  VALUES (v_student_id, p_group_id, v_price)
  RETURNING id INTO v_purchase_id;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'amount_paid', v_price,
    'remaining_balance', v_wallet_balance - v_price
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'أنت مشترك بالفعل في هذه المجموعة');
END;
$function$;

REVOKE ALL ON FUNCTION public.purchase_group_with_wallet(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_group_with_wallet(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.teacher_request_withdrawal(_amount numeric, _payment_method text, _phone_number text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_id uuid := auth.uid();
  v_balance numeric;
  v_request_id uuid;
BEGIN
  IF v_teacher_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول');
  END IF;
  IF NOT public.has_role(v_teacher_id, 'teacher'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'مبلغ غير صالح');
  END IF;
  IF NOT public.is_withdrawal_requests_open() THEN
    RETURN jsonb_build_object('success', false, 'error', 'WITHDRAWALS_CLOSED');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.teacher_withdrawal_requests
    WHERE teacher_id = v_teacher_id AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'لديك طلب سحب معلق بالفعل');
  END IF;

  SELECT balance INTO v_balance
  FROM public.teacher_wallets
  WHERE teacher_id = v_teacher_id
  FOR UPDATE;

  IF v_balance IS NULL OR v_balance < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'الرصيد المتاح غير كافٍ');
  END IF;

  UPDATE public.teacher_wallets
  SET balance = balance - _amount, updated_at = now()
  WHERE teacher_id = v_teacher_id;

  INSERT INTO public.teacher_withdrawal_requests
    (teacher_id, amount, payment_method, phone_number, status)
  VALUES
    (v_teacher_id, _amount, _payment_method, _phone_number, 'pending')
  RETURNING id INTO v_request_id;

  INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent)
  SELECT ur.user_id,
         'طلب سحب جديد',
         'تم تقديم طلب سحب بمبلغ ' || _amount || ' جنيه',
         'withdrawal', '/admin?tab=withdrawals', false, true
  FROM public.user_roles ur
  WHERE ur.role = 'admin';

  RETURN jsonb_build_object('success', true, 'request_id', v_request_id, 'remaining', v_balance - _amount);
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_request_withdrawal(numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_request_withdrawal(numeric, text, text) TO authenticated, service_role;
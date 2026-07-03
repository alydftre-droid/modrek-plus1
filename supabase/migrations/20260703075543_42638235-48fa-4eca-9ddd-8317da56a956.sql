CREATE OR REPLACE FUNCTION public.admin_add_student_wallet_credit(_student_id uuid, _amount numeric, _reason text DEFAULT 'إعادة شحن تلقائي من الإدارة'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  SET balance = balance + _amount, updated_at = now()
  WHERE user_id = _student_id;

  INSERT INTO public.wallet_adjustments (student_id, admin_id, amount, type, reason)
  VALUES (_student_id, v_admin_id, _amount, 'add', COALESCE(NULLIF(btrim(_reason), ''), 'إعادة شحن تلقائي من الإدارة'))
  RETURNING id INTO v_adjustment_id;

  PERFORM public.record_admin_wallet_deposit_request(v_adjustment_id);

  INSERT INTO public.notifications (user_id, title, message, notification_type, link)
  VALUES (
    _student_id,
    'تم إضافة رصيد لمحفظتك',
    'تم إضافة ' || _amount || ' جنيه إلى رصيدك بواسطة الإدارة',
    'wallet_credit',
    '/wallet'
  );

  RETURN jsonb_build_object('success', true, 'amount', _amount, 'adjustment_id', v_adjustment_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_process_deposit_request(_request_id uuid, _action text, _message text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid := auth.uid();
  v_req public.deposit_requests%ROWTYPE;
BEGIN
  IF v_admin_id IS NULL OR NOT public.has_role(v_admin_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  IF _action NOT IN ('approve', 'reject') THEN
    RETURN jsonb_build_object('success', false, 'error', 'إجراء غير صالح');
  END IF;

  SELECT * INTO v_req FROM public.deposit_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الطلب غير موجود');
  END IF;

  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'الطلب تم معالجته مسبقاً');
  END IF;

  IF _action = 'approve' THEN
    INSERT INTO public.wallets (user_id, balance) VALUES (v_req.student_id, 0)
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE public.wallets
    SET balance = balance + v_req.amount, updated_at = now()
    WHERE user_id = v_req.student_id;

    UPDATE public.deposit_requests
    SET status = 'approved', admin_message = _message, processed_at = now(), processed_by = v_admin_id
    WHERE id = _request_id;

    INSERT INTO public.notifications (user_id, title, message, notification_type, link)
    VALUES (
      v_req.student_id,
      'تم قبول طلب الإيداع',
      'تم إضافة ' || v_req.amount || ' جنيه إلى محفظتك',
      'deposit_approved',
      '/wallet'
    );
  ELSE
    UPDATE public.deposit_requests
    SET status = 'rejected', admin_message = _message, processed_at = now(), processed_by = v_admin_id
    WHERE id = _request_id;

    INSERT INTO public.notifications (user_id, title, message, notification_type, link)
    VALUES (
      v_req.student_id,
      'تم رفض طلب الإيداع',
      COALESCE(_message, 'تم رفض طلب الإيداع الخاص بك'),
      'deposit_rejected',
      '/wallet'
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'action', _action);
END;
$function$;
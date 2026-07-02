CREATE OR REPLACE FUNCTION public.admin_add_student_wallet_credit(
  _student_id uuid,
  _amount numeric,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_adjustment_id uuid;
  v_deposit_id uuid;
  v_reason text;
BEGIN
  IF v_admin_id IS NULL OR NOT public.has_role(v_admin_id, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح بتنفيذ العملية');
  END IF;

  IF _student_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'معرّف الطالب مطلوب');
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'المبلغ غير صحيح');
  END IF;

  v_reason := COALESCE(NULLIF(btrim(_reason), ''), 'إعادة شحن تلقائي من الإدارة');

  INSERT INTO public.wallets (user_id, balance)
  VALUES (_student_id, _amount)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = public.wallets.balance + EXCLUDED.balance,
      updated_at = now();

  INSERT INTO public.wallet_adjustments (student_id, admin_id, amount, type, reason)
  VALUES (_student_id, v_admin_id, _amount, 'add', v_reason)
  RETURNING id INTO v_adjustment_id;

  -- Idempotent safeguard: the trigger on wallet_adjustments also runs this.
  PERFORM public.record_admin_wallet_deposit_request(v_adjustment_id);

  SELECT id
  INTO v_deposit_id
  FROM public.deposit_requests
  WHERE wallet_adjustment_id = v_adjustment_id
  LIMIT 1;

  INSERT INTO public.notifications (user_id, title, message, notification_type, is_sent)
  VALUES (
    _student_id,
    'تم إضافة رصيد',
    'تم إضافة ' || _amount || ' جنيه إلى محفظتك من قبل الإدارة',
    'wallet',
    true
  );

  RETURN jsonb_build_object(
    'success', true,
    'amount', _amount,
    'wallet_adjustment_id', v_adjustment_id,
    'deposit_request_id', v_deposit_id
  );
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
  v_message text := NULLIF(btrim(COALESCE(_message, '')), '');
BEGIN
  IF v_admin_id IS NULL OR NOT public.has_role(v_admin_id, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح بتنفيذ العملية');
  END IF;

  IF _action NOT IN ('approve', 'reject') THEN
    RETURN jsonb_build_object('success', false, 'error', 'إجراء غير صحيح');
  END IF;

  SELECT *
  INTO v_request
  FROM public.deposit_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'طلب الإيداع غير موجود');
  END IF;

  IF v_request.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_processed', true,
      'status', v_request.status,
      'deposit_request_id', v_request.id
    );
  END IF;

  IF _action = 'approve' THEN
    INSERT INTO public.wallets (user_id, balance)
    VALUES (v_request.student_id, v_request.amount)
    ON CONFLICT (user_id) DO UPDATE
    SET balance = public.wallets.balance + EXCLUDED.balance,
        updated_at = now();

    UPDATE public.deposit_requests
    SET status = 'approved',
        admin_message = v_message,
        rejection_reason = NULL,
        processed_by = v_admin_id,
        processed_at = now(),
        updated_at = now()
    WHERE id = v_request.id;

    INSERT INTO public.notifications (user_id, title, message, notification_type, is_sent)
    VALUES (
      v_request.student_id,
      'تم إضافة الرصيد',
      'تم إضافة ' || v_request.amount || ' جنيه إلى محفظتك.' || CASE WHEN v_message IS NOT NULL THEN ' ملاحظة: ' || v_message ELSE '' END,
      'wallet',
      true
    );
  ELSE
    UPDATE public.deposit_requests
    SET status = 'rejected',
        admin_message = v_message,
        rejection_reason = v_message,
        processed_by = v_admin_id,
        processed_at = now(),
        updated_at = now()
    WHERE id = v_request.id;

    INSERT INTO public.notifications (user_id, title, message, notification_type, is_sent)
    VALUES (
      v_request.student_id,
      'تم رفض طلب الإيداع',
      'تم رفض طلب الإيداع بمبلغ ' || v_request.amount || ' جنيه.' || CASE WHEN v_message IS NOT NULL THEN ' السبب: ' || v_message ELSE '' END,
      'wallet',
      true
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', CASE WHEN _action = 'approve' THEN 'approved' ELSE 'rejected' END,
    'deposit_request_id', v_request.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_process_deposit_request(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_process_deposit_request(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_process_deposit_request(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_process_deposit_request(uuid, text, text) TO service_role;
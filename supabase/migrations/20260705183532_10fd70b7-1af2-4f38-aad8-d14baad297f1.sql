
-- 1) Allow authenticated & anon roles to read bucket metadata (default Supabase behavior).
--    Without this, storage.from(...).upload() returns "Bucket not found" for every user.
GRANT SELECT ON storage.buckets TO anon, authenticated;

-- Also make sure there is an RLS policy on storage.buckets permitting read (RLS is enabled).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polrelid = 'storage.buckets'::regclass AND polname = 'Allow read bucket metadata'
  ) THEN
    CREATE POLICY "Allow read bucket metadata"
      ON storage.buckets FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- 2) Fix admin_add_student_wallet_credit: use notification_type (real column), drop non-existent data column.
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

  INSERT INTO public.notifications (user_id, title, message, notification_type)
  VALUES (
    _student_id,
    'تم إضافة رصيد لمحفظتك',
    'تم إضافة ' || _amount || ' جنيه إلى رصيدك بواسطة الإدارة',
    'wallet_credit'
  );

  RETURN jsonb_build_object('success', true, 'amount', _amount, 'adjustment_id', v_adjustment_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_student_wallet_credit(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_student_wallet_credit(uuid, numeric, text) TO authenticated, service_role;

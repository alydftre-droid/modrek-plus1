-- ============================================
-- Teacher Activity Logs (track every action)
-- ============================================
CREATE TABLE IF NOT EXISTS public.teacher_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  action_type text NOT NULL, -- login, logout, page_view, content_upload, content_delete, message_reply, withdrawal_request, etc.
  action_label text NOT NULL, -- human-readable Arabic label
  page_path text,
  metadata jsonb DEFAULT '{}'::jsonb,
  duration_seconds integer,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teacher_activity_logs_teacher_id ON public.teacher_activity_logs(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_activity_logs_created_at ON public.teacher_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_activity_logs_action_type ON public.teacher_activity_logs(action_type);

ALTER TABLE public.teacher_activity_logs ENABLE ROW LEVEL SECURITY;

-- Teacher can view own logs
CREATE POLICY "Teachers can view own activity logs"
ON public.teacher_activity_logs FOR SELECT
USING (auth.uid() = teacher_id);

-- Teacher can insert own logs
CREATE POLICY "Teachers can insert own activity logs"
ON public.teacher_activity_logs FOR INSERT
WITH CHECK (auth.uid() = teacher_id);

-- Admin can view/manage all
CREATE POLICY "Admins can manage all activity logs"
ON public.teacher_activity_logs FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ============================================
-- Teacher Wallet Transactions (audit trail)
-- ============================================
CREATE TABLE IF NOT EXISTS public.teacher_wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  amount numeric NOT NULL, -- positive=credit, negative=debit
  transaction_type text NOT NULL, -- admin_credit, admin_debit, admin_bonus, commission, withdrawal, refund
  description text,
  admin_message text, -- thank-you message from admin
  admin_id uuid, -- who performed it (null for system)
  balance_after numeric,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teacher_wallet_tx_teacher_id ON public.teacher_wallet_transactions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_wallet_tx_created_at ON public.teacher_wallet_transactions(created_at DESC);

ALTER TABLE public.teacher_wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers view own transactions"
ON public.teacher_wallet_transactions FOR SELECT
USING (auth.uid() = teacher_id);

CREATE POLICY "Admins manage all transactions"
ON public.teacher_wallet_transactions FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ============================================
-- RPC: Admin adjust teacher wallet (atomic)
-- ============================================
CREATE OR REPLACE FUNCTION public.admin_adjust_teacher_wallet(
  _teacher_id uuid,
  _amount numeric, -- positive to add, negative to subtract
  _transaction_type text,
  _description text DEFAULT NULL,
  _admin_message text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_current_balance numeric;
  v_new_balance numeric;
  v_total_earned numeric;
BEGIN
  IF NOT has_role(v_admin_id, 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  IF _amount = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'المبلغ يجب ألا يكون صفراً');
  END IF;

  -- Ensure wallet exists
  INSERT INTO public.teacher_wallets (teacher_id, balance, total_earned)
  VALUES (_teacher_id, 0, 0)
  ON CONFLICT (teacher_id) DO NOTHING;

  -- Lock & read
  SELECT balance, total_earned INTO v_current_balance, v_total_earned
  FROM public.teacher_wallets
  WHERE teacher_id = _teacher_id
  FOR UPDATE;

  v_new_balance := COALESCE(v_current_balance, 0) + _amount;

  IF v_new_balance < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'الرصيد غير كافٍ للخصم');
  END IF;

  UPDATE public.teacher_wallets
  SET balance = v_new_balance,
      total_earned = CASE WHEN _amount > 0 AND _transaction_type IN ('admin_credit','admin_bonus')
                          THEN COALESCE(total_earned,0) + _amount
                          ELSE total_earned END,
      updated_at = now()
  WHERE teacher_id = _teacher_id;

  -- Log transaction
  INSERT INTO public.teacher_wallet_transactions
    (teacher_id, amount, transaction_type, description, admin_message, admin_id, balance_after)
  VALUES
    (_teacher_id, _amount, _transaction_type, _description, _admin_message, v_admin_id, v_new_balance);

  -- Notify teacher
  INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent)
  VALUES (
    _teacher_id,
    CASE
      WHEN _transaction_type = 'admin_bonus' THEN '🎁 مكافأة من الإدارة'
      WHEN _amount > 0 THEN '💰 إضافة رصيد لمحفظتك'
      ELSE '⚠️ خصم من محفظتك'
    END,
    COALESCE(_admin_message,
      CASE WHEN _amount > 0
           THEN 'تم إضافة ' || _amount || ' جنيه إلى محفظتك'
           ELSE 'تم خصم ' || abs(_amount) || ' جنيه من محفظتك' END
    ),
    'wallet',
    '/teacher/wallet',
    false,
    true
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'amount', _amount
  );
END;
$$;
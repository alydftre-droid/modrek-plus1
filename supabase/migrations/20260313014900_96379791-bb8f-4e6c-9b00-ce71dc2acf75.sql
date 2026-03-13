
-- Teacher messaging system
CREATE TABLE public.teacher_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL,
  student_id UUID NOT NULL,
  message TEXT NOT NULL,
  is_from_teacher BOOLEAN NOT NULL DEFAULT false,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.teacher_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view their messages" ON public.teacher_messages
  FOR SELECT TO authenticated
  USING (auth.uid() = teacher_id);

CREATE POLICY "Students can view their messages" ON public.teacher_messages
  FOR SELECT TO authenticated
  USING (auth.uid() = student_id);

CREATE POLICY "Teachers can send messages" ON public.teacher_messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = teacher_id AND is_from_teacher = true);

CREATE POLICY "Students can send messages" ON public.teacher_messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id AND is_from_teacher = false);

CREATE POLICY "Users can mark messages as read" ON public.teacher_messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = teacher_id OR auth.uid() = student_id);

CREATE POLICY "Admins manage all teacher messages" ON public.teacher_messages
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Teacher payment methods
CREATE TABLE public.teacher_payment_methods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL,
  method_type TEXT NOT NULL DEFAULT 'vodafone_cash',
  phone_number TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.teacher_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage own payment methods" ON public.teacher_payment_methods
  FOR ALL TO authenticated
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Admins view all payment methods" ON public.teacher_payment_methods
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Teacher withdrawal requests
CREATE TABLE public.teacher_withdrawal_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'vodafone_cash',
  phone_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_message TEXT,
  transfer_receipt_url TEXT,
  processed_by UUID,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.teacher_withdrawal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage own withdrawals" ON public.teacher_withdrawal_requests
  FOR ALL TO authenticated
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Admins manage all withdrawals" ON public.teacher_withdrawal_requests
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Teacher wallet/balance
CREATE TABLE public.teacher_wallets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL UNIQUE,
  balance NUMERIC NOT NULL DEFAULT 0,
  total_earned NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.teacher_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers view own wallet" ON public.teacher_wallets
  FOR SELECT TO authenticated
  USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers update own wallet" ON public.teacher_wallets
  FOR UPDATE TO authenticated
  USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers insert own wallet" ON public.teacher_wallets
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Admins manage all teacher wallets" ON public.teacher_wallets
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime for teacher messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.teacher_messages;

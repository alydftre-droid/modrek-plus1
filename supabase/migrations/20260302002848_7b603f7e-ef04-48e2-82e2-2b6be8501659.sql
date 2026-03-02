
-- 1) Wallet table for student balances
CREATE TABLE public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  balance numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wallet" ON public.wallets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own wallet" ON public.wallets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own wallet" ON public.wallets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage all wallets" ON public.wallets FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 2) Deposit requests table
CREATE TABLE public.deposit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  amount numeric NOT NULL,
  phone_number text NOT NULL,
  receipt_url text NOT NULL,
  payment_method text DEFAULT 'vodafone_cash',
  status text NOT NULL DEFAULT 'pending',
  admin_message text,
  rejection_reason text,
  processed_by uuid,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deposit_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own deposit requests" ON public.deposit_requests FOR ALL USING (auth.uid() = student_id);
CREATE POLICY "Admins manage all deposit requests" ON public.deposit_requests FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 3) Recharge codes table
CREATE TABLE public.recharge_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  amount numeric NOT NULL,
  max_uses integer NOT NULL DEFAULT 1,
  current_uses integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recharge_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage recharge codes" ON public.recharge_codes FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated users can read active codes" ON public.recharge_codes FOR SELECT USING (auth.role() = 'authenticated' AND is_active = true);

-- 4) Recharge code usage tracking
CREATE TABLE public.recharge_code_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid NOT NULL REFERENCES public.recharge_codes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  used_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(code_id, user_id)
);

ALTER TABLE public.recharge_code_uses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see own uses" ON public.recharge_code_uses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own uses" ON public.recharge_code_uses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage all uses" ON public.recharge_code_uses FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 5) Price change requests
CREATE TABLE public.price_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  group_id uuid NOT NULL REFERENCES public.content_groups(id) ON DELETE CASCADE,
  current_price numeric NOT NULL,
  requested_price numeric NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  admin_message text,
  processed_by uuid,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.price_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage own price requests" ON public.price_change_requests FOR ALL USING (auth.uid() = teacher_id);
CREATE POLICY "Admins manage all price requests" ON public.price_change_requests FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 6) Add new columns to content_groups
ALTER TABLE public.content_groups ADD COLUMN IF NOT EXISTS month_label text;
ALTER TABLE public.content_groups ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.content_groups ADD COLUMN IF NOT EXISTS teacher_id uuid;
ALTER TABLE public.content_groups ADD COLUMN IF NOT EXISTS price_approved boolean DEFAULT true;

-- 7) Teacher schedules
CREATE TABLE public.teacher_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  day_of_week text NOT NULL,
  time_slot text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teacher_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage own schedules" ON public.teacher_schedules FOR ALL USING (auth.uid() = teacher_id);
CREATE POLICY "Anyone can view schedules" ON public.teacher_schedules FOR SELECT USING (true);

-- 8) Auto-create wallet on new user
CREATE OR REPLACE FUNCTION public.handle_new_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.wallets (user_id, balance)
  VALUES (NEW.id, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_created_create_wallet
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_wallet();

-- 9) Student group purchases - add wallet-based purchase support
ALTER TABLE public.student_group_purchases ADD COLUMN IF NOT EXISTS amount_paid numeric DEFAULT 0;

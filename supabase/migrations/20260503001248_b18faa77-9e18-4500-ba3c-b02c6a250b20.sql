
-- =====================================================================
-- 1) Platform settings: commission rate + withdrawal window controls
-- =====================================================================
INSERT INTO public.platform_settings (key, value)
VALUES
  ('teacher_commission_rate', '0.70'),
  ('withdrawal_open_day', '25'),
  ('withdrawal_manual_state', 'auto'), -- 'auto' | 'open' | 'closed'
  ('withdrawal_notice_message', 'يفتح السحب يوم 25 من كل شهر')
ON CONFLICT (key) DO NOTHING;

-- Allow public to read these new settings
DROP POLICY IF EXISTS "Public can read settings" ON public.platform_settings;
CREATE POLICY "Public can read settings"
ON public.platform_settings
FOR SELECT
USING (key = ANY (ARRAY[
  'platform_name','maintenance_mode','maintenance_message','platform_logo',
  'support_phone','support_whatsapp','support_email',
  'subscription_whatsapp','subscription_default_price','subscription_default_message','subscription_currency',
  'payment_receive_number','payment_methods_config','deposit_tutorial_video',
  'student_dashboard_ticker_enabled','student_dashboard_ticker_text','student_dashboard_ticker_items',
  'teacher_commission_rate','withdrawal_open_day','withdrawal_manual_state','withdrawal_notice_message'
]));

-- =====================================================================
-- 2) Add frozen_balance to teacher_wallets
-- =====================================================================
ALTER TABLE public.teacher_wallets
  ADD COLUMN IF NOT EXISTS frozen_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_period text NOT NULL DEFAULT to_char(now(), 'YYYY-MM');

-- =====================================================================
-- 3) Earnings ledger: one row per successful purchase
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.teacher_earning_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  purchase_id uuid NOT NULL UNIQUE,
  group_id uuid NOT NULL,
  subject_id uuid,
  student_id uuid NOT NULL,
  gross_amount numeric NOT NULL,
  commission_rate numeric NOT NULL,
  net_amount numeric NOT NULL,
  period_label text NOT NULL,
  is_frozen boolean NOT NULL DEFAULT true,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ter_teacher ON public.teacher_earning_records(teacher_id);
CREATE INDEX IF NOT EXISTS idx_ter_period ON public.teacher_earning_records(teacher_id, period_label);
CREATE INDEX IF NOT EXISTS idx_ter_group ON public.teacher_earning_records(group_id);

ALTER TABLE public.teacher_earning_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers view own earnings" ON public.teacher_earning_records
  FOR SELECT USING (auth.uid() = teacher_id);
CREATE POLICY "Admins manage all earnings" ON public.teacher_earning_records
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =====================================================================
-- 4) Monthly archives — snapshot per teacher per period
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.teacher_monthly_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  period_label text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  total_earned numeric NOT NULL DEFAULT 0,
  total_subscribers integer NOT NULL DEFAULT 0,
  total_groups integer NOT NULL DEFAULT 0,
  commission_rate numeric NOT NULL,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, period_label)
);
CREATE INDEX IF NOT EXISTS idx_tma_teacher ON public.teacher_monthly_archives(teacher_id, archived_at DESC);

ALTER TABLE public.teacher_monthly_archives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers view own archives" ON public.teacher_monthly_archives
  FOR SELECT USING (auth.uid() = teacher_id);
CREATE POLICY "Admins manage all archives" ON public.teacher_monthly_archives
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =====================================================================
-- 5) Replace credit_teacher_on_purchase trigger to use new system
-- =====================================================================
CREATE OR REPLACE FUNCTION public.credit_teacher_on_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_teacher_id uuid;
  v_subject_id uuid;
  v_amount numeric;
  v_commission_rate numeric;
  v_commission numeric;
  v_period text;
BEGIN
  -- Idempotency: skip if already credited
  IF EXISTS (SELECT 1 FROM public.teacher_earning_records WHERE purchase_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(teacher_id, created_by), subject_id
    INTO v_teacher_id, v_subject_id
  FROM public.content_groups
  WHERE id = NEW.group_id;

  IF v_teacher_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_amount := COALESCE(NEW.amount_paid, 0);
  IF v_amount <= 0 THEN
    RETURN NEW;
  END IF;

  -- Read commission rate from platform_settings (fallback 0.70)
  SELECT COALESCE(NULLIF(value, '')::numeric, 0.70) INTO v_commission_rate
  FROM public.platform_settings WHERE key = 'teacher_commission_rate';
  IF v_commission_rate IS NULL THEN v_commission_rate := 0.70; END IF;

  v_commission := ROUND(v_amount * v_commission_rate, 2);
  v_period := to_char(NEW.purchased_at, 'YYYY-MM');

  -- Create ledger record
  INSERT INTO public.teacher_earning_records
    (teacher_id, purchase_id, group_id, subject_id, student_id,
     gross_amount, commission_rate, net_amount, period_label, is_frozen, is_archived)
  VALUES
    (v_teacher_id, NEW.id, NEW.group_id, v_subject_id, NEW.student_id,
     v_amount, v_commission_rate, v_commission, v_period, true, false);

  -- Credit FROZEN balance (current month)
  INSERT INTO public.teacher_wallets (teacher_id, balance, frozen_balance, total_earned, current_period)
  VALUES (v_teacher_id, 0, v_commission, v_commission, v_period)
  ON CONFLICT (teacher_id) DO UPDATE
  SET frozen_balance = teacher_wallets.frozen_balance + v_commission,
      total_earned = teacher_wallets.total_earned + v_commission,
      updated_at = now();

  RETURN NEW;
END;
$function$;

-- Make sure trigger exists
DROP TRIGGER IF EXISTS trg_credit_teacher_on_purchase ON public.student_group_purchases;
CREATE TRIGGER trg_credit_teacher_on_purchase
AFTER INSERT ON public.student_group_purchases
FOR EACH ROW EXECUTE FUNCTION public.credit_teacher_on_purchase();

-- =====================================================================
-- 6) Backfill: ensure every existing purchase has a ledger record
-- =====================================================================
DO $$
DECLARE
  v_rate numeric;
BEGIN
  SELECT COALESCE(NULLIF(value, '')::numeric, 0.70) INTO v_rate
  FROM public.platform_settings WHERE key = 'teacher_commission_rate';
  IF v_rate IS NULL THEN v_rate := 0.70; END IF;

  INSERT INTO public.teacher_earning_records
    (teacher_id, purchase_id, group_id, subject_id, student_id,
     gross_amount, commission_rate, net_amount, period_label, is_frozen, is_archived, created_at)
  SELECT
    COALESCE(cg.teacher_id, cg.created_by) AS teacher_id,
    sgp.id AS purchase_id,
    sgp.group_id,
    cg.subject_id,
    sgp.student_id,
    COALESCE(sgp.amount_paid, 0) AS gross_amount,
    v_rate AS commission_rate,
    ROUND(COALESCE(sgp.amount_paid, 0) * v_rate, 2) AS net_amount,
    to_char(sgp.purchased_at, 'YYYY-MM') AS period_label,
    -- Old purchases (different period from current) considered already-archived & available
    CASE WHEN to_char(sgp.purchased_at, 'YYYY-MM') = to_char(now(), 'YYYY-MM') THEN true ELSE false END,
    CASE WHEN to_char(sgp.purchased_at, 'YYYY-MM') = to_char(now(), 'YYYY-MM') THEN false ELSE true END,
    sgp.purchased_at
  FROM public.student_group_purchases sgp
  JOIN public.content_groups cg ON cg.id = sgp.group_id
  WHERE COALESCE(cg.teacher_id, cg.created_by) IS NOT NULL
    AND COALESCE(sgp.amount_paid, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.teacher_earning_records ter WHERE ter.purchase_id = sgp.id
    );
END $$;

-- =====================================================================
-- 7) RPC: request a withdrawal (checks window + available balance)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.teacher_request_withdrawal(
  _amount numeric,
  _payment_method text,
  _phone_number text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_teacher_id uuid := auth.uid();
  v_balance numeric;
  v_manual text;
  v_open_day int;
  v_today int;
  v_allowed boolean;
  v_request_id uuid;
BEGIN
  IF v_teacher_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول');
  END IF;
  IF NOT has_role(v_teacher_id, 'teacher'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'مبلغ غير صالح');
  END IF;

  -- Withdrawal window
  SELECT value INTO v_manual FROM public.platform_settings WHERE key = 'withdrawal_manual_state';
  SELECT COALESCE(NULLIF(value,'')::int, 25) INTO v_open_day FROM public.platform_settings WHERE key = 'withdrawal_open_day';

  IF v_manual = 'open' THEN
    v_allowed := true;
  ELSIF v_manual = 'closed' THEN
    v_allowed := false;
  ELSE
    -- auto: allowed only on/after the open day of the current month
    v_today := EXTRACT(DAY FROM now() AT TIME ZONE 'Africa/Cairo')::int;
    v_allowed := v_today >= COALESCE(v_open_day, 25);
  END IF;

  IF NOT v_allowed THEN
    RETURN jsonb_build_object('success', false, 'error', 'السحب مغلق حالياً. يفتح السحب في الموعد المحدد من الإدارة.');
  END IF;

  -- Lock and check available balance only
  SELECT balance INTO v_balance FROM public.teacher_wallets
  WHERE teacher_id = v_teacher_id FOR UPDATE;

  IF v_balance IS NULL OR v_balance < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'الرصيد المتاح غير كافٍ');
  END IF;

  -- Deduct from available balance
  UPDATE public.teacher_wallets
    SET balance = balance - _amount, updated_at = now()
  WHERE teacher_id = v_teacher_id;

  INSERT INTO public.teacher_withdrawal_requests
    (teacher_id, amount, payment_method, phone_number, status)
  VALUES
    (v_teacher_id, _amount, _payment_method, _phone_number, 'pending')
  RETURNING id INTO v_request_id;

  -- Notify admins
  INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent)
  SELECT ur.user_id,
         'طلب سحب جديد',
         'تم تقديم طلب سحب بمبلغ ' || _amount || ' جنيه',
         'withdrawal', '/admin?tab=withdrawals', false, true
  FROM public.user_roles ur WHERE ur.role = 'admin';

  RETURN jsonb_build_object('success', true, 'request_id', v_request_id, 'remaining', v_balance - _amount);
END;
$function$;

-- =====================================================================
-- 8) RPC: archive a single teacher's current period
-- =====================================================================
CREATE OR REPLACE FUNCTION public.archive_teacher_period(_teacher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_period text;
  v_total numeric;
  v_subs int;
  v_groups int;
  v_rate numeric;
  v_breakdown jsonb;
  v_period_start timestamptz;
  v_period_end timestamptz;
BEGIN
  IF v_caller IS NOT NULL AND NOT has_role(v_caller, 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  SELECT current_period INTO v_period FROM public.teacher_wallets WHERE teacher_id = _teacher_id;
  IF v_period IS NULL THEN
    v_period := to_char(now(), 'YYYY-MM');
  END IF;

  v_period_start := to_timestamp(v_period || '-01', 'YYYY-MM-DD');
  v_period_end := (v_period_start + INTERVAL '1 month');

  -- Stats for the period
  SELECT
    COALESCE(SUM(net_amount), 0),
    COUNT(DISTINCT student_id),
    COUNT(DISTINCT group_id),
    COALESCE(AVG(commission_rate), 0.70)
  INTO v_total, v_subs, v_groups, v_rate
  FROM public.teacher_earning_records
  WHERE teacher_id = _teacher_id
    AND period_label = v_period
    AND is_archived = false;

  -- Build breakdown by group
  SELECT COALESCE(jsonb_agg(g), '[]'::jsonb) INTO v_breakdown
  FROM (
    SELECT
      ter.group_id,
      cg.title AS group_title,
      cg.price AS price,
      cg.subject_id,
      s.name AS subject_name,
      s.stage,
      s.grade,
      s.category,
      COUNT(DISTINCT ter.student_id) AS students,
      SUM(ter.gross_amount) AS gross,
      SUM(ter.net_amount) AS net
    FROM public.teacher_earning_records ter
    LEFT JOIN public.content_groups cg ON cg.id = ter.group_id
    LEFT JOIN public.subjects s ON s.id = ter.subject_id
    WHERE ter.teacher_id = _teacher_id
      AND ter.period_label = v_period
      AND ter.is_archived = false
    GROUP BY ter.group_id, cg.title, cg.price, cg.subject_id, s.name, s.stage, s.grade, s.category
  ) g;

  -- Upsert archive snapshot
  INSERT INTO public.teacher_monthly_archives
    (teacher_id, period_label, period_start, period_end,
     total_earned, total_subscribers, total_groups, commission_rate, breakdown)
  VALUES
    (_teacher_id, v_period, v_period_start, v_period_end,
     v_total, v_subs, v_groups, v_rate, v_breakdown)
  ON CONFLICT (teacher_id, period_label) DO UPDATE
  SET total_earned = EXCLUDED.total_earned,
      total_subscribers = EXCLUDED.total_subscribers,
      total_groups = EXCLUDED.total_groups,
      breakdown = EXCLUDED.breakdown,
      archived_at = now();

  -- Mark records as archived & unfrozen
  UPDATE public.teacher_earning_records
    SET is_frozen = false, is_archived = true
  WHERE teacher_id = _teacher_id
    AND period_label = v_period
    AND is_archived = false;

  -- Move frozen balance into available balance + advance period
  UPDATE public.teacher_wallets
    SET balance = balance + frozen_balance,
        frozen_balance = 0,
        current_period = to_char(now(), 'YYYY-MM'),
        updated_at = now()
  WHERE teacher_id = _teacher_id;

  -- Notify teacher
  INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent)
  VALUES (
    _teacher_id,
    '✅ تم فتح السحب لشهر ' || v_period,
    'تم نقل أرباح الشهر إلى الرصيد المتاح للسحب: ' || v_total || ' جنيه',
    'wallet', '/teacher/wallet', false, true
  );

  RETURN jsonb_build_object('success', true, 'period', v_period, 'total', v_total, 'subscribers', v_subs);
END;
$function$;

-- =====================================================================
-- 9) RPC: archive ALL teachers (used by admin "open withdrawal now")
-- =====================================================================
CREATE OR REPLACE FUNCTION public.archive_all_teachers_period()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_count int := 0;
  r record;
BEGIN
  IF NOT has_role(v_caller, 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  FOR r IN SELECT teacher_id FROM public.teacher_wallets WHERE frozen_balance > 0 LOOP
    PERFORM public.archive_teacher_period(r.teacher_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'archived_count', v_count);
END;
$function$;


-- 1. Update default to 55%
UPDATE public.platform_settings SET value = '0.55' WHERE key = 'teacher_commission_rate';
INSERT INTO public.platform_settings (key, value)
SELECT 'teacher_commission_rate', '0.55'
WHERE NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'teacher_commission_rate');

-- 2. Per-teacher commission fields on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS commission_rate numeric,
  ADD COLUMN IF NOT EXISTS pending_commission_rate numeric,
  ADD COLUMN IF NOT EXISTS pending_effective_date date;

-- 3. History table
CREATE TABLE IF NOT EXISTS public.teacher_commission_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  old_rate numeric,
  new_rate numeric NOT NULL,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  scheduled boolean NOT NULL DEFAULT false,
  applied boolean NOT NULL DEFAULT true,
  applied_at timestamptz,
  note text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tch_teacher ON public.teacher_commission_history(teacher_id, created_at DESC);

ALTER TABLE public.teacher_commission_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage commission history" ON public.teacher_commission_history;
CREATE POLICY "Admins manage commission history" ON public.teacher_commission_history
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Teachers view own commission history" ON public.teacher_commission_history;
CREATE POLICY "Teachers view own commission history" ON public.teacher_commission_history
  FOR SELECT USING (auth.uid() = teacher_id);

-- 4. Effective rate helper
CREATE OR REPLACE FUNCTION public.get_effective_teacher_commission(_teacher_id uuid)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rate numeric;
  v_default numeric;
BEGIN
  SELECT commission_rate INTO v_rate FROM public.profiles WHERE id = _teacher_id;
  IF v_rate IS NOT NULL THEN
    RETURN v_rate;
  END IF;
  SELECT COALESCE(NULLIF(value,'')::numeric, 0.55) INTO v_default
    FROM public.platform_settings WHERE key = 'teacher_commission_rate';
  RETURN COALESCE(v_default, 0.55);
END;
$$;

-- 5. Update credit trigger to use effective rate
CREATE OR REPLACE FUNCTION public.credit_teacher_on_purchase()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_teacher_id uuid;
  v_subject_id uuid;
  v_amount numeric;
  v_commission_rate numeric;
  v_commission numeric;
  v_period text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.teacher_earning_records WHERE purchase_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(teacher_id, created_by), subject_id INTO v_teacher_id, v_subject_id
  FROM public.content_groups WHERE id = NEW.group_id;

  IF v_teacher_id IS NULL THEN RETURN NEW; END IF;

  v_amount := COALESCE(NEW.amount_paid, 0);
  IF v_amount <= 0 THEN RETURN NEW; END IF;

  v_commission_rate := public.get_effective_teacher_commission(v_teacher_id);
  v_commission := ROUND(v_amount * v_commission_rate, 2);
  v_period := to_char(NEW.purchased_at, 'YYYY-MM');

  INSERT INTO public.teacher_earning_records
    (teacher_id, purchase_id, group_id, subject_id, student_id,
     gross_amount, commission_rate, net_amount, period_label, is_frozen, is_archived)
  VALUES
    (v_teacher_id, NEW.id, NEW.group_id, v_subject_id, NEW.student_id,
     v_amount, v_commission_rate, v_commission, v_period, true, false);

  INSERT INTO public.teacher_wallets (teacher_id, balance, frozen_balance, total_earned, current_period)
  VALUES (v_teacher_id, 0, v_commission, v_commission, v_period)
  ON CONFLICT (teacher_id) DO UPDATE
  SET frozen_balance = teacher_wallets.frozen_balance + v_commission,
      total_earned = teacher_wallets.total_earned + v_commission,
      updated_at = now();

  RETURN NEW;
END;
$function$;

-- 6. Admin set commission RPC
CREATE OR REPLACE FUNCTION public.admin_set_teacher_commission(
  _teacher_id uuid,
  _new_rate numeric,
  _effective_date date DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_old numeric;
  v_today date := CURRENT_DATE;
  v_scheduled boolean;
BEGIN
  IF NOT has_role(v_caller, 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;
  IF _new_rate IS NULL OR _new_rate < 0 OR _new_rate > 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'النسبة يجب أن تكون بين 0 و 1');
  END IF;

  SELECT public.get_effective_teacher_commission(_teacher_id) INTO v_old;
  v_scheduled := _effective_date IS NOT NULL AND _effective_date > v_today;

  IF v_scheduled THEN
    UPDATE public.profiles
       SET pending_commission_rate = _new_rate,
           pending_effective_date  = _effective_date
     WHERE id = _teacher_id;

    INSERT INTO public.teacher_commission_history
      (teacher_id, old_rate, new_rate, effective_date, scheduled, applied, applied_at, note, changed_by)
    VALUES (_teacher_id, v_old, _new_rate, _effective_date, true, false, NULL, _note, v_caller);
  ELSE
    UPDATE public.profiles
       SET commission_rate = _new_rate,
           pending_commission_rate = NULL,
           pending_effective_date  = NULL
     WHERE id = _teacher_id;

    INSERT INTO public.teacher_commission_history
      (teacher_id, old_rate, new_rate, effective_date, scheduled, applied, applied_at, note, changed_by)
    VALUES (_teacher_id, v_old, _new_rate, v_today, false, true, now(), _note, v_caller);
  END IF;

  RETURN jsonb_build_object('success', true, 'scheduled', v_scheduled, 'old_rate', v_old, 'new_rate', _new_rate);
END;
$$;

-- 7. Apply pending rates whose date has arrived
CREATE OR REPLACE FUNCTION public.apply_pending_commissions()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  r record;
BEGIN
  FOR r IN
    SELECT id, commission_rate, pending_commission_rate
    FROM public.profiles
    WHERE pending_effective_date IS NOT NULL
      AND pending_effective_date <= CURRENT_DATE
      AND pending_commission_rate IS NOT NULL
  LOOP
    UPDATE public.profiles
       SET commission_rate = r.pending_commission_rate,
           pending_commission_rate = NULL,
           pending_effective_date = NULL
     WHERE id = r.id;

    UPDATE public.teacher_commission_history
       SET applied = true, applied_at = now()
     WHERE teacher_id = r.id
       AND scheduled = true
       AND applied = false
       AND new_rate = r.pending_commission_rate;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'applied', v_count);
END;
$$;

-- 8. Auto-archive when today == withdrawal_open_day
CREATE OR REPLACE FUNCTION public.auto_archive_if_due()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_day int;
  v_count int := 0;
  r record;
BEGIN
  SELECT COALESCE(NULLIF(value,'')::int, 25) INTO v_day
    FROM public.platform_settings WHERE key = 'withdrawal_open_day';
  IF v_day IS NULL THEN v_day := 25; END IF;

  IF EXTRACT(DAY FROM CURRENT_DATE)::int <> v_day THEN
    RETURN jsonb_build_object('success', true, 'archived_count', 0, 'skipped', true);
  END IF;

  FOR r IN SELECT teacher_id FROM public.teacher_wallets WHERE frozen_balance > 0 LOOP
    PERFORM public.archive_teacher_period(r.teacher_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'archived_count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_teacher_commission(uuid, numeric, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_teacher_commission(uuid) TO authenticated;

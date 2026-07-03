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
  v_inserted_id uuid;
BEGIN
  IF NEW.student_id IS NOT NULL AND public.is_test_student(NEW.student_id) THEN
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
     v_amount, v_commission_rate, v_commission, v_period, true, false)
  ON CONFLICT (purchase_id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.teacher_wallets (teacher_id, balance, frozen_balance, total_earned, current_period)
  VALUES (v_teacher_id, 0, v_commission, v_commission, v_period)
  ON CONFLICT (teacher_id) DO UPDATE
  SET frozen_balance = teacher_wallets.frozen_balance + v_commission,
      total_earned = teacher_wallets.total_earned + v_commission,
      updated_at = now();

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
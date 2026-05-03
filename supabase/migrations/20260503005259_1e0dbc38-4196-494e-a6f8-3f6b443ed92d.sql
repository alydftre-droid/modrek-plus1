
-- Idempotent credit trigger
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
  v_inserted_id uuid;
BEGIN
  SELECT COALESCE(teacher_id, created_by), subject_id INTO v_teacher_id, v_subject_id
  FROM public.content_groups WHERE id = NEW.group_id;

  IF v_teacher_id IS NULL THEN RETURN NEW; END IF;

  v_amount := COALESCE(NEW.amount_paid, 0);
  IF v_amount <= 0 THEN RETURN NEW; END IF;

  v_commission_rate := public.get_effective_teacher_commission(v_teacher_id);
  v_commission := ROUND(v_amount * v_commission_rate, 2);
  v_period := to_char(NEW.purchased_at, 'YYYY-MM');

  -- Atomic idempotent insert (relies on unique purchase_id)
  INSERT INTO public.teacher_earning_records
    (teacher_id, purchase_id, group_id, subject_id, student_id,
     gross_amount, commission_rate, net_amount, period_label, is_frozen, is_archived)
  VALUES
    (v_teacher_id, NEW.id, NEW.group_id, v_subject_id, NEW.student_id,
     v_amount, v_commission_rate, v_commission, v_period, true, false)
  ON CONFLICT (purchase_id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  -- If conflict (already credited) — exit without touching wallet
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

-- Set commission with notification
CREATE OR REPLACE FUNCTION public.admin_set_teacher_commission(
  _teacher_id uuid, _new_rate numeric, _effective_date date DEFAULT NULL, _note text DEFAULT NULL
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
       SET pending_commission_rate = _new_rate, pending_effective_date = _effective_date
     WHERE id = _teacher_id;

    INSERT INTO public.teacher_commission_history
      (teacher_id, old_rate, new_rate, effective_date, scheduled, applied, applied_at, note, changed_by)
    VALUES (_teacher_id, v_old, _new_rate, _effective_date, true, false, NULL, _note, v_caller);

    INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent)
    VALUES (
      _teacher_id,
      '📅 جدولة تعديل نسبة العمولة',
      'تم جدولة نسبة عمولة جديدة (' || ROUND(_new_rate*100) || '%) لتُطبَّق يوم ' || to_char(_effective_date, 'YYYY-MM-DD') || '. النسبة الحالية: ' || ROUND(v_old*100) || '%.',
      'commission', '/teacher/wallet', false, true
    );
  ELSE
    UPDATE public.profiles
       SET commission_rate = _new_rate, pending_commission_rate = NULL, pending_effective_date = NULL
     WHERE id = _teacher_id;

    INSERT INTO public.teacher_commission_history
      (teacher_id, old_rate, new_rate, effective_date, scheduled, applied, applied_at, note, changed_by)
    VALUES (_teacher_id, v_old, _new_rate, v_today, false, true, now(), _note, v_caller);

    INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent)
    VALUES (
      _teacher_id,
      '✅ تم تحديث نسبة العمولة',
      'تم تحديث نسبة عمولتك إلى ' || ROUND(_new_rate*100) || '% (السابقة: ' || ROUND(v_old*100) || '%). النسبة الجديدة تُطبَّق فوراً على الاشتراكات الجديدة.',
      'commission', '/teacher/wallet', false, true
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'scheduled', v_scheduled, 'old_rate', v_old, 'new_rate', _new_rate);
END;
$$;

-- Apply pending with notification
CREATE OR REPLACE FUNCTION public.apply_pending_commissions()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  r record;
BEGIN
  FOR r IN
    SELECT id, commission_rate AS old_rate, pending_commission_rate AS new_rate
    FROM public.profiles
    WHERE pending_effective_date IS NOT NULL
      AND pending_effective_date <= CURRENT_DATE
      AND pending_commission_rate IS NOT NULL
  LOOP
    UPDATE public.profiles
       SET commission_rate = r.new_rate,
           pending_commission_rate = NULL,
           pending_effective_date = NULL
     WHERE id = r.id;

    UPDATE public.teacher_commission_history
       SET applied = true, applied_at = now()
     WHERE teacher_id = r.id AND scheduled = true AND applied = false AND new_rate = r.new_rate;

    INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent)
    VALUES (
      r.id,
      '🎉 تم تفعيل نسبة العمولة الجديدة',
      'وصل تاريخ تفعيل نسبة عمولتك الجديدة (' || ROUND(r.new_rate*100) || '%). تم تطبيقها تلقائياً على كل اشتراك جديد.',
      'commission', '/teacher/wallet', false, true
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'applied', v_count);
END;
$$;


-- Add category_keys column to support category-based bundles (new model)
ALTER TABLE public.bundled_packages 
  ADD COLUMN IF NOT EXISTS category_keys text[] NOT NULL DEFAULT '{}'::text[];

-- New RPC: purchase by category selections. Each selection: {category_key, group_id}.
-- Validates each group exists & is active, prevents duplicate purchase, applies discount.
CREATE OR REPLACE FUNCTION public.purchase_bundle_by_categories(_package_id uuid, _selections jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_student uuid := auth.uid();
  v_pkg public.bundled_packages%ROWTYPE;
  v_sel jsonb;
  v_cat text;
  v_group_id uuid;
  v_group record;
  v_total_original numeric := 0;
  v_total_final numeric;
  v_wallet_balance numeric;
  v_subscription_id uuid;
  v_purchase_id uuid;
  v_share numeric;
  v_required_categories text[];
  v_seen_categories text[] := '{}';
BEGIN
  IF v_student IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول');
  END IF;

  SELECT * INTO v_pkg FROM public.bundled_packages WHERE id = _package_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'الباقة غير موجودة'); END IF;
  IF v_pkg.status <> 'active' THEN RETURN jsonb_build_object('success', false, 'error', 'الباقة غير نشطة'); END IF;
  IF v_pkg.expires_at IS NOT NULL AND v_pkg.expires_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'انتهت صلاحية الباقة'); END IF;
  IF v_pkg.max_subscriptions IS NOT NULL AND v_pkg.subscriptions_count >= v_pkg.max_subscriptions THEN
    RETURN jsonb_build_object('success', false, 'error', 'تم استنفاد عدد الاشتراكات'); END IF;
  IF EXISTS (SELECT 1 FROM public.bundled_package_subscriptions WHERE package_id = _package_id AND student_id = v_student) THEN
    RETURN jsonb_build_object('success', false, 'error', 'أنت مشترك في هذه الباقة بالفعل'); END IF;

  v_required_categories := v_pkg.category_keys;
  IF v_required_categories IS NULL OR array_length(v_required_categories,1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'الباقة لا تحتوي على فئات'); END IF;

  IF jsonb_typeof(_selections) <> 'array' OR jsonb_array_length(_selections) <> array_length(v_required_categories,1) THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب اختيار مجموعة لكل فئة'); END IF;

  FOR v_sel IN SELECT * FROM jsonb_array_elements(_selections) LOOP
    v_cat := v_sel->>'category_key';
    v_group_id := (v_sel->>'group_id')::uuid;

    IF NOT (v_cat = ANY(v_required_categories)) THEN
      RETURN jsonb_build_object('success', false, 'error', 'فئة غير مطلوبة في الباقة'); END IF;
    IF v_cat = ANY(v_seen_categories) THEN
      RETURN jsonb_build_object('success', false, 'error', 'تم اختيار فئة مكرّرة'); END IF;
    v_seen_categories := array_append(v_seen_categories, v_cat);

    SELECT cg.id, cg.price, cg.is_active, cg.subject_id, COALESCE(cg.teacher_id, cg.created_by) AS teacher_id
      INTO v_group FROM public.content_groups cg WHERE cg.id = v_group_id;
    IF NOT FOUND OR v_group.is_active IS NOT TRUE THEN
      RETURN jsonb_build_object('success', false, 'error', 'مجموعة غير صالحة'); END IF;

    IF EXISTS (SELECT 1 FROM public.student_group_purchases WHERE student_id = v_student AND group_id = v_group_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'أنت مشترك بالفعل في إحدى مجموعات الباقة'); END IF;

    v_total_original := v_total_original + COALESCE(v_group.price, 0);
  END LOOP;

  IF v_pkg.manual_final_price IS NOT NULL THEN
    v_total_final := v_pkg.manual_final_price;
  ELSE
    v_total_final := ROUND(v_total_original * (1 - COALESCE(v_pkg.discount_percentage,0)/100.0), 2);
  END IF;
  IF v_total_final < 0 THEN v_total_final := 0; END IF;

  SELECT balance INTO v_wallet_balance FROM public.wallets WHERE user_id = v_student FOR UPDATE;
  IF v_wallet_balance IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'لم يتم العثور على محفظتك'); END IF;
  IF v_wallet_balance < v_total_final THEN RETURN jsonb_build_object('success', false, 'error', 'الرصيد غير كافٍ'); END IF;

  UPDATE public.wallets SET balance = balance - v_total_final, updated_at = now() WHERE user_id = v_student;

  INSERT INTO public.bundled_package_subscriptions (package_id, student_id, total_original, total_paid, discount_applied)
  VALUES (_package_id, v_student, v_total_original, v_total_final, GREATEST(v_total_original - v_total_final, 0))
  RETURNING id INTO v_subscription_id;

  FOR v_sel IN SELECT * FROM jsonb_array_elements(_selections) LOOP
    v_cat := v_sel->>'category_key';
    v_group_id := (v_sel->>'group_id')::uuid;
    SELECT cg.id, cg.price, cg.subject_id, COALESCE(cg.teacher_id, cg.created_by) AS teacher_id
      INTO v_group FROM public.content_groups cg WHERE cg.id = v_group_id;

    IF v_total_original > 0 THEN
      v_share := ROUND((COALESCE(v_group.price,0) / v_total_original) * v_total_final, 2);
    ELSE v_share := 0; END IF;

    INSERT INTO public.student_group_purchases (student_id, group_id, amount_paid)
    VALUES (v_student, v_group_id, v_share) RETURNING id INTO v_purchase_id;

    INSERT INTO public.bundled_package_subscription_groups
      (subscription_id, subject_id, group_id, teacher_id, price_at_purchase, group_purchase_id)
    VALUES (v_subscription_id, v_group.subject_id, v_group_id, v_group.teacher_id, v_share, v_purchase_id);
  END LOOP;

  INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent)
  VALUES (v_student, '🎉 تم الاشتراك في باقة',
    'تم اشتراكك في ' || COALESCE(v_pkg.name,'الباقة') || ' بنجاح بمبلغ ' || v_total_final || ' جنيه',
    'subscription', '/my-courses', false, true);

  RETURN jsonb_build_object('success', true, 'subscription_id', v_subscription_id,
    'total_original', v_total_original, 'total_paid', v_total_final,
    'remaining_balance', v_wallet_balance - v_total_final);
END; $function$;

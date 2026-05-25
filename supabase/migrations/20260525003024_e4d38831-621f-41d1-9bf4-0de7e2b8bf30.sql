ALTER TABLE public.bundled_packages
  ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS discount_amount numeric;

UPDATE public.bundled_packages
SET discount_type = COALESCE(NULLIF(discount_type, ''), 'percentage')
WHERE discount_type IS NULL OR discount_type = '';

ALTER TABLE public.bundled_packages
  DROP CONSTRAINT IF EXISTS bundled_packages_discount_type_check;

ALTER TABLE public.bundled_packages
  ADD CONSTRAINT bundled_packages_discount_type_check
  CHECK (discount_type IN ('percentage', 'amount'));

ALTER TABLE public.bundled_packages
  DROP CONSTRAINT IF EXISTS bundled_packages_discount_percentage_check;

ALTER TABLE public.bundled_packages
  ADD CONSTRAINT bundled_packages_discount_percentage_check
  CHECK (discount_percentage >= 0 AND discount_percentage <= 100);

ALTER TABLE public.bundled_packages
  DROP CONSTRAINT IF EXISTS bundled_packages_discount_amount_check;

ALTER TABLE public.bundled_packages
  ADD CONSTRAINT bundled_packages_discount_amount_check
  CHECK (discount_amount IS NULL OR discount_amount >= 0);

CREATE OR REPLACE FUNCTION public.bundle_category_matches_subject(
  _category_key text,
  _subject_category text,
  _subject_name text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $function$
DECLARE
  v_key text := lower(coalesce(trim(_category_key), ''));
  v_cat text := lower(coalesce(trim(_subject_category), ''));
  v_name text := coalesce(trim(_subject_name), '');
BEGIN
  IF v_key = '' THEN
    RETURN false;
  END IF;

  CASE v_key
    WHEN 'arabic' THEN
      RETURN v_cat = 'arabic';
    WHEN 'religious' THEN
      RETURN v_cat IN ('religious', 'sharia');
    WHEN 'english' THEN
      RETURN v_cat = 'english';
    WHEN 'math' THEN
      RETURN v_cat = 'math' OR v_name LIKE '%رياضيات%';
    WHEN 'science' THEN
      RETURN v_cat IN ('science', 'integrated_science') AND (v_name LIKE '%علوم%' OR v_name LIKE '%العلوم%');
    WHEN 'integrated_science' THEN
      RETURN (v_cat IN ('integrated_science', 'science')) AND v_name LIKE '%العلوم المتكاملة%';
    WHEN 'social' THEN
      RETURN v_cat IN ('social', 'studies') AND (v_name LIKE '%دراسات%');
    WHEN 'history_geo' THEN
      RETURN v_cat = 'literary' AND (v_name LIKE '%تاريخ%' OR v_name LIKE '%جغرافيا%');
    WHEN 'physics' THEN
      RETURN v_cat IN ('scientific', 'science') AND v_name LIKE '%فيزياء%';
    WHEN 'chemistry' THEN
      RETURN v_cat IN ('scientific', 'science') AND v_name LIKE '%كيمياء%';
    WHEN 'biology' THEN
      RETURN v_cat IN ('scientific', 'science') AND (v_name LIKE '%أحياء%' OR v_name LIKE '%احياء%');
    ELSE
      RETURN false;
  END CASE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.purchase_bundle_by_categories(_package_id uuid, _selections jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    RETURN jsonb_build_object('success', false, 'error', 'الباقة لا تحتوي على مواد'); END IF;

  IF jsonb_typeof(_selections) <> 'array' OR jsonb_array_length(_selections) <> array_length(v_required_categories,1) THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب اختيار مجموعة لكل مادة'); END IF;

  FOR v_sel IN SELECT * FROM jsonb_array_elements(_selections) LOOP
    v_cat := v_sel->>'category_key';
    v_group_id := (v_sel->>'group_id')::uuid;

    IF NOT (v_cat = ANY(v_required_categories)) THEN
      RETURN jsonb_build_object('success', false, 'error', 'مادة غير مطلوبة في الباقة'); END IF;
    IF v_cat = ANY(v_seen_categories) THEN
      RETURN jsonb_build_object('success', false, 'error', 'تم اختيار مادة مكررة'); END IF;
    v_seen_categories := array_append(v_seen_categories, v_cat);

    SELECT cg.id, cg.price, cg.is_active, cg.subject_id, COALESCE(cg.teacher_id, cg.created_by) AS teacher_id,
           s.category AS subject_category, s.name AS subject_name
      INTO v_group
      FROM public.content_groups cg
      JOIN public.subjects s ON s.id = cg.subject_id
      WHERE cg.id = v_group_id;

    IF NOT FOUND OR v_group.is_active IS NOT TRUE THEN
      RETURN jsonb_build_object('success', false, 'error', 'مجموعة غير صالحة'); END IF;

    IF NOT public.bundle_category_matches_subject(v_cat, v_group.subject_category, v_group.subject_name) THEN
      RETURN jsonb_build_object('success', false, 'error', 'المجموعة المختارة لا تنتمي للمادة المطلوبة'); END IF;

    IF EXISTS (SELECT 1 FROM public.student_group_purchases WHERE student_id = v_student AND group_id = v_group_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'أنت مشترك بالفعل في إحدى مجموعات الباقة'); END IF;

    v_total_original := v_total_original + COALESCE(v_group.price, 0);
  END LOOP;

  IF COALESCE(v_pkg.discount_type, 'percentage') = 'amount' THEN
    v_total_final := GREATEST(v_total_original - COALESCE(v_pkg.discount_amount, 0), 0);
  ELSIF v_pkg.manual_final_price IS NOT NULL THEN
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
      INTO v_group
      FROM public.content_groups cg
      WHERE cg.id = v_group_id;

    IF v_total_original > 0 THEN
      v_share := ROUND((COALESCE(v_group.price,0) / v_total_original) * v_total_final, 2);
    ELSE
      v_share := 0;
    END IF;

    INSERT INTO public.student_group_purchases (student_id, group_id, amount_paid)
    VALUES (v_student, v_group_id, v_share)
    RETURNING id INTO v_purchase_id;

    INSERT INTO public.bundled_package_subscription_groups
      (subscription_id, subject_id, group_id, teacher_id, price_at_purchase, group_purchase_id)
    VALUES (v_subscription_id, v_group.subject_id, v_group_id, v_group.teacher_id, v_share, v_purchase_id);
  END LOOP;

  INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent)
  VALUES (
    v_student,
    '🎉 تم الاشتراك في باقة',
    'تم اشتراكك في ' || COALESCE(v_pkg.name,'الباقة') || ' بنجاح بمبلغ ' || v_total_final || ' جنيه',
    'subscription', '/my-courses', false, true
  );

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', v_subscription_id,
    'total_original', v_total_original,
    'total_paid', v_total_final,
    'remaining_balance', v_wallet_balance - v_total_final
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.compute_bundle_price(_package_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pkg public.bundled_packages%ROWTYPE;
  v_original numeric := 0;
  v_final numeric := 0;
  v_subject record;
  v_min_price numeric;
  v_key text;
BEGIN
  SELECT * INTO v_pkg FROM public.bundled_packages WHERE id = _package_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('original',0,'final',0,'discount_amount',0,'discount_percentage',0);
  END IF;

  IF v_pkg.category_keys IS NOT NULL AND array_length(v_pkg.category_keys, 1) IS NOT NULL THEN
    FOREACH v_key IN ARRAY v_pkg.category_keys LOOP
      SELECT MIN(cg.price)
      INTO v_min_price
      FROM public.content_groups cg
      JOIN public.subjects s ON s.id = cg.subject_id
      WHERE cg.is_active = true
        AND public.bundle_category_matches_subject(v_key, s.category, s.name);

      IF v_min_price IS NOT NULL THEN
        v_original := v_original + v_min_price;
      END IF;
    END LOOP;
  ELSE
    FOR v_subject IN
      SELECT subject_id FROM public.bundled_package_subjects WHERE package_id = _package_id
    LOOP
      SELECT MIN(price) INTO v_min_price
      FROM public.content_groups
      WHERE subject_id = v_subject.subject_id AND is_active = true;
      IF v_min_price IS NOT NULL THEN
        v_original := v_original + v_min_price;
      END IF;
    END LOOP;
  END IF;

  IF COALESCE(v_pkg.discount_type, 'percentage') = 'amount' THEN
    v_final := GREATEST(v_original - COALESCE(v_pkg.discount_amount, 0), 0);
  ELSIF v_pkg.manual_final_price IS NOT NULL THEN
    v_final := v_pkg.manual_final_price;
  ELSE
    v_final := ROUND(v_original * (1 - COALESCE(v_pkg.discount_percentage,0)/100.0), 2);
  END IF;

  IF v_final < 0 THEN v_final := 0; END IF;

  RETURN jsonb_build_object(
    'original', v_original,
    'final', v_final,
    'discount_amount', GREATEST(v_original - v_final, 0),
    'discount_percentage', CASE WHEN v_original > 0 THEN ROUND(((v_original - v_final)/v_original)*100, 1) ELSE 0 END
  );
END;
$function$;
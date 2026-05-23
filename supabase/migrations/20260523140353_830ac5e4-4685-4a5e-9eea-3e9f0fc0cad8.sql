
-- =====================================================
-- BUNDLED PACKAGES SYSTEM
-- =====================================================

-- 1) Main packages table
CREATE TABLE IF NOT EXISTS public.bundled_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  name text,
  description text,
  image_url text,
  color text DEFAULT '#10b981',
  education_type text NOT NULL CHECK (education_type IN ('عام','أزهر')),
  stage text NOT NULL CHECK (stage IN ('preparatory','secondary')),
  grade text NOT NULL,
  section text,
  discount_percentage numeric NOT NULL DEFAULT 0 CHECK (discount_percentage >= 0 AND discount_percentage <= 95),
  manual_final_price numeric,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','active','hidden','expired')),
  publish_at timestamptz,
  expires_at timestamptz,
  max_subscriptions int,
  subscriptions_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bundled_packages_filter ON public.bundled_packages(education_type, stage, grade, section, status);

-- 2) Subjects in package
CREATE TABLE IF NOT EXISTS public.bundled_package_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.bundled_packages(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_bundled_package_subjects_pkg ON public.bundled_package_subjects(package_id);

-- 3) Student subscriptions to packages
CREATE TABLE IF NOT EXISTS public.bundled_package_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.bundled_packages(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL,
  total_original numeric NOT NULL DEFAULT 0,
  total_paid numeric NOT NULL DEFAULT 0,
  discount_applied numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_bundle_subs_student ON public.bundled_package_subscriptions(student_id);

-- 4) Groups chosen per subject within a subscription
CREATE TABLE IF NOT EXISTS public.bundled_package_subscription_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.bundled_package_subscriptions(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL,
  group_id uuid NOT NULL,
  teacher_id uuid,
  price_at_purchase numeric NOT NULL DEFAULT 0,
  group_purchase_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, subject_id)
);

-- =====================================================
-- TRIGGERS
-- =====================================================

CREATE OR REPLACE FUNCTION public.bundled_packages_set_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_bundled_packages_updated ON public.bundled_packages;
CREATE TRIGGER trg_bundled_packages_updated
BEFORE UPDATE ON public.bundled_packages
FOR EACH ROW EXECUTE FUNCTION public.bundled_packages_set_updated();

CREATE OR REPLACE FUNCTION public.bundle_subscription_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_max int; v_count int;
BEGIN
  UPDATE public.bundled_packages
    SET subscriptions_count = subscriptions_count + 1, updated_at = now()
    WHERE id = NEW.package_id
    RETURNING max_subscriptions, subscriptions_count INTO v_max, v_count;

  IF v_max IS NOT NULL AND v_count >= v_max THEN
    UPDATE public.bundled_packages SET status='expired' WHERE id = NEW.package_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_bundle_sub_after_insert ON public.bundled_package_subscriptions;
CREATE TRIGGER trg_bundle_sub_after_insert
AFTER INSERT ON public.bundled_package_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.bundle_subscription_after_insert();

-- =====================================================
-- RLS
-- =====================================================

ALTER TABLE public.bundled_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundled_package_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundled_package_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundled_package_subscription_groups ENABLE ROW LEVEL SECURITY;

-- packages
DROP POLICY IF EXISTS "Admins manage bundled packages" ON public.bundled_packages;
CREATE POLICY "Admins manage bundled packages" ON public.bundled_packages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Students view active packages" ON public.bundled_packages;
CREATE POLICY "Students view active packages" ON public.bundled_packages
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR status = 'active'
  );

-- package subjects
DROP POLICY IF EXISTS "Admins manage package subjects" ON public.bundled_package_subjects;
CREATE POLICY "Admins manage package subjects" ON public.bundled_package_subjects
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Anyone authenticated reads package subjects" ON public.bundled_package_subjects;
CREATE POLICY "Anyone authenticated reads package subjects" ON public.bundled_package_subjects
  FOR SELECT TO authenticated USING (true);

-- subscriptions
DROP POLICY IF EXISTS "Students see own bundle subs" ON public.bundled_package_subscriptions;
CREATE POLICY "Students see own bundle subs" ON public.bundled_package_subscriptions
  FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage bundle subs" ON public.bundled_package_subscriptions;
CREATE POLICY "Admins manage bundle subs" ON public.bundled_package_subscriptions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- subscription groups
DROP POLICY IF EXISTS "Students see own bundle sub groups" ON public.bundled_package_subscription_groups;
CREATE POLICY "Students see own bundle sub groups" ON public.bundled_package_subscription_groups
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bundled_package_subscriptions s
      WHERE s.id = subscription_id AND (s.student_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- =====================================================
-- PRICING FUNCTION (Smart Dynamic)
-- =====================================================

CREATE OR REPLACE FUNCTION public.compute_bundle_price(_package_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_pkg public.bundled_packages%ROWTYPE;
  v_original numeric := 0;
  v_final numeric := 0;
  v_subject record;
  v_min_price numeric;
BEGIN
  SELECT * INTO v_pkg FROM public.bundled_packages WHERE id = _package_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('original',0,'final',0,'discount_amount',0,'discount_percentage',0);
  END IF;

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

  IF v_pkg.manual_final_price IS NOT NULL THEN
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
END; $$;

-- =====================================================
-- PURCHASE FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION public.purchase_bundled_package(_package_id uuid, _selections jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_student uuid := auth.uid();
  v_pkg public.bundled_packages%ROWTYPE;
  v_subject_ids uuid[];
  v_sel jsonb;
  v_subject_id uuid;
  v_group_id uuid;
  v_group record;
  v_total_original numeric := 0;
  v_total_final numeric;
  v_wallet_balance numeric;
  v_subscription_id uuid;
  v_purchase_id uuid;
  v_pkg_teacher uuid;
BEGIN
  IF v_student IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول');
  END IF;

  SELECT * INTO v_pkg FROM public.bundled_packages WHERE id = _package_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الباقة غير موجودة');
  END IF;

  IF v_pkg.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'الباقة غير نشطة حالياً');
  END IF;
  IF v_pkg.expires_at IS NOT NULL AND v_pkg.expires_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'انتهت صلاحية الباقة');
  END IF;
  IF v_pkg.max_subscriptions IS NOT NULL AND v_pkg.subscriptions_count >= v_pkg.max_subscriptions THEN
    RETURN jsonb_build_object('success', false, 'error', 'تم استنفاد عدد الاشتراكات للباقة');
  END IF;

  IF EXISTS (SELECT 1 FROM public.bundled_package_subscriptions WHERE package_id = _package_id AND student_id = v_student) THEN
    RETURN jsonb_build_object('success', false, 'error', 'أنت مشترك في هذه الباقة بالفعل');
  END IF;

  SELECT array_agg(subject_id) INTO v_subject_ids
    FROM public.bundled_package_subjects WHERE package_id = _package_id;

  IF v_subject_ids IS NULL OR array_length(v_subject_ids,1) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'الباقة لا تحتوي على مواد');
  END IF;

  IF jsonb_typeof(_selections) <> 'array' OR jsonb_array_length(_selections) <> array_length(v_subject_ids,1) THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب اختيار مجموعة لكل مادة في الباقة');
  END IF;

  -- Validate each selection & compute original total
  FOR v_sel IN SELECT * FROM jsonb_array_elements(_selections) LOOP
    v_subject_id := (v_sel->>'subject_id')::uuid;
    v_group_id   := (v_sel->>'group_id')::uuid;

    IF NOT (v_subject_id = ANY(v_subject_ids)) THEN
      RETURN jsonb_build_object('success', false, 'error', 'مادة غير موجودة في الباقة');
    END IF;

    SELECT cg.id, cg.price, cg.is_active, cg.subject_id, COALESCE(cg.teacher_id, cg.created_by) AS teacher_id
      INTO v_group
      FROM public.content_groups cg
      WHERE cg.id = v_group_id;
    IF NOT FOUND OR v_group.subject_id <> v_subject_id OR v_group.is_active IS NOT TRUE THEN
      RETURN jsonb_build_object('success', false, 'error', 'مجموعة غير صالحة لإحدى المواد');
    END IF;

    -- Prevent double subscription to same group
    IF EXISTS (SELECT 1 FROM public.student_group_purchases WHERE student_id = v_student AND group_id = v_group_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'أنت مشترك بالفعل في إحدى مجموعات الباقة');
    END IF;

    v_total_original := v_total_original + COALESCE(v_group.price, 0);
  END LOOP;

  -- Compute final price using discount % or manual override (Smart Dynamic at purchase time)
  IF v_pkg.manual_final_price IS NOT NULL THEN
    v_total_final := v_pkg.manual_final_price;
  ELSE
    v_total_final := ROUND(v_total_original * (1 - COALESCE(v_pkg.discount_percentage,0)/100.0), 2);
  END IF;
  IF v_total_final < 0 THEN v_total_final := 0; END IF;

  -- Wallet
  SELECT balance INTO v_wallet_balance FROM public.wallets WHERE user_id = v_student FOR UPDATE;
  IF v_wallet_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'لم يتم العثور على محفظتك');
  END IF;
  IF v_wallet_balance < v_total_final THEN
    RETURN jsonb_build_object('success', false, 'error', 'الرصيد غير كافٍ');
  END IF;

  -- Deduct
  UPDATE public.wallets SET balance = balance - v_total_final, updated_at = now() WHERE user_id = v_student;

  -- Create subscription record
  INSERT INTO public.bundled_package_subscriptions
    (package_id, student_id, total_original, total_paid, discount_applied)
  VALUES
    (_package_id, v_student, v_total_original, v_total_final, GREATEST(v_total_original - v_total_final, 0))
  RETURNING id INTO v_subscription_id;

  -- Distribute final price proportionally per group and insert purchases
  FOR v_sel IN SELECT * FROM jsonb_array_elements(_selections) LOOP
    v_subject_id := (v_sel->>'subject_id')::uuid;
    v_group_id   := (v_sel->>'group_id')::uuid;

    SELECT cg.id, cg.price, COALESCE(cg.teacher_id, cg.created_by) AS teacher_id
      INTO v_group FROM public.content_groups cg WHERE cg.id = v_group_id;

    -- Each group gets its share of the final price (proportional)
    DECLARE
      v_share numeric;
    BEGIN
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
      VALUES (v_subscription_id, v_subject_id, v_group_id, v_group.teacher_id, v_share, v_purchase_id);
    END;
  END LOOP;

  -- Notification
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

EXCEPTION WHEN OTHERS THEN
  RAISE; -- bubble up to rollback whole transaction
END; $$;

GRANT EXECUTE ON FUNCTION public.compute_bundle_price(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_bundled_package(uuid, jsonb) TO authenticated;

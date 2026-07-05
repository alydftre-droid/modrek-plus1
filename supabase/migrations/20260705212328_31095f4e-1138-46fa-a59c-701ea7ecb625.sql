-- Persist test-student subscriptions while keeping teacher-side isolation.

-- 1) Student-owned rows must be visible/manageable to the same student, including test students.
-- Teacher-facing reads remain strictly non-test only.
DROP POLICY IF EXISTS "Students can insert their own choice" ON public.student_teacher_choices;
CREATE POLICY "Students can insert their own choice"
ON public.student_teacher_choices
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Students can update their own choice" ON public.student_teacher_choices;
CREATE POLICY "Students can update their own choice"
ON public.student_teacher_choices
FOR UPDATE
TO authenticated
USING (auth.uid() = student_id)
WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Students can view their own choices" ON public.student_teacher_choices;
CREATE POLICY "Students can view their own choices"
ON public.student_teacher_choices
FOR SELECT
TO authenticated
USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Students see own purchases" ON public.student_group_purchases;
CREATE POLICY "Students see own purchases"
ON public.student_group_purchases
FOR SELECT
TO authenticated
USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Students can insert own purchases" ON public.student_group_purchases;
CREATE POLICY "Students can insert own purchases"
ON public.student_group_purchases
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = student_id);

-- Keep teacher-facing policies explicitly filtered.
DROP POLICY IF EXISTS "Teachers can view choices for them" ON public.student_teacher_choices;
CREATE POLICY "Teachers can view choices for them"
ON public.student_teacher_choices
FOR SELECT
TO authenticated
USING (auth.uid() = teacher_id AND NOT public.is_test_student(student_id));

DROP POLICY IF EXISTS "Teachers can view purchases for their groups" ON public.student_group_purchases;
CREATE POLICY "Teachers can view purchases for their groups"
ON public.student_group_purchases
FOR SELECT
TO authenticated
USING (
  NOT public.is_test_student(student_id)
  AND EXISTS (
    SELECT 1
    FROM public.content_groups
    WHERE content_groups.id = student_group_purchases.group_id
      AND (content_groups.teacher_id = auth.uid() OR content_groups.created_by = auth.uid())
  )
);

-- 2) Make previously dangerous blocking functions harmless if an old deployment recreates their triggers.
CREATE OR REPLACE FUNCTION public.block_teacher_choice_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Deprecated: test students must be able to persist their own teacher choices.
  -- Teacher isolation is enforced by SELECT policies and teacher-side side-effect blockers.
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.block_group_purchase_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Deprecated: test students must be able to persist their own purchases.
  -- Teacher earnings/wallet side effects are blocked separately.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_teacher_choice_test_student_trg ON public.student_teacher_choices;
DROP TRIGGER IF EXISTS block_group_purchase_test_student_trg ON public.student_group_purchases;

-- 3) Purchase RPC: remove fake success for test students; insert the real purchase and deduct wallet like normal.
CREATE OR REPLACE FUNCTION public.purchase_group_with_wallet(p_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_price numeric;
  v_is_active boolean;
  v_wallet_balance numeric;
  v_purchase_id uuid;
  v_teacher_id uuid;
BEGIN
  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول أولاً');
  END IF;

  SELECT price, is_active, COALESCE(teacher_id, created_by)
  INTO v_price, v_is_active, v_teacher_id
  FROM public.content_groups
  WHERE id = p_group_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'المجموعة غير موجودة');
  END IF;

  IF COALESCE(v_is_active, false) = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'هذه المجموعة غير متاحة حالياً');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.student_group_purchases
    WHERE student_id = v_student_id
      AND group_id = p_group_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'أنت مشترك بالفعل في هذه المجموعة');
  END IF;

  SELECT balance
  INTO v_wallet_balance
  FROM public.wallets
  WHERE user_id = v_student_id
  FOR UPDATE;

  IF v_wallet_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'لم يتم العثور على محفظة الطالب');
  END IF;

  IF v_wallet_balance < v_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'الرصيد غير كافٍ');
  END IF;

  UPDATE public.wallets
  SET balance = balance - v_price,
      updated_at = now()
  WHERE user_id = v_student_id;

  INSERT INTO public.student_group_purchases (student_id, group_id, amount_paid)
  VALUES (v_student_id, p_group_id, v_price)
  RETURNING id INTO v_purchase_id;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'amount_paid', v_price,
    'remaining_balance', v_wallet_balance - v_price,
    'test_account', public.is_test_student(v_student_id)
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'أنت مشترك بالفعل في هذه المجموعة');
END;
$$;

-- 4) Do not count persisted test subscriptions as leaks. Leaks are teacher-visible side effects only.
CREATE OR REPLACE FUNCTION public.audit_test_student_visibility()
RETURNS TABLE(source text, row_count bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT 'teacher_messages'::text, COUNT(*)::bigint
    FROM public.teacher_messages tm
   WHERE public.is_test_student(tm.student_id)
  UNION ALL
  SELECT 'teacher_earning_records', COUNT(*)::bigint
    FROM public.teacher_earning_records ter
   WHERE public.is_test_student(ter.student_id)
  UNION ALL
  SELECT 'teacher_wallet_transactions', COUNT(*)::bigint
    FROM public.teacher_wallet_transactions twt
   WHERE public.teacher_wallet_tx_is_for_test_student(twt.metadata)
  UNION ALL
  SELECT 'unflagged_named_test_profiles', COUNT(*)::bigint
    FROM public.profiles p
   WHERE COALESCE(p.role, '') = 'student'
     AND COALESCE(p.full_name, '') ILIKE '%تجريبي%'
     AND NOT public.is_test_student(p.id);
$$;

CREATE OR REPLACE FUNCTION public.teacher_test_student_query_regression()
RETURNS TABLE(scenario text, leaked_count bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT 'message_threads'::text, COUNT(*)::bigint
  FROM public.teacher_messages tm
  WHERE public.is_test_student(tm.student_id)
    AND tm.teacher_id IS NOT NULL

  UNION ALL
  SELECT 'teacher_earnings', COUNT(*)::bigint
  FROM public.teacher_earning_records ter
  WHERE public.is_test_student(ter.student_id)
    AND ter.teacher_id IS NOT NULL

  UNION ALL
  SELECT 'teacher_wallet_transactions', COUNT(*)::bigint
  FROM public.teacher_wallet_transactions twt
  WHERE public.teacher_wallet_tx_is_for_test_student(twt.metadata)

  UNION ALL
  SELECT 'unflagged_legacy_named_test_accounts', COUNT(*)::bigint
  FROM public.profiles p
  WHERE COALESCE(p.role, '') = 'student'
    AND COALESCE(p.full_name, '') ILIKE '%تجريبي%'
    AND NOT public.is_test_student(p.id);
$$;
CREATE OR REPLACE FUNCTION public.teacher_wallet_tx_is_for_test_student(_metadata jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  student uuid;
  purchase uuid;
BEGIN
  IF _metadata IS NULL THEN
    RETURN false;
  END IF;

  BEGIN
    student := NULLIF(_metadata->>'student_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    student := NULL;
  END;

  IF student IS NOT NULL AND public.is_test_student(student) THEN
    RETURN true;
  END IF;

  BEGIN
    purchase := NULLIF(_metadata->>'purchase_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    purchase := NULL;
  END;

  IF purchase IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.student_group_purchases sgp
      WHERE sgp.id = purchase
        AND public.is_test_student(sgp.student_id)
    );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_wallet_tx_is_for_test_student(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_wallet_tx_is_for_test_student(jsonb) TO authenticated, service_role;

DROP POLICY IF EXISTS "Teachers view own earnings" ON public.teacher_earning_records;
CREATE POLICY "Teachers view own earnings"
ON public.teacher_earning_records
FOR SELECT
USING (
  auth.uid() = teacher_id
  AND NOT public.is_test_student(student_id)
);

DROP POLICY IF EXISTS "Teachers view own transactions" ON public.teacher_wallet_transactions;
CREATE POLICY "Teachers view own transactions"
ON public.teacher_wallet_transactions
FOR SELECT
USING (
  auth.uid() = teacher_id
  AND NOT public.teacher_wallet_tx_is_for_test_student(metadata)
);

DROP POLICY IF EXISTS "Teachers can send messages" ON public.teacher_messages;
CREATE POLICY "Teachers can send messages"
ON public.teacher_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = teacher_id
  AND is_from_teacher = true
  AND NOT public.is_test_student(student_id)
);

DROP POLICY IF EXISTS "Users can mark messages as read" ON public.teacher_messages;
CREATE POLICY "Users can mark messages as read"
ON public.teacher_messages
FOR UPDATE
TO authenticated
USING (
  auth.uid() = student_id
  OR (
    auth.uid() = teacher_id
    AND NOT public.is_test_student(student_id)
  )
)
WITH CHECK (
  auth.uid() = student_id
  OR (
    auth.uid() = teacher_id
    AND NOT public.is_test_student(student_id)
  )
);

CREATE OR REPLACE FUNCTION public.block_teacher_wallet_tx_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.teacher_wallet_tx_is_for_test_student(NEW.metadata) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.block_earning_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.student_id IS NOT NULL AND public.is_test_student(NEW.student_id) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
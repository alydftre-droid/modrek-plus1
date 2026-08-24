-- 1) Lock exam grading fields against student tampering
CREATE OR REPLACE FUNCTION public.lock_exam_attempt_grading_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Trusted paths: service role / SECURITY DEFINER grading RPCs run as the
  -- function owner (postgres), never as the PostgREST 'authenticated' role.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  -- Admins and the exam's owning teacher may grade.
  IF public.has_role(auth.uid(), 'admin'::public.app_role)
     OR EXISTS (
       SELECT 1 FROM public.exams e
       WHERE e.id = NEW.exam_id AND e.teacher_id = auth.uid()
     )
  THEN
    RETURN NEW;
  END IF;

  NEW.total_score := OLD.total_score;
  NEW.max_score   := OLD.max_score;
  NEW.percentage  := OLD.percentage;
  NEW.passed      := OLD.passed;
  NEW.is_graded   := OLD.is_graded;
  NEW.graded_by   := OLD.graded_by;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_exam_attempt_grading_fields ON public.exam_attempts;
CREATE TRIGGER trg_lock_exam_attempt_grading_fields
BEFORE UPDATE ON public.exam_attempts
FOR EACH ROW EXECUTE FUNCTION public.lock_exam_attempt_grading_fields();

-- 2) Remove hardcoded email admin backdoors
CREATE OR REPLACE FUNCTION public.is_modrek_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role = 'admin'::public.app_role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_developer_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(public.has_role(_user_id, 'admin'::public.app_role), false);
$$;

-- 3) Course purchases must go through the wallet purchase RPCs
CREATE OR REPLACE FUNCTION public.enforce_group_purchase_via_rpc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'purchases_must_use_wallet_rpc';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_group_purchase_via_rpc ON public.student_group_purchases;
CREATE TRIGGER trg_enforce_group_purchase_via_rpc
BEFORE INSERT OR UPDATE ON public.student_group_purchases
FOR EACH ROW EXECUTE FUNCTION public.enforce_group_purchase_via_rpc();

-- 4) Self-created wallets always start at zero
CREATE OR REPLACE FUNCTION public.enforce_wallet_zero_on_self_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user = 'authenticated'
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    NEW.balance := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_wallet_zero_on_self_insert ON public.wallets;
CREATE TRIGGER trg_enforce_wallet_zero_on_self_insert
BEFORE INSERT ON public.wallets
FOR EACH ROW EXECUTE FUNCTION public.enforce_wallet_zero_on_self_insert();

REVOKE EXECUTE ON FUNCTION public.lock_exam_attempt_grading_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_group_purchase_via_rpc() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_wallet_zero_on_self_insert() FROM PUBLIC, anon, authenticated;
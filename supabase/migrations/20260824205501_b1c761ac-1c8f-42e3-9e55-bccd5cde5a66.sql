CREATE OR REPLACE FUNCTION public.guard_deposit_request_immutable_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- service_role / postgres / definer-admin RPCs bypass this guard
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.recharge_code IS DISTINCT FROM OLD.recharge_code
     OR NEW.recharge_code_id IS DISTINCT FROM OLD.recharge_code_id
     OR NEW.deposit_type IS DISTINCT FROM OLD.deposit_type
     OR NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.processed_by IS DISTINCT FROM OLD.processed_by
     OR NEW.processed_at IS DISTINCT FROM OLD.processed_at
     OR NEW.admin_message IS DISTINCT FROM OLD.admin_message
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.wallet_adjustment_id IS DISTINCT FROM OLD.wallet_adjustment_id
  THEN
    RAISE EXCEPTION 'غير مصرح بتعديل بيانات طلب الإيداع المالية أو حالته';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_deposit_request_immutable_fields() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_deposit_request_immutable_fields() FROM authenticated, anon;

DROP TRIGGER IF EXISTS trg_guard_deposit_request_immutable_fields ON public.deposit_requests;
CREATE TRIGGER trg_guard_deposit_request_immutable_fields
BEFORE UPDATE ON public.deposit_requests
FOR EACH ROW
EXECUTE FUNCTION public.guard_deposit_request_immutable_fields();
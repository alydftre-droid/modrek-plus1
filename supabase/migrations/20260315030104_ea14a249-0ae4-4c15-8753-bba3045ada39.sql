
-- Add media support columns to teacher_messages
ALTER TABLE public.teacher_messages
ADD COLUMN IF NOT EXISTS file_url text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS file_type text DEFAULT NULL;

-- Create teacher commission function triggered on student_group_purchases insert
CREATE OR REPLACE FUNCTION public.credit_teacher_on_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_id uuid;
  v_amount numeric;
  v_commission_rate numeric := 0.70; -- 70% goes to teacher
  v_commission numeric;
BEGIN
  -- Find the teacher who owns this group
  SELECT COALESCE(teacher_id, created_by) INTO v_teacher_id
  FROM public.content_groups
  WHERE id = NEW.group_id;

  IF v_teacher_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_amount := COALESCE(NEW.amount_paid, 0);
  IF v_amount <= 0 THEN
    RETURN NEW;
  END IF;

  v_commission := ROUND(v_amount * v_commission_rate, 2);

  -- Upsert teacher wallet
  INSERT INTO public.teacher_wallets (teacher_id, balance, total_earned)
  VALUES (v_teacher_id, v_commission, v_commission)
  ON CONFLICT (teacher_id) DO UPDATE
  SET balance = teacher_wallets.balance + v_commission,
      total_earned = teacher_wallets.total_earned + v_commission,
      updated_at = now();

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_credit_teacher_on_purchase ON public.student_group_purchases;
CREATE TRIGGER trg_credit_teacher_on_purchase
AFTER INSERT ON public.student_group_purchases
FOR EACH ROW
EXECUTE FUNCTION public.credit_teacher_on_purchase();

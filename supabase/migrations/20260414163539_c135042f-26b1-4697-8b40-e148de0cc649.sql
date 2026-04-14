
-- 1. Fix profiles: remove public SELECT policy, keep authenticated-only
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;

-- 2. Fix wallets: remove user self-update policy (only admin/functions should modify balance)
DROP POLICY IF EXISTS "Users can update own wallet" ON public.wallets;

-- 3. Fix teacher_assignments: remove overly permissive INSERT policies
DROP POLICY IF EXISTS "Allow All Authenticated Insert" ON public.teacher_assignments;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.teacher_assignments;
DROP POLICY IF EXISTS "Teacher Insert" ON public.teacher_assignments;

-- 4. Fix recharge_codes: remove public read of active codes, add server-side validation function
DROP POLICY IF EXISTS "Authenticated users can read active codes" ON public.recharge_codes;

-- Create a secure function to validate a specific recharge code without exposing all codes
CREATE OR REPLACE FUNCTION public.validate_recharge_code(code_text text)
RETURNS TABLE(id uuid, amount numeric, is_valid boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rc.id, rc.amount, (rc.is_active AND rc.current_uses < rc.max_uses) as is_valid
  FROM public.recharge_codes rc
  WHERE rc.code = code_text
  LIMIT 1;
$$;

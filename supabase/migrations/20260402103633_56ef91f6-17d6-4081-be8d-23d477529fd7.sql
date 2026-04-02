
-- Add teacher_code column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS teacher_code TEXT;

-- Create unique index for teacher_code (partial - only non-null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_teacher_code ON public.profiles(teacher_code) WHERE teacher_code IS NOT NULL;

-- Function to generate unique teacher code
CREATE OR REPLACE FUNCTION public.generate_unique_teacher_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    new_code := 'T' || LPAD(floor(random() * 100000)::text, 5, '0');
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE teacher_code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  RETURN new_code;
END;
$$;

-- Auto-assign teacher_code on profile creation if role is teacher
CREATE OR REPLACE FUNCTION public.auto_assign_teacher_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'teacher' AND NEW.teacher_code IS NULL THEN
    NEW.teacher_code := generate_unique_teacher_code();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_auto_teacher_code
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_teacher_code();

-- Backfill existing teachers
UPDATE public.profiles
SET teacher_code = generate_unique_teacher_code()
WHERE role = 'teacher' AND teacher_code IS NULL;

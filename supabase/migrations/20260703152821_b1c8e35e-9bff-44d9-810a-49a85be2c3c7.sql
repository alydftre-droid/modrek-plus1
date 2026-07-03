
-- =========================================================================
-- 1. Columns on profiles
-- =========================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS test_account_code text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_test_account_code_key
  ON public.profiles (test_account_code)
  WHERE test_account_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_is_test_account_idx
  ON public.profiles (is_test_account) WHERE is_test_account = true;

-- =========================================================================
-- 2. Security definer helper
-- =========================================================================
CREATE OR REPLACE FUNCTION public.is_test_student(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_test_account FROM public.profiles WHERE id = _user_id),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_test_student(uuid) TO authenticated, anon, service_role;

-- =========================================================================
-- 3. Prevent unauthorized flag changes
--    Bypass when there is no auth context AND no JWT (migration / direct DB).
-- =========================================================================
CREATE OR REPLACE FUNCTION public.prevent_test_flag_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_role text;
  uid uuid;
BEGIN
  BEGIN
    jwt_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  EXCEPTION WHEN OTHERS THEN
    jwt_role := NULL;
  END;
  BEGIN
    uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    uid := NULL;
  END;

  -- Migration / superuser direct-DB context: no JWT, no auth.uid() → allow.
  IF jwt_role IS NULL AND uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.is_test_account = true THEN
    IF jwt_role IS DISTINCT FROM 'service_role' AND NOT public.has_role(uid, 'admin'::app_role) THEN
      RAISE EXCEPTION 'Only service_role or admins can create test accounts';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_test_account IS DISTINCT FROM NEW.is_test_account THEN
    IF jwt_role IS DISTINCT FROM 'service_role' AND NOT public.has_role(uid, 'admin'::app_role) THEN
      RAISE EXCEPTION 'Only service_role or admins can change is_test_account';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.test_account_code IS DISTINCT FROM NEW.test_account_code THEN
    IF jwt_role IS DISTINCT FROM 'service_role' AND NOT public.has_role(uid, 'admin'::app_role) THEN
      RAISE EXCEPTION 'Only service_role or admins can change test_account_code';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_test_flag_tampering_trg ON public.profiles;
CREATE TRIGGER prevent_test_flag_tampering_trg
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_test_flag_tampering();

-- =========================================================================
-- 4. Block earnings / wallet credits driven by test-student purchases
-- =========================================================================
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

DROP TRIGGER IF EXISTS block_earning_for_test_student_trg ON public.teacher_earning_records;
CREATE TRIGGER block_earning_for_test_student_trg
BEFORE INSERT ON public.teacher_earning_records
FOR EACH ROW EXECUTE FUNCTION public.block_earning_for_test_student();

CREATE OR REPLACE FUNCTION public.block_teacher_wallet_tx_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  student uuid;
  purchase uuid;
BEGIN
  BEGIN
    student := NULLIF(NEW.metadata->>'student_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN student := NULL;
  END;

  IF student IS NOT NULL AND public.is_test_student(student) THEN
    RETURN NULL;
  END IF;

  BEGIN
    purchase := NULLIF(NEW.metadata->>'purchase_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN purchase := NULL;
  END;

  IF purchase IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.student_group_purchases sgp
      JOIN public.profiles p ON p.id = sgp.student_id
      WHERE sgp.id = purchase AND p.is_test_account = true
    ) THEN
      RETURN NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_teacher_wallet_tx_for_test_student_trg ON public.teacher_wallet_transactions;
CREATE TRIGGER block_teacher_wallet_tx_for_test_student_trg
BEFORE INSERT ON public.teacher_wallet_transactions
FOR EACH ROW EXECUTE FUNCTION public.block_teacher_wallet_tx_for_test_student();

-- =========================================================================
-- 5. Hide test students from teacher-facing RLS policies
-- =========================================================================
DROP POLICY IF EXISTS "Teachers can view purchases for their groups" ON public.student_group_purchases;
CREATE POLICY "Teachers can view purchases for their groups"
ON public.student_group_purchases FOR SELECT
USING (
  NOT public.is_test_student(student_id)
  AND EXISTS (
    SELECT 1 FROM public.content_groups
    WHERE content_groups.id = student_group_purchases.group_id
      AND (content_groups.teacher_id = auth.uid() OR content_groups.created_by = auth.uid())
  )
);

DROP POLICY IF EXISTS "Teachers view attempts on their exams" ON public.exam_attempts;
CREATE POLICY "Teachers view attempts on their exams"
ON public.exam_attempts FOR SELECT
USING (
  NOT public.is_test_student(student_id)
  AND EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = exam_attempts.exam_id AND e.teacher_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Teachers grade attempts on their exams" ON public.exam_attempts;
CREATE POLICY "Teachers grade attempts on their exams"
ON public.exam_attempts FOR UPDATE
USING (
  NOT public.is_test_student(student_id)
  AND EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = exam_attempts.exam_id AND e.teacher_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Teachers can view student video progress" ON public.video_progress;
CREATE POLICY "Teachers can view student video progress"
ON public.video_progress FOR SELECT
USING (
  NOT public.is_test_student(user_id)
  AND EXISTS (
    SELECT 1 FROM public.student_teacher_choices
    WHERE student_teacher_choices.student_id = video_progress.user_id
      AND student_teacher_choices.teacher_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Teachers can read activity of their students" ON public.student_activity_logs;
CREATE POLICY "Teachers can read activity of their students"
ON public.student_activity_logs FOR SELECT
TO authenticated
USING (
  NOT public.is_test_student(student_id)
  AND EXISTS (
    SELECT 1
    FROM public.student_group_purchases sgp
    JOIN public.content_groups cg ON cg.id = sgp.group_id
    WHERE sgp.student_id = student_activity_logs.student_id
      AND COALESCE(cg.teacher_id, cg.created_by) = auth.uid()
  )
);

DROP POLICY IF EXISTS "Teachers can view their messages" ON public.teacher_messages;
CREATE POLICY "Teachers can view their messages"
ON public.teacher_messages FOR SELECT
USING (
  auth.uid() = teacher_id AND NOT public.is_test_student(student_id)
);

DROP POLICY IF EXISTS "Teachers can view choices for them" ON public.student_teacher_choices;
CREATE POLICY "Teachers can view choices for them"
ON public.student_teacher_choices FOR SELECT
USING (
  auth.uid() = teacher_id AND NOT public.is_test_student(student_id)
);

-- =========================================================================
-- 6. Admin-visible test students helper view
-- =========================================================================
DROP VIEW IF EXISTS public.developer_test_students;
CREATE VIEW public.developer_test_students
WITH (security_invoker = on) AS
SELECT
  p.id,
  p.test_account_code,
  p.full_name,
  p.stage,
  p.grade,
  p.section,
  p.education_type,
  p.student_code,
  p.created_at
FROM public.profiles p
WHERE p.is_test_account = true;

GRANT SELECT ON public.developer_test_students TO authenticated;

-- =========================================================================
-- 7. Seed the 18 developer test student accounts
-- =========================================================================
DO $seed$
DECLARE
  acc RECORD;
  new_uid uuid;
  hashed text;
BEGIN
  FOR acc IN
    SELECT * FROM (VALUES
      ('AZH-PREP-1', 'preparatory', 'first',  NULL::text,   'أزهر', 'طالب تجريبي — أولى إعدادي أزهر'),
      ('AZH-PREP-2', 'preparatory', 'second', NULL,         'أزهر', 'طالب تجريبي — ثانية إعدادي أزهر'),
      ('AZH-PREP-3', 'preparatory', 'third',  NULL,         'أزهر', 'طالب تجريبي — ثالثة إعدادي أزهر'),
      ('AZH-SEC1-SCI', 'secondary', 'first',  'علمي', 'أزهر', 'طالب تجريبي — أولى ثانوي أزهر علمي'),
      ('AZH-SEC1-LIT', 'secondary', 'first',  'أدبي', 'أزهر', 'طالب تجريبي — أولى ثانوي أزهر أدبي'),
      ('AZH-SEC2-SCI', 'secondary', 'second', 'علمي', 'أزهر', 'طالب تجريبي — ثانية ثانوي أزهر علمي'),
      ('AZH-SEC2-LIT', 'secondary', 'second', 'أدبي', 'أزهر', 'طالب تجريبي — ثانية ثانوي أزهر أدبي'),
      ('AZH-SEC3-SCI', 'secondary', 'third',  'علمي', 'أزهر', 'طالب تجريبي — ثالثة ثانوي أزهر علمي'),
      ('AZH-SEC3-LIT', 'secondary', 'third',  'أدبي', 'أزهر', 'طالب تجريبي — ثالثة ثانوي أزهر أدبي'),
      ('GEN-PREP-1', 'preparatory', 'first',  NULL,   'عام', 'طالب تجريبي — أولى إعدادي عام'),
      ('GEN-PREP-2', 'preparatory', 'second', NULL,   'عام', 'طالب تجريبي — ثانية إعدادي عام'),
      ('GEN-PREP-3', 'preparatory', 'third',  NULL,   'عام', 'طالب تجريبي — ثالثة إعدادي عام'),
      ('GEN-SEC1',         'secondary', 'first',  NULL,          'عام', 'طالب تجريبي — أولى ثانوي عام'),
      ('GEN-SEC2-SCI',     'secondary', 'second', 'علمي',        'عام', 'طالب تجريبي — ثانية ثانوي عام علمي'),
      ('GEN-SEC2-LIT',     'secondary', 'second', 'أدبي',        'عام', 'طالب تجريبي — ثانية ثانوي عام أدبي'),
      ('GEN-SEC3-SCIENCE', 'secondary', 'third',  'علمي علوم',   'عام', 'طالب تجريبي — ثالثة ثانوي عام علمي علوم'),
      ('GEN-SEC3-MATH',    'secondary', 'third',  'علمي رياضة',  'عام', 'طالب تجريبي — ثالثة ثانوي عام علمي رياضة'),
      ('GEN-SEC3-LIT',     'secondary', 'third',  'أدبي',        'عام', 'طالب تجريبي — ثالثة ثانوي عام أدبي')
    ) AS t(code, stage, grade, section, edu, full_name)
  LOOP
    IF EXISTS (SELECT 1 FROM public.profiles WHERE test_account_code = acc.code) THEN
      CONTINUE;
    END IF;

    new_uid := gen_random_uuid();
    hashed := crypt(encode(gen_random_bytes(32), 'hex'), gen_salt('bf'));

    INSERT INTO auth.users (
      instance_id, id, aud, role,
      email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_uid,
      'authenticated',
      'authenticated',
      lower(acc.code) || '@test.modrek.local',
      hashed,
      now(),
      jsonb_build_object('provider','email','providers',ARRAY['email']),
      jsonb_build_object('full_name', acc.full_name, 'is_test_account', true, 'test_account_code', acc.code),
      now(), now(), '', '', '', ''
    );

    INSERT INTO public.profiles (id, full_name, email, role, stage, grade, section, education_type, is_test_account, test_account_code)
    VALUES (
      new_uid, acc.full_name, lower(acc.code) || '@test.modrek.local',
      'student', acc.stage, acc.grade, acc.section, acc.edu, true, acc.code
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      stage = EXCLUDED.stage,
      grade = EXCLUDED.grade,
      section = EXCLUDED.section,
      education_type = EXCLUDED.education_type,
      is_test_account = true,
      test_account_code = EXCLUDED.test_account_code;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (new_uid, 'student'::app_role)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.wallets (user_id, balance)
    VALUES (new_uid, 10000)
    ON CONFLICT (user_id) DO UPDATE SET balance = 10000;
  END LOOP;
END
$seed$;

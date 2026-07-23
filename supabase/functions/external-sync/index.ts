// Runtime sync from this Lovable Cloud project to an external Supabase project.
// Uses DIRECT Postgres connections to mirror:
//   - auth.users INCLUDING encrypted_password (so logins keep working)
//   - public.* tables (data)
//   - RLS policies for critical public tables (so students can read groups)
//
// Required secrets:
//   SUPABASE_DB_URL                       (this project's pg)
//   EXTERNAL_SUPABASE_DB_URL              (external project's pg)
//   EXTERNAL_SUPABASE_URL                 (for reporting)
//   EXTERNAL_SUPABASE_SERVICE_ROLE_KEY    (kept for compatibility, not required here)

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

// Some DB URLs contain unencoded special chars (e.g. '#' in password).
// Percent-encode the password section so the URI parser succeeds.
function sanitizeDbUrl(raw: string): string {
  if (!raw) return raw;
  const schemeIdx = raw.indexOf("://");
  if (schemeIdx === -1) return raw;
  const afterScheme = raw.slice(schemeIdx + 3);
  const atIdx = afterScheme.lastIndexOf("@");
  if (atIdx === -1) return raw;
  const userInfo = afterScheme.slice(0, atIdx);
  const rest = afterScheme.slice(atIdx);
  const colonIdx = userInfo.indexOf(":");
  if (colonIdx === -1) return raw;
  const user = userInfo.slice(0, colonIdx);
  const pwd = userInfo.slice(colonIdx + 1);
  // Encode only if not already encoded
  const encoded = /%[0-9A-Fa-f]{2}/.test(pwd) ? pwd : encodeURIComponent(pwd);
  return `${raw.slice(0, schemeIdx + 3)}${user}:${encoded}${rest}`;
}

const RAW_SRC_DB = Deno.env.get("SUPABASE_DB_URL") ?? "";
const RAW_DST_DB = Deno.env.get("EXTERNAL_SUPABASE_DB_URL") ?? "";
const SRC_DB = sanitizeDbUrl(RAW_SRC_DB);
const DST_DB = sanitizeDbUrl(RAW_DST_DB);
const EXT_URL = Deno.env.get("EXTERNAL_SUPABASE_URL") ?? "";
const EXT_SERVICE_ROLE = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ?? "";
const REQUIRED_EXTERNAL_PROJECT_REF = "qteuqfntsocsdbjmdvmr";

async function connectWithFallback(primaryUrl: string, fallbackUrl: string) {
  const primary = new Client(primaryUrl);
  try {
    await primary.connect();
    return { client: primary, strategy: "raw" };
  } catch (primaryError) {
    try {
      await primary.end();
    } catch (_e) {
      /* noop */
    }

    if (!fallbackUrl || fallbackUrl === primaryUrl) {
      throw primaryError;
    }

    const fallback = new Client(fallbackUrl);
    await fallback.connect();
    return { client: fallback, strategy: "sanitized" };
  }
}

// Tables to mirror, in FK-safe order
const TABLES = [
  "platform_settings",
  "ai_function_settings",
  "profiles",
  "user_roles",
  "wallets",
  "wallet_adjustments",
  "deposit_requests",
  "teacher_profiles",
  "teacher_assignments",
  "teacher_wallets",
  "subjects",
  "system_terms",
  "content_groups",
  "content",
  "student_group_purchases",
  "student_teacher_choices",
  "subscriptions",
  "subscription_requests",
  "teacher_requests",
  "teacher_schedules",
  "teacher_messages",
  "exams",
  "exam_attempts",
  "live_sessions",
  "live_session_recordings",
  "notifications",
];

// Critical RLS policies to (re)create on the external project. Keep this in
// lock-step with the term workspace model: groups from a previous term must
// not be readable on the live domain after system_terms moves to the next term.
const RLS_SQL = `
-- shared term helpers used by content_groups policies
CREATE OR REPLACE FUNCTION public.term_grade_key(_grade text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN lower(trim(coalesce(_grade, ''))) IN ('1', 'first') THEN '1'
    WHEN lower(trim(coalesce(_grade, ''))) IN ('2', 'second') THEN '2'
    WHEN lower(trim(coalesce(_grade, ''))) IN ('3', 'third') THEN '3'
    WHEN coalesce(_grade, '') LIKE '%الأول%' OR coalesce(_grade, '') LIKE '%الاول%' THEN '1'
    WHEN coalesce(_grade, '') LIKE '%الثاني%' THEN '2'
    WHEN coalesce(_grade, '') LIKE '%الثالث%' THEN '3'
    ELSE lower(trim(coalesce(_grade, '')))
  END;
$$;

CREATE OR REPLACE FUNCTION public.group_matches_current_system_term(_subject_id uuid, _term text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subjects s
    JOIN public.system_terms st
      ON st.stage = s.stage
     AND st.grade = public.term_grade_key(s.grade)
    WHERE s.id = _subject_id
      AND st.current_term = _term
  );
$$;

REVOKE ALL ON FUNCTION public.group_matches_current_system_term(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.term_grade_key(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.group_matches_current_system_term(uuid, text) TO anon, authenticated, service_role;

-- content_groups: only current-term workspaces are readable/manageable
ALTER TABLE IF EXISTS public.content_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view active groups" ON public.content_groups;
DROP POLICY IF EXISTS "Teachers/Admins can manage groups" ON public.content_groups;
DROP POLICY IF EXISTS "Anyone can view active current-term groups" ON public.content_groups;
DROP POLICY IF EXISTS "Teachers can view own current-term groups" ON public.content_groups;
DROP POLICY IF EXISTS "Teachers can create own current-term groups" ON public.content_groups;
DROP POLICY IF EXISTS "Teachers can update own current-term groups" ON public.content_groups;
DROP POLICY IF EXISTS "Teachers can delete own groups" ON public.content_groups;
DROP POLICY IF EXISTS "Admins can manage all groups" ON public.content_groups;

CREATE POLICY "Admins can manage all groups" ON public.content_groups
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Anyone can view active current-term groups" ON public.content_groups
  FOR SELECT TO public
  USING (
    is_active = true
    AND public.group_matches_current_system_term(subject_id, term)
  );

CREATE POLICY "Teachers can view own current-term groups" ON public.content_groups
  FOR SELECT TO authenticated
  USING (
    (auth.uid() = created_by OR auth.uid() = teacher_id)
    AND public.group_matches_current_system_term(subject_id, term)
  );

CREATE POLICY "Teachers can create own current-term groups" ON public.content_groups
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND (teacher_id IS NULL OR auth.uid() = teacher_id)
    AND public.group_matches_current_system_term(subject_id, term)
  );

CREATE POLICY "Teachers can update own current-term groups" ON public.content_groups
  FOR UPDATE TO authenticated
  USING (
    (auth.uid() = created_by OR auth.uid() = teacher_id)
    AND public.group_matches_current_system_term(subject_id, term)
  )
  WITH CHECK (
    (auth.uid() = created_by OR auth.uid() = teacher_id)
    AND public.group_matches_current_system_term(subject_id, term)
  );

CREATE POLICY "Teachers can delete own groups" ON public.content_groups
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR auth.uid() = teacher_id);

-- subjects: public read
ALTER TABLE IF EXISTS public.subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Subjects are publicly readable" ON public.subjects;
CREATE POLICY "Subjects are publicly readable" ON public.subjects
  FOR SELECT USING (true);

-- teacher_assignments: public read (students browse teachers)
ALTER TABLE IF EXISTS public.teacher_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Assignments are publicly readable" ON public.teacher_assignments;
CREATE POLICY "Assignments are publicly readable" ON public.teacher_assignments
  FOR SELECT USING (true);

-- profiles: public read of teacher cards
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Teacher profiles are publicly readable" ON public.profiles;
CREATE POLICY "Teacher profiles are publicly readable" ON public.profiles
  FOR SELECT USING (role = 'teacher' AND NOT public.is_test_student(id));

-- content: anyone can read (subscription is enforced at the group level)
ALTER TABLE IF EXISTS public.content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Content is publicly readable" ON public.content;
CREATE POLICY "Content is publicly readable" ON public.content
  FOR SELECT USING (true);

-- platform_settings: expose the support/contact keys used by the live app
GRANT SELECT ON public.platform_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE IF EXISTS public.platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read settings" ON public.platform_settings;
CREATE POLICY "Public can read settings" ON public.platform_settings
  FOR SELECT USING (key = ANY (ARRAY[
    'platform_name'::text,
    'maintenance_mode'::text,
    'maintenance_message'::text,
    'platform_logo'::text,
    'support_phone'::text,
    'support_whatsapp'::text,
    'support_email'::text,
    'support_telegram'::text,
    'support_whatsapp_student'::text,
    'support_whatsapp_teacher'::text,
    'support_whatsapp_enabled'::text,
    'support_messenger_student'::text,
    'support_messenger_teacher'::text,
    'support_messenger_enabled'::text,
    'support_assistant_enabled'::text,
    'support_assistant_display_name'::text,
    'support_message_template'::text,
    'subscription_whatsapp'::text,
    'subscription_default_price'::text,
    'subscription_default_message'::text,
    'subscription_currency'::text,
    'payment_receive_number'::text,
    'payment_methods_config'::text,
    'deposit_tutorial_video'::text,
    'student_dashboard_ticker_enabled'::text,
    'student_dashboard_ticker_text'::text,
    'student_dashboard_ticker_items'::text,
    'teacher_commission_rate'::text,
    'withdrawal_open_day'::text,
    'withdrawal_manual_state'::text,
    'withdrawal_notice_message'::text
  ]));
DROP POLICY IF EXISTS "Admins can manage settings" ON public.platform_settings;
CREATE POLICY "Admins can manage settings" ON public.platform_settings
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR lower(coalesce(auth.jwt() ->> 'email', '')) = ANY (ARRAY['alyedaft@gmail.com'::text, 'aliana200713@gmail.com'::text])
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR lower(coalesce(auth.jwt() ->> 'email', '')) = ANY (ARRAY['alyedaft@gmail.com'::text, 'aliana200713@gmail.com'::text])
  );

-- payment-receipts: required for student deposit receipts and admin withdrawal receipts
GRANT SELECT ON storage.buckets TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT ALL ON storage.objects TO service_role;
DROP POLICY IF EXISTS "Allow read bucket metadata" ON storage.buckets;
CREATE POLICY "Allow read bucket metadata"
  ON storage.buckets FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read receipts" ON storage.objects;
DROP POLICY IF EXISTS "Students upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Admins view receipts" ON storage.objects;
CREATE POLICY "Users can upload own receipts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'payment-receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "Users can read own receipts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payment-receipts'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin'::public.app_role))
  );
CREATE POLICY "Admins view receipts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'payment-receipts' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- student-library bucket has been retired. Personal library PDFs live on
-- Bunny Storage under library/{uid}/... and are accessed via the
-- bunny-storage edge function. No Supabase Storage policies are needed here.



DROP POLICY IF EXISTS "Students can insert own library content" ON public.content;
CREATE POLICY "Students can insert own library content"
  ON public.content FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = uploaded_by
    AND type = 'student_library'
    AND coalesce(is_paid, false) = false
    AND subject_id IS NULL
    AND group_id IS NULL
  );
DROP POLICY IF EXISTS "Students can update own library content" ON public.content;
CREATE POLICY "Students can update own library content"
  ON public.content FOR UPDATE
  TO authenticated
  USING (auth.uid() = uploaded_by AND type = 'student_library')
  WITH CHECK (auth.uid() = uploaded_by AND type = 'student_library');
DROP POLICY IF EXISTS "Students can delete own library content" ON public.content;
CREATE POLICY "Students can delete own library content"
  ON public.content FOR DELETE
  TO authenticated
  USING (auth.uid() = uploaded_by AND type = 'student_library');

-- Developer test-student isolation: keep fake testing accounts completely invisible to teachers.
ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_account_code text;

UPDATE public.profiles
SET is_test_account = true,
    test_account_code = COALESCE(NULLIF(test_account_code, ''), 'LEGACY-' || left(id::text, 8)),
    updated_at = now()
WHERE role = 'student'
  AND COALESCE(is_test_account, false) = false
  AND NULLIF(test_account_code, '') IS NULL
  AND full_name ILIKE '%تجريبي%';

CREATE TABLE IF NOT EXISTS public.test_student_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  source_table text NOT NULL,
  source_id uuid,
  teacher_id uuid,
  student_id uuid,
  severity text NOT NULL DEFAULT 'critical',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  fingerprint text NOT NULL UNIQUE,
  occurrence_count integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid
);

GRANT SELECT, UPDATE ON public.test_student_security_events TO authenticated;
GRANT ALL ON public.test_student_security_events TO service_role;
ALTER TABLE public.test_student_security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Developer admins can view test student security events" ON public.test_student_security_events;
CREATE POLICY "Developer admins can view test student security events"
ON public.test_student_security_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_developer_admin(auth.uid()));

DROP POLICY IF EXISTS "Developer admins can acknowledge test student security events" ON public.test_student_security_events;
CREATE POLICY "Developer admins can acknowledge test student security events"
ON public.test_student_security_events
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_developer_admin(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_developer_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_test_student_security_events_last_seen
ON public.test_student_security_events(last_seen_at DESC);

CREATE OR REPLACE FUNCTION public.is_test_student(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT (COALESCE(is_test_account, false) = true)
            OR (NULLIF(test_account_code, '') IS NOT NULL)
            OR (COALESCE(role, '') = 'student' AND COALESCE(full_name, '') ILIKE '%تجريبي%')
       FROM public.profiles
      WHERE id = _user_id),
    false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_test_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_test_student(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.log_test_student_teacher_leak(
  _event_type text,
  _source_table text,
  _teacher_id uuid DEFAULT NULL,
  _student_id uuid DEFAULT NULL,
  _source_id uuid DEFAULT NULL,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fingerprint text;
  v_inserted boolean := false;
  v_admin uuid;
BEGIN
  v_fingerprint := md5(COALESCE(_event_type, '') || '|' || COALESCE(_source_table, '') || '|' || COALESCE(_teacher_id::text, '') || '|' || COALESCE(_student_id::text, '') || '|' || COALESCE(_source_id::text, ''));

  INSERT INTO public.test_student_security_events
    (event_type, source_table, source_id, teacher_id, student_id, details, fingerprint)
  VALUES
    (_event_type, _source_table, _source_id, _teacher_id, _student_id, COALESCE(_details, '{}'::jsonb), v_fingerprint)
  ON CONFLICT (fingerprint) DO UPDATE
  SET occurrence_count = public.test_student_security_events.occurrence_count + 1,
      last_seen_at = now(),
      details = public.test_student_security_events.details || EXCLUDED.details
  RETURNING (xmax = 0) INTO v_inserted;

  IF COALESCE(v_inserted, false) THEN
    FOR v_admin IN
      SELECT DISTINCT p.id
      FROM public.profiles p
      WHERE p.email = 'alyedaft@gmail.com'
         OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin'::public.app_role)
    LOOP
      INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent)
      VALUES (v_admin, 'تنبيه أمني: محاولة ظهور طالب تجريبي للمعلم', 'تم رصد ومنع تسريب بيانات طالب تجريبي ضمن نطاق معلم.', 'security_alert', '/admin/test-students', false, true);
    END LOOP;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_test_student_teacher_leak(text, text, uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_test_student_teacher_leak(text, text, uuid, uuid, uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.block_teacher_choice_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Deprecated: test students must persist their own teacher choices.
  -- Teacher-side isolation is enforced by SELECT policies and side-effect blockers.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_teacher_choice_test_student_trg ON public.student_teacher_choices;

CREATE OR REPLACE FUNCTION public.block_group_purchase_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Deprecated: test students must persist their own course purchases.
  -- Teacher earnings/wallet side effects are blocked separately.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_group_purchase_test_student_trg ON public.student_group_purchases;

CREATE OR REPLACE FUNCTION public.block_teacher_message_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.student_id IS NOT NULL AND public.is_test_student(NEW.student_id) THEN
    PERFORM public.log_test_student_teacher_leak('blocked_teacher_message', 'teacher_messages', NEW.teacher_id, NEW.student_id, COALESCE(NEW.id, gen_random_uuid()), jsonb_build_object('is_from_teacher', NEW.is_from_teacher));
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Students can send messages" ON public.teacher_messages;
CREATE POLICY "Students can send messages"
ON public.teacher_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = student_id
  AND is_from_teacher = false
  AND NOT public.is_test_student(student_id)
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

DROP TRIGGER IF EXISTS block_teacher_message_test_student_trg ON public.teacher_messages;
CREATE TRIGGER block_teacher_message_test_student_trg
BEFORE INSERT OR UPDATE ON public.teacher_messages
FOR EACH ROW
EXECUTE FUNCTION public.block_teacher_message_for_test_student();

CREATE OR REPLACE FUNCTION public.teacher_wallet_tx_is_for_test_student(_metadata jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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

REVOKE EXECUTE ON FUNCTION public.teacher_wallet_tx_is_for_test_student(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_wallet_tx_is_for_test_student(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.block_earning_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.student_id IS NOT NULL AND public.is_test_student(NEW.student_id) THEN
    PERFORM public.log_test_student_teacher_leak('blocked_teacher_earning', 'teacher_earning_records', NEW.teacher_id, NEW.student_id, COALESCE(NEW.id, gen_random_uuid()), jsonb_build_object('purchase_id', NEW.purchase_id, 'group_id', NEW.group_id, 'net_amount', NEW.net_amount));
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_earning_for_test_student_trg ON public.teacher_earning_records;
CREATE TRIGGER block_earning_for_test_student_trg
BEFORE INSERT OR UPDATE ON public.teacher_earning_records
FOR EACH ROW
EXECUTE FUNCTION public.block_earning_for_test_student();

CREATE OR REPLACE FUNCTION public.block_teacher_wallet_tx_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.teacher_wallet_tx_is_for_test_student(NEW.metadata) THEN
    PERFORM public.log_test_student_teacher_leak('blocked_teacher_wallet_transaction', 'teacher_wallet_transactions', NEW.teacher_id, NULL, COALESCE(NEW.id, gen_random_uuid()), jsonb_build_object('amount', NEW.amount, 'transaction_type', NEW.transaction_type, 'metadata', NEW.metadata));
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_teacher_wallet_tx_for_test_student_trg ON public.teacher_wallet_transactions;
CREATE TRIGGER block_teacher_wallet_tx_for_test_student_trg
BEFORE INSERT OR UPDATE ON public.teacher_wallet_transactions
FOR EACH ROW
EXECUTE FUNCTION public.block_teacher_wallet_tx_for_test_student();

DROP POLICY IF EXISTS "Teachers can view choices for them" ON public.student_teacher_choices;
CREATE POLICY "Teachers can view choices for them"
ON public.student_teacher_choices
FOR SELECT
USING (auth.uid() = teacher_id AND NOT public.is_test_student(student_id));

DROP POLICY IF EXISTS "Students can insert their own choice" ON public.student_teacher_choices;
CREATE POLICY "Students can insert their own choice"
ON public.student_teacher_choices
FOR INSERT
WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Students can update their own choice" ON public.student_teacher_choices;
CREATE POLICY "Students can update their own choice"
ON public.student_teacher_choices
FOR UPDATE
USING (auth.uid() = student_id)
WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Students can view their own choices" ON public.student_teacher_choices;
CREATE POLICY "Students can view their own choices"
ON public.student_teacher_choices
FOR SELECT
TO authenticated
USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Teachers can view purchases for their groups" ON public.student_group_purchases;
CREATE POLICY "Teachers can view purchases for their groups"
ON public.student_group_purchases
FOR SELECT
USING (
  NOT public.is_test_student(student_id)
  AND EXISTS (
    SELECT 1
    FROM public.content_groups
    WHERE content_groups.id = student_group_purchases.group_id
      AND (content_groups.teacher_id = auth.uid() OR content_groups.created_by = auth.uid())
  )
);

DROP POLICY IF EXISTS "Students see own purchases" ON public.student_group_purchases;
CREATE POLICY "Students see own purchases"
ON public.student_group_purchases
FOR SELECT
USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Students can insert own purchases" ON public.student_group_purchases;
CREATE POLICY "Students can insert own purchases"
ON public.student_group_purchases
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = student_id);

-- Purchase RPC: test-student purchases must persist like normal student purchases.
-- Teacher-facing side effects remain blocked by earning/wallet/message policies and triggers.
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

GRANT EXECUTE ON FUNCTION public.purchase_group_with_wallet(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_group_with_wallet(uuid) TO service_role;

DROP POLICY IF EXISTS "Teachers can view their messages" ON public.teacher_messages;
CREATE POLICY "Teachers can view their messages"
ON public.teacher_messages
FOR SELECT
USING (auth.uid() = teacher_id AND NOT public.is_test_student(student_id));

DROP POLICY IF EXISTS "Students can view their messages" ON public.teacher_messages;
CREATE POLICY "Students can view their messages"
ON public.teacher_messages
FOR SELECT
TO authenticated
USING (auth.uid() = student_id AND NOT public.is_test_student(student_id));

DROP POLICY IF EXISTS "Users can mark messages as read" ON public.teacher_messages;
CREATE POLICY "Users can mark messages as read"
ON public.teacher_messages
FOR UPDATE
TO authenticated
USING (((auth.uid() = student_id) OR (auth.uid() = teacher_id)) AND NOT public.is_test_student(student_id))
WITH CHECK (((auth.uid() = student_id) OR (auth.uid() = teacher_id)) AND NOT public.is_test_student(student_id));

DROP POLICY IF EXISTS "Teachers view own earnings" ON public.teacher_earning_records;
CREATE POLICY "Teachers view own earnings"
ON public.teacher_earning_records
FOR SELECT
USING (auth.uid() = teacher_id AND NOT public.is_test_student(student_id));

DROP POLICY IF EXISTS "Teachers view own transactions" ON public.teacher_wallet_transactions;
CREATE POLICY "Teachers view own transactions"
ON public.teacher_wallet_transactions
FOR SELECT
USING (auth.uid() = teacher_id AND NOT public.teacher_wallet_tx_is_for_test_student(metadata));

DROP POLICY IF EXISTS "Teachers can view linked non-test student profiles" ON public.profiles;
CREATE POLICY "Teachers can view linked non-test student profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  role = 'student'
  AND NOT public.is_test_student(id)
  AND (
    EXISTS (SELECT 1 FROM public.student_teacher_choices stc WHERE stc.student_id = profiles.id AND stc.teacher_id = auth.uid() AND NOT public.is_test_student(stc.student_id))
    OR EXISTS (SELECT 1 FROM public.student_group_purchases sgp JOIN public.content_groups cg ON cg.id = sgp.group_id WHERE sgp.student_id = profiles.id AND COALESCE(cg.teacher_id, cg.created_by) = auth.uid() AND NOT public.is_test_student(sgp.student_id))
    OR EXISTS (SELECT 1 FROM public.teacher_messages tm WHERE tm.student_id = profiles.id AND tm.teacher_id = auth.uid() AND NOT public.is_test_student(tm.student_id))
  )
);

CREATE OR REPLACE FUNCTION public.block_teacher_notification_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_teacher boolean := false;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = NEW.user_id AND role = 'teacher'::public.app_role
  ) INTO v_is_teacher;

  IF v_is_teacher AND NEW.created_by IS NOT NULL AND public.is_test_student(NEW.created_by) THEN
    PERFORM public.log_test_student_teacher_leak('blocked_teacher_notification', 'notifications', NEW.user_id, NEW.created_by, COALESCE(NEW.id, gen_random_uuid()), jsonb_build_object('notification_type', NEW.notification_type, 'title', NEW.title));
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_teacher_notification_test_student_trg ON public.notifications;
CREATE TRIGGER block_teacher_notification_test_student_trg
BEFORE INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.block_teacher_notification_for_test_student();

WITH bad AS (
  SELECT teacher_id,
         COALESCE(SUM(net_amount), 0) AS total_net,
         COALESCE(SUM(net_amount) FILTER (WHERE COALESCE(is_frozen, false) = true AND COALESCE(is_archived, false) = false), 0) AS frozen_net,
         COALESCE(SUM(net_amount) FILTER (WHERE COALESCE(is_archived, false) = true OR COALESCE(is_frozen, false) = false), 0) AS available_net
  FROM public.teacher_earning_records
  WHERE public.is_test_student(student_id)
  GROUP BY teacher_id
)
UPDATE public.teacher_wallets tw
SET total_earned = GREATEST(0, COALESCE(tw.total_earned, 0) - bad.total_net),
    frozen_balance = GREATEST(0, COALESCE(tw.frozen_balance, 0) - bad.frozen_net),
    balance = GREATEST(0, COALESCE(tw.balance, 0) - bad.available_net),
    updated_at = now()
FROM bad
WHERE tw.teacher_id = bad.teacher_id;

WITH affected AS (
  SELECT DISTINCT teacher_id, period_label
  FROM public.teacher_earning_records
  WHERE public.is_test_student(student_id)
), recalculated AS (
  SELECT a.teacher_id,
         a.period_label,
         COALESCE(SUM(ter.net_amount), 0) AS total_earned,
         COUNT(DISTINCT ter.student_id)::int AS total_subscribers,
         COUNT(DISTINCT ter.group_id)::int AS total_groups
  FROM affected a
  LEFT JOIN public.teacher_earning_records ter
    ON ter.teacher_id = a.teacher_id
   AND ter.period_label = a.period_label
   AND NOT public.is_test_student(ter.student_id)
  GROUP BY a.teacher_id, a.period_label
)
UPDATE public.teacher_monthly_archives tma
SET total_earned = recalculated.total_earned,
    total_subscribers = recalculated.total_subscribers,
    total_groups = recalculated.total_groups,
    archived_at = now()
FROM recalculated
WHERE tma.teacher_id = recalculated.teacher_id
  AND tma.period_label = recalculated.period_label;

DELETE FROM public.teacher_wallet_transactions twt WHERE public.teacher_wallet_tx_is_for_test_student(twt.metadata);
DELETE FROM public.teacher_earning_records ter WHERE public.is_test_student(ter.student_id);
DELETE FROM public.teacher_messages tm WHERE public.is_test_student(tm.student_id);

CREATE OR REPLACE FUNCTION public.audit_test_student_visibility()
RETURNS TABLE(source text, row_count bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT 'teacher_messages'::text, COUNT(*)::bigint FROM public.teacher_messages tm WHERE public.is_test_student(tm.student_id)
  UNION ALL
  SELECT 'teacher_earning_records', COUNT(*)::bigint FROM public.teacher_earning_records ter WHERE public.is_test_student(ter.student_id)
  UNION ALL
  SELECT 'teacher_wallet_transactions', COUNT(*)::bigint FROM public.teacher_wallet_transactions twt WHERE public.teacher_wallet_tx_is_for_test_student(twt.metadata)
  UNION ALL
  SELECT 'unflagged_named_test_profiles', COUNT(*)::bigint
    FROM public.profiles p
   WHERE COALESCE(p.role, '') = 'student'
     AND COALESCE(p.full_name, '') ILIKE '%تجريبي%'
     AND NOT public.is_test_student(p.id);
$$;

REVOKE ALL ON FUNCTION public.audit_test_student_visibility() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_test_student_visibility() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.teacher_test_student_query_regression()
RETURNS TABLE(scenario text, leaked_count bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT 'message_threads'::text, COUNT(*)::bigint
  FROM public.teacher_messages tm
  JOIN public.profiles p ON p.id = tm.student_id
  WHERE public.is_test_student(tm.student_id)
    AND tm.teacher_id IS NOT NULL
  UNION ALL
  SELECT 'teacher_earnings', COUNT(*)::bigint
  FROM public.teacher_earning_records ter
  JOIN public.profiles p ON p.id = ter.student_id
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

REVOKE ALL ON FUNCTION public.teacher_test_student_query_regression() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_test_student_query_regression() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.report_test_student_query_result(
  _source_table text,
  _student_ids uuid[],
  _context jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_student uuid;
  v_allowed_sources text[] := ARRAY[
    'student_teacher_choices',
    'student_group_purchases',
    'teacher_messages',
    'teacher_earning_records',
    'teacher_wallet_transactions',
    'profiles',
    'video_progress',
    'exam_attempts',
    'student_activity_logs'
  ];
BEGIN
  IF v_caller IS NULL OR _student_ids IS NULL OR array_length(_student_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF NOT (
    public.has_role(v_caller, 'teacher'::public.app_role)
    OR public.has_role(v_caller, 'admin'::public.app_role)
    OR public.is_developer_admin(v_caller)
  ) THEN
    RETURN;
  END IF;

  IF _source_table IS NULL OR NOT (_source_table = ANY(v_allowed_sources)) THEN
    _source_table := 'unknown_teacher_query';
  END IF;

  FOR v_student IN SELECT DISTINCT unnest(_student_ids)
  LOOP
    IF v_student IS NOT NULL AND public.is_test_student(v_student) THEN
      PERFORM public.log_test_student_teacher_leak(
        'detected_teacher_query_result_test_student',
        _source_table,
        v_caller,
        v_student,
        NULL,
        COALESCE(_context, '{}'::jsonb)
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.report_test_student_query_result(text, uuid[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_test_student_query_result(text, uuid[], jsonb) TO authenticated, service_role;

DO $optional_tables$
BEGIN
  IF to_regclass('public.exam_answers') IS NOT NULL THEN
    EXECUTE $sql$
      DROP POLICY IF EXISTS "Teachers view answers on their exams" ON public.exam_answers;
      CREATE POLICY "Teachers view answers on their exams"
      ON public.exam_answers
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.exam_attempts a
          JOIN public.exams e ON e.id = a.exam_id
          WHERE a.id = exam_answers.attempt_id
            AND e.teacher_id = auth.uid()
            AND NOT public.is_test_student(a.student_id)
        )
      );

      DROP POLICY IF EXISTS "Teachers grade answers on their exams" ON public.exam_answers;
      CREATE POLICY "Teachers grade answers on their exams"
      ON public.exam_answers
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.exam_attempts a
          JOIN public.exams e ON e.id = a.exam_id
          WHERE a.id = exam_answers.attempt_id
            AND e.teacher_id = auth.uid()
            AND NOT public.is_test_student(a.student_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.exam_attempts a
          JOIN public.exams e ON e.id = a.exam_id
          WHERE a.id = exam_answers.attempt_id
            AND e.teacher_id = auth.uid()
            AND NOT public.is_test_student(a.student_id)
        )
      );
    $sql$;
  END IF;

  IF to_regclass('public.live_session_messages') IS NOT NULL THEN
    EXECUTE $sql$
      DROP POLICY IF EXISTS "Students can send session messages" ON public.live_session_messages;
      CREATE POLICY "Students can send session messages"
      ON public.live_session_messages
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id AND is_teacher = false AND NOT public.is_test_student(user_id));

      DROP POLICY IF EXISTS "Students can view session messages" ON public.live_session_messages;
      CREATE POLICY "Students can view session messages"
      ON public.live_session_messages
      FOR SELECT
      TO authenticated
      USING (NOT public.is_test_student(user_id));

      DROP POLICY IF EXISTS "Teachers manage own session messages" ON public.live_session_messages;
      CREATE POLICY "Teachers manage own session messages"
      ON public.live_session_messages
      FOR ALL
      TO authenticated
      USING (NOT public.is_test_student(user_id))
      WITH CHECK (NOT public.is_test_student(user_id));

      CREATE OR REPLACE FUNCTION public.block_live_session_message_for_test_student()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path TO 'public'
      AS $fn$
      DECLARE
        v_teacher_id uuid;
      BEGIN
        IF NEW.user_id IS NOT NULL AND public.is_test_student(NEW.user_id) THEN
          SELECT teacher_id INTO v_teacher_id FROM public.live_sessions WHERE id = NEW.session_id;
          PERFORM public.log_test_student_teacher_leak('blocked_live_session_message', 'live_session_messages', v_teacher_id, NEW.user_id, COALESCE(NEW.id, gen_random_uuid()), jsonb_build_object('session_id', NEW.session_id, 'is_teacher', NEW.is_teacher));
          RETURN NULL;
        END IF;
        RETURN NEW;
      END;
      $fn$;

      DROP TRIGGER IF EXISTS block_live_session_message_test_student_trg ON public.live_session_messages;
      CREATE TRIGGER block_live_session_message_test_student_trg
      BEFORE INSERT OR UPDATE ON public.live_session_messages
      FOR EACH ROW
      EXECUTE FUNCTION public.block_live_session_message_for_test_student();

      DELETE FROM public.live_session_messages lsm WHERE public.is_test_student(lsm.user_id);
    $sql$;
  END IF;

  IF to_regclass('public.live_session_actions') IS NOT NULL THEN
    EXECUTE $sql$
      DROP POLICY IF EXISTS "Teachers manage actions for own sessions" ON public.live_session_actions;
      CREATE POLICY "Teachers manage actions for own sessions"
      ON public.live_session_actions
      FOR ALL
      TO authenticated
      USING (NOT public.is_test_student(student_id))
      WITH CHECK (NOT public.is_test_student(student_id));

      CREATE OR REPLACE FUNCTION public.block_live_session_action_for_test_student()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path TO 'public'
      AS $fn$
      DECLARE
        v_teacher_id uuid;
      BEGIN
        IF NEW.student_id IS NOT NULL AND public.is_test_student(NEW.student_id) THEN
          SELECT teacher_id INTO v_teacher_id FROM public.live_sessions WHERE id = NEW.session_id;
          PERFORM public.log_test_student_teacher_leak('blocked_live_session_action', 'live_session_actions', v_teacher_id, NEW.student_id, COALESCE(NEW.id, gen_random_uuid()), jsonb_build_object('session_id', NEW.session_id, 'action', NEW.action));
          RETURN NULL;
        END IF;
        RETURN NEW;
      END;
      $fn$;

      DROP TRIGGER IF EXISTS block_live_session_action_test_student_trg ON public.live_session_actions;
      CREATE TRIGGER block_live_session_action_test_student_trg
      BEFORE INSERT OR UPDATE ON public.live_session_actions
      FOR EACH ROW
      EXECUTE FUNCTION public.block_live_session_action_for_test_student();

      DELETE FROM public.live_session_actions lsa WHERE public.is_test_student(lsa.student_id);
    $sql$;
  END IF;
END
$optional_tables$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exam_attempts' AND column_name = 'percentage'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.get_exam_leaderboard(_exam_id uuid, _limit integer DEFAULT 50)
      RETURNS TABLE(rank bigint, student_id uuid, student_name text, percentage numeric, total_score numeric, time_spent_seconds integer, submitted_at timestamp with time zone)
      LANGUAGE sql
      STABLE SECURITY DEFINER
      SET search_path TO 'public'
      AS $body$
        SELECT
          ROW_NUMBER() OVER (ORDER BY a.percentage DESC, a.time_spent_seconds ASC) AS rank,
          a.student_id,
          COALESCE(p.full_name, 'طالب') AS student_name,
          a.percentage,
          a.total_score,
          a.time_spent_seconds,
          a.submitted_at
        FROM public.exam_attempts a
        LEFT JOIN public.profiles p ON p.id = a.student_id
        WHERE a.exam_id = _exam_id
          AND a.status IN ('submitted','graded')
          AND NOT public.is_test_student(a.student_id)
        ORDER BY rank
        LIMIT _limit;
      $body$;
    $fn$;
    REVOKE EXECUTE ON FUNCTION public.get_exam_leaderboard(uuid, integer) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.get_exam_leaderboard(uuid, integer) TO authenticated, service_role;
  END IF;
END;
$$;
`;

async function mirrorTable(src: Client, dst: Client, table: string) {
  // Get column list (excluding generated)
  const colsRes = await dst.queryObject<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1
       AND is_generated <> 'ALWAYS'
     ORDER BY ordinal_position`,
    [table],
  );
  if (colsRes.rows.length === 0) {
    return { table, error: "destination table not found" };
  }
  const cols = colsRes.rows.map((r) => `"${r.column_name}"`);

  // Find pk for ON CONFLICT
  const pkRes = await dst.queryObject<{ a: string }>(
    `SELECT a.attname AS a FROM pg_index i
     JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)
     WHERE i.indrelid = ('public.'||$1)::regclass AND i.indisprimary`,
    [table],
  );
  const conflictTarget = table === "platform_settings" ? '"key"' : pkRes.rows.map((r) => `"${r.a}"`).join(",");
  const immutableCols = new Set(table === "platform_settings" ? ['"id"', '"key"', '"created_at"'] : conflictTarget.split(",").filter(Boolean));
  const updateCols = cols.filter((c) => !immutableCols.has(c));
  const onConflict = conflictTarget
    ? `ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updateCols
        .map((c) => `${c}=EXCLUDED.${c}`)
        .join(",")}`
    : "ON CONFLICT DO NOTHING";

  // Stream source rows
  const data = await src.queryObject<Record<string, unknown>>(
    `SELECT ${cols.join(",")} FROM public."${table}"`,
  );
  let upserted = 0;
  for (const row of data.rows) {
    const values = cols.map((c) => row[c.replaceAll('"', "")]);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(",");
    try {
      await dst.queryArray(
        `INSERT INTO public."${table}" (${cols.join(",")}) VALUES (${placeholders}) ${onConflict}`,
        values,
      );
      upserted++;
    } catch (_e) {
      // skip bad row, continue
    }
  }
  return { table, total: data.rows.length, upserted };
}

async function mirrorAuthUsers(src: Client, dst: Client) {
  // Copy auth.users INCLUDING encrypted_password so logins keep working.
  const rows = await src.queryObject<any>(`
    SELECT id, instance_id, email, encrypted_password, email_confirmed_at,
           phone, phone_confirmed_at, confirmation_token, confirmation_sent_at,
           recovery_token, email_change_token_new, email_change,
           raw_app_meta_data, raw_user_meta_data, is_super_admin,
           created_at, updated_at, role, aud
    FROM auth.users
  `);
  let upserted = 0;
  const failed: any[] = [];
  for (const u of rows.rows) {
    try {
      await dst.queryArray(
        `INSERT INTO auth.users
          (id, instance_id, email, encrypted_password, email_confirmed_at,
           phone, phone_confirmed_at, confirmation_token, confirmation_sent_at,
           recovery_token, email_change_token_new, email_change,
           raw_app_meta_data, raw_user_meta_data, is_super_admin,
           created_at, updated_at, role, aud)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (id) DO UPDATE SET
           email=EXCLUDED.email,
           encrypted_password=EXCLUDED.encrypted_password,
           email_confirmed_at=EXCLUDED.email_confirmed_at,
           phone=EXCLUDED.phone,
           phone_confirmed_at=EXCLUDED.phone_confirmed_at,
           raw_app_meta_data=EXCLUDED.raw_app_meta_data,
           raw_user_meta_data=EXCLUDED.raw_user_meta_data,
           updated_at=now()`,
        [
          u.id, u.instance_id, u.email, u.encrypted_password, u.email_confirmed_at,
          u.phone, u.phone_confirmed_at, u.confirmation_token ?? "", u.confirmation_sent_at,
          u.recovery_token ?? "", u.email_change_token_new ?? "", u.email_change ?? "",
          u.raw_app_meta_data, u.raw_user_meta_data, u.is_super_admin ?? false,
          u.created_at, u.updated_at, u.role ?? "authenticated", u.aud ?? "authenticated",
        ],
      );
      // Also copy identities so providers (email) still work
      upserted++;
    } catch (e) {
      failed.push({ id: u.id, error: String(e) });
    }
  }

  // Mirror identities
  let identities = 0;
  try {
    const ident = await src.queryObject<any>(
      `SELECT id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at, email FROM auth.identities`,
    );
    for (const r of ident.rows) {
      try {
        await dst.queryArray(
          `INSERT INTO auth.identities
             (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at, email)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (provider, provider_id) DO UPDATE SET
             identity_data=EXCLUDED.identity_data,
             updated_at=now()`,
          [r.id, r.user_id, r.identity_data, r.provider, r.provider_id, r.last_sign_in_at, r.created_at, r.updated_at, r.email],
        );
        identities++;
      } catch (_e) { /* ignore individual */ }
    }
  } catch (_e) { /* table shape may differ on older projects */ }

  return { listed: rows.rows.length, upserted, identities, failed_count: failed.length, failed: failed.slice(0, 5) };
}

async function applyRlsPolicies(dst: Client) {
  try {
    await dst.queryArray(RLS_SQL);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function ensureExternalBucket(id: string, opts: { public?: boolean; file_size_limit?: number } = {}) {
  if (!EXT_URL || !EXT_SERVICE_ROLE) {
    return { ok: false, skipped: true, reason: "missing_external_storage_credentials" };
  }

  const headers = {
    apikey: EXT_SERVICE_ROLE,
    Authorization: `Bearer ${EXT_SERVICE_ROLE}`,
    "Content-Type": "application/json",
  };

  try {
    const existing = await fetch(`${EXT_URL}/storage/v1/bucket/${id}`, { headers });
    if (existing.ok) return { ok: true, existed: true };

    const created = await fetch(`${EXT_URL}/storage/v1/bucket`, {
      method: "POST",
      headers,
      body: JSON.stringify({ id, name: id, public: opts.public ?? false, file_size_limit: opts.file_size_limit }),
    });
    if (created.ok || created.status === 409) return { ok: true, created: created.ok, existed: created.status === 409 };

    return { ok: false, status: created.status, error: await created.text() };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function ensureExternalBuckets() {
  return {
    "payment-receipts": await ensureExternalBucket("payment-receipts", { public: false }),
  };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // SECURITY: require service-role bearer to prevent unauthenticated dumping
  // of auth.users (including password hashes) to the external mirror project.
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const providedToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!SERVICE_ROLE || !providedToken || providedToken !== SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }


  const report: any = {
    started_at: new Date().toISOString(),
    external_url: EXT_URL,
    missing_secrets: [] as string[],
  };
  if (!SRC_DB) report.missing_secrets.push("SUPABASE_DB_URL");
  if (!DST_DB) report.missing_secrets.push("EXTERNAL_SUPABASE_DB_URL");
  if (EXT_URL && !EXT_URL.includes(REQUIRED_EXTERNAL_PROJECT_REF)) {
    report.status = "error";
    report.error = "EXTERNAL_SUPABASE_URL_PROJECT_REF_MISMATCH";
    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  }
  if (report.missing_secrets.length) {
    report.status = "skipped";
    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  }

  const url = new URL(req.url);
  const only = url.searchParams.get("only"); // "auth" | "tables" | "rls"

  let src: Client | null = null;
  let dst: Client | null = null;
  try {
    try {
      const srcConn = await connectWithFallback(RAW_SRC_DB, SRC_DB);
      src = srcConn.client;
      report.src_connected = true;
      report.src_connection_strategy = srcConn.strategy;
    }
    catch (e) { report.src_connect_error = String(e); throw e; }
    try {
      const dstConn = await connectWithFallback(RAW_DST_DB, DST_DB);
      dst = dstConn.client;
      report.dst_connected = true;
      report.dst_connection_strategy = dstConn.strategy;
    }
    catch (e) { report.dst_connect_error = String(e); throw e; }


    if (!only || only === "rls") {
      report.storage = await ensureExternalBuckets();
      report.rls = await applyRlsPolicies(dst);
    }
    if (!only || only === "auth") {
      try { report.auth = await mirrorAuthUsers(src, dst); }
      catch (e) { report.auth_error = String(e); }
    }
    if (!only || only === "tables") {
      report.tables = [];
      for (const t of TABLES) {
        try { report.tables.push(await mirrorTable(src, dst, t)); }
        catch (e) { report.tables.push({ table: t, error: String(e) }); }
      }
    }

    report.status = "ok";
    report.finished_at = new Date().toISOString();
  } catch (e) {
    report.status = "error";
    report.error = String(e);
  } finally {
    try { await src?.end(); } catch (_e) { /* */ }
    try { await dst?.end(); } catch (_e) { /* */ }
  }

  return new Response(JSON.stringify(report), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
  });
});

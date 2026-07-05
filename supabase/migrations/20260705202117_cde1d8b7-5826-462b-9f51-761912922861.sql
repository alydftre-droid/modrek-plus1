-- Central developer-test-student leak guard and alerting

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
CREATE INDEX IF NOT EXISTS idx_test_student_security_events_teacher
ON public.test_student_security_events(teacher_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_student_security_events_student
ON public.test_student_security_events(student_id, last_seen_at DESC);

CREATE OR REPLACE FUNCTION public.is_test_student(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT (COALESCE(is_test_account, false) = true) OR (test_account_code IS NOT NULL)
       FROM public.profiles
      WHERE id = _user_id),
    false
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.is_test_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_test_student(uuid) TO authenticated, service_role;

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
  v_fingerprint := md5(
    COALESCE(_event_type, '') || '|' ||
    COALESCE(_source_table, '') || '|' ||
    COALESCE(_teacher_id::text, '') || '|' ||
    COALESCE(_student_id::text, '') || '|' ||
    COALESCE(_source_id::text, '')
  );

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
         OR EXISTS (
           SELECT 1 FROM public.user_roles ur
           WHERE ur.user_id = p.id AND ur.role = 'admin'::public.app_role
         )
    LOOP
      INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent)
      VALUES (
        v_admin,
        'تنبيه أمني: محاولة ظهور طالب تجريبي للمعلم',
        'تم رصد ومنع تسريب بيانات طالب تجريبي ضمن نطاق معلم. راجع سجل حماية الحسابات التجريبية.',
        'security_alert',
        '/admin/developer-test-students',
        false,
        true
      );
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
  IF NEW.student_id IS NOT NULL AND public.is_test_student(NEW.student_id) THEN
    PERFORM public.log_test_student_teacher_leak(
      'blocked_teacher_choice',
      'student_teacher_choices',
      NEW.teacher_id,
      NEW.student_id,
      COALESCE(NEW.id, gen_random_uuid()),
      jsonb_build_object('grade', NEW.grade, 'stage', NEW.stage, 'category', NEW.category)
    );
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_teacher_choice_test_student_trg ON public.student_teacher_choices;
CREATE TRIGGER block_teacher_choice_test_student_trg
BEFORE INSERT OR UPDATE ON public.student_teacher_choices
FOR EACH ROW
EXECUTE FUNCTION public.block_teacher_choice_for_test_student();

CREATE OR REPLACE FUNCTION public.block_group_purchase_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_teacher_id uuid;
BEGIN
  IF NEW.student_id IS NOT NULL AND public.is_test_student(NEW.student_id) THEN
    SELECT COALESCE(teacher_id, created_by) INTO v_teacher_id
    FROM public.content_groups
    WHERE id = NEW.group_id;

    PERFORM public.log_test_student_teacher_leak(
      'blocked_group_purchase',
      'student_group_purchases',
      v_teacher_id,
      NEW.student_id,
      COALESCE(NEW.id, gen_random_uuid()),
      jsonb_build_object('group_id', NEW.group_id, 'amount_paid', NEW.amount_paid)
    );
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_group_purchase_test_student_trg ON public.student_group_purchases;
CREATE TRIGGER block_group_purchase_test_student_trg
BEFORE INSERT OR UPDATE ON public.student_group_purchases
FOR EACH ROW
EXECUTE FUNCTION public.block_group_purchase_for_test_student();

CREATE OR REPLACE FUNCTION public.block_teacher_message_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.student_id IS NOT NULL AND public.is_test_student(NEW.student_id) THEN
    PERFORM public.log_test_student_teacher_leak(
      'blocked_teacher_message',
      'teacher_messages',
      NEW.teacher_id,
      NEW.student_id,
      COALESCE(NEW.id, gen_random_uuid()),
      jsonb_build_object('is_from_teacher', NEW.is_from_teacher)
    );
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_teacher_message_test_student_trg ON public.teacher_messages;
CREATE TRIGGER block_teacher_message_test_student_trg
BEFORE INSERT OR UPDATE ON public.teacher_messages
FOR EACH ROW
EXECUTE FUNCTION public.block_teacher_message_for_test_student();

CREATE OR REPLACE FUNCTION public.block_earning_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.student_id IS NOT NULL AND public.is_test_student(NEW.student_id) THEN
    PERFORM public.log_test_student_teacher_leak(
      'blocked_teacher_earning',
      'teacher_earning_records',
      NEW.teacher_id,
      NEW.student_id,
      COALESCE(NEW.id, gen_random_uuid()),
      jsonb_build_object('purchase_id', NEW.purchase_id, 'group_id', NEW.group_id, 'net_amount', NEW.net_amount)
    );
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
DECLARE
  v_student uuid;
BEGIN
  IF public.teacher_wallet_tx_is_for_test_student(NEW.metadata) THEN
    BEGIN
      v_student := NULLIF(NEW.metadata->>'student_id', '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_student := NULL;
    END;

    IF v_student IS NULL THEN
      SELECT sgp.student_id INTO v_student
      FROM public.student_group_purchases sgp
      WHERE sgp.id = NULLIF(NEW.metadata->>'purchase_id', '')::uuid;
    END IF;

    PERFORM public.log_test_student_teacher_leak(
      'blocked_teacher_wallet_transaction',
      'teacher_wallet_transactions',
      NEW.teacher_id,
      v_student,
      COALESCE(NEW.id, gen_random_uuid()),
      jsonb_build_object('amount', NEW.amount, 'transaction_type', NEW.transaction_type, 'metadata', NEW.metadata)
    );
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

CREATE OR REPLACE FUNCTION public.block_teacher_notification_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_teacher boolean := false;
  v_student uuid;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = NEW.user_id AND role = 'teacher'::public.app_role
  ) INTO v_is_teacher;

  IF NOT v_is_teacher THEN
    RETURN NEW;
  END IF;

  IF NEW.created_by IS NOT NULL AND public.is_test_student(NEW.created_by) THEN
    PERFORM public.log_test_student_teacher_leak(
      'blocked_teacher_notification',
      'notifications',
      NEW.user_id,
      NEW.created_by,
      COALESCE(NEW.id, gen_random_uuid()),
      jsonb_build_object('notification_type', NEW.notification_type, 'title', NEW.title)
    );
    RETURN NULL;
  END IF;

  BEGIN
    v_student := NULLIF(COALESCE(NEW.link, ''), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_student := NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_teacher_notification_test_student_trg ON public.notifications;
CREATE TRIGGER block_teacher_notification_test_student_trg
BEFORE INSERT OR UPDATE ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.block_teacher_notification_for_test_student();

CREATE OR REPLACE FUNCTION public.block_teacher_delivery_log_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student uuid;
  v_is_teacher boolean := false;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = NEW.user_id AND role = 'teacher'::public.app_role
  ) INTO v_is_teacher;

  IF NOT v_is_teacher THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_student := NULLIF(COALESCE(NEW.details->>'student_id', NEW.details->>'target_student_id'), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_student := NULL;
  END;

  IF v_student IS NOT NULL AND public.is_test_student(v_student) THEN
    PERFORM public.log_test_student_teacher_leak(
      'blocked_teacher_delivery_log',
      'notification_delivery_logs',
      NEW.user_id,
      v_student,
      COALESCE(NEW.id, gen_random_uuid()),
      jsonb_build_object('source_table', NEW.source_table, 'notification_type', NEW.notification_type)
    );
    RETURN NULL;
  END IF;

  IF NEW.source_table = 'teacher_messages' AND NEW.source_id IS NOT NULL THEN
    SELECT tm.student_id INTO v_student
    FROM public.teacher_messages tm
    WHERE tm.id = NEW.source_id;

    IF v_student IS NOT NULL AND public.is_test_student(v_student) THEN
      PERFORM public.log_test_student_teacher_leak(
        'blocked_teacher_delivery_log',
        'notification_delivery_logs',
        NEW.user_id,
        v_student,
        COALESCE(NEW.id, gen_random_uuid()),
        jsonb_build_object('source_table', NEW.source_table, 'notification_type', NEW.notification_type)
      );
      RETURN NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_teacher_delivery_log_test_student_trg ON public.notification_delivery_logs;
CREATE TRIGGER block_teacher_delivery_log_test_student_trg
BEFORE INSERT OR UPDATE ON public.notification_delivery_logs
FOR EACH ROW
EXECUTE FUNCTION public.block_teacher_delivery_log_for_test_student();

-- Block test accounts from being persisted in teacher-facing relationship tables.
DROP POLICY IF EXISTS "Teachers can view choices for them" ON public.student_teacher_choices;
CREATE POLICY "Teachers can view choices for them"
ON public.student_teacher_choices
FOR SELECT
USING (auth.uid() = teacher_id AND NOT public.is_test_student(student_id));

DROP POLICY IF EXISTS "Students can insert their own choice" ON public.student_teacher_choices;
CREATE POLICY "Students can insert their own choice"
ON public.student_teacher_choices
FOR INSERT
WITH CHECK (auth.uid() = student_id AND NOT public.is_test_student(student_id));

DROP POLICY IF EXISTS "Students can update their own choice" ON public.student_teacher_choices;
CREATE POLICY "Students can update their own choice"
ON public.student_teacher_choices
FOR UPDATE
USING (auth.uid() = student_id AND NOT public.is_test_student(student_id))
WITH CHECK (auth.uid() = student_id AND NOT public.is_test_student(student_id));

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
USING (auth.uid() = student_id AND NOT public.is_test_student(student_id));

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

DROP POLICY IF EXISTS "Students can send messages" ON public.teacher_messages;
CREATE POLICY "Students can send messages"
ON public.teacher_messages
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = student_id AND is_from_teacher = false AND NOT public.is_test_student(student_id));

DROP POLICY IF EXISTS "Teachers can send messages" ON public.teacher_messages;
CREATE POLICY "Teachers can send messages"
ON public.teacher_messages
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = teacher_id AND is_from_teacher = true AND NOT public.is_test_student(student_id));

DROP POLICY IF EXISTS "Users can mark messages as read" ON public.teacher_messages;
CREATE POLICY "Users can mark messages as read"
ON public.teacher_messages
FOR UPDATE
TO authenticated
USING (
  (auth.uid() = student_id OR auth.uid() = teacher_id)
  AND NOT public.is_test_student(student_id)
)
WITH CHECK (
  (auth.uid() = student_id OR auth.uid() = teacher_id)
  AND NOT public.is_test_student(student_id)
);

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
    EXISTS (
      SELECT 1 FROM public.student_teacher_choices stc
      WHERE stc.student_id = profiles.id
        AND stc.teacher_id = auth.uid()
        AND NOT public.is_test_student(stc.student_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.student_group_purchases sgp
      JOIN public.content_groups cg ON cg.id = sgp.group_id
      WHERE sgp.student_id = profiles.id
        AND COALESCE(cg.teacher_id, cg.created_by) = auth.uid()
        AND NOT public.is_test_student(sgp.student_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.teacher_messages tm
      WHERE tm.student_id = profiles.id
        AND tm.teacher_id = auth.uid()
        AND NOT public.is_test_student(tm.student_id)
    )
  )
);

-- Make purchasing itself no-op for developer test students: they can test browsing, but never create teacher-facing purchases.
CREATE OR REPLACE FUNCTION public.purchase_group_with_wallet(p_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF public.is_test_student(v_student_id) THEN
    PERFORM public.log_test_student_teacher_leak(
      'blocked_purchase_rpc_test_student',
      'student_group_purchases',
      v_teacher_id,
      v_student_id,
      p_group_id,
      jsonb_build_object('group_id', p_group_id)
    );
    RETURN jsonb_build_object('success', true, 'test_account', true, 'purchase_id', NULL, 'amount_paid', 0, 'remaining_balance', 0);
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
    'remaining_balance', v_wallet_balance - v_price
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'أنت مشترك بالفعل في هذه المجموعة');
END;
$function$;

REVOKE ALL ON FUNCTION public.purchase_group_with_wallet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_group_with_wallet(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.credit_teacher_on_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_teacher_id uuid;
  v_subject_id uuid;
  v_amount numeric;
  v_commission_rate numeric;
  v_commission numeric;
  v_period text;
  v_inserted_id uuid;
BEGIN
  SELECT COALESCE(teacher_id, created_by), subject_id INTO v_teacher_id, v_subject_id
  FROM public.content_groups WHERE id = NEW.group_id;

  IF NEW.student_id IS NOT NULL AND public.is_test_student(NEW.student_id) THEN
    PERFORM public.log_test_student_teacher_leak(
      'blocked_credit_trigger_test_student',
      'teacher_earning_records',
      v_teacher_id,
      NEW.student_id,
      NEW.id,
      jsonb_build_object('group_id', NEW.group_id, 'amount_paid', NEW.amount_paid)
    );
    RETURN NEW;
  END IF;

  IF v_teacher_id IS NULL THEN RETURN NEW; END IF;

  v_amount := COALESCE(NEW.amount_paid, 0);
  IF v_amount <= 0 THEN RETURN NEW; END IF;

  v_commission_rate := public.get_effective_teacher_commission(v_teacher_id);
  v_commission := ROUND(v_amount * v_commission_rate, 2);
  v_period := to_char(NEW.purchased_at, 'YYYY-MM');

  INSERT INTO public.teacher_earning_records
    (teacher_id, purchase_id, group_id, subject_id, student_id,
     gross_amount, commission_rate, net_amount, period_label, is_frozen, is_archived)
  VALUES
    (v_teacher_id, NEW.id, NEW.group_id, v_subject_id, NEW.student_id,
     v_amount, v_commission_rate, v_commission, v_period, true, false)
  ON CONFLICT (purchase_id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.teacher_wallets (teacher_id, balance, frozen_balance, total_earned, current_period)
  VALUES (v_teacher_id, 0, v_commission, v_commission, v_period)
  ON CONFLICT (teacher_id) DO UPDATE
  SET frozen_balance = teacher_wallets.frozen_balance + v_commission,
      total_earned = teacher_wallets.total_earned + v_commission,
      updated_at = now();

  RETURN NEW;
END;
$function$;

-- Log and remove existing contamination from all teacher-facing surfaces.
INSERT INTO public.test_student_security_events
  (event_type, source_table, source_id, teacher_id, student_id, details, fingerprint, occurrence_count)
SELECT 'purged_existing_teacher_choice', 'student_teacher_choices', stc.id, stc.teacher_id, stc.student_id,
       jsonb_build_object('grade', stc.grade, 'stage', stc.stage, 'category', stc.category),
       md5('purged_existing_teacher_choice|student_teacher_choices|' || COALESCE(stc.teacher_id::text,'') || '|' || stc.student_id::text || '|' || stc.id::text),
       1
FROM public.student_teacher_choices stc
WHERE public.is_test_student(stc.student_id)
ON CONFLICT (fingerprint) DO UPDATE SET occurrence_count = public.test_student_security_events.occurrence_count + 1, last_seen_at = now();

INSERT INTO public.test_student_security_events
  (event_type, source_table, source_id, teacher_id, student_id, details, fingerprint, occurrence_count)
SELECT 'purged_existing_group_purchase', 'student_group_purchases', sgp.id, COALESCE(cg.teacher_id, cg.created_by), sgp.student_id,
       jsonb_build_object('group_id', sgp.group_id, 'amount_paid', sgp.amount_paid),
       md5('purged_existing_group_purchase|student_group_purchases|' || COALESCE(COALESCE(cg.teacher_id, cg.created_by)::text,'') || '|' || sgp.student_id::text || '|' || sgp.id::text),
       1
FROM public.student_group_purchases sgp
LEFT JOIN public.content_groups cg ON cg.id = sgp.group_id
WHERE public.is_test_student(sgp.student_id)
ON CONFLICT (fingerprint) DO UPDATE SET occurrence_count = public.test_student_security_events.occurrence_count + 1, last_seen_at = now();

INSERT INTO public.test_student_security_events
  (event_type, source_table, source_id, teacher_id, student_id, details, fingerprint, occurrence_count)
SELECT 'purged_existing_teacher_message', 'teacher_messages', tm.id, tm.teacher_id, tm.student_id,
       jsonb_build_object('is_from_teacher', tm.is_from_teacher),
       md5('purged_existing_teacher_message|teacher_messages|' || COALESCE(tm.teacher_id::text,'') || '|' || tm.student_id::text || '|' || tm.id::text),
       1
FROM public.teacher_messages tm
WHERE public.is_test_student(tm.student_id)
ON CONFLICT (fingerprint) DO UPDATE SET occurrence_count = public.test_student_security_events.occurrence_count + 1, last_seen_at = now();

WITH bad_earnings AS (
  SELECT id, teacher_id, period_label, COALESCE(net_amount, 0) AS net_amount, COALESCE(is_archived, false) AS is_archived
  FROM public.teacher_earning_records
  WHERE public.is_test_student(student_id)
), wallet_delta AS (
  SELECT teacher_id,
         COALESCE(SUM(net_amount), 0) AS total_bad,
         COALESCE(SUM(net_amount) FILTER (WHERE is_archived = false), 0) AS frozen_bad,
         COALESCE(SUM(net_amount) FILTER (WHERE is_archived = true), 0) AS available_bad
  FROM bad_earnings
  GROUP BY teacher_id
)
UPDATE public.teacher_wallets tw
SET total_earned = GREATEST(0, COALESCE(tw.total_earned, 0) - wallet_delta.total_bad),
    frozen_balance = GREATEST(0, COALESCE(tw.frozen_balance, 0) - wallet_delta.frozen_bad),
    balance = GREATEST(0, COALESCE(tw.balance, 0) - wallet_delta.available_bad),
    updated_at = now()
FROM wallet_delta
WHERE tw.teacher_id = wallet_delta.teacher_id;

INSERT INTO public.test_student_security_events
  (event_type, source_table, source_id, teacher_id, student_id, details, fingerprint, occurrence_count)
SELECT 'purged_existing_teacher_earning', 'teacher_earning_records', ter.id, ter.teacher_id, ter.student_id,
       jsonb_build_object('purchase_id', ter.purchase_id, 'group_id', ter.group_id, 'net_amount', ter.net_amount),
       md5('purged_existing_teacher_earning|teacher_earning_records|' || COALESCE(ter.teacher_id::text,'') || '|' || ter.student_id::text || '|' || ter.id::text),
       1
FROM public.teacher_earning_records ter
WHERE public.is_test_student(ter.student_id)
ON CONFLICT (fingerprint) DO UPDATE SET occurrence_count = public.test_student_security_events.occurrence_count + 1, last_seen_at = now();

INSERT INTO public.test_student_security_events
  (event_type, source_table, source_id, teacher_id, student_id, details, fingerprint, occurrence_count)
SELECT 'purged_existing_wallet_transaction', 'teacher_wallet_transactions', twt.id, twt.teacher_id, NULL,
       jsonb_build_object('metadata', twt.metadata, 'amount', twt.amount, 'transaction_type', twt.transaction_type),
       md5('purged_existing_wallet_transaction|teacher_wallet_transactions|' || COALESCE(twt.teacher_id::text,'') || '|' || twt.id::text),
       1
FROM public.teacher_wallet_transactions twt
WHERE public.teacher_wallet_tx_is_for_test_student(twt.metadata)
ON CONFLICT (fingerprint) DO UPDATE SET occurrence_count = public.test_student_security_events.occurrence_count + 1, last_seen_at = now();

DELETE FROM public.teacher_wallet_transactions twt
WHERE public.teacher_wallet_tx_is_for_test_student(twt.metadata);

DELETE FROM public.teacher_earning_records ter
WHERE public.is_test_student(ter.student_id);

DELETE FROM public.teacher_messages tm
WHERE public.is_test_student(tm.student_id);

DELETE FROM public.student_group_purchases sgp
WHERE public.is_test_student(sgp.student_id);

DELETE FROM public.student_teacher_choices stc
WHERE public.is_test_student(stc.student_id);

CREATE OR REPLACE FUNCTION public.audit_test_student_visibility()
RETURNS TABLE(source text, row_count bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT 'student_teacher_choices'::text, COUNT(*)::bigint
    FROM public.student_teacher_choices stc
   WHERE public.is_test_student(stc.student_id)
     AND stc.teacher_id IS NOT NULL
  UNION ALL
  SELECT 'student_group_purchases', COUNT(*)::bigint
    FROM public.student_group_purchases sgp
    JOIN public.content_groups cg ON cg.id = sgp.group_id
   WHERE public.is_test_student(sgp.student_id)
     AND COALESCE(cg.teacher_id, cg.created_by) IS NOT NULL
  UNION ALL
  SELECT 'teacher_messages', COUNT(*)::bigint
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
  SELECT 'teacher_visible_profiles', COUNT(*)::bigint
    FROM public.profiles p
   WHERE public.is_test_student(p.id)
     AND EXISTS (
       SELECT 1 FROM public.student_teacher_choices stc WHERE stc.student_id = p.id AND stc.teacher_id IS NOT NULL
       UNION ALL
       SELECT 1 FROM public.student_group_purchases sgp JOIN public.content_groups cg ON cg.id = sgp.group_id WHERE sgp.student_id = p.id AND COALESCE(cg.teacher_id, cg.created_by) IS NOT NULL
       UNION ALL
       SELECT 1 FROM public.teacher_messages tm WHERE tm.student_id = p.id
     );
$$;

REVOKE ALL ON FUNCTION public.audit_test_student_visibility() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_test_student_visibility() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- 1. Table: automated_messages
CREATE TABLE IF NOT EXISTS public.automated_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_key TEXT NOT NULL,
  name TEXT NOT NULL,
  title_template TEXT NOT NULL,
  message_template TEXT NOT NULL,
  notification_type TEXT NOT NULL DEFAULT 'normal',
  link_template TEXT,
  recipient_mode TEXT NOT NULL DEFAULT 'actor', -- actor | related | role_students | role_teachers | role_all
  extra_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  run_count INTEGER NOT NULL DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automated_messages TO authenticated;
GRANT ALL ON public.automated_messages TO service_role;

ALTER TABLE public.automated_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage automated_messages"
ON public.automated_messages FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_automated_messages_event ON public.automated_messages(event_key) WHERE is_active;

-- 2. Table: automation_runs
CREATE TABLE IF NOT EXISTS public.automation_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id UUID REFERENCES public.automated_messages(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  recipients_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success', -- success | error | skipped
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.automation_runs TO authenticated;
GRANT ALL ON public.automation_runs TO service_role;

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view automation_runs"
ON public.automation_runs FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_automation_runs_auto ON public.automation_runs(automation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_runs_event ON public.automation_runs(event_key, created_at DESC);

-- 3. Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_automated_messages_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_automated_messages_updated ON public.automated_messages;
CREATE TRIGGER trg_automated_messages_updated
BEFORE UPDATE ON public.automated_messages
FOR EACH ROW EXECUTE FUNCTION public.set_automated_messages_updated_at();

-- 4. Template rendering helper (simple {{key}} replacement)
CREATE OR REPLACE FUNCTION public.render_notification_template(_tpl TEXT, _vars JSONB)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  k TEXT; v TEXT; out TEXT := COALESCE(_tpl, '');
BEGIN
  IF _vars IS NULL THEN RETURN out; END IF;
  FOR k, v IN SELECT key, COALESCE(value #>> '{}', '') FROM jsonb_each(_vars) LOOP
    out := replace(out, '{{' || k || '}}', v);
  END LOOP;
  RETURN out;
END;
$$;

-- 5. Core dispatcher
CREATE OR REPLACE FUNCTION public.dispatch_automation(
  _event_key TEXT,
  _actor_user_id UUID,
  _related_user_id UUID,
  _payload JSONB DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a RECORD;
  rendered_title TEXT;
  rendered_msg TEXT;
  rendered_link TEXT;
  target_ids UUID[];
  sched TIMESTAMPTZ;
  inserted_count INTEGER;
BEGIN
  FOR a IN
    SELECT * FROM public.automated_messages
    WHERE event_key = _event_key AND is_active = true
  LOOP
    BEGIN
      rendered_title := public.render_notification_template(a.title_template, _payload);
      rendered_msg := public.render_notification_template(a.message_template, _payload);
      rendered_link := public.render_notification_template(a.link_template, _payload);
      sched := CASE WHEN a.delay_minutes > 0 THEN now() + (a.delay_minutes || ' minutes')::interval ELSE NULL END;

      target_ids := NULL;
      IF a.recipient_mode = 'actor' AND _actor_user_id IS NOT NULL THEN
        target_ids := ARRAY[_actor_user_id];
      ELSIF a.recipient_mode = 'related' AND _related_user_id IS NOT NULL THEN
        target_ids := ARRAY[_related_user_id];
      ELSIF a.recipient_mode = 'role_students' THEN
        SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO target_ids FROM public.profiles WHERE role = 'student';
      ELSIF a.recipient_mode = 'role_teachers' THEN
        SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO target_ids FROM public.profiles WHERE role = 'teacher';
      ELSIF a.recipient_mode = 'role_all' THEN
        SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO target_ids FROM public.profiles;
      END IF;

      IF target_ids IS NULL OR array_length(target_ids, 1) IS NULL THEN
        INSERT INTO public.automation_runs(automation_id, event_key, event_payload, recipients_count, status, error_message)
        VALUES (a.id, _event_key, _payload, 0, 'skipped', 'no recipients');
        CONTINUE;
      END IF;

      INSERT INTO public.notifications(user_id, title, message, notification_type, link, is_sent, scheduled_at)
      SELECT uid, rendered_title, rendered_msg, a.notification_type,
             NULLIF(rendered_link, ''), sched IS NULL, sched
      FROM unnest(target_ids) AS uid;

      GET DIAGNOSTICS inserted_count = ROW_COUNT;

      UPDATE public.automated_messages
      SET run_count = run_count + 1, last_run_at = now()
      WHERE id = a.id;

      INSERT INTO public.automation_runs(automation_id, event_key, event_payload, recipients_count, status)
      VALUES (a.id, _event_key, _payload, inserted_count, 'success');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.automation_runs(automation_id, event_key, event_payload, recipients_count, status, error_message)
      VALUES (a.id, _event_key, _payload, 0, 'error', SQLERRM);
    END;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dispatch_automation(TEXT, UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_automation(TEXT, UUID, UUID, JSONB) TO authenticated, service_role;

-- 6. Event triggers
-- 6a. profile registration
CREATE OR REPLACE FUNCTION public.trg_profile_automation_events()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ev TEXT; pl JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'teacher' THEN ev := 'teacher.registered';
    ELSIF NEW.role = 'student' THEN ev := 'student.registered';
    ELSE RETURN NEW; END IF;
    pl := jsonb_build_object('full_name', NEW.full_name, 'email', NEW.email, 'phone', COALESCE(NEW.phone,''));
    PERFORM public.dispatch_automation(ev, NEW.id, NULL, pl);
  ELSIF TG_OP = 'UPDATE' THEN
    -- ban / unban
    IF TG_TABLE_NAME = 'profiles' AND (OLD.is_banned IS DISTINCT FROM NEW.is_banned) THEN
      pl := jsonb_build_object('full_name', NEW.full_name);
      IF NEW.is_banned THEN
        PERFORM public.dispatch_automation('user.banned', NEW.id, NULL, pl);
      ELSE
        PERFORM public.dispatch_automation('user.unbanned', NEW.id, NULL, pl);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_automation_ins ON public.profiles;
CREATE TRIGGER trg_profiles_automation_ins
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_profile_automation_events();

DROP TRIGGER IF EXISTS trg_profiles_automation_upd ON public.profiles;
CREATE TRIGGER trg_profiles_automation_upd
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_profile_automation_events();

-- 6b. teacher_requests approve/reject
CREATE OR REPLACE FUNCTION public.trg_teacher_request_automation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pl JSONB;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    pl := jsonb_build_object('full_name', NEW.full_name, 'reason', COALESCE(NEW.rejection_reason,''));
    IF NEW.status::text = 'approved' THEN
      PERFORM public.dispatch_automation('teacher.approved', NEW.user_id, NULL, pl);
    ELSIF NEW.status::text = 'rejected' THEN
      PERFORM public.dispatch_automation('teacher.rejected', NEW.user_id, NULL, pl);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_teacher_requests_automation ON public.teacher_requests;
CREATE TRIGGER trg_teacher_requests_automation
AFTER UPDATE ON public.teacher_requests
FOR EACH ROW EXECUTE FUNCTION public.trg_teacher_request_automation();

-- 6c. subscription created
CREATE OR REPLACE FUNCTION public.trg_subscription_automation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pl JSONB; sub_name TEXT;
BEGIN
  SELECT name INTO sub_name FROM public.subjects WHERE id = NEW.subject_id;
  pl := jsonb_build_object('subject', COALESCE(sub_name,''), 'end_date', to_char(NEW.end_date, 'YYYY-MM-DD'));
  PERFORM public.dispatch_automation('subscription.created', NEW.student_id, NEW.teacher_id, pl);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscriptions_automation ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_automation
AFTER INSERT ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.trg_subscription_automation();

-- 6d. content (video) uploaded
CREATE OR REPLACE FUNCTION public.trg_content_automation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pl JSONB; sub_name TEXT;
BEGIN
  IF NEW.type = 'video' THEN
    SELECT name INTO sub_name FROM public.subjects WHERE id = NEW.subject_id;
    pl := jsonb_build_object('title', NEW.title, 'subject', COALESCE(sub_name,''));
    PERFORM public.dispatch_automation('content.video_uploaded', NEW.uploaded_by, NULL, pl);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_content_automation ON public.content;
CREATE TRIGGER trg_content_automation
AFTER INSERT ON public.content
FOR EACH ROW EXECUTE FUNCTION public.trg_content_automation();

-- 7. Scheduled: subscription expiry sweeper (invoked by cron)
CREATE OR REPLACE FUNCTION public.run_subscription_expiry_automation()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s RECORD; pl JSONB; sub_name TEXT;
BEGIN
  -- expiring within 3 days (once per day per subscription: guard via last_run marker in end_date approach)
  FOR s IN
    SELECT s.id, s.student_id, s.subject_id, s.end_date
    FROM public.subscriptions s
    WHERE s.is_active = true
      AND s.end_date > now()
      AND s.end_date <= now() + interval '3 days'
  LOOP
    SELECT name INTO sub_name FROM public.subjects WHERE id = s.subject_id;
    pl := jsonb_build_object('subject', COALESCE(sub_name,''), 'end_date', to_char(s.end_date, 'YYYY-MM-DD'),
      'days_left', GREATEST(0, EXTRACT(DAY FROM (s.end_date - now()))::int));
    PERFORM public.dispatch_automation('subscription.expiring_soon', s.student_id, NULL, pl);
  END LOOP;

  -- expired today
  FOR s IN
    SELECT s.id, s.student_id, s.subject_id, s.end_date
    FROM public.subscriptions s
    WHERE s.end_date <= now() AND s.end_date > now() - interval '1 day'
  LOOP
    SELECT name INTO sub_name FROM public.subjects WHERE id = s.subject_id;
    pl := jsonb_build_object('subject', COALESCE(sub_name,''), 'end_date', to_char(s.end_date, 'YYYY-MM-DD'));
    PERFORM public.dispatch_automation('subscription.expired', s.student_id, NULL, pl);
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_subscription_expiry_automation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_subscription_expiry_automation() TO authenticated, service_role;

-- 8. Default automated messages (only if none exist)
INSERT INTO public.automated_messages (event_key, name, title_template, message_template, notification_type, recipient_mode)
SELECT * FROM (VALUES
  ('student.registered',       'ترحيب بالطالب الجديد', 'أهلاً بك في مدرك Plus 🎉', 'مرحبًا {{full_name}}، تم إنشاء حسابك بنجاح. ابدأ رحلتك التعليمية الآن!', 'announcement', 'actor'),
  ('teacher.registered',       'استلام طلب المعلم',   'تم استلام طلبك ✅', 'مرحبًا {{full_name}}، تم استلام طلب انضمامك كمعلم وسيتم مراجعته قريبًا.', 'normal', 'actor'),
  ('teacher.approved',         'قبول المعلم',         'تهانينا! تم قبولك 🎓', 'أهلاً {{full_name}}، تم قبولك كمعلم في مدرك Plus. يمكنك الآن رفع الدروس والامتحانات.', 'important', 'actor'),
  ('teacher.rejected',         'رفض طلب المعلم',      'نأسف، لم يتم قبول طلبك', 'عزيزي {{full_name}}، لم يتم قبول طلبك حاليًا. السبب: {{reason}}', 'warning', 'actor'),
  ('subscription.created',     'شراء اشتراك',         'تم تفعيل الاشتراك ✔', 'تم تفعيل اشتراكك في مادة {{subject}} حتى {{end_date}}.', 'normal', 'actor'),
  ('subscription.expiring_soon','قرب انتهاء الاشتراك','اشتراكك سينتهي قريبًا ⏰', 'اشتراكك في مادة {{subject}} سينتهي خلال {{days_left}} يوم/أيام. جدد الآن لتجنب الانقطاع.', 'warning', 'actor'),
  ('subscription.expired',     'انتهاء الاشتراك',     'انتهى اشتراكك', 'انتهى اشتراكك في مادة {{subject}}. يمكنك تجديده الآن من صفحة الاشتراكات.', 'warning', 'actor'),
  ('content.video_uploaded',   'رفع فيديو جديد',      'تم رفع فيديو جديد', 'تم رفع فيديو "{{title}}" في مادة {{subject}} بنجاح.', 'update', 'actor'),
  ('user.banned',              'حظر المستخدم',        'تم تعليق حسابك', 'عزيزي {{full_name}}، تم تعليق حسابك مؤقتًا. للاستفسار تواصل مع الدعم.', 'urgent', 'actor'),
  ('user.unbanned',            'فك الحظر',            'تم إعادة تفعيل حسابك ✅', 'أهلاً {{full_name}}، تم إعادة تفعيل حسابك ويمكنك المتابعة الآن.', 'important', 'actor')
) AS t(event_key, name, title_template, message_template, notification_type, recipient_mode)
WHERE NOT EXISTS (SELECT 1 FROM public.automated_messages WHERE event_key = t.event_key);

-- 9. Schedule expiry job (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('automation_subscription_expiry');
    PERFORM cron.schedule('automation_subscription_expiry', '0 9 * * *', $cron$ SELECT public.run_subscription_expiry_automation(); $cron$);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

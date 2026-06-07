CREATE OR REPLACE FUNCTION public.request_external_sync(sync_scope text DEFAULT 'tables')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_base_url text := 'https://qohhrliaecdtaeyfhcvb.supabase.co/functions/v1/external-sync';
  v_url text;
BEGIN
  v_url := v_base_url || CASE
    WHEN sync_scope IN ('auth','tables','rls') THEN '?only=' || sync_scope
    ELSE ''
  END;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvaGhybGlhZWNkdGFleWZoY3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3MTU1NDYsImV4cCI6MjA4MTI5MTU0Nn0.0j-tjPRX-s2wMCYfJypWo2dlYk9Mi40ueU8z0f00y8A',
      'Authorization', 'Bearer ' || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvaGhybGlhZWNkdGFleWZoY3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3MTU1NDYsImV4cCI6MjA4MTI5MTU0Nn0.0j-tjPRX-s2wMCYfJypWo2dlYk9Mi40ueU8z0f00y8A'
    ),
    body := jsonb_build_object(
      'source', 'db-trigger',
      'scope', sync_scope,
      'requested_at', now()
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'request_external_sync failed: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_external_sync_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.request_external_sync('tables');
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_external_sync ON public.profiles;
CREATE TRIGGER trg_profiles_external_sync
AFTER INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trigger_external_sync_after_change();

DROP TRIGGER IF EXISTS trg_user_roles_external_sync ON public.user_roles;
CREATE TRIGGER trg_user_roles_external_sync
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.trigger_external_sync_after_change();

DROP TRIGGER IF EXISTS trg_teacher_requests_external_sync ON public.teacher_requests;
CREATE TRIGGER trg_teacher_requests_external_sync
AFTER INSERT OR UPDATE OR DELETE ON public.teacher_requests
FOR EACH ROW EXECUTE FUNCTION public.trigger_external_sync_after_change();

DROP TRIGGER IF EXISTS trg_content_groups_external_sync ON public.content_groups;
CREATE TRIGGER trg_content_groups_external_sync
AFTER INSERT OR UPDATE OR DELETE ON public.content_groups
FOR EACH ROW EXECUTE FUNCTION public.trigger_external_sync_after_change();

DROP TRIGGER IF EXISTS trg_content_external_sync ON public.content;
CREATE TRIGGER trg_content_external_sync
AFTER INSERT OR UPDATE OR DELETE ON public.content
FOR EACH ROW EXECUTE FUNCTION public.trigger_external_sync_after_change();

DROP TRIGGER IF EXISTS trg_student_group_purchases_external_sync ON public.student_group_purchases;
CREATE TRIGGER trg_student_group_purchases_external_sync
AFTER INSERT OR UPDATE OR DELETE ON public.student_group_purchases
FOR EACH ROW EXECUTE FUNCTION public.trigger_external_sync_after_change();

DROP TRIGGER IF EXISTS trg_subscriptions_external_sync ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_external_sync
AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.trigger_external_sync_after_change();

CREATE OR REPLACE FUNCTION public.get_default_sub_subject_names(
  p_category text,
  p_stage text,
  p_grade text,
  p_section text DEFAULT NULL,
  p_subject_name text DEFAULT NULL
)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_category text := lower(coalesce(p_category, ''));
  v_stage text := lower(coalesce(p_stage, ''));
  v_grade text := lower(coalesce(p_grade, ''));
  v_section text := lower(coalesce(p_section, ''));
BEGIN
  IF v_category = 'arabic' THEN
    RETURN ARRAY['النحو','الصرف','البلاغة','الأدب والنصوص','القراءة','الإملاء','التعبير'];
  END IF;

  IF v_category = 'sharia' OR v_category = 'religious' THEN
    IF v_stage = 'preparatory' THEN
      RETURN ARRAY['التوحيد','الحديث','التفسير','السيرة','الفقه'];
    END IF;

    IF v_stage = 'secondary' AND v_grade IN ('first','second') THEN
      RETURN ARRAY['التفسير','الحديث','التوحيد','الفقه الشافعي'];
    END IF;

    IF v_stage = 'secondary' AND v_grade = 'third' THEN
      RETURN ARRAY['التفسير','الحديث','التوحيد','الفقه الشافعي','الميراث'];
    END IF;

    RETURN ARRAY['التفسير','الحديث','التوحيد','الفقه'];
  END IF;

  IF v_category = 'studies' OR v_category = 'social' THEN
    RETURN ARRAY['التاريخ','الجغرافيا'];
  END IF;

  IF v_category = 'math' THEN
    IF v_stage = 'preparatory' THEN
      RETURN ARRAY['الجبر','الهندسة'];
    END IF;

    IF v_stage = 'secondary' AND v_grade = 'first' THEN
      RETURN ARRAY['الرياضيات','الجبر','الهندسة','حساب المثلثات'];
    END IF;

    IF v_stage = 'secondary' AND v_grade = 'second' THEN
      RETURN ARRAY['الرياضيات','الجبر','حساب المثلثات','الهندسة التحليلية'];
    END IF;

    IF v_stage = 'secondary' AND v_grade = 'third' AND v_section = 'scientific' THEN
      RETURN ARRAY['الجبر','الهندسة الفراغية','التفاضل والتكامل','الاستاتيكا','الديناميكا'];
    END IF;

    RETURN ARRAY['الرياضيات'];
  END IF;

  RETURN ARRAY[]::text[];
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_group_sub_subjects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subject record;
  v_defaults text[];
BEGIN
  SELECT id, category, stage, grade, section, name
  INTO v_subject
  FROM public.subjects
  WHERE id = NEW.subject_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_defaults := public.get_default_sub_subject_names(
    v_subject.category,
    v_subject.stage,
    v_subject.grade,
    v_subject.section,
    v_subject.name
  );

  IF coalesce(array_length(v_defaults, 1), 0) = 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.sub_subjects (group_id, name, order_index, created_by, is_active)
  SELECT NEW.id, sub_name, ord - 1, COALESCE(NEW.teacher_id, NEW.created_by), true
  FROM unnest(v_defaults) WITH ORDINALITY AS seeded(sub_name, ord)
  ON CONFLICT (group_id, name) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_group_sub_subjects ON public.content_groups;
CREATE TRIGGER trg_seed_group_sub_subjects
AFTER INSERT ON public.content_groups
FOR EACH ROW EXECUTE FUNCTION public.seed_group_sub_subjects();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_role public.app_role;
  student_code_val TEXT;
BEGIN
  user_role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'student');
  
  IF user_role NOT IN ('student', 'teacher') THEN
    user_role := 'student';
  END IF;
  
  IF user_role = 'student' THEN
     student_code_val := floor(random() * 100000)::text;
  ELSE
     student_code_val := NULL;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, phone, student_code, stage, grade, section)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    student_code_val,
    NEW.raw_user_meta_data->>'stage',
    NEW.raw_user_meta_data->>'grade',
    NEW.raw_user_meta_data->>'section'
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  PERFORM public.request_external_sync('auth');
  PERFORM public.request_external_sync('tables');

  RETURN NEW;
END;
$function$;
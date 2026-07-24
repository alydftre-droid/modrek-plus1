CREATE OR REPLACE FUNCTION public.content_effective_section(
  _content_target_section text,
  _content_subject_id uuid,
  _content_group_id uuid DEFAULT NULL::uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.normalize_content_section(_content_target_section)
$function$;

CREATE OR REPLACE FUNCTION public.exam_effective_section(
  _target_section text,
  _subject_id uuid,
  _group_id uuid DEFAULT NULL::uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.normalize_content_section(_target_section)
$function$;

CREATE OR REPLACE FUNCTION public.validate_and_normalize_content_targets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_group_edu text;
  v_subject_category text;
  v_subject_stage text;
  v_teacher_edu text;
  v_category_lower text;
BEGIN
  IF COALESCE(NEW.type, '') = 'student_library' THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_valid_target_education_type(NEW.education_type) THEN
    RAISE EXCEPTION 'Invalid content education_type target: %', NEW.education_type
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_valid_target_section(NEW.target_section) THEN
    RAISE EXCEPTION 'Invalid content target_section: %', NEW.target_section
      USING ERRCODE = '22023';
  END IF;

  NEW.education_type := public.normalize_content_education_type(NEW.education_type);
  NEW.target_section := public.normalize_content_section(NEW.target_section);

  IF NEW.group_id IS NOT NULL THEN
    SELECT public.normalize_content_education_type(cg.education_type)
    INTO v_group_edu
    FROM public.content_groups cg
    WHERE cg.id = NEW.group_id;

    IF v_group_edu IS NOT NULL THEN
      IF NEW.education_type IS NULL THEN
        NEW.education_type := v_group_edu;
      ELSIF NEW.education_type <> v_group_edu THEN
        RAISE EXCEPTION 'Content target education_type (%) conflicts with group target (%)', NEW.education_type, v_group_edu
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  IF NEW.subject_id IS NOT NULL THEN
    SELECT s.category, s.stage
    INTO v_subject_category, v_subject_stage
    FROM public.subjects s
    WHERE s.id = NEW.subject_id;
  END IF;

  v_category_lower := lower(coalesce(v_subject_category, ''));

  IF v_subject_stage = 'secondary'
     AND (v_category_lower IN ('arabic', 'sharia', 'religious') OR v_category_lower LIKE '%عرب%' OR v_category_lower LIKE '%شرع%')
     AND NEW.education_type IS NULL THEN
    SELECT public.normalize_content_education_type(tr.education_type)
    INTO v_teacher_edu
    FROM public.teacher_requests tr
    WHERE tr.user_id = NEW.uploaded_by
      AND public.normalize_content_education_type(tr.education_type) IN ('عام', 'أزهر')
    LIMIT 1;

    IF v_teacher_edu IS NOT NULL THEN
      NEW.education_type := v_teacher_edu;
    ELSE
      RAISE EXCEPTION 'Arabic/Sharia secondary content must have a specific education_type target'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_content_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  subject_rec RECORD;
  v_group_title TEXT;
  v_group_subject_id UUID;
  v_group_teacher_id UUID;
  v_group_created_by UUID;
  v_group_education_type TEXT;
  v_group_section_name TEXT;
  teacher_name TEXT;
  sub_name TEXT;
  resolved_sub_subject_id UUID;
  scope_name TEXT;
  content_label TEXT;
  content_word TEXT;
  target_education TEXT;
  target_section TEXT;
  target_link TEXT;
  category_variants TEXT[] := '{}'::text[];
  candidate_count INTEGER := 0;
  eligible_count INTEGER := 0;
  inserted_count INTEGER := 0;
  duplicate_count INTEGER := 0;
  v_error TEXT;
  v_state TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.is_active, true) IS NOT TRUE OR COALESCE(OLD.is_active, true) IS TRUE THEN
      INSERT INTO public.notification_delivery_logs (
        user_id, source_table, source_id, notification_type, event_type,
        delivery_channel, status, title, body, link, details
      ) VALUES (
        NEW.uploaded_by, 'content', NEW.id, NEW.type, 'content_notification_skipped',
        'database', 'skipped', NEW.title, 'content update did not activate a previously inactive item', NULL,
        jsonb_build_object('reason', 'update_not_activation', 'operation', TG_OP, 'is_active', NEW.is_active)
      );
      RETURN NEW;
    END IF;
  ELSIF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notification_delivery_logs (
    user_id, source_table, source_id, notification_type, event_type,
    delivery_channel, status, title, body, link, details
  ) VALUES (
    NEW.uploaded_by, 'content', NEW.id, NEW.type, 'content_notification_started',
    'database', 'queued', NEW.title, NULL, NULL,
    jsonb_build_object(
      'operation', TG_OP,
      'content_id', NEW.id,
      'subject_id', NEW.subject_id,
      'group_id', NEW.group_id,
      'sub_subject_id', NEW.sub_subject_id,
      'sub_subject', NEW.sub_subject,
      'education_type', NEW.education_type,
      'target_section', NEW.target_section,
      'is_active', NEW.is_active,
      'term', NEW.term
    )
  );

  IF COALESCE(NEW.is_active, true) IS NOT TRUE THEN
    INSERT INTO public.notification_delivery_logs (
      user_id, source_table, source_id, notification_type, event_type,
      delivery_channel, status, title, body, link, details
    ) VALUES (
      NEW.uploaded_by, 'content', NEW.id, NEW.type, 'content_notification_skipped',
      'database', 'skipped', NEW.title, NULL, NULL,
      jsonb_build_object('reason', 'inactive_content')
    );
    RETURN NEW;
  END IF;

  IF NEW.type NOT IN ('video', 'pdf', 'summary', 'exam') THEN
    INSERT INTO public.notification_delivery_logs (
      user_id, source_table, source_id, notification_type, event_type,
      delivery_channel, status, title, body, link, details
    ) VALUES (
      NEW.uploaded_by, 'content', NEW.id, NEW.type, 'content_notification_skipped',
      'database', 'skipped', NEW.title, NULL, NULL,
      jsonb_build_object('reason', 'unsupported_content_type', 'type', NEW.type)
    );
    RETURN NEW;
  END IF;

  IF NEW.uploaded_by IS NULL OR NEW.subject_id IS NULL THEN
    INSERT INTO public.notification_delivery_logs (
      user_id, source_table, source_id, notification_type, event_type,
      delivery_channel, status, title, body, link, details
    ) VALUES (
      NEW.uploaded_by, 'content', NEW.id, NEW.type, 'content_notification_skipped',
      'database', 'skipped', NEW.title, NULL, NULL,
      jsonb_build_object('reason', 'missing_uploaded_by_or_subject', 'uploaded_by', NEW.uploaded_by, 'subject_id', NEW.subject_id)
    );
    RETURN NEW;
  END IF;

  SELECT id, name, category, stage, grade, section
  INTO subject_rec
  FROM public.subjects
  WHERE id = NEW.subject_id;

  IF NOT FOUND THEN
    INSERT INTO public.notification_delivery_logs (
      user_id, source_table, source_id, notification_type, event_type,
      delivery_channel, status, title, body, link, details
    ) VALUES (
      NEW.uploaded_by, 'content', NEW.id, NEW.type, 'content_notification_skipped',
      'database', 'skipped', NEW.title, NULL, NULL,
      jsonb_build_object('reason', 'subject_missing', 'subject_id', NEW.subject_id)
    );
    RETURN NEW;
  END IF;

  IF NEW.group_id IS NOT NULL THEN
    SELECT title, subject_id, teacher_id, created_by, education_type, section_name
    INTO v_group_title, v_group_subject_id, v_group_teacher_id, v_group_created_by, v_group_education_type, v_group_section_name
    FROM public.content_groups
    WHERE id = NEW.group_id;

    IF NOT FOUND THEN
      INSERT INTO public.notification_delivery_logs (
        user_id, source_table, source_id, notification_type, event_type,
        delivery_channel, status, title, body, link, details
      ) VALUES (
        NEW.uploaded_by, 'content', NEW.id, NEW.type, 'content_notification_skipped',
        'database', 'skipped', NEW.title, NULL, NULL,
        jsonb_build_object('reason', 'group_missing', 'group_id', NEW.group_id)
      );
      RETURN NEW;
    END IF;
  END IF;

  SELECT COALESCE(NULLIF(full_name, ''), 'المعلم')
  INTO teacher_name
  FROM public.profiles
  WHERE id = NEW.uploaded_by;
  teacher_name := COALESCE(teacher_name, 'المعلم');

  resolved_sub_subject_id := NEW.sub_subject_id;

  IF resolved_sub_subject_id IS NOT NULL THEN
    SELECT NULLIF(name, '')
    INTO sub_name
    FROM public.sub_subjects
    WHERE id = resolved_sub_subject_id;
  ELSIF NEW.group_id IS NOT NULL AND NULLIF(NEW.sub_subject, '') IS NOT NULL THEN
    SELECT id, NULLIF(name, '')
    INTO resolved_sub_subject_id, sub_name
    FROM public.sub_subjects
    WHERE group_id = NEW.group_id
      AND trim(name) = trim(NEW.sub_subject)
    ORDER BY COALESCE(is_active, true) DESC, order_index NULLS LAST, created_at
    LIMIT 1;
  END IF;

  sub_name := COALESCE(NULLIF(sub_name, ''), NULLIF(NEW.sub_subject, ''));
  scope_name := COALESCE(sub_name, NULLIF(subject_rec.name, ''), 'المادة');

  content_label := CASE NEW.type
    WHEN 'video' THEN 'درس فيديو 🎥'
    WHEN 'pdf' THEN 'كتاب PDF 📚'
    WHEN 'summary' THEN 'ملخص 📝'
    WHEN 'exam' THEN 'امتحان 📋'
    ELSE 'محتوى جديد'
  END;

  content_word := CASE NEW.type
    WHEN 'video' THEN 'الفيديو'
    WHEN 'pdf' THEN 'الكتاب'
    WHEN 'summary' THEN 'الملخص'
    WHEN 'exam' THEN 'الامتحان'
    ELSE 'المحتوى'
  END;

  category_variants := ARRAY_REMOVE(ARRAY[
    subject_rec.category,
    subject_rec.name,
    trim(subject_rec.name),
    CASE WHEN subject_rec.name IS NOT NULL AND subject_rec.name LIKE 'ال%' THEN regexp_replace(subject_rec.name, '^ال', '') END,
    CASE WHEN subject_rec.name IS NOT NULL AND subject_rec.name NOT LIKE 'ال%' THEN 'ال' || subject_rec.name END,
    CASE WHEN subject_rec.category = 'math' THEN 'scientific' END,
    CASE WHEN subject_rec.category = 'math' THEN 'الرياضيات' END,
    CASE WHEN subject_rec.category = 'science' THEN 'scientific' END,
    CASE WHEN subject_rec.category = 'science' THEN 'العلوم' END,
    CASE WHEN subject_rec.category = 'arabic' THEN 'arabic' END,
    CASE WHEN subject_rec.category = 'arabic' THEN 'لغة عربية' END,
    CASE WHEN subject_rec.category = 'arabic' THEN 'اللغة العربية' END,
    CASE WHEN subject_rec.category IN ('sharia', 'religious') THEN 'religious' END,
    CASE WHEN subject_rec.category IN ('sharia', 'religious') THEN 'المواد الشرعية' END,
    CASE WHEN subject_rec.category IN ('studies', 'social') THEN 'social' END,
    CASE WHEN subject_rec.category IN ('studies', 'social') THEN 'الدراسات' END,
    CASE WHEN subject_rec.category = 'english' THEN 'english' END,
    CASE WHEN subject_rec.category = 'english' THEN 'الإنجليزية' END,
    CASE WHEN subject_rec.category = 'french' THEN 'french' END,
    CASE WHEN subject_rec.category = 'french' THEN 'الفرنسية' END,
    CASE WHEN subject_rec.category = 'literary' THEN 'literary' END,
    CASE WHEN subject_rec.category = 'literary' THEN 'أدبي' END,
    CASE WHEN subject_rec.category = 'literary' THEN 'المواد الأدبية' END
  ], NULL);

  target_education := public.normalize_content_education_type(COALESCE(NEW.education_type, v_group_education_type));
  target_section := public.normalize_content_section(NEW.target_section);

  target_link := '/student-subject?stage=' || subject_rec.stage ||
          '&grade=' || subject_rec.grade ||
          '&category=' || subject_rec.category ||
          '&subject_name=' || replace(COALESCE(subject_rec.name, subject_rec.category), ' ', '+');

  IF target_section IS NOT NULL THEN
    target_link := target_link || '&section=' || target_section;
  END IF;

  IF NEW.group_id IS NOT NULL THEN
    target_link := target_link || '&group_id=' || NEW.group_id::text;
  END IF;

  IF resolved_sub_subject_id IS NOT NULL THEN
    target_link := target_link || '&sub_subject_id=' || resolved_sub_subject_id::text;
  END IF;

  IF NEW.type <> 'exam' THEN
    target_link := target_link || '&content_id=' || NEW.id::text;
  ELSE
    target_link := '/student/exams';
  END IF;

  WITH raw_candidates AS (
    SELECT DISTINCT sgp.student_id
    FROM public.student_group_purchases sgp
    WHERE NEW.group_id IS NOT NULL
      AND sgp.group_id = NEW.group_id

    UNION

    SELECT DISTINCT stc.student_id
    FROM public.student_teacher_choices stc
    WHERE stc.teacher_id = NEW.uploaded_by
      AND stc.category = ANY(category_variants)
      AND stc.stage = subject_rec.stage
      AND stc.grade = subject_rec.grade
  )
  SELECT count(*) INTO candidate_count FROM raw_candidates;

  WITH raw_candidates AS (
    SELECT DISTINCT sgp.student_id
    FROM public.student_group_purchases sgp
    WHERE NEW.group_id IS NOT NULL
      AND sgp.group_id = NEW.group_id

    UNION

    SELECT DISTINCT stc.student_id
    FROM public.student_teacher_choices stc
    WHERE stc.teacher_id = NEW.uploaded_by
      AND stc.category = ANY(category_variants)
      AND stc.stage = subject_rec.stage
      AND stc.grade = subject_rec.grade
  ), eligible AS (
    SELECT DISTINCT p.id
    FROM raw_candidates rc
    JOIN public.profiles p ON p.id = rc.student_id
    WHERE COALESCE(p.is_banned, false) = false
      AND COALESCE(p.role, 'student') = 'student'
      AND COALESCE(p.is_test_account, false) = false
      AND (
        target_education IS NULL
        OR public.normalize_content_education_type(p.education_type) IS NULL
        OR public.normalize_content_education_type(p.education_type) = target_education
      )
      AND (
        target_section IS NULL
        OR public.normalize_content_section(p.section) IS NULL
        OR public.normalize_content_section(p.section) = target_section
      )
  )
  SELECT count(*) INTO eligible_count FROM eligible;

  WITH raw_candidates AS (
    SELECT DISTINCT sgp.student_id
    FROM public.student_group_purchases sgp
    WHERE NEW.group_id IS NOT NULL
      AND sgp.group_id = NEW.group_id

    UNION

    SELECT DISTINCT stc.student_id
    FROM public.student_teacher_choices stc
    WHERE stc.teacher_id = NEW.uploaded_by
      AND stc.category = ANY(category_variants)
      AND stc.stage = subject_rec.stage
      AND stc.grade = subject_rec.grade
  ), eligible AS (
    SELECT DISTINCT p.id
    FROM raw_candidates rc
    JOIN public.profiles p ON p.id = rc.student_id
    WHERE COALESCE(p.is_banned, false) = false
      AND COALESCE(p.role, 'student') = 'student'
      AND COALESCE(p.is_test_account, false) = false
      AND (
        target_education IS NULL
        OR public.normalize_content_education_type(p.education_type) IS NULL
        OR public.normalize_content_education_type(p.education_type) = target_education
      )
      AND (
        target_section IS NULL
        OR public.normalize_content_section(p.section) IS NULL
        OR public.normalize_content_section(p.section) = target_section
      )
  )
  INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent, created_by)
  SELECT
    e.id,
    content_label || ' - ' || scope_name,
    'قام الأستاذ ' || teacher_name || ' بإضافة ' || content_word || ' الجديد: "' || NEW.title || '" داخل ' || scope_name,
    NEW.type,
    target_link,
    false,
    true,
    NEW.uploaded_by
  FROM eligible e
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.user_id = e.id
      AND n.created_by = NEW.uploaded_by
      AND n.notification_type = NEW.type
      AND COALESCE(n.link, '') = target_link
      AND n.created_at >= now() - interval '15 minutes'
  );

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  duplicate_count := GREATEST(eligible_count - inserted_count, 0);

  INSERT INTO public.notification_delivery_logs (
    user_id, source_table, source_id, notification_type, event_type,
    delivery_channel, status, title, body, link, details
  ) VALUES (
    NEW.uploaded_by, 'content', NEW.id, NEW.type, 'content_notification_completed',
    'database', CASE WHEN inserted_count > 0 THEN 'success' ELSE 'skipped' END,
    NEW.title,
    'تمت معالجة إشعارات المحتوى',
    target_link,
    jsonb_build_object(
      'content_id', NEW.id,
      'subject_id', NEW.subject_id,
      'subject_name', subject_rec.name,
      'subject_category', subject_rec.category,
      'subject_stage', subject_rec.stage,
      'subject_grade', subject_rec.grade,
      'subject_section', subject_rec.section,
      'group_id', NEW.group_id,
      'group_title', v_group_title,
      'group_section', v_group_section_name,
      'target_education', target_education,
      'target_section', target_section,
      'sub_subject_id', resolved_sub_subject_id,
      'sub_subject_name', scope_name,
      'candidate_count', candidate_count,
      'eligible_count', eligible_count,
      'inserted_count', inserted_count,
      'duplicate_count', duplicate_count,
      'category_variants', category_variants,
      'link', target_link
    )
  );

  RAISE LOG 'content notification completed content_id=% candidates=% eligible=% inserted=% link=%', NEW.id, candidate_count, eligible_count, inserted_count, target_link;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT, v_state = RETURNED_SQLSTATE;

  INSERT INTO public.notification_delivery_logs (
    user_id, source_table, source_id, notification_type, event_type,
    delivery_channel, status, title, body, link, error_message, details
  ) VALUES (
    NEW.uploaded_by, 'content', NEW.id, NEW.type, 'content_notification_failed',
    'database', 'failed', NEW.title, 'فشل مسار إشعارات المحتوى', NULL, v_error,
    jsonb_build_object(
      'sqlstate', v_state,
      'operation', TG_OP,
      'content_id', NEW.id,
      'subject_id', NEW.subject_id,
      'group_id', NEW.group_id,
      'sub_subject_id', NEW.sub_subject_id,
      'education_type', NEW.education_type,
      'target_section', NEW.target_section
    )
  );

  RAISE WARNING 'content notification failed content_id=% sqlstate=% error=%', NEW.id, v_state, v_error;
  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
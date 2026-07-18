CREATE OR REPLACE FUNCTION public.trg_content_automation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  subject_rec RECORD;
  group_education_type TEXT;
  group_section_name TEXT;
  teacher_name TEXT;
  sub_name TEXT;
  resolved_sub_subject_id UUID;
  scope_name TEXT;
  content_label TEXT;
  content_word TEXT;
  target_education TEXT;
  target_section TEXT;
  link TEXT;
  scope_link TEXT;
  candidate_ids UUID[] := '{}'::uuid[];
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.is_active, true) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.type NOT IN ('video', 'pdf', 'summary', 'exam') THEN
    RETURN NEW;
  END IF;

  IF NEW.uploaded_by IS NULL OR NEW.subject_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, name, category, stage, grade, section
  INTO subject_rec
  FROM public.subjects
  WHERE id = NEW.subject_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.group_id IS NOT NULL THEN
    SELECT education_type, section_name
    INTO group_education_type, group_section_name
    FROM public.content_groups
    WHERE id = NEW.group_id;
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
      AND COALESCE(is_active, true) = true
      AND trim(name) = trim(NEW.sub_subject)
    ORDER BY order_index NULLS LAST, created_at
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

  target_education := NULLIF(COALESCE(NEW.education_type, group_education_type, ''), '');
  target_section := CASE
    WHEN lower(trim(COALESCE(group_section_name, subject_rec.section, ''))) IN ('scientific', 'علمي', 'علمي علوم', 'علمي رياضة') THEN 'scientific'
    WHEN lower(trim(COALESCE(group_section_name, subject_rec.section, ''))) IN ('literary', 'أدبي', 'ادبي') THEN 'literary'
    ELSE NULL
  END;

  link := '/student-subject?stage=' || subject_rec.stage ||
          '&grade=' || subject_rec.grade ||
          '&category=' || subject_rec.category ||
          '&subject_name=' || replace(subject_rec.name, ' ', '+');

  IF target_section IS NOT NULL THEN
    link := link || '&section=' || target_section;
  END IF;

  IF NEW.group_id IS NOT NULL THEN
    link := link || '&group_id=' || NEW.group_id::text;
  END IF;

  IF resolved_sub_subject_id IS NOT NULL THEN
    link := link || '&sub_subject_id=' || resolved_sub_subject_id::text;
  END IF;

  IF NEW.type <> 'exam' THEN
    link := link || '&content_id=' || NEW.id::text;
  ELSE
    link := '/student/exams';
  END IF;

  scope_link := CASE WHEN NEW.type = 'exam' THEN '/student/exams' ELSE regexp_replace(link, '&content_id=[^&]*', '') END;

  IF NEW.group_id IS NOT NULL THEN
    SELECT COALESCE(array_agg(DISTINCT student_id), '{}'::uuid[])
    INTO candidate_ids
    FROM public.student_group_purchases
    WHERE group_id = NEW.group_id;

    IF COALESCE(array_length(candidate_ids, 1), 0) = 0 THEN
      RETURN NEW;
    END IF;
  ELSE
    SELECT COALESCE(array_agg(DISTINCT student_id), '{}'::uuid[])
    INTO candidate_ids
    FROM public.subscriptions
    WHERE subject_id = NEW.subject_id
      AND is_active = true
      AND end_date > now()
      AND (teacher_id IS NULL OR teacher_id = NEW.uploaded_by);

    IF COALESCE(array_length(candidate_ids, 1), 0) = 0 THEN
      RETURN NEW;
    END IF;
  END IF;

  WITH eligible AS (
    SELECT DISTINCT p.id
    FROM public.profiles p
    WHERE p.id = ANY(candidate_ids)
      AND COALESCE(p.is_banned, false) = false
      AND COALESCE(p.role, 'student') = 'student'
      AND (
        target_education IS NULL
        OR p.education_type IS NULL
        OR lower(trim(p.education_type)) = lower(trim(target_education))
        OR (lower(trim(p.education_type)) IN ('عام', 'general', 'public') AND lower(trim(target_education)) IN ('عام', 'general', 'public'))
        OR (lower(trim(p.education_type)) IN ('أزهر', 'ازهر', 'azhar') AND lower(trim(target_education)) IN ('أزهر', 'ازهر', 'azhar'))
      )
      AND (
        target_section IS NULL
        OR p.section IS NULL
        OR (target_section = 'scientific' AND lower(trim(p.section)) IN ('scientific', 'علمي', 'علمي علوم', 'علمي رياضة'))
        OR (target_section = 'literary' AND lower(trim(p.section)) IN ('literary', 'أدبي', 'ادبي'))
      )
  ), recent AS (
    SELECT
      n.id AS notification_id,
      e.id AS user_id,
      COALESCE((substring(n.title from '\\(([0-9]+)\\)\\s*$'))::integer, 1) + 1 AS next_count
    FROM eligible e
    JOIN public.notifications n
      ON n.user_id = e.id
     AND n.created_by = NEW.uploaded_by
     AND n.notification_type = NEW.type
     AND n.is_read = false
     AND n.created_at >= now() - interval '10 minutes'
     AND COALESCE(n.link, '') LIKE scope_link || '%'
  ), updated AS (
    UPDATE public.notifications n
    SET
      title = CASE
        WHEN r.next_count > 1 THEN content_label || ' - ' || scope_name || ' (' || r.next_count::text || ')'
        ELSE content_label || ' - ' || scope_name
      END,
      message = CASE
        WHEN r.next_count > 1 THEN 'قام الأستاذ ' || teacher_name || ' بإضافة ' || r.next_count::text || ' عناصر جديدة داخل ' || scope_name || '. آخرها: "' || NEW.title || '"'
        ELSE 'قام الأستاذ ' || teacher_name || ' بإضافة ' || content_word || ' الجديد: "' || NEW.title || '" داخل ' || scope_name
      END,
      link = link,
      is_read = false,
      is_sent = true,
      created_at = now()
    FROM recent r
    WHERE n.id = r.notification_id
    RETURNING r.user_id
  )
  INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent, created_by)
  SELECT
    e.id,
    content_label || ' - ' || scope_name,
    'قام الأستاذ ' || teacher_name || ' بإضافة ' || content_word || ' الجديد: "' || NEW.title || '" داخل ' || scope_name,
    NEW.type,
    link,
    false,
    true,
    NEW.uploaded_by
  FROM eligible e
  WHERE NOT EXISTS (SELECT 1 FROM updated u WHERE u.user_id = e.id);

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_content_automation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_content_automation() TO service_role;
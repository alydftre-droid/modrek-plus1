CREATE OR REPLACE FUNCTION public.trg_content_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  subject_rec RECORD;
  group_rec RECORD;
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
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.is_active, true) IS NOT TRUE OR COALESCE(OLD.is_active, true) IS TRUE THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP <> 'INSERT' THEN
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
    RAISE LOG 'content notification skipped: subject missing content_id=% subject=%', NEW.id, NEW.subject_id;
    RETURN NEW;
  END IF;

  IF NEW.group_id IS NOT NULL THEN
    SELECT id, title, subject_id, teacher_id, created_by, education_type, section_name
    INTO group_rec
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
    CASE WHEN subject_rec.category = 'math' THEN 'scientific' END,
    CASE WHEN subject_rec.category = 'math' THEN 'الرياضيات' END,
    CASE WHEN subject_rec.category = 'science' THEN 'scientific' END,
    CASE WHEN subject_rec.category = 'science' THEN 'العلوم' END,
    CASE WHEN subject_rec.category = 'arabic' THEN 'لغة عربية' END,
    CASE WHEN subject_rec.category = 'arabic' THEN 'اللغة العربية' END,
    CASE WHEN subject_rec.category IN ('sharia', 'religious') THEN 'religious' END,
    CASE WHEN subject_rec.category IN ('sharia', 'religious') THEN 'المواد الشرعية' END,
    CASE WHEN subject_rec.category IN ('studies', 'social') THEN 'social' END,
    CASE WHEN subject_rec.category IN ('studies', 'social') THEN 'الدراسات' END,
    CASE WHEN subject_rec.category = 'english' THEN 'الإنجليزية' END,
    CASE WHEN subject_rec.category = 'french' THEN 'الفرنسية' END,
    CASE WHEN subject_rec.category = 'literary' THEN 'أدبي' END,
    CASE WHEN subject_rec.category = 'literary' THEN 'المواد الأدبية' END
  ], NULL);

  target_education := NULLIF(COALESCE(NEW.education_type, group_rec.education_type, ''), '');
  target_education := CASE
    WHEN lower(trim(target_education)) IN ('both', 'all', 'none', 'null', 'الكل', 'كلاهما') THEN NULL
    ELSE target_education
  END;

  target_section := CASE
    WHEN lower(trim(COALESCE(group_rec.section_name, subject_rec.section, ''))) IN ('scientific', 'علمي', 'علمي علوم', 'علمي رياضة', 'علم') THEN 'scientific'
    WHEN lower(trim(COALESCE(group_rec.section_name, subject_rec.section, ''))) IN ('literary', 'أدبي', 'ادبي') THEN 'literary'
    ELSE NULL
  END;

  target_link := '/student-subject?stage=' || subject_rec.stage ||
          '&grade=' || subject_rec.grade ||
          '&category=' || subject_rec.category ||
          '&subject_name=' || replace(subject_rec.name, ' ', '+');

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
  ), eligible AS (
    SELECT DISTINCT p.id
    FROM raw_candidates rc
    JOIN public.profiles p ON p.id = rc.student_id
    WHERE COALESCE(p.is_banned, false) = false
      AND COALESCE(p.role, 'student') = 'student'
      AND COALESCE(p.is_test_account, false) = false
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
        OR (target_section = 'scientific' AND lower(trim(p.section)) IN ('scientific', 'علمي', 'علمي علوم', 'علمي رياضة', 'علم'))
        OR (target_section = 'literary' AND lower(trim(p.section)) IN ('literary', 'أدبي', 'ادبي'))
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

  RAISE LOG 'content notification processed content_id=% group=% subject=% target_link=%', NEW.id, NEW.group_id, NEW.subject_id, target_link;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trg_content_automation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_content_automation() TO service_role;
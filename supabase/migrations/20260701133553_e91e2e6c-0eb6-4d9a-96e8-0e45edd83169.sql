
-- ============ TEACHER ACTIVITY TRIGGERS ============

CREATE OR REPLACE FUNCTION public.log_teacher_content_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_teacher uuid;
  v_action text;
  v_label text;
  v_row record;
BEGIN
  IF TG_OP='DELETE' THEN v_row := OLD; ELSE v_row := NEW; END IF;
  v_teacher := v_row.uploaded_by;
  IF v_teacher IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP='INSERT' THEN
    v_action := 'content_created';
    v_label := CASE v_row.type WHEN 'video' THEN 'رفع فيديو جديد' WHEN 'pdf' THEN 'رفع ملف PDF' ELSE 'إضافة محتوى' END;
  ELSIF TG_OP='UPDATE' THEN
    v_action := 'content_updated'; v_label := 'تعديل محتوى';
  ELSE
    v_action := 'content_deleted'; v_label := 'حذف محتوى';
  END IF;

  INSERT INTO public.teacher_activity_logs(teacher_id, action_type, action_label, description, metadata)
  VALUES (v_teacher, v_action, v_label, v_row.title,
    jsonb_build_object('content_id', v_row.id, 'type', v_row.type, 'group_id', v_row.group_id, 'subject_id', v_row.subject_id));
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_log_teacher_content ON public.content;
CREATE TRIGGER trg_log_teacher_content
AFTER INSERT OR UPDATE OR DELETE ON public.content
FOR EACH ROW EXECUTE FUNCTION public.log_teacher_content_activity();

CREATE OR REPLACE FUNCTION public.log_teacher_exam_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_teacher uuid; v_action text; v_label text; v_row record;
BEGIN
  IF TG_OP='DELETE' THEN v_row := OLD; ELSE v_row := NEW; END IF;
  v_teacher := v_row.teacher_id;
  IF v_teacher IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP='INSERT' THEN v_action:='exam_created'; v_label:='إنشاء امتحان';
  ELSIF TG_OP='UPDATE' THEN v_action:='exam_updated'; v_label:='تعديل امتحان';
  ELSE v_action:='exam_deleted'; v_label:='حذف امتحان'; END IF;
  INSERT INTO public.teacher_activity_logs(teacher_id, action_type, action_label, description, metadata)
  VALUES(v_teacher, v_action, v_label, v_row.title,
    jsonb_build_object('exam_id', v_row.id, 'group_id', v_row.group_id, 'subject_id', v_row.subject_id));
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_log_teacher_exams ON public.exams;
CREATE TRIGGER trg_log_teacher_exams
AFTER INSERT OR UPDATE OR DELETE ON public.exams
FOR EACH ROW EXECUTE FUNCTION public.log_teacher_exam_activity();

CREATE OR REPLACE FUNCTION public.log_teacher_exam_question_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_teacher uuid; v_exam uuid; v_action text; v_label text; v_row record;
BEGIN
  IF TG_OP='DELETE' THEN v_row := OLD; ELSE v_row := NEW; END IF;
  SELECT teacher_id, id INTO v_teacher, v_exam FROM public.exams WHERE id = v_row.exam_id;
  IF v_teacher IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP='INSERT' THEN v_action:='question_added'; v_label:='إضافة سؤال';
  ELSIF TG_OP='UPDATE' THEN v_action:='question_updated'; v_label:='تعديل سؤال';
  ELSE v_action:='question_deleted'; v_label:='حذف سؤال'; END IF;
  INSERT INTO public.teacher_activity_logs(teacher_id, action_type, action_label, description, metadata)
  VALUES(v_teacher, v_action, v_label, left(COALESCE(v_row.question_text,''), 120),
    jsonb_build_object('question_id', v_row.id, 'exam_id', v_row.exam_id));
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_log_teacher_questions ON public.exam_questions;
CREATE TRIGGER trg_log_teacher_questions
AFTER INSERT OR UPDATE OR DELETE ON public.exam_questions
FOR EACH ROW EXECUTE FUNCTION public.log_teacher_exam_question_activity();

CREATE OR REPLACE FUNCTION public.log_teacher_group_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_teacher uuid; v_action text; v_label text; v_row record;
BEGIN
  IF TG_OP='DELETE' THEN v_row := OLD; ELSE v_row := NEW; END IF;
  v_teacher := COALESCE(v_row.teacher_id, v_row.created_by);
  IF v_teacher IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP='INSERT' THEN v_action:='group_created'; v_label:='إنشاء مجموعة';
  ELSIF TG_OP='UPDATE' THEN v_action:='group_updated'; v_label:='تعديل مجموعة';
  ELSE v_action:='group_deleted'; v_label:='حذف مجموعة'; END IF;
  INSERT INTO public.teacher_activity_logs(teacher_id, action_type, action_label, description, metadata)
  VALUES(v_teacher, v_action, v_label, v_row.title,
    jsonb_build_object('group_id', v_row.id, 'subject_id', v_row.subject_id, 'price', v_row.price));
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_log_teacher_groups ON public.content_groups;
CREATE TRIGGER trg_log_teacher_groups
AFTER INSERT OR UPDATE OR DELETE ON public.content_groups
FOR EACH ROW EXECUTE FUNCTION public.log_teacher_group_activity();

CREATE OR REPLACE FUNCTION public.log_teacher_earning_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.teacher_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.teacher_activity_logs(teacher_id, action_type, action_label, description, metadata)
  VALUES(NEW.teacher_id, 'earning_received', 'استلام أرباح',
    'تم إضافة عمولة',
    jsonb_build_object('amount', NEW.net_amount, 'source', NEW.source_type));
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_log_teacher_earnings ON public.teacher_earning_records;
CREATE TRIGGER trg_log_teacher_earnings
AFTER INSERT ON public.teacher_earning_records
FOR EACH ROW EXECUTE FUNCTION public.log_teacher_earning_activity();

-- ============ RPCs ============

CREATE OR REPLACE FUNCTION public.get_developer_teacher_students(_teacher_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR NOT has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row ORDER BY (row->>'last_activity') DESC NULLS LAST)
    FROM (
      SELECT jsonb_build_object(
        'student_id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'email', p.email,
        'phone', p.phone,
        'stage', p.stage,
        'grade', p.grade,
        'section', p.section,
        'student_code', p.student_code,
        'groups_count', (
          SELECT count(DISTINCT sgp.group_id)
          FROM public.student_group_purchases sgp
          JOIN public.content_groups cg ON cg.id = sgp.group_id
          WHERE sgp.student_id = p.id
            AND COALESCE(cg.teacher_id, cg.created_by) = _teacher_id
        ),
        'total_paid', COALESCE((
          SELECT SUM(sgp.amount_paid)
          FROM public.student_group_purchases sgp
          JOIN public.content_groups cg ON cg.id = sgp.group_id
          WHERE sgp.student_id = p.id
            AND COALESCE(cg.teacher_id, cg.created_by) = _teacher_id
        ),0),
        'exams_count', COALESCE((
          SELECT count(*) FROM public.exam_attempts a
          JOIN public.exams e ON e.id = a.exam_id
          WHERE a.student_id = p.id AND e.teacher_id = _teacher_id
            AND a.status IN ('submitted','graded')
        ),0),
        'avg_percentage', COALESCE((
          SELECT ROUND(AVG(a.percentage),2) FROM public.exam_attempts a
          JOIN public.exams e ON e.id = a.exam_id
          WHERE a.student_id = p.id AND e.teacher_id = _teacher_id
            AND a.status IN ('submitted','graded')
        ),0),
        'last_activity', (
          SELECT MAX(l.created_at) FROM public.student_activity_logs l
          WHERE l.student_id = p.id AND (l.teacher_id = _teacher_id OR l.teacher_id IS NULL)
        ),
        'first_purchase', (
          SELECT MIN(sgp.created_at)
          FROM public.student_group_purchases sgp
          JOIN public.content_groups cg ON cg.id = sgp.group_id
          WHERE sgp.student_id = p.id
            AND COALESCE(cg.teacher_id, cg.created_by) = _teacher_id
        )
      ) AS row
      FROM public.profiles p
      WHERE p.id IN (
        SELECT DISTINCT sgp.student_id
        FROM public.student_group_purchases sgp
        JOIN public.content_groups cg ON cg.id = sgp.group_id
        WHERE COALESCE(cg.teacher_id, cg.created_by) = _teacher_id
      )
    ) t
  ), '[]'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.get_developer_teacher_logs(_teacher_id uuid, _limit int DEFAULT 500)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR NOT has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at DESC)
    FROM (
      SELECT id, action_type, action_label, description, page_path,
             ip_address, device_type, browser, os, session_id,
             duration_seconds, metadata, created_at
      FROM public.teacher_activity_logs
      WHERE teacher_id = _teacher_id
      ORDER BY created_at DESC
      LIMIT _limit
    ) l
  ), '[]'::jsonb);
END; $$;

GRANT EXECUTE ON FUNCTION public.get_developer_teacher_students(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_logs(uuid, int) TO authenticated, service_role;

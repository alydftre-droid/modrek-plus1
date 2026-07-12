CREATE OR REPLACE FUNCTION public.log_exam_attempt_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_subject uuid;
  v_group uuid;
  v_teacher uuid;
  v_action text;
  v_old_status public.exam_attempt_status;
BEGIN
  SELECT subject_id, group_id, teacher_id INTO v_subject, v_group, v_teacher
  FROM public.exams WHERE id = NEW.exam_id;

  IF TG_OP = 'INSERT' THEN
    v_action := 'exam_started';
  ELSE
    v_old_status := OLD.status;
    IF NEW.status IN ('submitted','graded') AND (v_old_status IS NULL OR v_old_status NOT IN ('submitted','graded')) THEN
      v_action := 'exam_submitted';
    ELSIF NEW.status = 'expired' AND (v_old_status IS NULL OR v_old_status <> 'expired') THEN
      v_action := 'exam_expired';
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.student_activity_logs
    (student_id, action_type, action_label, subject_id, group_id, teacher_id, exam_id,
     metadata)
  VALUES
    (NEW.student_id, v_action,
     CASE v_action
       WHEN 'exam_started' THEN 'بدء امتحان'
       WHEN 'exam_submitted' THEN 'تسليم امتحان'
       WHEN 'exam_expired' THEN 'انتهاء وقت امتحان'
     END,
     v_subject, v_group, v_teacher, NEW.exam_id,
     jsonb_build_object(
       'attempt_id', NEW.id,
       'percentage', NEW.percentage,
       'total_score', NEW.total_score,
       'max_score', NEW.max_score
     ));
  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.log_exam_attempt_activity() TO service_role;
REVOKE EXECUTE ON FUNCTION public.log_exam_attempt_activity() FROM anon;
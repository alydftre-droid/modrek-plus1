CREATE OR REPLACE FUNCTION public.log_teacher_earning_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.teacher_id IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.teacher_activity_logs(
      teacher_id,
      action_type,
      action_label,
      description,
      metadata
    )
    VALUES(
      NEW.teacher_id,
      'earning_received',
      'استلام أرباح',
      'تم إضافة عمولة',
      jsonb_build_object(
        'amount', NEW.net_amount,
        'gross_amount', NEW.gross_amount,
        'commission_rate', NEW.commission_rate,
        'purchase_id', NEW.purchase_id,
        'group_id', NEW.group_id,
        'subject_id', NEW.subject_id,
        'student_id', NEW.student_id,
        'period_label', NEW.period_label,
        'source', 'group_purchase'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'log_teacher_earning_activity failed for earning %, teacher %: %', NEW.id, NEW.teacher_id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.log_teacher_earning_activity() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_teacher_earning_activity() TO service_role;
REVOKE EXECUTE ON FUNCTION public.log_teacher_earning_activity() FROM anon;
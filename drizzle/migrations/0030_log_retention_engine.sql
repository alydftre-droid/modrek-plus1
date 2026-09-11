CREATE OR REPLACE FUNCTION public.cleanup_processing_events()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE deleted integer;
BEGIN
  DELETE FROM public.processing_events WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS deleted = ROW_COUNT; RETURN deleted;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_library_processing_events()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE deleted integer;
BEGIN
  DELETE FROM public.library_processing_events WHERE created_at < now() - interval '14 days';
  GET DIAGNOSTICS deleted = ROW_COUNT; RETURN deleted;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_student_activity_logs()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE deleted integer;
BEGIN
  DELETE FROM public.student_activity_logs WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS deleted = ROW_COUNT; RETURN deleted;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_teacher_activity_logs()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE deleted integer;
BEGIN
  DELETE FROM public.teacher_activity_logs WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS deleted = ROW_COUNT; RETURN deleted;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_exam_attempt_debug_logs()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE deleted integer;
BEGIN
  DELETE FROM public.exam_attempt_debug_logs WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS deleted = ROW_COUNT; RETURN deleted;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_cron_job_run_details()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'cron'
AS $function$
DECLARE deleted integer;
BEGIN
  DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';
  GET DIAGNOSTICS deleted = ROW_COUNT; RETURN deleted;
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN RETURN 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.monitor_database_size()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE size_bytes bigint; size_mb numeric; sev text;
BEGIN
  SELECT pg_database_size(current_database()) INTO size_bytes;
  size_mb := round((size_bytes / 1024.0 / 1024.0)::numeric, 1);
  IF size_mb >= 440 THEN sev := 'critical';
  ELSIF size_mb >= 380 THEN sev := 'warning';
  ELSE RETURN jsonb_build_object('size_mb', size_mb, 'alert', false);
  END IF;
  INSERT INTO public.admin_monitoring_alerts (alert_type, severity, title, description, details)
  VALUES ('database_size', sev,
    CASE WHEN sev = 'critical' THEN 'حجم قاعدة البيانات قريب جدًا من الحد' ELSE 'حجم قاعدة البيانات مرتفع' END,
    'الحجم الحالي ' || size_mb || ' ميجابايت من حد 500 ميجابايت.',
    jsonb_build_object('size_mb', size_mb, 'limit_mb', 500, 'dedupe_key', sev || '-' || to_char(now(), 'YYYY-MM-DD')))
  ON CONFLICT (alert_type, (details ->> 'dedupe_key')) WHERE (details ->> 'dedupe_key') IS NOT NULL DO NOTHING;
  RETURN jsonb_build_object('size_mb', size_mb, 'alert', true, 'severity', sev);
END;
$function$;

REVOKE ALL ON FUNCTION public.cleanup_processing_events() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_library_processing_events() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_student_activity_logs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_teacher_activity_logs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_exam_attempt_debug_logs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_cron_job_run_details() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.monitor_database_size() FROM PUBLIC, anon, authenticated;
-- Cleanup helper functions (all SECURITY DEFINER with fixed search_path)
CREATE OR REPLACE FUNCTION public.cleanup_modrek_search_cache()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE deleted integer; BEGIN
  DELETE FROM public.modrek_search_cache WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS deleted = ROW_COUNT; RETURN deleted;
END; $$;
REVOKE ALL ON FUNCTION public.cleanup_modrek_search_cache() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_voice_answers()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE deleted integer; BEGIN
  DELETE FROM public.voice_answers WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS deleted = ROW_COUNT; RETURN deleted;
END; $$;
REVOKE ALL ON FUNCTION public.cleanup_voice_answers() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_modrek_search_logs()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE deleted integer; BEGIN
  DELETE FROM public.modrek_search_logs WHERE created_at < now() - interval '60 days';
  GET DIAGNOSTICS deleted = ROW_COUNT; RETURN deleted;
END; $$;
REVOKE ALL ON FUNCTION public.cleanup_modrek_search_logs() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_notification_delivery_logs()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE deleted integer; BEGIN
  DELETE FROM public.notification_delivery_logs WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS deleted = ROW_COUNT; RETURN deleted;
END; $$;
REVOKE ALL ON FUNCTION public.cleanup_notification_delivery_logs() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_ai_daily_usage()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE deleted integer; BEGIN
  DELETE FROM public.ai_daily_usage
  WHERE COALESCE(usage_date, (created_at)::date) < (now() - interval '180 days')::date;
  GET DIAGNOSTICS deleted = ROW_COUNT; RETURN deleted;
END; $$;
REVOKE ALL ON FUNCTION public.cleanup_ai_daily_usage() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_processing_jobs()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE deleted integer; BEGIN
  DELETE FROM public.processing_jobs
  WHERE created_at < now() - interval '30 days'
    AND status IN ('completed','failed','cancelled');
  GET DIAGNOSTICS deleted = ROW_COUNT; RETURN deleted;
END; $$;
REVOKE ALL ON FUNCTION public.cleanup_processing_jobs() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_student_activity_logs()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE deleted integer; BEGIN
  DELETE FROM public.student_activity_logs WHERE created_at < now() - interval '365 days';
  GET DIAGNOSTICS deleted = ROW_COUNT; RETURN deleted;
END; $$;
REVOKE ALL ON FUNCTION public.cleanup_student_activity_logs() FROM PUBLIC, anon, authenticated;

-- Schedule via pg_cron (unschedule prior versions first for idempotency)
DO $$
DECLARE jn text;
BEGIN
  FOR jn IN SELECT jobname FROM cron.job
    WHERE jobname IN (
      'mp_cleanup_modrek_search_cache','mp_cleanup_voice_answers',
      'mp_cleanup_modrek_search_logs','mp_cleanup_notification_delivery_logs',
      'mp_cleanup_ai_daily_usage','mp_cleanup_processing_jobs',
      'mp_cleanup_student_activity_logs'
    )
  LOOP PERFORM cron.unschedule(jn); END LOOP;
END $$;

SELECT cron.schedule('mp_cleanup_modrek_search_cache',       '15 3 * * *', $$SELECT public.cleanup_modrek_search_cache();$$);
SELECT cron.schedule('mp_cleanup_voice_answers',             '25 3 * * *', $$SELECT public.cleanup_voice_answers();$$);
SELECT cron.schedule('mp_cleanup_modrek_search_logs',        '35 3 * * *', $$SELECT public.cleanup_modrek_search_logs();$$);
SELECT cron.schedule('mp_cleanup_notification_delivery_logs','45 3 * * *', $$SELECT public.cleanup_notification_delivery_logs();$$);
SELECT cron.schedule('mp_cleanup_ai_daily_usage',            '55 3 * * *', $$SELECT public.cleanup_ai_daily_usage();$$);
SELECT cron.schedule('mp_cleanup_processing_jobs',           '05 4 * * *', $$SELECT public.cleanup_processing_jobs();$$);
SELECT cron.schedule('mp_cleanup_student_activity_logs',     '15 4 * * 0', $$SELECT public.cleanup_student_activity_logs();$$);

-- Indexes to keep cleanup queries fast
CREATE INDEX IF NOT EXISTS idx_modrek_search_cache_created_at    ON public.modrek_search_cache (created_at);
CREATE INDEX IF NOT EXISTS idx_voice_answers_created_at          ON public.voice_answers (created_at);
CREATE INDEX IF NOT EXISTS idx_modrek_search_logs_created_at     ON public.modrek_search_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_notif_delivery_logs_created_at    ON public.notification_delivery_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status_created_at ON public.processing_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS idx_student_activity_logs_created_at  ON public.student_activity_logs (created_at);
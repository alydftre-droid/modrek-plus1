REVOKE ALL ON public.admin_monitoring_alerts FROM anon;
REVOKE ALL ON public.ai_request_log FROM anon;
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.admin_monitoring_alerts FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.ai_request_log FROM authenticated;
GRANT SELECT, UPDATE ON public.admin_monitoring_alerts TO authenticated;
GRANT SELECT ON public.ai_request_log TO authenticated;
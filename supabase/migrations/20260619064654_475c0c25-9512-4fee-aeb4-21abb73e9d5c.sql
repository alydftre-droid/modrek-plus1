
-- 1) Mask stored push tokens in delivery logs (keep last 4 chars only)
UPDATE public.notification_delivery_logs
SET token = CASE
  WHEN token IS NULL OR length(token) <= 4 THEN token
  ELSE '****' || right(token, 4)
END
WHERE token IS NOT NULL AND token NOT LIKE '****%';

-- 2) Revoke EXECUTE from anon on SECURITY DEFINER function not meant to be public
REVOKE EXECUTE ON FUNCTION public.sync_exam_attempts_count(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_exam_attempts_count(uuid) TO authenticated, service_role;

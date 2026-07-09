
-- 1) Restrict the "publicly readable" teacher profiles policy to authenticated users
DROP POLICY IF EXISTS "Teacher profiles are publicly readable" ON public.profiles;
CREATE POLICY "Teacher profiles are readable by authenticated users"
ON public.profiles
FOR SELECT
TO authenticated
USING ((role = 'teacher'::text) AND (NOT is_test_student(id)));

-- 2) Revoke EXECUTE from anon and public on SECURITY DEFINER functions in public schema
REVOKE EXECUTE ON FUNCTION public.block_group_purchase_for_test_student() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.block_live_session_action_for_test_student() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.block_live_session_message_for_test_student() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.block_student_activity_log_for_test_student() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.block_teacher_choice_for_test_student() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.block_teacher_delivery_log_for_test_student() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.block_teacher_message_for_test_student() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.block_teacher_notification_for_test_student() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.modrek_extract_text_fallback(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.modrek_rescue_stuck_version(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_role_self_change() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.prevent_test_flag_tampering() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.trg_profile_automation_events() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.trg_teacher_request_automation() FROM anon, public;

NOTIFY pgrst, 'reload schema';

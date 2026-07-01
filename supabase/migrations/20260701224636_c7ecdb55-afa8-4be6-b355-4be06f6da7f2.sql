-- Restore Data API access grants required by the teacher-management dashboard.
-- These grants do not bypass RLS; existing policies still enforce row-level access.

GRANT SELECT ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teacher_activity_logs TO authenticated;
GRANT ALL ON TABLE public.teacher_activity_logs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teacher_withdrawal_requests TO authenticated;
GRANT ALL ON TABLE public.teacher_withdrawal_requests TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teacher_wallets TO authenticated;
GRANT ALL ON TABLE public.teacher_wallets TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teacher_wallet_transactions TO authenticated;
GRANT ALL ON TABLE public.teacher_wallet_transactions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teacher_earning_records TO authenticated;
GRANT ALL ON TABLE public.teacher_earning_records TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teacher_monthly_archives TO authenticated;
GRANT ALL ON TABLE public.teacher_monthly_archives TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teacher_profiles TO authenticated;
GRANT ALL ON TABLE public.teacher_profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.content_groups TO authenticated;
GRANT ALL ON TABLE public.content_groups TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.content TO authenticated;
GRANT ALL ON TABLE public.content TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_group_purchases TO authenticated;
GRANT ALL ON TABLE public.student_group_purchases TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subjects TO authenticated;
GRANT ALL ON TABLE public.subjects TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subscriptions TO authenticated;
GRANT ALL ON TABLE public.subscriptions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.video_progress TO authenticated;
GRANT ALL ON TABLE public.video_progress TO service_role;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_developer_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_logs(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_courses(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_wallet_monthly(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
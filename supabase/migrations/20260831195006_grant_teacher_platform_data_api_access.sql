GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teacher_platforms TO authenticated;
GRANT ALL ON TABLE public.teacher_platforms TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teacher_platform_subjects TO authenticated;
GRANT ALL ON TABLE public.teacher_platform_subjects TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_memberships TO authenticated;
GRANT ALL ON TABLE public.platform_memberships TO service_role;
NOTIFY pgrst, 'reload schema';
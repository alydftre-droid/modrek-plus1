GRANT SELECT ON public.demo_accounts TO authenticated;
GRANT SELECT ON public.demo_account_audit_logs TO authenticated;
GRANT ALL ON public.demo_accounts TO service_role;
GRANT ALL ON public.demo_account_audit_logs TO service_role;
NOTIFY pgrst, 'reload schema';
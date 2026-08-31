REVOKE ALL ON public.demo_accounts FROM anon;
REVOKE ALL ON public.demo_account_audit_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.demo_accounts FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.demo_account_audit_logs FROM authenticated;
NOTIFY pgrst, 'reload schema';
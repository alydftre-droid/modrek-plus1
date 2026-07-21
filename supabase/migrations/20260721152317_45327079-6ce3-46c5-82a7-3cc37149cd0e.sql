
REVOKE EXECUTE ON FUNCTION public.admin_financial_overview() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_teacher_wallets(text, int, int) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_teacher_monthly_statement(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_audit_logs(text, uuid, int, int) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_manual_wallet_action(uuid, text, numeric, text) FROM anon, PUBLIC;

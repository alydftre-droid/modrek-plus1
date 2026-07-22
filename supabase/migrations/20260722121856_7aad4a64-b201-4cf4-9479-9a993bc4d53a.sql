GRANT SELECT ON public.teacher_monthly_archives TO authenticated;
GRANT ALL ON public.teacher_monthly_archives TO service_role;

GRANT SELECT ON public.teacher_wallet_transactions TO authenticated;
GRANT ALL ON public.teacher_wallet_transactions TO service_role;

GRANT SELECT, INSERT ON public.teacher_wallets TO authenticated;
GRANT ALL ON public.teacher_wallets TO service_role;
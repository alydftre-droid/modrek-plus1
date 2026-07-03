REVOKE ALL ON FUNCTION public.block_earning_for_test_student() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.block_teacher_wallet_tx_for_test_student() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.block_earning_for_test_student() TO service_role;
GRANT EXECUTE ON FUNCTION public.block_teacher_wallet_tx_for_test_student() TO service_role;
NOTIFY pgrst, 'reload schema';
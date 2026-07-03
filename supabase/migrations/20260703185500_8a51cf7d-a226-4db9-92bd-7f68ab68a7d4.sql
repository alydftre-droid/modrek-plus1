
-- Reverse wallet balances for any historical positive credits tied to test students (metadata->student_id)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT twt.teacher_id, SUM(twt.amount) AS total
    FROM public.teacher_wallet_transactions twt
    WHERE twt.amount > 0
      AND (twt.metadata ? 'student_id')
      AND public.is_test_student((twt.metadata->>'student_id')::uuid)
    GROUP BY twt.teacher_id
  LOOP
    UPDATE public.teacher_wallets
       SET balance = GREATEST(0, COALESCE(balance,0) - r.total),
           updated_at = now()
     WHERE teacher_id = r.teacher_id;
  END LOOP;
END $$;

DELETE FROM public.teacher_wallet_transactions
 WHERE (metadata ? 'student_id')
   AND public.is_test_student((metadata->>'student_id')::uuid);

DELETE FROM public.teacher_earning_records
 WHERE public.is_test_student(student_id);

DELETE FROM public.student_group_purchases
 WHERE public.is_test_student(student_id);

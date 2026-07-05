-- Allow test students to actually create teacher choices & group purchases.
-- Previous BEFORE INSERT/UPDATE triggers returned NULL for test students,
-- silently discarding their subscriptions so the row never persisted.
-- Isolation from teachers is still guaranteed by:
--   * RLS policies filtering test students out of teacher-visible reads
--   * block triggers on teacher_earning_records / teacher_wallet_transactions
--     (so no commission is ever counted)
--   * block triggers on teacher_messages / notifications (so teachers get
--     no ping from a test student)

DROP TRIGGER IF EXISTS block_teacher_choice_test_student_trg ON public.student_teacher_choices;
DROP TRIGGER IF EXISTS block_group_purchase_test_student_trg ON public.student_group_purchases;

-- Keep the functions in place (harmless) but they are no longer wired to any trigger.
COMMENT ON FUNCTION public.block_teacher_choice_for_test_student() IS
  'Deprecated: previously blocked test students from selecting a teacher, which caused their own subscriptions to disappear. Isolation is now enforced via RLS + teacher-side triggers only.';
COMMENT ON FUNCTION public.block_group_purchase_for_test_student() IS
  'Deprecated: previously blocked test students from purchasing groups, which caused their own subscriptions to disappear. Isolation is now enforced via RLS + teacher-side triggers only.';
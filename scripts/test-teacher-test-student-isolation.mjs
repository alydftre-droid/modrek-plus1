import { spawnSync } from "node:child_process";

const dbUrl = process.env.EXTERNAL_SUPABASE_DB_URL || process.env.SUPABASE_DB_URL || "";

const fallbackRegressionSql = `
WITH regression AS (
  SELECT 'grade_all_students'::text AS scenario, COUNT(*)::bigint AS leaked_count
  FROM public.student_teacher_choices stc
  JOIN public.profiles p ON p.id = stc.student_id
  WHERE public.is_test_student(stc.student_id)
    AND stc.teacher_id IS NOT NULL

  UNION ALL
  SELECT 'grade_subscribed_students', COUNT(*)::bigint
  FROM public.student_group_purchases sgp
  JOIN public.content_groups cg ON cg.id = sgp.group_id
  JOIN public.profiles p ON p.id = sgp.student_id
  WHERE public.is_test_student(sgp.student_id)
    AND COALESCE(cg.teacher_id, cg.created_by) IS NOT NULL

  UNION ALL
  SELECT 'message_threads', COUNT(*)::bigint
  FROM public.teacher_messages tm
  JOIN public.profiles p ON p.id = tm.student_id
  WHERE public.is_test_student(tm.student_id)
    AND tm.teacher_id IS NOT NULL

  UNION ALL
  SELECT 'teacher_earnings', COUNT(*)::bigint
  FROM public.teacher_earning_records ter
  JOIN public.profiles p ON p.id = ter.student_id
  WHERE public.is_test_student(ter.student_id)
    AND ter.teacher_id IS NOT NULL

  UNION ALL
  SELECT 'teacher_wallet_transactions', COUNT(*)::bigint
  FROM public.teacher_wallet_transactions twt
  WHERE public.teacher_wallet_tx_is_for_test_student(twt.metadata)

  UNION ALL
  SELECT 'unflagged_legacy_named_test_accounts', COUNT(*)::bigint
  FROM public.profiles p
  WHERE COALESCE(p.role, '') = 'student'
    AND COALESCE(p.full_name, '') ILIKE '%تجريبي%'
    AND NOT public.is_test_student(p.id)
)
SELECT scenario, leaked_count
FROM regression
WHERE leaked_count <> 0
ORDER BY scenario;
`;

const sql = `
DO $$
BEGIN
  IF to_regprocedure('public.teacher_test_student_query_regression()') IS NULL THEN
    RAISE NOTICE 'teacher_test_student_query_regression() is missing; using inline regression query';
  END IF;
END $$;

WITH regression AS (
  SELECT *
  FROM public.teacher_test_student_query_regression()
)
SELECT scenario, leaked_count
FROM regression
WHERE leaked_count <> 0
ORDER BY scenario;
`;

function runPsql(statement) {
  const args = ["-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", statement];
  if (dbUrl) args.unshift(dbUrl);
  return spawnSync("psql", args, { encoding: "utf8" });
}

let result = runPsql(sql);

if (result.status !== 0 && /teacher_test_student_query_regression/.test(result.stderr || "")) {
  result = runPsql(fallbackRegressionSql);
}

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || "Regression query failed\n");
  process.exit(result.status ?? 1);
}

const leaks = result.stdout.trim();
if (leaks) {
  process.stderr.write(`Test-student teacher isolation regression failed:\n${leaks}\n`);
  process.exit(1);
}

console.log("Test-student teacher isolation regression passed: no test accounts in grade, messages, or earnings queries.");
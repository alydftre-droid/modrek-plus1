
REVOKE EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_student_exam_stats(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_exam_answer(uuid, uuid, uuid[], text, integer, boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_exam_leaderboard(uuid, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_exam_attempt(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_student_exam_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_exam_answer(uuid, uuid, uuid[], text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_leaderboard(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_exam_attempt(uuid) TO authenticated;

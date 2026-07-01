REVOKE ALL ON FUNCTION public.get_developer_student_exam_filter_options(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_developer_student_exam_filter_options(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_developer_student_exam_filter_options(uuid) TO authenticated;
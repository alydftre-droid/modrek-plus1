REVOKE ALL ON public.library_books FROM anon;
REVOKE ALL ON public.library_book_pages FROM anon;
REVOKE ALL ON public.library_book_sections FROM anon;
REVOKE ALL ON public.library_section_explanations FROM anon;
REVOKE ALL ON public.library_processing_jobs FROM anon;
REVOKE ALL ON public.library_book_index FROM anon;
REVOKE ALL ON public.library_book_chunks FROM anon;
REVOKE ALL ON public.library_book_conversations FROM anon;
REVOKE ALL ON public.library_conversation_messages FROM anon;
REVOKE ALL ON public.library_generated_quizzes FROM anon;
REVOKE ALL ON public.library_recommendations FROM anon;
REVOKE ALL ON public.library_student_book_progress FROM anon;
REVOKE ALL ON public.library_student_memory FROM anon;
REVOKE ALL ON public.library_student_weaknesses FROM anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.library_stages FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.library_grades FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.library_sections FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.library_tracks FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.library_subjects FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.library_sub_subjects FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.library_access_tiers FROM anon;

GRANT SELECT ON public.library_stages TO anon;
GRANT SELECT ON public.library_grades TO anon;
GRANT SELECT ON public.library_sections TO anon;
GRANT SELECT ON public.library_tracks TO anon;
GRANT SELECT ON public.library_subjects TO anon;
GRANT SELECT ON public.library_sub_subjects TO anon;
GRANT SELECT ON public.library_access_tiers TO anon;

NOTIFY pgrst, 'reload schema';
-- Root-cause fix: the library tables exist, but the Data API roles have no
-- table privileges in the live database. Without these GRANTs, PostgREST
-- reports "table not found in schema cache" even when the table exists.

GRANT SELECT ON public.library_access_tiers TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_access_tiers TO authenticated;
GRANT ALL ON public.library_access_tiers TO service_role;

GRANT SELECT ON public.library_stages TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_stages TO authenticated;
GRANT ALL ON public.library_stages TO service_role;

GRANT SELECT ON public.library_sections TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_sections TO authenticated;
GRANT ALL ON public.library_sections TO service_role;

GRANT SELECT ON public.library_grades TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_grades TO authenticated;
GRANT ALL ON public.library_grades TO service_role;

GRANT SELECT ON public.library_tracks TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_tracks TO authenticated;
GRANT ALL ON public.library_tracks TO service_role;

GRANT SELECT ON public.library_subjects TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_subjects TO authenticated;
GRANT ALL ON public.library_subjects TO service_role;

GRANT SELECT ON public.library_sub_subjects TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_sub_subjects TO authenticated;
GRANT ALL ON public.library_sub_subjects TO service_role;

GRANT SELECT ON public.library_books TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_books TO authenticated;
GRANT ALL ON public.library_books TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_book_pages TO authenticated;
GRANT ALL ON public.library_book_pages TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_book_sections TO authenticated;
GRANT ALL ON public.library_book_sections TO service_role;

GRANT SELECT ON public.library_book_chunks TO authenticated;
GRANT ALL ON public.library_book_chunks TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_book_index TO authenticated;
GRANT ALL ON public.library_book_index TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_section_explanations TO authenticated;
GRANT ALL ON public.library_section_explanations TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_generated_quizzes TO authenticated;
GRANT ALL ON public.library_generated_quizzes TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_student_book_progress TO authenticated;
GRANT ALL ON public.library_student_book_progress TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_book_conversations TO authenticated;
GRANT ALL ON public.library_book_conversations TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_conversation_messages TO authenticated;
GRANT ALL ON public.library_conversation_messages TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_recommendations TO authenticated;
GRANT ALL ON public.library_recommendations TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_student_memory TO authenticated;
GRANT ALL ON public.library_student_memory TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_student_weaknesses TO authenticated;
GRANT ALL ON public.library_student_weaknesses TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_processing_jobs TO authenticated;
GRANT ALL ON public.library_processing_jobs TO service_role;

GRANT EXECUTE ON FUNCTION public.sync_library_taxonomy_from_subjects() TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_library_book_processing(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_library_job(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.library_match_chunks(uuid, vector, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
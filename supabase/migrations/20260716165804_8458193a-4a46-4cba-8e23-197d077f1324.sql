REVOKE ALL ON FUNCTION public.validate_library_book_scope_before_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_library_book_scope_before_write() FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_library_book_scope_before_write() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_library_book_scope_before_write() TO service_role;
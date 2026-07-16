CREATE OR REPLACE FUNCTION public.validate_library_book_scope_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _subject record;
  _legacy record;
  _stage record;
  _grade record;
  _section record;
  _track record;
BEGIN
  IF NEW.subject_id IS NOT NULL THEN
    SELECT id, name, category, stage, grade, section, is_active
    INTO _subject
    FROM public.subjects
    WHERE id = NEW.subject_id;

    IF NOT FOUND THEN
      SELECT id, name_ar, code, source_subject_id
      INTO _legacy
      FROM public.library_subjects
      WHERE id = NEW.subject_id;

      RAISE EXCEPTION USING
        MESSAGE = 'library_debug.invalid_subject_id',
        DETAIL = jsonb_build_object(
          'file', 'supabase/migrations/validate_library_book_scope_before_write.sql',
          'function', 'validate_library_book_scope_before_write',
          'component', 'LibraryUploadPage',
          'api', 'library-admin?action=create',
          'table', 'library_books',
          'column', 'subject_id',
          'sent_value', NEW.subject_id,
          'expected_value', 'public.subjects.id فقط',
          'sent_value_found_in_subjects', false,
          'sent_value_found_in_library_subjects', FOUND,
          'legacy_subject_id', CASE WHEN FOUND THEN _legacy.id ELSE NULL END,
          'legacy_subject_name', CASE WHEN FOUND THEN _legacy.name_ar ELSE NULL END,
          'legacy_source_subject_id', CASE WHEN FOUND THEN _legacy.source_subject_id ELSE NULL END,
          'source_table_detected', CASE WHEN FOUND THEN 'public.library_subjects' ELSE 'unknown' END,
          'subject_lookup_sql', 'SELECT id, name, category, stage, grade, section, is_active FROM public.subjects WHERE id = $1',
          'legacy_lookup_sql', 'SELECT id, name_ar, code, source_subject_id FROM public.library_subjects WHERE id = $1',
          'insert_target_sql', 'INSERT INTO public.library_books (..., subject_id, ...) VALUES (..., $1, ...)',
          'failure_reason', CASE
            WHEN FOUND THEN 'legacy_library_subject_id_sent_to_library_books_subject_id'
            ELSE 'subject_id_not_found_in_public_subjects'
          END,
          'layer', 'database',
          'error_type', 'relationship_error'
        )::text;
    END IF;

    IF _subject.is_active IS NOT TRUE THEN
      RAISE EXCEPTION USING
        MESSAGE = 'library_debug.inactive_subject_id',
        DETAIL = jsonb_build_object(
          'function', 'validate_library_book_scope_before_write',
          'table', 'library_books',
          'column', 'subject_id',
          'sent_value', NEW.subject_id,
          'expected_value', 'public.subjects.id موجود وفعّال',
          'subject_name', _subject.name,
          'source_table_detected', 'public.subjects',
          'failure_reason', 'subject_is_inactive',
          'layer', 'database',
          'error_type', 'validation_error'
        )::text;
    END IF;
  END IF;

  IF NEW.stage_id IS NOT NULL THEN
    SELECT id, code, name_ar, is_active INTO _stage
    FROM public.library_stages
    WHERE id = NEW.stage_id;
    IF NOT FOUND OR _stage.is_active IS NOT TRUE THEN
      RAISE EXCEPTION USING
        MESSAGE = 'library_debug.invalid_stage_id',
        DETAIL = jsonb_build_object(
          'function', 'validate_library_book_scope_before_write',
          'table', 'library_books',
          'column', 'stage_id',
          'sent_value', NEW.stage_id,
          'expected_value', 'public.library_stages.id موجود وفعّال',
          'failure_reason', 'stage_not_found_or_inactive',
          'layer', 'database',
          'error_type', 'validation_error'
        )::text;
    END IF;
  END IF;

  IF NEW.grade_id IS NOT NULL THEN
    SELECT id, stage_id, code, name_ar, is_active INTO _grade
    FROM public.library_grades
    WHERE id = NEW.grade_id;
    IF NOT FOUND OR _grade.is_active IS NOT TRUE THEN
      RAISE EXCEPTION USING
        MESSAGE = 'library_debug.invalid_grade_id',
        DETAIL = jsonb_build_object(
          'function', 'validate_library_book_scope_before_write',
          'table', 'library_books',
          'column', 'grade_id',
          'sent_value', NEW.grade_id,
          'expected_value', 'public.library_grades.id موجود وفعّال',
          'failure_reason', 'grade_not_found_or_inactive',
          'layer', 'database',
          'error_type', 'validation_error'
        )::text;
    END IF;
    IF NEW.stage_id IS NOT NULL AND _grade.stage_id IS DISTINCT FROM NEW.stage_id THEN
      RAISE EXCEPTION USING
        MESSAGE = 'library_debug.invalid_grade_for_stage',
        DETAIL = jsonb_build_object(
          'function', 'validate_library_book_scope_before_write',
          'table', 'library_books',
          'column', 'grade_id',
          'sent_value', NEW.grade_id,
          'expected_value', 'صف تابع للمرحلة المحددة',
          'stage_id', NEW.stage_id,
          'actual_grade_stage_id', _grade.stage_id,
          'failure_reason', 'grade_does_not_belong_to_stage',
          'layer', 'database',
          'error_type', 'relationship_error'
        )::text;
    END IF;
  END IF;

  IF NEW.section_id IS NOT NULL THEN
    SELECT id, code, name_ar, is_active INTO _section
    FROM public.library_sections
    WHERE id = NEW.section_id;
    IF NOT FOUND OR _section.is_active IS NOT TRUE THEN
      RAISE EXCEPTION USING
        MESSAGE = 'library_debug.invalid_section_id',
        DETAIL = jsonb_build_object(
          'function', 'validate_library_book_scope_before_write',
          'table', 'library_books',
          'column', 'section_id',
          'sent_value', NEW.section_id,
          'expected_value', 'public.library_sections.id موجود وفعّال',
          'failure_reason', 'section_not_found_or_inactive',
          'layer', 'database',
          'error_type', 'validation_error'
        )::text;
    END IF;
  END IF;

  IF NEW.track_id IS NOT NULL THEN
    SELECT id, code, name_ar, is_active INTO _track
    FROM public.library_tracks
    WHERE id = NEW.track_id;
    IF NOT FOUND OR _track.is_active IS NOT TRUE THEN
      RAISE EXCEPTION USING
        MESSAGE = 'library_debug.invalid_track_id',
        DETAIL = jsonb_build_object(
          'function', 'validate_library_book_scope_before_write',
          'table', 'library_books',
          'column', 'track_id',
          'sent_value', NEW.track_id,
          'expected_value', 'public.library_tracks.id موجود وفعّال',
          'failure_reason', 'track_not_found_or_inactive',
          'layer', 'database',
          'error_type', 'validation_error'
        )::text;
    END IF;
  END IF;

  IF NEW.term IS NOT NULL AND NEW.term NOT IN ('annual', 'term1', 'term2') THEN
    RAISE EXCEPTION USING
      MESSAGE = 'library_debug.invalid_term',
      DETAIL = jsonb_build_object(
        'function', 'validate_library_book_scope_before_write',
        'table', 'library_books',
        'column', 'term',
        'sent_value', NEW.term,
        'expected_value', 'annual أو term1 أو term2',
        'failure_reason', 'unsupported_term_value',
        'layer', 'database',
        'error_type', 'validation_error'
      )::text;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_library_book_scope_before_write ON public.library_books;
CREATE TRIGGER trg_validate_library_book_scope_before_write
BEFORE INSERT OR UPDATE OF subject_id, stage_id, grade_id, section_id, track_id, term
ON public.library_books
FOR EACH ROW
EXECUTE FUNCTION public.validate_library_book_scope_before_write();

GRANT EXECUTE ON FUNCTION public.validate_library_book_scope_before_write() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_library_book_scope_before_write() TO service_role;
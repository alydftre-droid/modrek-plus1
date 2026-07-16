CREATE OR REPLACE FUNCTION public.validate_library_book_scope_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _exists boolean := false;
  _legacy record;
  _stage record;
  _grade record;
  _section record;
  _track record;
BEGIN
  IF NEW.subject_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.subjects s WHERE s.id = NEW.subject_id
    ) INTO _exists;

    IF NOT _exists THEN
      SELECT ls.id, ls.name_ar, ls.code, ls.source_subject_id
      INTO _legacy
      FROM public.library_subjects ls
      WHERE ls.id = NEW.subject_id;

      IF FOUND AND _legacy.source_subject_id IS NOT NULL THEN
        SELECT EXISTS (
          SELECT 1 FROM public.subjects s WHERE s.id = _legacy.source_subject_id
        ) INTO _exists;

        IF _exists THEN
          NEW.subject_id := _legacy.source_subject_id;
        ELSE
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
              'expected_value', 'public.subjects.id موجود وفعّال',
              'legacy_subject_id', _legacy.id,
              'legacy_subject_name', _legacy.name_ar,
              'legacy_source_subject_id', _legacy.source_subject_id,
              'failure_reason', 'legacy_source_subject_id_not_found_in_subjects',
              'layer', 'database',
              'error_type', 'validation_error'
            )::text;
        END IF;
      ELSE
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
            'expected_value', 'public.subjects.id أو public.library_subjects.id مرتبط بـ source_subject_id صحيح',
            'legacy_subject_found', FOUND,
            'legacy_subject_name', CASE WHEN FOUND THEN _legacy.name_ar ELSE NULL END,
            'legacy_source_subject_id', CASE WHEN FOUND THEN _legacy.source_subject_id ELSE NULL END,
            'failure_reason', CASE
              WHEN FOUND THEN 'legacy_library_subject_has_no_source_subject_id'
              ELSE 'subject_id_not_found_in_subjects_or_library_subjects'
            END,
            'layer', 'database',
            'error_type', 'validation_error'
          )::text;
      END IF;
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
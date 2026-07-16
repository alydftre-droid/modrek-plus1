CREATE OR REPLACE FUNCTION public.validate_library_book_scope_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _subject record;
  _stage record;
  _grade record;
  _section record;
  _track record;
  _track_code text := null;
  _subject_stage_code text;
  _subject_grade_code text;
  _subject_track_code text;
  _expected_track_code text := null;
  _subject_category text;
BEGIN
  IF NEW.subject_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'library_debug.missing_subject_id', DETAIL = jsonb_build_object('file','database:function:validate_library_book_scope_before_write','function','validate_library_book_scope_before_write','component','LibraryUploadPage','hook','React useState/useMemo → callAdmin','api','library-admin?action=create/update','table','library_books','column','subject_id','sent_value',NEW.subject_id,'expected_value','public.subjects.id موجود وفعّال','correct_value',null,'sql_query','SELECT id,name,category,stage,grade,section,is_active FROM public.subjects WHERE id = $1','query_result','not_executed_missing_value','failure_reason','subject_id_required','source_table','public.subjects','layer','database','error_type','validation_error')::text;
  END IF;

  SELECT id, name, category, stage, grade, section, is_active INTO _subject
  FROM public.subjects
  WHERE id = NEW.subject_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'library_debug.invalid_subject_id', DETAIL = jsonb_build_object('file','database:function:validate_library_book_scope_before_write','function','validate_library_book_scope_before_write','component','LibraryUploadPage','hook','React useState/useMemo → callAdmin','api','library-admin?action=create/update','table','library_books','column','subject_id','sent_value',NEW.subject_id,'expected_value','public.subjects.id فقط','correct_value',null,'sql_query','SELECT id,name,category,stage,grade,section,is_active FROM public.subjects WHERE id = $1','query_result','no_rows','failure_reason','subject_id_not_found_in_public_subjects','source_table','public.subjects','forbidden_source_table','public.library_subjects','insert_sql','INSERT INTO public.library_books (title, education_type, stage_id, grade_id, section_id, track_id, subject_id, ...) VALUES (...)','layer','database','error_type','relationship_error')::text;
  END IF;

  IF _subject.is_active IS NOT TRUE THEN
    RAISE EXCEPTION USING MESSAGE = 'library_debug.inactive_subject_id', DETAIL = jsonb_build_object('file','database:function:validate_library_book_scope_before_write','function','validate_library_book_scope_before_write','component','LibraryUploadPage','hook','React useState/useMemo → callAdmin','api','library-admin?action=create/update','table','library_books','column','subject_id','sent_value',NEW.subject_id,'expected_value','public.subjects.id فعّال','correct_value',_subject.id,'query_result',row_to_json(_subject),'failure_reason','subject_is_inactive','source_table','public.subjects','layer','database','error_type','validation_error')::text;
  END IF;

  _subject_stage_code := public.library_stage_code_from_subject(_subject.stage);
  _subject_grade_code := public.library_grade_code_from_subject(_subject.stage, _subject.grade);
  _subject_track_code := public.library_track_code_from_subject(_subject.section);
  _subject_category := lower(coalesce(_subject.category, ''));

  IF NEW.stage_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'library_debug.missing_stage_id', DETAIL = jsonb_build_object('file','database:function:validate_library_book_scope_before_write','function','validate_library_book_scope_before_write','component','LibraryUploadPage','hook','React useState/useMemo → callAdmin','api','library-admin?action=create/update','table','library_books','column','stage_id','sent_value',NEW.stage_id,'expected_value','public.library_stages.id موجود وفعّال','failure_reason','stage_id_required','layer','database','error_type','validation_error')::text;
  END IF;

  SELECT id, code, name_ar, is_active INTO _stage
  FROM public.library_stages
  WHERE id = NEW.stage_id;

  IF NOT FOUND OR _stage.is_active IS NOT TRUE THEN
    RAISE EXCEPTION USING MESSAGE = 'library_debug.invalid_stage_id', DETAIL = jsonb_build_object('file','database:function:validate_library_book_scope_before_write','function','validate_library_book_scope_before_write','component','LibraryUploadPage','hook','React useState/useMemo → callAdmin','api','library-admin?action=create/update','table','library_books','column','stage_id','sent_value',NEW.stage_id,'expected_value','public.library_stages.id موجود وفعّال','sql_query','SELECT id,code,name_ar,is_active FROM public.library_stages WHERE id = $1','query_result','no_rows_or_inactive','failure_reason','stage_not_found_or_inactive','layer','database','error_type','validation_error')::text;
  END IF;

  IF NEW.grade_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'library_debug.missing_grade_id', DETAIL = jsonb_build_object('file','database:function:validate_library_book_scope_before_write','function','validate_library_book_scope_before_write','component','LibraryUploadPage','hook','React useState/useMemo → callAdmin','api','library-admin?action=create/update','table','library_books','column','grade_id','sent_value',NEW.grade_id,'expected_value','public.library_grades.id موجود وفعّال','failure_reason','grade_id_required','layer','database','error_type','validation_error')::text;
  END IF;

  SELECT id, stage_id, code, name_ar, is_active INTO _grade
  FROM public.library_grades
  WHERE id = NEW.grade_id;

  IF NOT FOUND OR _grade.is_active IS NOT TRUE THEN
    RAISE EXCEPTION USING MESSAGE = 'library_debug.invalid_grade_id', DETAIL = jsonb_build_object('file','database:function:validate_library_book_scope_before_write','function','validate_library_book_scope_before_write','component','LibraryUploadPage','hook','React useState/useMemo → callAdmin','api','library-admin?action=create/update','table','library_books','column','grade_id','sent_value',NEW.grade_id,'expected_value','public.library_grades.id موجود وفعّال','sql_query','SELECT id,stage_id,code,name_ar,is_active FROM public.library_grades WHERE id = $1','query_result','no_rows_or_inactive','failure_reason','grade_not_found_or_inactive','layer','database','error_type','validation_error')::text;
  END IF;

  IF NEW.section_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'library_debug.missing_section_id', DETAIL = jsonb_build_object('file','database:function:validate_library_book_scope_before_write','function','validate_library_book_scope_before_write','component','LibraryUploadPage','hook','React useState/useMemo → callAdmin','api','library-admin?action=create/update','table','library_books','column','section_id','sent_value',NEW.section_id,'expected_value','public.library_sections.id موجود وفعّال','failure_reason','section_id_required','layer','database','error_type','validation_error')::text;
  END IF;

  SELECT id, code, name_ar, is_active INTO _section
  FROM public.library_sections
  WHERE id = NEW.section_id;

  IF NOT FOUND OR _section.is_active IS NOT TRUE THEN
    RAISE EXCEPTION USING MESSAGE = 'library_debug.invalid_section_id', DETAIL = jsonb_build_object('file','database:function:validate_library_book_scope_before_write','function','validate_library_book_scope_before_write','component','LibraryUploadPage','hook','React useState/useMemo → callAdmin','api','library-admin?action=create/update','table','library_books','column','section_id','sent_value',NEW.section_id,'expected_value','public.library_sections.id موجود وفعّال','sql_query','SELECT id,code,name_ar,is_active FROM public.library_sections WHERE id = $1','query_result','no_rows_or_inactive','failure_reason','section_not_found_or_inactive','layer','database','error_type','validation_error')::text;
  END IF;

  IF NEW.track_id IS NULL AND _subject_stage_code = 'secondary' AND coalesce(_subject_track_code, '') <> '' THEN
    SELECT id, code, name_ar, is_active INTO _track
    FROM public.library_tracks
    WHERE code = _subject_track_code AND is_active IS TRUE
    ORDER BY sort_order
    LIMIT 1;

    IF FOUND THEN
      NEW.track_id := _track.id;
      _track_code := _track.code;
    ELSE
      RAISE EXCEPTION USING MESSAGE = 'library_debug.missing_track_id', DETAIL = jsonb_build_object('file','database:function:validate_library_book_scope_before_write','function','validate_library_book_scope_before_write','component','LibraryUploadPage','hook','React useState/useMemo → callAdmin','api','library-admin?action=create/update','table','library_tracks','column','track_id','sent_value',NEW.track_id,'expected_value','شعبة فعّالة مطابقة لشعبة المادة الثانوية','correct_value',_subject_track_code,'sql_query','SELECT id,code,name_ar,is_active FROM public.library_tracks WHERE code = $1 AND is_active IS TRUE','failure_reason','track_id_required_for_secondary_subject','layer','database','error_type','relationship_error')::text;
    END IF;
  ELSIF NEW.track_id IS NOT NULL THEN
    SELECT id, code, name_ar, is_active INTO _track
    FROM public.library_tracks
    WHERE id = NEW.track_id;

    IF NOT FOUND OR _track.is_active IS NOT TRUE THEN
      RAISE EXCEPTION USING MESSAGE = 'library_debug.invalid_track_id', DETAIL = jsonb_build_object('file','database:function:validate_library_book_scope_before_write','function','validate_library_book_scope_before_write','component','LibraryUploadPage','hook','React useState/useMemo → callAdmin','api','library-admin?action=create/update','table','library_tracks','column','track_id','sent_value',NEW.track_id,'expected_value','public.library_tracks.id موجود وفعّال','sql_query','SELECT id,code,name_ar,is_active FROM public.library_tracks WHERE id = $1','query_result','no_rows_or_inactive','failure_reason','track_not_found_or_inactive','layer','database','error_type','validation_error')::text;
    END IF;
    _track_code := _track.code;
  END IF;

  _expected_track_code := CASE
    WHEN _track_code IN ('scientific', 'sci_science', 'sci_math') THEN 'scientific'
    WHEN _track_code = 'literary' THEN 'literary'
    ELSE _track_code
  END;

  IF _grade.stage_id IS DISTINCT FROM NEW.stage_id THEN
    RAISE EXCEPTION USING MESSAGE = 'library_debug.invalid_grade_for_stage', DETAIL = jsonb_build_object('file','database:function:validate_library_book_scope_before_write','function','validate_library_book_scope_before_write','component','LibraryUploadPage','hook','React useState/useMemo → callAdmin','api','library-admin?action=create/update','table','library_books','column','grade_id','sent_value',NEW.grade_id,'expected_value','صف تابع للمرحلة المحددة','correct_value',_grade.stage_id,'stage_id',NEW.stage_id,'actual_grade_stage_id',_grade.stage_id,'query_result',row_to_json(_grade),'failure_reason','grade_does_not_belong_to_stage','layer','database','error_type','relationship_error')::text;
  END IF;

  IF _subject_stage_code IS DISTINCT FROM _stage.code THEN
    RAISE EXCEPTION USING MESSAGE = 'library_debug.invalid_subject_for_stage', DETAIL = jsonb_build_object('file','database:function:validate_library_book_scope_before_write','function','validate_library_book_scope_before_write','component','LibraryUploadPage','hook','React useState/useMemo → callAdmin','api','library-admin?action=create/update','table','library_books','column','subject_id','sent_value',NEW.subject_id,'expected_value','مادة تابعة للمرحلة المحددة','correct_value',_subject.id,'selected_stage_code',_stage.code,'subject_stage_code',_subject_stage_code,'query_result',row_to_json(_subject),'failure_reason','subject_stage_mismatch','source_table','public.subjects','layer','database','error_type','relationship_error')::text;
  END IF;

  IF _subject_grade_code IS DISTINCT FROM _grade.code THEN
    RAISE EXCEPTION USING MESSAGE = 'library_debug.invalid_subject_for_grade', DETAIL = jsonb_build_object('file','database:function:validate_library_book_scope_before_write','function','validate_library_book_scope_before_write','component','LibraryUploadPage','hook','React useState/useMemo → callAdmin','api','library-admin?action=create/update','table','library_books','column','subject_id','sent_value',NEW.subject_id,'expected_value','مادة تابعة للصف المحدد','correct_value',_subject.id,'selected_grade_code',_grade.code,'subject_grade_code',_subject_grade_code,'query_result',row_to_json(_subject),'failure_reason','subject_grade_mismatch','source_table','public.subjects','layer','database','error_type','relationship_error')::text;
  END IF;

  IF _section.code = 'general' AND _subject_category IN ('sharia', 'religious') THEN
    RAISE EXCEPTION USING MESSAGE = 'library_debug.invalid_general_subject_category', DETAIL = jsonb_build_object('file','database:function:validate_library_book_scope_before_write','function','validate_library_book_scope_before_write','component','LibraryUploadPage','hook','React useState/useMemo → callAdmin','api','library-admin?action=create/update','table','library_books','column','subject_id','sent_value',NEW.subject_id,'expected_value','مادة غير شرعية عند اختيار النظام العام','correct_value',_subject.id,'subject_category',_subject_category,'selected_section_code',_section.code,'query_result',row_to_json(_subject),'failure_reason','general_section_cannot_use_sharia_subject','source_table','public.subjects','layer','database','error_type','relationship_error')::text;
  END IF;

  IF NEW.track_id IS NOT NULL AND coalesce(_subject_track_code, '') <> '' AND _subject_track_code IS DISTINCT FROM _expected_track_code THEN
    RAISE EXCEPTION USING MESSAGE = 'library_debug.invalid_subject_for_track', DETAIL = jsonb_build_object('file','database:function:validate_library_book_scope_before_write','function','validate_library_book_scope_before_write','component','LibraryUploadPage','hook','React useState/useMemo → callAdmin','api','library-admin?action=create/update','table','library_books','column','subject_id','sent_value',NEW.subject_id,'expected_value','مادة تابعة للشعبة المحددة','correct_value',_subject.id,'selected_track_code',_track_code,'expected_source_track_code',_expected_track_code,'subject_track_code',_subject_track_code,'query_result',row_to_json(_subject),'failure_reason','subject_track_mismatch','source_table','public.subjects','layer','database','error_type','relationship_error')::text;
  END IF;

  IF NEW.track_id IS NOT NULL AND _track_code = 'sci_science' AND coalesce(_subject.name, '') LIKE '%رياضيات%' THEN
    RAISE EXCEPTION USING MESSAGE = 'library_debug.invalid_subject_for_sci_science_track', DETAIL = jsonb_build_object('file','database:function:validate_library_book_scope_before_write','function','validate_library_book_scope_before_write','component','LibraryUploadPage','hook','React useState/useMemo → callAdmin','api','library-admin?action=create/update','table','library_books','column','subject_id','sent_value',NEW.subject_id,'expected_value','مادة علمي علوم وليست رياضيات','correct_value',_subject.id,'subject_name',_subject.name,'selected_track_code',_track_code,'failure_reason','sci_science_track_cannot_use_math_subject','source_table','public.subjects','layer','database','error_type','relationship_error')::text;
  END IF;

  IF NEW.track_id IS NOT NULL AND _track_code = 'sci_math' AND (coalesce(_subject.name, '') LIKE '%أحياء%' OR coalesce(_subject.name, '') LIKE '%احياء%' OR coalesce(_subject.name, '') LIKE '%الأحياء%') THEN
    RAISE EXCEPTION USING MESSAGE = 'library_debug.invalid_subject_for_sci_math_track', DETAIL = jsonb_build_object('file','database:function:validate_library_book_scope_before_write','function','validate_library_book_scope_before_write','component','LibraryUploadPage','hook','React useState/useMemo → callAdmin','api','library-admin?action=create/update','table','library_books','column','subject_id','sent_value',NEW.subject_id,'expected_value','مادة علمي رياضة وليست أحياء','correct_value',_subject.id,'subject_name',_subject.name,'selected_track_code',_track_code,'failure_reason','sci_math_track_cannot_use_biology_subject','source_table','public.subjects','layer','database','error_type','relationship_error')::text;
  END IF;

  IF NEW.term IS NULL OR NEW.term NOT IN ('annual', 'term1', 'term2') THEN
    RAISE EXCEPTION USING MESSAGE = 'library_debug.invalid_term', DETAIL = jsonb_build_object('file','database:function:validate_library_book_scope_before_write','function','validate_library_book_scope_before_write','component','LibraryUploadPage','hook','React useState/useMemo → callAdmin','api','library-admin?action=create/update','table','library_books','column','term','sent_value',NEW.term,'expected_value','annual أو term1 أو term2','failure_reason','term_required_or_unsupported','layer','database','error_type','validation_error')::text;
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_library_book_scope_before_write() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_library_book_scope_before_write() TO service_role;

NOTIFY pgrst, 'reload schema';
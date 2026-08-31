-- =========================================================
-- Teacher Platforms — Phase 5: backend/database tenant isolation
-- RESTRICTIVE policies so existing business logic is untouched
-- and tenant isolation is always ANDed. Official platform == NULL.
-- =========================================================

ALTER TABLE public.library_books     ADD COLUMN IF NOT EXISTS platform_id UUID REFERENCES public.teacher_platforms(id) ON DELETE SET NULL;
ALTER TABLE public.knowledge_sources ADD COLUMN IF NOT EXISTS platform_id UUID REFERENCES public.teacher_platforms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_library_books_platform ON public.library_books(platform_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_platform ON public.knowledge_sources(platform_id);

UPDATE public.library_books SET platform_id = public.user_platform_id(created_by)
 WHERE platform_id IS NULL AND created_by IS NOT NULL;
UPDATE public.knowledge_sources SET platform_id = public.user_platform_id(created_by)
 WHERE platform_id IS NULL AND created_by IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_row_platform_from_creator()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.platform_id IS NULL THEN
    NEW.platform_id := COALESCE(public.user_platform_id(auth.uid()), public.user_platform_id(NEW.created_by));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_library_books_platform ON public.library_books;
CREATE TRIGGER trg_library_books_platform BEFORE INSERT ON public.library_books
  FOR EACH ROW EXECUTE FUNCTION public.set_row_platform_from_creator();

DROP TRIGGER IF EXISTS trg_knowledge_sources_platform ON public.knowledge_sources;
CREATE TRIGGER trg_knowledge_sources_platform BEFORE INSERT ON public.knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_row_platform_from_creator();

-- ---------- isolation predicates ----------
CREATE OR REPLACE FUNCTION public.platform_actor_ok(_owner UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NULL
      OR public.has_role(auth.uid(), 'admin')
      OR _owner IS NULL
      OR public.user_platform_id(_owner) IS NOT DISTINCT FROM public.user_platform_id(auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.platform_row_ok(_platform_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NULL
      OR public.has_role(auth.uid(), 'admin')
      OR _platform_id IS NOT DISTINCT FROM public.user_platform_id(auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.platform_group_ok(_group_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _group_id IS NULL OR public.platform_actor_ok(
    (SELECT COALESCE(cg.teacher_id, cg.created_by) FROM public.content_groups cg WHERE cg.id = _group_id))
$$;

CREATE OR REPLACE FUNCTION public.platform_exam_ok(_exam_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _exam_id IS NULL OR public.platform_actor_ok(
    (SELECT e.teacher_id FROM public.exams e WHERE e.id = _exam_id))
$$;

CREATE OR REPLACE FUNCTION public.platform_question_ok(_question_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _question_id IS NULL OR public.platform_exam_ok(
    (SELECT q.exam_id FROM public.exam_questions q WHERE q.id = _question_id))
$$;

CREATE OR REPLACE FUNCTION public.platform_attempt_ok(_attempt_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _attempt_id IS NULL OR public.platform_exam_ok(
    (SELECT a.exam_id FROM public.exam_attempts a WHERE a.id = _attempt_id))
$$;

CREATE OR REPLACE FUNCTION public.platform_content_ok(_content_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _content_id IS NULL OR public.platform_actor_ok(
    (SELECT c.uploaded_by FROM public.content c WHERE c.id = _content_id))
$$;

CREATE OR REPLACE FUNCTION public.platform_book_ok(_book_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _book_id IS NULL OR public.platform_row_ok(
    (SELECT b.platform_id FROM public.library_books b WHERE b.id = _book_id))
$$;

CREATE OR REPLACE FUNCTION public.platform_source_ok(_source_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _source_id IS NULL OR public.platform_row_ok(
    (SELECT s.platform_id FROM public.knowledge_sources s WHERE s.id = _source_id))
$$;

CREATE OR REPLACE FUNCTION public.platform_version_ok(_version_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _version_id IS NULL OR public.platform_source_ok(
    (SELECT v.source_id FROM public.knowledge_source_versions v WHERE v.id = _version_id))
$$;

REVOKE ALL ON FUNCTION public.platform_actor_ok(UUID), public.platform_row_ok(UUID),
  public.platform_group_ok(UUID), public.platform_exam_ok(UUID), public.platform_question_ok(UUID),
  public.platform_attempt_ok(UUID), public.platform_content_ok(UUID), public.platform_book_ok(UUID),
  public.platform_source_ok(UUID), public.platform_version_ok(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_actor_ok(UUID), public.platform_row_ok(UUID),
  public.platform_group_ok(UUID), public.platform_exam_ok(UUID), public.platform_question_ok(UUID),
  public.platform_attempt_ok(UUID), public.platform_content_ok(UUID), public.platform_book_ok(UUID),
  public.platform_source_ok(UUID), public.platform_version_ok(UUID) TO anon, authenticated, service_role;

-- ---------- lessons / content ----------
DROP POLICY IF EXISTS platform_isolation_content ON public.content;
CREATE POLICY platform_isolation_content ON public.content AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_actor_ok(uploaded_by)) WITH CHECK (public.platform_actor_ok(uploaded_by));

DROP POLICY IF EXISTS platform_isolation_content_groups ON public.content_groups;
CREATE POLICY platform_isolation_content_groups ON public.content_groups AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_actor_ok(COALESCE(teacher_id, created_by)))
  WITH CHECK (public.platform_actor_ok(COALESCE(teacher_id, created_by)));

DROP POLICY IF EXISTS platform_isolation_sub_subjects ON public.sub_subjects;
CREATE POLICY platform_isolation_sub_subjects ON public.sub_subjects AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_group_ok(group_id)) WITH CHECK (public.platform_group_ok(group_id));

DROP POLICY IF EXISTS platform_isolation_video_progress ON public.video_progress;
CREATE POLICY platform_isolation_video_progress ON public.video_progress AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_content_ok(content_id)) WITH CHECK (public.platform_content_ok(content_id));

-- ---------- exams / results ----------
DROP POLICY IF EXISTS platform_isolation_exams ON public.exams;
CREATE POLICY platform_isolation_exams ON public.exams AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_actor_ok(teacher_id)) WITH CHECK (public.platform_actor_ok(teacher_id));

DROP POLICY IF EXISTS platform_isolation_exam_questions ON public.exam_questions;
CREATE POLICY platform_isolation_exam_questions ON public.exam_questions AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_exam_ok(exam_id)) WITH CHECK (public.platform_exam_ok(exam_id));

DROP POLICY IF EXISTS platform_isolation_exam_question_options ON public.exam_question_options;
CREATE POLICY platform_isolation_exam_question_options ON public.exam_question_options AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_question_ok(question_id)) WITH CHECK (public.platform_question_ok(question_id));

DROP POLICY IF EXISTS platform_isolation_exam_attempts ON public.exam_attempts;
CREATE POLICY platform_isolation_exam_attempts ON public.exam_attempts AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_exam_ok(exam_id)) WITH CHECK (public.platform_exam_ok(exam_id));

DROP POLICY IF EXISTS platform_isolation_exam_answers ON public.exam_answers;
CREATE POLICY platform_isolation_exam_answers ON public.exam_answers AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_attempt_ok(attempt_id)) WITH CHECK (public.platform_attempt_ok(attempt_id));

DROP POLICY IF EXISTS platform_isolation_exam_statistics ON public.exam_statistics;
CREATE POLICY platform_isolation_exam_statistics ON public.exam_statistics AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_actor_ok(student_id)) WITH CHECK (public.platform_actor_ok(student_id));

-- ---------- teachers / discovery / subscriptions ----------
DROP POLICY IF EXISTS platform_isolation_teacher_profiles ON public.teacher_profiles;
CREATE POLICY platform_isolation_teacher_profiles ON public.teacher_profiles AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_actor_ok(teacher_id)) WITH CHECK (public.platform_actor_ok(teacher_id));

DROP POLICY IF EXISTS platform_isolation_teacher_assignments ON public.teacher_assignments;
CREATE POLICY platform_isolation_teacher_assignments ON public.teacher_assignments AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_actor_ok(teacher_id)) WITH CHECK (public.platform_actor_ok(teacher_id));

DROP POLICY IF EXISTS platform_isolation_student_teacher_choices ON public.student_teacher_choices;
CREATE POLICY platform_isolation_student_teacher_choices ON public.student_teacher_choices AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_actor_ok(teacher_id)) WITH CHECK (public.platform_actor_ok(teacher_id));

DROP POLICY IF EXISTS platform_isolation_subscriptions ON public.subscriptions;
CREATE POLICY platform_isolation_subscriptions ON public.subscriptions AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_actor_ok(teacher_id)) WITH CHECK (public.platform_actor_ok(teacher_id));

DROP POLICY IF EXISTS platform_isolation_group_purchases ON public.student_group_purchases;
CREATE POLICY platform_isolation_group_purchases ON public.student_group_purchases AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_group_ok(group_id)) WITH CHECK (public.platform_group_ok(group_id));

DROP POLICY IF EXISTS platform_isolation_teacher_messages ON public.teacher_messages;
CREATE POLICY platform_isolation_teacher_messages ON public.teacher_messages AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_actor_ok(teacher_id)) WITH CHECK (public.platform_actor_ok(teacher_id));

DROP POLICY IF EXISTS platform_isolation_live_sessions ON public.live_sessions;
CREATE POLICY platform_isolation_live_sessions ON public.live_sessions AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_actor_ok(teacher_id)) WITH CHECK (public.platform_actor_ok(teacher_id));

DROP POLICY IF EXISTS platform_isolation_notifications ON public.notifications;
CREATE POLICY platform_isolation_notifications ON public.notifications AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_actor_ok(user_id)) WITH CHECK (public.platform_actor_ok(user_id));

-- ---------- library / AI knowledge (RAG corpus) ----------
DROP POLICY IF EXISTS platform_isolation_library_books ON public.library_books;
CREATE POLICY platform_isolation_library_books ON public.library_books AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_row_ok(platform_id)) WITH CHECK (public.platform_row_ok(platform_id));

DROP POLICY IF EXISTS platform_isolation_knowledge_sources ON public.knowledge_sources;
CREATE POLICY platform_isolation_knowledge_sources ON public.knowledge_sources AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_row_ok(platform_id)) WITH CHECK (public.platform_row_ok(platform_id));

DROP POLICY IF EXISTS platform_isolation_content_chunks ON public.content_chunks;
CREATE POLICY platform_isolation_content_chunks ON public.content_chunks AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_source_ok(source_id)) WITH CHECK (public.platform_source_ok(source_id));

DROP POLICY IF EXISTS platform_isolation_knowledge_units ON public.knowledge_units;
CREATE POLICY platform_isolation_knowledge_units ON public.knowledge_units AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_version_ok(version_id)) WITH CHECK (public.platform_version_ok(version_id));

DROP POLICY IF EXISTS platform_isolation_knowledge_source_versions ON public.knowledge_source_versions;
CREATE POLICY platform_isolation_knowledge_source_versions ON public.knowledge_source_versions AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_source_ok(source_id)) WITH CHECK (public.platform_source_ok(source_id));

DROP POLICY IF EXISTS platform_isolation_library_book_pages ON public.library_book_pages;
CREATE POLICY platform_isolation_library_book_pages ON public.library_book_pages AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_book_ok(book_id)) WITH CHECK (public.platform_book_ok(book_id));

DROP POLICY IF EXISTS platform_isolation_library_book_sections ON public.library_book_sections;
CREATE POLICY platform_isolation_library_book_sections ON public.library_book_sections AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_book_ok(book_id)) WITH CHECK (public.platform_book_ok(book_id));

DROP POLICY IF EXISTS platform_isolation_library_book_chunks ON public.library_book_chunks;
CREATE POLICY platform_isolation_library_book_chunks ON public.library_book_chunks AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_book_ok(book_id)) WITH CHECK (public.platform_book_ok(book_id));

DROP POLICY IF EXISTS platform_isolation_library_book_index ON public.library_book_index;
CREATE POLICY platform_isolation_library_book_index ON public.library_book_index AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_book_ok(book_id)) WITH CHECK (public.platform_book_ok(book_id));

DROP POLICY IF EXISTS platform_isolation_storage_assets ON public.storage_assets;
CREATE POLICY platform_isolation_storage_assets ON public.storage_assets AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.platform_actor_ok(uploaded_by)) WITH CHECK (public.platform_actor_ok(uploaded_by));

-- ---------- server-side tenant resolver for edge functions / RAG ----------
CREATE OR REPLACE FUNCTION public.platform_scope_for_user(_user_id UUID)
RETURNS TABLE (platform_id UUID, owner_teacher_id UUID, subject_ids UUID[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tp.id, tp.owner_teacher_id,
         COALESCE((SELECT array_agg(tps.subject_id) FROM public.teacher_platform_subjects tps
                    WHERE tps.platform_id = tp.id), ARRAY[]::UUID[])
  FROM public.teacher_platforms tp
  WHERE tp.id = public.user_platform_id(_user_id)
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.platform_scope_for_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_scope_for_user(UUID) TO authenticated, service_role;
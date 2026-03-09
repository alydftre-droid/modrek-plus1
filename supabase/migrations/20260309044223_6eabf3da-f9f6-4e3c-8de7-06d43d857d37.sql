-- 1) Lessons metadata for AI teaching mode
CREATE TABLE IF NOT EXISTS public.ai_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  group_id UUID NULL REFERENCES public.content_groups(id) ON DELETE SET NULL,
  sub_subject_id UUID NULL REFERENCES public.sub_subjects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  source_pdf_url TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_lessons_subject_id ON public.ai_lessons(subject_id);
CREATE INDEX IF NOT EXISTS idx_ai_lessons_group_id ON public.ai_lessons(group_id);
CREATE INDEX IF NOT EXISTS idx_ai_lessons_sub_subject_id ON public.ai_lessons(sub_subject_id);
CREATE INDEX IF NOT EXISTS idx_ai_lessons_created_by ON public.ai_lessons(created_by);

ALTER TABLE public.ai_lessons ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_lessons' AND policyname = 'Authenticated users can view ai lessons'
  ) THEN
    CREATE POLICY "Authenticated users can view ai lessons"
    ON public.ai_lessons
    FOR SELECT
    USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_lessons' AND policyname = 'Teachers and admins can insert ai lessons'
  ) THEN
    CREATE POLICY "Teachers and admins can insert ai lessons"
    ON public.ai_lessons
    FOR INSERT
    WITH CHECK (
      has_role(auth.uid(), 'admin'::app_role)
      OR (has_role(auth.uid(), 'teacher'::app_role) AND auth.uid() = created_by)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_lessons' AND policyname = 'Teachers and admins can update ai lessons'
  ) THEN
    CREATE POLICY "Teachers and admins can update ai lessons"
    ON public.ai_lessons
    FOR UPDATE
    USING (
      has_role(auth.uid(), 'admin'::app_role)
      OR (has_role(auth.uid(), 'teacher'::app_role) AND auth.uid() = created_by)
    )
    WITH CHECK (
      has_role(auth.uid(), 'admin'::app_role)
      OR (has_role(auth.uid(), 'teacher'::app_role) AND auth.uid() = created_by)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_lessons' AND policyname = 'Teachers and admins can delete ai lessons'
  ) THEN
    CREATE POLICY "Teachers and admins can delete ai lessons"
    ON public.ai_lessons
    FOR DELETE
    USING (
      has_role(auth.uid(), 'admin'::app_role)
      OR (has_role(auth.uid(), 'teacher'::app_role) AND auth.uid() = created_by)
    );
  END IF;
END $$;

-- 2) Lesson pages (images + optional notes)
CREATE TABLE IF NOT EXISTS public.ai_lesson_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES public.ai_lessons(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL DEFAULT 1,
  title TEXT NULL,
  image_url TEXT NOT NULL,
  notes TEXT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, page_number)
);

CREATE INDEX IF NOT EXISTS idx_ai_lesson_pages_lesson_id ON public.ai_lesson_pages(lesson_id);
CREATE INDEX IF NOT EXISTS idx_ai_lesson_pages_created_by ON public.ai_lesson_pages(created_by);

ALTER TABLE public.ai_lesson_pages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_lesson_pages' AND policyname = 'Authenticated users can view ai lesson pages'
  ) THEN
    CREATE POLICY "Authenticated users can view ai lesson pages"
    ON public.ai_lesson_pages
    FOR SELECT
    USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_lesson_pages' AND policyname = 'Teachers and admins can insert ai lesson pages'
  ) THEN
    CREATE POLICY "Teachers and admins can insert ai lesson pages"
    ON public.ai_lesson_pages
    FOR INSERT
    WITH CHECK (
      has_role(auth.uid(), 'admin'::app_role)
      OR (has_role(auth.uid(), 'teacher'::app_role) AND auth.uid() = created_by)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_lesson_pages' AND policyname = 'Teachers and admins can update ai lesson pages'
  ) THEN
    CREATE POLICY "Teachers and admins can update ai lesson pages"
    ON public.ai_lesson_pages
    FOR UPDATE
    USING (
      has_role(auth.uid(), 'admin'::app_role)
      OR (has_role(auth.uid(), 'teacher'::app_role) AND auth.uid() = created_by)
    )
    WITH CHECK (
      has_role(auth.uid(), 'admin'::app_role)
      OR (has_role(auth.uid(), 'teacher'::app_role) AND auth.uid() = created_by)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_lesson_pages' AND policyname = 'Teachers and admins can delete ai lesson pages'
  ) THEN
    CREATE POLICY "Teachers and admins can delete ai lesson pages"
    ON public.ai_lesson_pages
    FOR DELETE
    USING (
      has_role(auth.uid(), 'admin'::app_role)
      OR (has_role(auth.uid(), 'teacher'::app_role) AND auth.uid() = created_by)
    );
  END IF;
END $$;

-- 3) Keep updated_at fresh
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_ai_lessons_updated_at'
  ) THEN
    CREATE TRIGGER update_ai_lessons_updated_at
    BEFORE UPDATE ON public.ai_lessons
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_ai_lesson_pages_updated_at'
  ) THEN
    CREATE TRIGGER update_ai_lesson_pages_updated_at
    BEFORE UPDATE ON public.ai_lesson_pages
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- 4) Storage bucket for page images
INSERT INTO storage.buckets (id, name, public)
VALUES ('ai-lesson-pages', 'ai-lesson-pages', true)
ON CONFLICT (id) DO NOTHING;

-- 5) Storage policies for lesson page images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public can view ai lesson pages images'
  ) THEN
    CREATE POLICY "Public can view ai lesson pages images"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'ai-lesson-pages');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Teachers and admins can upload ai lesson pages images'
  ) THEN
    CREATE POLICY "Teachers and admins can upload ai lesson pages images"
    ON storage.objects
    FOR INSERT
    WITH CHECK (
      bucket_id = 'ai-lesson-pages'
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'teacher'::app_role)
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Teachers and admins can update ai lesson pages images'
  ) THEN
    CREATE POLICY "Teachers and admins can update ai lesson pages images"
    ON storage.objects
    FOR UPDATE
    USING (
      bucket_id = 'ai-lesson-pages'
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'teacher'::app_role)
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Teachers and admins can delete ai lesson pages images'
  ) THEN
    CREATE POLICY "Teachers and admins can delete ai lesson pages images"
    ON storage.objects
    FOR DELETE
    USING (
      bucket_id = 'ai-lesson-pages'
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'teacher'::app_role)
      )
    );
  END IF;
END $$;
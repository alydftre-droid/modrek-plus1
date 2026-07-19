-- Ensure public.student_activity_logs exists on the production database.
-- The production project was baselined from a SQL dump that did not
-- include this table, so the original 20260701102207 migration was
-- marked applied without running. A later migration (20260711222104)
-- then fails when it tries to CREATE INDEX on the missing table.
-- This migration is dated 20260710000001 so it sits just after the
-- baseline cutoff (20260710000000) and runs BEFORE 20260711222104.

CREATE TABLE IF NOT EXISTS public.student_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  action_type text NOT NULL,
  action_label text,
  description text,
  subject_id uuid,
  group_id uuid,
  content_id uuid,
  teacher_id uuid,
  exam_id uuid,
  page_path text,
  ip_address text,
  user_agent text,
  device_type text,
  browser text,
  os text,
  session_id text,
  duration_seconds integer,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_activity_logs_student_created
  ON public.student_activity_logs (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_activity_logs_action_type
  ON public.student_activity_logs (action_type);
CREATE INDEX IF NOT EXISTS idx_student_activity_logs_created
  ON public.student_activity_logs (created_at DESC);

GRANT SELECT, INSERT ON public.student_activity_logs TO authenticated;
GRANT ALL ON public.student_activity_logs TO service_role;

ALTER TABLE public.student_activity_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'student_activity_logs'
      AND policyname = 'Students can insert their own activity'
  ) THEN
    CREATE POLICY "Students can insert their own activity"
      ON public.student_activity_logs FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = student_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'student_activity_logs'
      AND policyname = 'Students can read their own activity'
  ) THEN
    CREATE POLICY "Students can read their own activity"
      ON public.student_activity_logs FOR SELECT
      TO authenticated
      USING (auth.uid() = student_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'student_activity_logs'
      AND policyname = 'Admins can read all student activity'
  ) THEN
    CREATE POLICY "Admins can read all student activity"
      ON public.student_activity_logs FOR SELECT
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::app_role));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'student_activity_logs'
      AND policyname = 'Teachers can read activity of their students'
  ) THEN
    CREATE POLICY "Teachers can read activity of their students"
      ON public.student_activity_logs FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.student_group_purchases sgp
          JOIN public.content_groups cg ON cg.id = sgp.group_id
          WHERE sgp.student_id = student_activity_logs.student_id
            AND COALESCE(cg.teacher_id, cg.created_by) = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.student_activity_logs;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END $$;
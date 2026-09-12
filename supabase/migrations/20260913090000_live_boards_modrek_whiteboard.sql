-- Modrek Live Board: teacher-driven whiteboard + file explanation surface for live classes.
CREATE TABLE IF NOT EXISTS public.live_boards (
  group_id uuid PRIMARY KEY REFERENCES public.content_groups(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL,
  session_id uuid,
  file_ref text,
  file_kind text NOT NULL DEFAULT 'blank' CHECK (file_kind IN ('blank', 'image', 'pdf')),
  file_name text,
  page integer NOT NULL DEFAULT 1,
  page_count integer NOT NULL DEFAULT 1,
  strokes jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_open boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_boards TO authenticated;
GRANT ALL ON public.live_boards TO service_role;

ALTER TABLE public.live_boards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers manage own live board" ON public.live_boards;
CREATE POLICY "Teachers manage own live board"
ON public.live_boards
FOR ALL
TO authenticated
USING (
  teacher_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.content_groups g
    WHERE g.id = live_boards.group_id AND g.teacher_id = auth.uid()
  )
)
WITH CHECK (
  teacher_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.content_groups g
    WHERE g.id = live_boards.group_id AND g.teacher_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Students can view their group live board" ON public.live_boards;
CREATE POLICY "Students can view their group live board"
ON public.live_boards
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.student_group_purchases sgp
    WHERE sgp.group_id = live_boards.group_id
      AND sgp.student_id = auth.uid()
      AND NOT public.is_test_student(sgp.student_id)
  )
);

DROP POLICY IF EXISTS "Admins manage all live boards" ON public.live_boards;
CREATE POLICY "Admins manage all live boards"
ON public.live_boards
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Demo accounts stay strictly read-only.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'block_demo_write' AND pronamespace = 'public'::regnamespace) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS zzz_demo_read_only ON public.live_boards';
    EXECUTE 'CREATE TRIGGER zzz_demo_read_only BEFORE INSERT OR UPDATE OR DELETE ON public.live_boards FOR EACH ROW EXECUTE FUNCTION public.block_demo_write()';
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_boards;
ALTER TABLE public.live_boards REPLICA IDENTITY FULL;
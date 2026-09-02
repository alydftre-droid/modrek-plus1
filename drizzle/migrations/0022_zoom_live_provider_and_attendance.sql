-- 1) Extend live_sessions with a swappable provider + Zoom metadata (non-destructive)
ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'jitsi',
  ADD COLUMN IF NOT EXISTS zoom_meeting_id text,
  ADD COLUMN IF NOT EXISTS zoom_meeting_uuid text,
  ADD COLUMN IF NOT EXISTS zoom_join_url text,
  ADD COLUMN IF NOT EXISTS zoom_host_email text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Close any pre-existing duplicate active sessions per group so the guard index can be created
UPDATE public.live_sessions ls
SET status = 'ended', ended_at = COALESCE(ls.ended_at, now()), viewer_count = 0
WHERE ls.status IN ('live', 'starting')
  AND EXISTS (
    SELECT 1 FROM public.live_sessions other
    WHERE other.group_id = ls.group_id
      AND other.status IN ('live', 'starting')
      AND (other.started_at, other.id) > (ls.started_at, ls.id)
  );

-- Idempotency guard: at most one active session per group
CREATE UNIQUE INDEX IF NOT EXISTS live_sessions_one_active_per_group
  ON public.live_sessions (group_id)
  WHERE status IN ('live', 'starting');

CREATE INDEX IF NOT EXISTS live_sessions_zoom_meeting_id_idx
  ON public.live_sessions (zoom_meeting_id)
  WHERE zoom_meeting_id IS NOT NULL;

-- 2) Attendance
CREATE TABLE IF NOT EXISTS public.live_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  duration_seconds integer NOT NULL DEFAULT 0,
  tenant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS live_attendance_session_student_idx
  ON public.live_attendance (live_session_id, student_id);

GRANT SELECT ON public.live_attendance TO authenticated;
GRANT ALL ON public.live_attendance TO service_role;

ALTER TABLE public.live_attendance ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_tenant_id_trg ON public.live_attendance;
CREATE TRIGGER set_tenant_id_trg
  BEFORE INSERT ON public.live_attendance
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_from_session();

DROP POLICY IF EXISTS "Students view own attendance" ON public.live_attendance;
CREATE POLICY "Students view own attendance"
ON public.live_attendance FOR SELECT TO authenticated
USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Teachers view attendance of own sessions" ON public.live_attendance;
CREATE POLICY "Teachers view attendance of own sessions"
ON public.live_attendance FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.live_sessions ls
  WHERE ls.id = live_attendance.live_session_id
    AND ls.teacher_id = auth.uid()
));

DROP POLICY IF EXISTS "Admins manage all attendance" ON public.live_attendance;
CREATE POLICY "Admins manage all attendance"
ON public.live_attendance FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS tenant_isolation_live_attendance ON public.live_attendance;
CREATE POLICY tenant_isolation_live_attendance
ON public.live_attendance AS RESTRICTIVE FOR ALL
USING (public.tenant_row_visible(tenant_id))
WITH CHECK (public.tenant_row_visible(tenant_id));
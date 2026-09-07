-- Zoom becomes the only live provider for NEW sessions (existing rows untouched)
ALTER TABLE public.live_sessions ALTER COLUMN provider SET DEFAULT 'zoom';

-- Attendance: Zoom-verified identity + lifecycle status
ALTER TABLE public.live_attendance
  ADD COLUMN IF NOT EXISTS participant_tag text,
  ADD COLUMN IF NOT EXISTS zoom_participant_uuid text,
  ADD COLUMN IF NOT EXISTS zoom_participant_user_id text,
  ADD COLUMN IF NOT EXISTS verified_by_zoom boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'joined';

CREATE INDEX IF NOT EXISTS live_attendance_session_idx
  ON public.live_attendance (live_session_id);

CREATE INDEX IF NOT EXISTS live_attendance_tag_idx
  ON public.live_attendance (participant_tag)
  WHERE participant_tag IS NOT NULL;

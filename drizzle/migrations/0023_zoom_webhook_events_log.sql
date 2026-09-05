-- Server-only log of raw Zoom webhook events (no student identity linkage yet).
CREATE TABLE IF NOT EXISTS public.zoom_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  zoom_event_ts bigint,
  meeting_id text,
  meeting_uuid text,
  participant_user_id text,
  participant_uuid text,
  participant_display_name text,
  occurred_at timestamptz,
  dedupe_key text NOT NULL,
  live_session_id uuid REFERENCES public.live_sessions(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed boolean NOT NULL DEFAULT false,
  process_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS zoom_webhook_events_dedupe_idx
  ON public.zoom_webhook_events (dedupe_key);
CREATE INDEX IF NOT EXISTS zoom_webhook_events_meeting_idx
  ON public.zoom_webhook_events (meeting_id, created_at DESC);

-- Written and read only by the webhook (service role) and admins.
GRANT ALL ON public.zoom_webhook_events TO service_role;

ALTER TABLE public.zoom_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read zoom webhook events" ON public.zoom_webhook_events;
CREATE POLICY "Admins read zoom webhook events"
ON public.zoom_webhook_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
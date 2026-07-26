CREATE TABLE IF NOT EXISTS public.deletion_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id UUID,
  actor_email TEXT,
  action_type TEXT NOT NULL,
  target_id TEXT,
  target_label TEXT,
  target_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  bunny_total INT NOT NULL DEFAULT 0,
  bunny_success INT NOT NULL DEFAULT 0,
  bunny_failed INT NOT NULL DEFAULT 0,
  bunny_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration_ms INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.deletion_audit_logs TO authenticated;
GRANT ALL ON public.deletion_audit_logs TO service_role;

ALTER TABLE public.deletion_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view deletion audit logs" ON public.deletion_audit_logs;
CREATE POLICY "Admins can view deletion audit logs"
ON public.deletion_audit_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert deletion audit logs" ON public.deletion_audit_logs;
CREATE POLICY "Admins can insert deletion audit logs"
ON public.deletion_audit_logs
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_deletion_audit_logs_created_at ON public.deletion_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deletion_audit_logs_action_type ON public.deletion_audit_logs (action_type);
CREATE INDEX IF NOT EXISTS idx_deletion_audit_logs_actor ON public.deletion_audit_logs (actor_id);
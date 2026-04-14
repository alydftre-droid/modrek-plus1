
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS scheduled_at timestamptz DEFAULT NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_sent boolean DEFAULT true;

CREATE TABLE IF NOT EXISTS public.wallet_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  admin_id uuid NOT NULL,
  amount numeric NOT NULL,
  type text NOT NULL DEFAULT 'add',
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage wallet adjustments"
  ON public.wallet_adjustments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Students can view own adjustments"
  ON public.wallet_adjustments FOR SELECT
  TO authenticated
  USING (auth.uid() = student_id);


CREATE TABLE public.support_contact_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_role TEXT,
  user_code TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','messenger','assistant')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.support_contact_logs TO authenticated;
GRANT ALL ON public.support_contact_logs TO service_role;

ALTER TABLE public.support_contact_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users insert own support logs"
  ON public.support_contact_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users read own support logs"
  ON public.support_contact_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "admins read all support logs"
  ON public.support_contact_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_support_contact_logs_created ON public.support_contact_logs(created_at DESC);
CREATE INDEX idx_support_contact_logs_channel ON public.support_contact_logs(channel);

-- Seed default settings (only if missing)
INSERT INTO public.platform_settings (key, value) VALUES
  ('support_whatsapp_student', ''),
  ('support_whatsapp_teacher', '201223909712'),
  ('support_whatsapp_enabled', 'true'),
  ('support_messenger_student', ''),
  ('support_messenger_teacher', ''),
  ('support_messenger_enabled', 'false'),
  ('support_assistant_enabled', 'true'),
  ('support_assistant_display_name', 'المساعد الذكي'),
  ('support_message_template', E'مرحباً فريق الدعم،\n\nالاسم: {{name}}\nنوع الحساب: {{role}}\nالكود: {{code}}\nالبريد: {{email}}\nالهاتف: {{phone}}\nالإصدار: {{appVersion}} ({{platform}})\nالوقت: {{date}} {{time}}\n\nالمشكلة:\n')
ON CONFLICT (key) DO NOTHING;

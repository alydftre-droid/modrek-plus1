DROP POLICY IF EXISTS "Admins can manage settings" ON public.platform_settings;

CREATE POLICY "Admins can manage settings"
ON public.platform_settings
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR lower(coalesce(auth.jwt() ->> 'email', '')) IN ('alyedaft@gmail.com', 'aliana200713@gmail.com')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR lower(coalesce(auth.jwt() ->> 'email', '')) IN ('alyedaft@gmail.com', 'aliana200713@gmail.com')
);

DROP POLICY IF EXISTS "Public can read settings" ON public.platform_settings;

CREATE POLICY "Public can read settings"
ON public.platform_settings
FOR SELECT
TO public
USING (key = ANY (ARRAY[
  'platform_name'::text,
  'maintenance_mode'::text,
  'maintenance_message'::text,
  'platform_logo'::text,
  'support_phone'::text,
  'support_whatsapp'::text,
  'support_email'::text,
  'support_telegram'::text,
  'support_whatsapp_student'::text,
  'support_whatsapp_teacher'::text,
  'support_whatsapp_enabled'::text,
  'support_messenger_student'::text,
  'support_messenger_teacher'::text,
  'support_messenger_enabled'::text,
  'support_assistant_enabled'::text,
  'support_assistant_display_name'::text,
  'support_message_template'::text,
  'subscription_whatsapp'::text,
  'subscription_default_price'::text,
  'subscription_default_message'::text,
  'subscription_currency'::text,
  'payment_receive_number'::text,
  'payment_methods_config'::text,
  'deposit_tutorial_video'::text,
  'student_dashboard_ticker_enabled'::text,
  'student_dashboard_ticker_text'::text,
  'student_dashboard_ticker_items'::text,
  'teacher_commission_rate'::text,
  'withdrawal_open_day'::text,
  'withdrawal_manual_state'::text,
  'withdrawal_notice_message'::text
]));

GRANT SELECT ON public.platform_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
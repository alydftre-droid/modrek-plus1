DROP POLICY IF EXISTS "Public can read settings" ON public.platform_settings;

CREATE POLICY "Public can read settings"
ON public.platform_settings
FOR SELECT
TO public
USING (
  key = ANY (
    ARRAY[
      'platform_name'::text,
      'maintenance_mode'::text,
      'maintenance_message'::text,
      'platform_logo'::text,
      'support_phone'::text,
      'support_whatsapp'::text,
      'support_email'::text,
      'subscription_whatsapp'::text,
      'subscription_default_price'::text,
      'subscription_default_message'::text,
      'subscription_currency'::text,
      'payment_receive_number'::text,
      'payment_methods_config'::text,
      'deposit_tutorial_video'::text,
      'student_dashboard_ticker_enabled'::text,
      'student_dashboard_ticker_text'::text,
      'student_dashboard_ticker_items'::text
    ]
  )
);
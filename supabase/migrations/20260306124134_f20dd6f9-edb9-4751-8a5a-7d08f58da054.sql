
DROP POLICY IF EXISTS "Public can read settings" ON public.platform_settings;
CREATE POLICY "Public can read settings" ON public.platform_settings FOR SELECT USING (
  key = ANY (ARRAY[
    'platform_name','maintenance_mode','maintenance_message','platform_logo',
    'support_phone','support_whatsapp','support_email','subscription_whatsapp',
    'subscription_default_price','subscription_default_message','subscription_currency',
    'payment_receive_number','payment_methods_config','deposit_tutorial_video'
  ])
);

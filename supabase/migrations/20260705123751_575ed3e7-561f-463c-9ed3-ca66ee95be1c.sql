DROP POLICY IF EXISTS "Public can read settings" ON public.platform_settings;
CREATE POLICY "Public can read settings"
ON public.platform_settings
FOR SELECT
USING (key = ANY (ARRAY[
  'platform_name','maintenance_mode','maintenance_message','platform_logo',
  'support_phone','support_whatsapp','support_email',
  'support_whatsapp_student','support_whatsapp_teacher','support_whatsapp_enabled',
  'support_messenger_student','support_messenger_teacher','support_messenger_enabled',
  'support_assistant_enabled','support_assistant_display_name','support_message_template',
  'subscription_whatsapp','subscription_default_price','subscription_default_message','subscription_currency',
  'payment_receive_number','payment_methods_config','deposit_tutorial_video',
  'student_dashboard_ticker_enabled','student_dashboard_ticker_text','student_dashboard_ticker_items',
  'teacher_commission_rate','withdrawal_open_day','withdrawal_manual_state','withdrawal_notice_message'
]));
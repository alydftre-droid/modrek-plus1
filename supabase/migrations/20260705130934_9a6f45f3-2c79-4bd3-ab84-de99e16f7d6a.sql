CREATE OR REPLACE FUNCTION public.sync_support_contact_setting_aliases()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.key = 'support_whatsapp_student' AND COALESCE(NULLIF(NEW.value, ''), '') <> '' THEN
    INSERT INTO public.platform_settings (key, value, updated_at)
    VALUES ('support_whatsapp', NEW.value, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

    INSERT INTO public.platform_settings (key, value, updated_at)
    VALUES ('support_phone', NEW.value, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_support_contact_setting_aliases_trigger ON public.platform_settings;
CREATE TRIGGER sync_support_contact_setting_aliases_trigger
AFTER INSERT OR UPDATE OF value ON public.platform_settings
FOR EACH ROW
WHEN (NEW.key IN ('support_whatsapp_student'))
EXECUTE FUNCTION public.sync_support_contact_setting_aliases();

DROP POLICY IF EXISTS "Public can read settings" ON public.platform_settings;
CREATE POLICY "Public can read settings"
ON public.platform_settings
FOR SELECT
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

UPDATE public.platform_settings
SET value = (SELECT ps.value FROM public.platform_settings ps WHERE ps.key = 'support_whatsapp_student'),
    updated_at = now()
WHERE key IN ('support_whatsapp', 'support_phone')
  AND EXISTS (
    SELECT 1 FROM public.platform_settings ps
    WHERE ps.key = 'support_whatsapp_student'
      AND COALESCE(NULLIF(ps.value, ''), '') <> ''
  );
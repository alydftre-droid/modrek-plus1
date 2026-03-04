-- Make payment-receipts bucket public so admins can view uploaded receipts
UPDATE storage.buckets SET public = true WHERE id = 'payment-receipts';

-- Add payment settings keys to public read policy
DROP POLICY IF EXISTS "Public can read settings" ON public.platform_settings;
CREATE POLICY "Public can read settings" ON public.platform_settings
FOR SELECT USING (
  key = ANY (ARRAY[
    'platform_name', 'maintenance_mode', 'maintenance_message', 'platform_logo',
    'support_phone', 'support_whatsapp', 'support_email',
    'subscription_whatsapp', 'subscription_default_price', 'subscription_default_message', 'subscription_currency',
    'payment_receive_number', 'payment_methods_config'
  ])
);

-- Allow students to insert into student_group_purchases
CREATE POLICY "Students can insert own purchases" ON public.student_group_purchases
FOR INSERT WITH CHECK (auth.uid() = student_id);

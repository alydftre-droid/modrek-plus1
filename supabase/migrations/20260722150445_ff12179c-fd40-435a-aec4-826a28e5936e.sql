GRANT SELECT, INSERT, UPDATE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;

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
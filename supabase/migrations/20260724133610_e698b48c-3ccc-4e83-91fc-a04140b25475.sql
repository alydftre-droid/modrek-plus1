DROP POLICY IF EXISTS "Admins can manage content" ON public.content;
CREATE POLICY "Admins can manage content"
ON public.content
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Teachers can delete own content" ON public.content;
CREATE POLICY "Teachers can delete own content"
ON public.content
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'teacher'::public.app_role)
  AND auth.uid() = uploaded_by
);

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
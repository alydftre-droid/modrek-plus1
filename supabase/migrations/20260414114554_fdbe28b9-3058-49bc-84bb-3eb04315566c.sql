-- Admin can view all video progress
CREATE POLICY "Admins can view all video progress"
ON public.video_progress
FOR SELECT
TO public
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Admin can manage all usage logs (update/delete)
CREATE POLICY "Admins can manage all logs"
ON public.usage_logs
FOR ALL
TO public
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
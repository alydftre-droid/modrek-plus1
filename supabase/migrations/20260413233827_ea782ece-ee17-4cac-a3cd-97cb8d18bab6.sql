
CREATE TABLE public.live_session_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.live_sessions(id) ON DELETE CASCADE NOT NULL,
  group_id UUID NOT NULL,
  teacher_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'تسجيل حصة',
  video_url TEXT NOT NULL,
  duration TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.live_session_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage own recordings"
  ON public.live_session_recordings FOR ALL
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Subscribed students can view recordings"
  ON public.live_session_recordings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.student_group_purchases
      WHERE student_group_purchases.group_id = live_session_recordings.group_id
        AND student_group_purchases.student_id = auth.uid()
    )
  );

CREATE POLICY "Admins manage all recordings"
  ON public.live_session_recordings FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

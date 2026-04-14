
CREATE TABLE public.live_session_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_name text NOT NULL DEFAULT 'مستخدم',
  message text NOT NULL,
  is_teacher boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.live_session_messages ENABLE ROW LEVEL SECURITY;

-- Teachers can do everything on their session messages
CREATE POLICY "Teachers manage own session messages" ON public.live_session_messages
  FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM live_sessions WHERE live_sessions.id = live_session_messages.session_id AND live_sessions.teacher_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM live_sessions WHERE live_sessions.id = live_session_messages.session_id AND live_sessions.teacher_id = auth.uid()
  ));

-- Subscribed students can view messages
CREATE POLICY "Students can view session messages" ON public.live_session_messages
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM live_sessions ls
    JOIN student_group_purchases sgp ON sgp.group_id = ls.group_id
    WHERE ls.id = live_session_messages.session_id AND sgp.student_id = auth.uid()
  ));

-- Subscribed students can send messages
CREATE POLICY "Students can send session messages" ON public.live_session_messages
  FOR INSERT TO public
  WITH CHECK (
    auth.uid() = user_id AND
    is_teacher = false AND
    EXISTS (
      SELECT 1 FROM live_sessions ls
      JOIN student_group_purchases sgp ON sgp.group_id = ls.group_id
      WHERE ls.id = live_session_messages.session_id AND sgp.student_id = auth.uid()
    )
  );

-- Admins manage all
CREATE POLICY "Admins manage all session messages" ON public.live_session_messages
  FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_session_messages;

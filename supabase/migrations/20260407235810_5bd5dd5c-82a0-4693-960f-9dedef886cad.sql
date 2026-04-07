
-- جدول جلسات البث المباشر
CREATE TABLE public.live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'حصة مباشرة',
  room_name text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'ended')),
  allow_student_camera boolean NOT NULL DEFAULT false,
  allow_student_mic boolean NOT NULL DEFAULT true,
  viewer_count integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

-- المعلم يتحكم بجلساته
CREATE POLICY "Teachers manage own live sessions"
  ON public.live_sessions FOR ALL
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

-- الطلاب المشتركون في المجموعة فقط يشاهدون الجلسات النشطة
CREATE POLICY "Subscribed students can view live sessions"
  ON public.live_sessions FOR SELECT
  USING (
    status = 'live' AND EXISTS (
      SELECT 1 FROM public.student_group_purchases
      WHERE student_group_purchases.group_id = live_sessions.group_id
        AND student_group_purchases.student_id = auth.uid()
    )
  );

-- الأدمن يرى الكل
CREATE POLICY "Admins manage all live sessions"
  ON public.live_sessions FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- جدول إجراءات الإشراف أثناء البث
CREATE TABLE public.live_session_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('mute', 'ban', 'unmute', 'unban')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.live_session_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage actions for own sessions"
  ON public.live_session_actions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.live_sessions
    WHERE live_sessions.id = live_session_actions.session_id
      AND live_sessions.teacher_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.live_sessions
    WHERE live_sessions.id = live_session_actions.session_id
      AND live_sessions.teacher_id = auth.uid()
  ));

CREATE POLICY "Students can view actions for their sessions"
  ON public.live_session_actions FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Admins manage all actions"
  ON public.live_session_actions FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- تفعيل Realtime للبث المباشر
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_session_actions;

-- فهرس للبحث السريع
CREATE INDEX idx_live_sessions_group_status ON public.live_sessions(group_id, status);
CREATE INDEX idx_live_sessions_teacher ON public.live_sessions(teacher_id, status);

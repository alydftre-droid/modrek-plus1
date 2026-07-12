
-- 1) Conversations
CREATE TABLE public.modrek_ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assistant_type TEXT NOT NULL CHECK (assistant_type IN ('study','exams','review')),
  title TEXT NOT NULL DEFAULT 'محادثة جديدة',
  context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_modrek_ai_conv_student ON public.modrek_ai_conversations(student_id, last_message_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.modrek_ai_conversations TO authenticated;
GRANT ALL ON public.modrek_ai_conversations TO service_role;

ALTER TABLE public.modrek_ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage their own AI conversations"
  ON public.modrek_ai_conversations
  FOR ALL
  TO authenticated
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

-- 2) Messages
CREATE TABLE public.modrek_ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.modrek_ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  parts JSONB NOT NULL DEFAULT '[]'::jsonb,
  attachments JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_modrek_ai_msg_conv ON public.modrek_ai_messages(conversation_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.modrek_ai_messages TO authenticated;
GRANT ALL ON public.modrek_ai_messages TO service_role;

ALTER TABLE public.modrek_ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students access messages of their conversations"
  ON public.modrek_ai_messages
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.modrek_ai_conversations c
      WHERE c.id = modrek_ai_messages.conversation_id
        AND c.student_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.modrek_ai_conversations c
      WHERE c.id = modrek_ai_messages.conversation_id
        AND c.student_id = auth.uid()
    )
  );

-- 3) Update trigger for conversations
CREATE OR REPLACE FUNCTION public.modrek_ai_touch_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.modrek_ai_conversations
    SET last_message_at = now(), updated_at = now()
    WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER modrek_ai_msg_touch_conv
  AFTER INSERT ON public.modrek_ai_messages
  FOR EACH ROW EXECUTE FUNCTION public.modrek_ai_touch_conversation();

CREATE OR REPLACE FUNCTION public.modrek_ai_update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER modrek_ai_conv_updated_at
  BEFORE UPDATE ON public.modrek_ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.modrek_ai_update_updated_at();

-- 4) Extend exams for AI-generated student exams
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'teacher',
  ADD COLUMN IF NOT EXISTS owner_student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.exams ALTER COLUMN teacher_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exams_owner_student ON public.exams(owner_student_id) WHERE owner_student_id IS NOT NULL;

CREATE POLICY "Students access their own Modrek AI exams"
  ON public.exams
  FOR SELECT
  TO authenticated
  USING (source = 'modrek_ai' AND owner_student_id = auth.uid());

-- Allow inserting attempts for Modrek AI exams (RLS on exam_attempts already scopes to student_id)

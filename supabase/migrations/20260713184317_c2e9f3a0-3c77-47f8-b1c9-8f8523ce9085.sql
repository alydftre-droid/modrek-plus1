
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.library_book_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES public.library_books(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.library_book_index(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'section' CHECK (kind IN ('chapter','lesson','section','heading','note')),
  title TEXT NOT NULL,
  summary TEXT,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  page_start INTEGER NOT NULL,
  page_end INTEGER NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_library_index_book ON public.library_book_index(book_id, order_index);
CREATE INDEX IF NOT EXISTS idx_library_index_pages ON public.library_book_index(book_id, page_start, page_end);
GRANT SELECT ON public.library_book_index TO authenticated;
GRANT ALL ON public.library_book_index TO service_role;
ALTER TABLE public.library_book_index ENABLE ROW LEVEL SECURITY;
CREATE POLICY "students read index of accessible books"
  ON public.library_book_index FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.library_books b
      WHERE b.id = library_book_index.book_id AND b.status = 'ready' AND b.access_tier = 'free'));
CREATE POLICY "admins manage library index"
  ON public.library_book_index FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.library_book_pages
  ADD COLUMN IF NOT EXISTS page_summary TEXT,
  ADD COLUMN IF NOT EXISTS keywords TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_library_pages_ocr_trgm
  ON public.library_book_pages USING gin (ocr_text gin_trgm_ops);

CREATE TABLE IF NOT EXISTS public.library_book_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES public.library_books(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_page INTEGER,
  current_section_id UUID REFERENCES public.library_book_sections(id) ON DELETE SET NULL,
  last_index_id UUID REFERENCES public.library_book_index(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (book_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_library_conv_student ON public.library_book_conversations(student_id, last_message_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_book_conversations TO authenticated;
GRANT ALL ON public.library_book_conversations TO service_role;
ALTER TABLE public.library_book_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "students manage own book conversation"
  ON public.library_book_conversations FOR ALL TO authenticated
  USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);
CREATE POLICY "admins read all book conversations"
  ON public.library_book_conversations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.library_conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.library_book_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'page' CHECK (scope IN ('page','book','section')),
  page_number INTEGER,
  section_id UUID REFERENCES public.library_book_sections(id) ON DELETE SET NULL,
  audio_path TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_library_conv_msgs ON public.library_conversation_messages(conversation_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_conversation_messages TO authenticated;
GRANT ALL ON public.library_conversation_messages TO service_role;
ALTER TABLE public.library_conversation_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "students access messages of own conversations"
  ON public.library_conversation_messages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.library_book_conversations c
      WHERE c.id = library_conversation_messages.conversation_id AND c.student_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.library_book_conversations c
      WHERE c.id = library_conversation_messages.conversation_id AND c.student_id = auth.uid()));
CREATE POLICY "admins read all library conversation messages"
  ON public.library_conversation_messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.ai_function_settings (function_name, models_to_try, fallback_delay_ms)
VALUES
  ('library-chat',   ARRAY['google/gemini-2.5-flash','google/gemini-2.5-flash-lite'], 800),
  ('library-search', ARRAY['google/gemini-2.5-flash-lite'], 500),
  ('library-index',  ARRAY['google/gemini-2.5-flash','google/gemini-2.5-flash-lite'], 800)
ON CONFLICT (function_name) DO UPDATE
SET models_to_try = EXCLUDED.models_to_try,
    fallback_delay_ms = EXCLUDED.fallback_delay_ms;

DO $$ BEGIN
  ALTER TABLE public.library_processing_jobs
    DROP CONSTRAINT IF EXISTS library_processing_jobs_kind_check;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

ALTER TABLE public.library_processing_jobs
  ADD CONSTRAINT library_processing_jobs_kind_check
  CHECK (kind IN ('extract_book','extract_page','build_index','summarise_page'));

CREATE OR REPLACE FUNCTION public.touch_library_conv_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  NEW.last_message_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_library_conv_touch ON public.library_book_conversations;
CREATE TRIGGER trg_library_conv_touch
  BEFORE UPDATE ON public.library_book_conversations
  FOR EACH ROW EXECUTE FUNCTION public.touch_library_conv_updated_at();

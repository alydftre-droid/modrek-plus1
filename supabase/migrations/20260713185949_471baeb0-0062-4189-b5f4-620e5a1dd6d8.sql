
-- === Phase Final: RAG + Learning Memory + Weaknesses + Quiz + Regions ===

CREATE EXTENSION IF NOT EXISTS vector;

-- 1) Chunk table for RAG (paragraph-level, independent of sections)
CREATE TABLE IF NOT EXISTS public.library_book_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.library_books(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  token_count integer,
  embedding vector(1536),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (book_id, page_number, chunk_index)
);
GRANT SELECT ON public.library_book_chunks TO authenticated;
GRANT ALL ON public.library_book_chunks TO service_role;
ALTER TABLE public.library_book_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chunks readable by authenticated" ON public.library_book_chunks
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS library_book_chunks_book_page_idx
  ON public.library_book_chunks (book_id, page_number);
CREATE INDEX IF NOT EXISTS library_book_chunks_embedding_hnsw
  ON public.library_book_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS library_book_chunks_content_trgm
  ON public.library_book_chunks USING gin (content gin_trgm_ops);

-- Ensure sections have a matching HNSW index too
CREATE INDEX IF NOT EXISTS library_book_sections_embedding_hnsw
  ON public.library_book_sections USING hnsw (embedding vector_cosine_ops);

-- 2) Student learning memory (last book/page/section/audio)
CREATE TABLE IF NOT EXISTS public.library_student_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  last_book_id uuid REFERENCES public.library_books(id) ON DELETE SET NULL,
  last_page integer,
  last_section_id uuid REFERENCES public.library_book_sections(id) ON DELETE SET NULL,
  last_conversation_id uuid REFERENCES public.library_book_conversations(id) ON DELETE SET NULL,
  last_question text,
  last_answer text,
  last_audio_path text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_student_memory TO authenticated;
GRANT ALL ON public.library_student_memory TO service_role;
ALTER TABLE public.library_student_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "student manages own memory" ON public.library_student_memory
  FOR ALL TO authenticated
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

-- Per-book progress (last page opened, last section explained)
CREATE TABLE IF NOT EXISTS public.library_student_book_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  book_id uuid NOT NULL REFERENCES public.library_books(id) ON DELETE CASCADE,
  last_page integer NOT NULL DEFAULT 1,
  last_section_id uuid REFERENCES public.library_book_sections(id) ON DELETE SET NULL,
  reading_seconds integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, book_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_student_book_progress TO authenticated;
GRANT ALL ON public.library_student_book_progress TO service_role;
ALTER TABLE public.library_student_book_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "student manages own book progress" ON public.library_student_book_progress
  FOR ALL TO authenticated
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

-- 3) Weakness / mastery tracker (topic-level)
CREATE TABLE IF NOT EXISTS public.library_student_weaknesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  book_id uuid REFERENCES public.library_books(id) ON DELETE CASCADE,
  topic text NOT NULL,
  page_number integer,
  section_id uuid REFERENCES public.library_book_sections(id) ON DELETE SET NULL,
  wrong_count integer NOT NULL DEFAULT 0,
  right_count integer NOT NULL DEFAULT 0,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  strength_score numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, book_id, topic)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_student_weaknesses TO authenticated;
GRANT ALL ON public.library_student_weaknesses TO service_role;
ALTER TABLE public.library_student_weaknesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "student manages own weaknesses" ON public.library_student_weaknesses
  FOR ALL TO authenticated
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

-- 4) Generated quizzes (cached by hash of book+scope+prompt)
CREATE TABLE IF NOT EXISTS public.library_generated_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.library_books(id) ON DELETE CASCADE,
  scope text NOT NULL,
  scope_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  prompt_hash text NOT NULL,
  questions jsonb NOT NULL,
  question_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  hit_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (book_id, prompt_hash)
);
GRANT SELECT, INSERT, UPDATE ON public.library_generated_quizzes TO authenticated;
GRANT ALL ON public.library_generated_quizzes TO service_role;
ALTER TABLE public.library_generated_quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quizzes readable authenticated" ON public.library_generated_quizzes
  FOR SELECT TO authenticated USING (true);

-- 5) Recommendation cache
CREATE TABLE IF NOT EXISTS public.library_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  source_book_id uuid REFERENCES public.library_books(id) ON DELETE CASCADE,
  source_page integer,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.library_recommendations TO authenticated;
GRANT ALL ON public.library_recommendations TO service_role;
ALTER TABLE public.library_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "student sees own recommendations" ON public.library_recommendations
  FOR ALL TO authenticated
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

-- 6) Add embedding + summary to index nodes (chapter/lesson level)
ALTER TABLE public.library_book_index
  ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS library_book_index_embedding_hnsw
  ON public.library_book_index USING hnsw (embedding vector_cosine_ops);

-- 7) Page-level embedding for coarse retrieval
ALTER TABLE public.library_book_pages
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS ocr_confidence numeric;
CREATE INDEX IF NOT EXISTS library_book_pages_embedding_hnsw
  ON public.library_book_pages USING hnsw (embedding vector_cosine_ops);

-- 8) Hybrid vector search RPC (book-scoped)
CREATE OR REPLACE FUNCTION public.library_match_chunks(
  p_book_id uuid,
  p_query_embedding vector(1536),
  p_match_count integer DEFAULT 6
) RETURNS TABLE (
  id uuid,
  page_number integer,
  content text,
  similarity float
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT c.id, c.page_number, c.content,
         1 - (c.embedding <=> p_query_embedding) AS similarity
  FROM public.library_book_chunks c
  WHERE c.book_id = p_book_id
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;

-- 9) Trigger to bump updated_at on new tables
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_chunks_updated ON public.library_book_chunks;
CREATE TRIGGER trg_chunks_updated BEFORE UPDATE ON public.library_book_chunks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_memory_updated ON public.library_student_memory;
CREATE TRIGGER trg_memory_updated BEFORE UPDATE ON public.library_student_memory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_bp_updated ON public.library_student_book_progress;
CREATE TRIGGER trg_bp_updated BEFORE UPDATE ON public.library_student_book_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_weak_updated ON public.library_student_weaknesses;
CREATE TRIGGER trg_weak_updated BEFORE UPDATE ON public.library_student_weaknesses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 10) Add a new processing kind flag to enqueue embeddings job when ingest completes
-- (library_processing_jobs.kind is already free-text; workers dispatch by kind)

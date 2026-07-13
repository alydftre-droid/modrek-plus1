
-- Ensure vector extension available
CREATE EXTENSION IF NOT EXISTS vector;

-- Reuse existing updated_at trigger helper (already exists in project as public.update_updated_at_column)

-- ============================================================================
-- 1) library_access_tiers  (reference table for future subscription tiers)
-- ============================================================================
CREATE TABLE public.library_access_tiers (
  code TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.library_access_tiers TO authenticated, anon;
GRANT ALL ON public.library_access_tiers TO service_role;

ALTER TABLE public.library_access_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read access tiers"
  ON public.library_access_tiers FOR SELECT
  USING (true);

CREATE POLICY "Admins manage access tiers"
  ON public.library_access_tiers FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.library_access_tiers (code, name_ar, sort_order) VALUES
  ('free', 'مجاني', 1),
  ('premium', 'مميز', 2),
  ('vip', 'VIP', 3)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 2) library_books  (developer-managed books)
-- ============================================================================
CREATE TABLE public.library_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  cover_url TEXT,
  pdf_path TEXT,                       -- bstorage://library-books/{id}/source.pdf
  education_type TEXT NOT NULL CHECK (education_type IN ('عام','أزهر','both')),
  stage_id UUID REFERENCES public.library_stages(id) ON DELETE SET NULL,
  track_id UUID REFERENCES public.library_tracks(id) ON DELETE SET NULL,
  subject_id UUID REFERENCES public.library_subjects(id) ON DELETE SET NULL,
  subject_name_ar TEXT,                -- denormalised for grouping headers
  page_count INTEGER,
  file_size BIGINT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','uploading','processing','ready','failed','paused','hidden')),
  processing_progress INTEGER NOT NULL DEFAULT 0,   -- 0..100
  processing_stage TEXT,
  processing_error TEXT,
  access_tier TEXT NOT NULL DEFAULT 'free' REFERENCES public.library_access_tiers(code),
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_library_books_status ON public.library_books(status);
CREATE INDEX idx_library_books_edu ON public.library_books(education_type);
CREATE INDEX idx_library_books_scope ON public.library_books(stage_id, track_id, subject_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_books TO authenticated;
GRANT ALL ON public.library_books TO service_role;
ALTER TABLE public.library_books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all library books"
  ON public.library_books FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view ready free books"
  ON public.library_books FOR SELECT
  TO authenticated
  USING (
    status = 'ready'
    AND access_tier = 'free'
  );

CREATE TRIGGER trg_library_books_updated_at
  BEFORE UPDATE ON public.library_books
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 3) library_book_pages
-- ============================================================================
CREATE TABLE public.library_book_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES public.library_books(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  image_path TEXT,                     -- bstorage path to rasterised page image
  ocr_text TEXT,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (book_id, page_number)
);

CREATE INDEX idx_library_pages_book ON public.library_book_pages(book_id, page_number);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_book_pages TO authenticated;
GRANT ALL ON public.library_book_pages TO service_role;
ALTER TABLE public.library_book_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage pages"
  ON public.library_book_pages FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Readable when book is readable"
  ON public.library_book_pages FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.library_books b
    WHERE b.id = library_book_pages.book_id
      AND b.status = 'ready'
      AND b.access_tier = 'free'
  ));

CREATE TRIGGER trg_library_pages_updated_at
  BEFORE UPDATE ON public.library_book_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 4) library_book_sections  (clickable regions within a page)
-- ============================================================================
CREATE TABLE public.library_book_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES public.library_books(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES public.library_book_pages(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('title','paragraph','image','table','equation','list')),
  bbox JSONB NOT NULL,                       -- {x,y,w,h} normalised 0..1
  order_index INTEGER NOT NULL DEFAULT 0,
  raw_text TEXT,
  embedding vector(1536),                    -- openai/text-embedding-3-small for HNSW support
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_library_sections_page ON public.library_book_sections(page_id, order_index);
CREATE INDEX idx_library_sections_book ON public.library_book_sections(book_id);
CREATE INDEX idx_library_sections_vec
  ON public.library_book_sections USING hnsw (embedding vector_cosine_ops);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_book_sections TO authenticated;
GRANT ALL ON public.library_book_sections TO service_role;
ALTER TABLE public.library_book_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage sections"
  ON public.library_book_sections FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Readable when book is readable"
  ON public.library_book_sections FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.library_books b
    WHERE b.id = library_book_sections.book_id
      AND b.status = 'ready'
      AND b.access_tier = 'free'
  ));

CREATE TRIGGER trg_library_sections_updated_at
  BEFORE UPDATE ON public.library_book_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 5) library_section_explanations  (cached AI narration + audio)
-- ============================================================================
CREATE TABLE public.library_section_explanations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES public.library_books(id) ON DELETE CASCADE,
  page_id UUID REFERENCES public.library_book_pages(id) ON DELETE CASCADE,
  section_id UUID REFERENCES public.library_book_sections(id) ON DELETE CASCADE,
  variant TEXT NOT NULL DEFAULT 'default'
    CHECK (variant IN ('default','deeper','simpler')),
  prompt_hash TEXT NOT NULL,
  text_ar TEXT NOT NULL,
  audio_path TEXT,
  voice TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_library_expl_section_variant
  ON public.library_section_explanations(section_id, variant)
  WHERE section_id IS NOT NULL;

CREATE INDEX idx_library_expl_book ON public.library_section_explanations(book_id);
CREATE INDEX idx_library_expl_prompt ON public.library_section_explanations(prompt_hash);

GRANT SELECT ON public.library_section_explanations TO authenticated;
GRANT ALL ON public.library_section_explanations TO service_role;
ALTER TABLE public.library_section_explanations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage explanations"
  ON public.library_section_explanations FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Readable when book is readable"
  ON public.library_section_explanations FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.library_books b
    WHERE b.id = library_section_explanations.book_id
      AND b.status = 'ready'
      AND b.access_tier = 'free'
  ));

CREATE TRIGGER trg_library_expl_updated_at
  BEFORE UPDATE ON public.library_section_explanations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 6) library_processing_jobs
-- ============================================================================
CREATE TABLE public.library_processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES public.library_books(id) ON DELETE CASCADE,
  stage TEXT NOT NULL
    CHECK (stage IN ('upload','split','ocr','sections','embed','explain','tts','finalize')),
  state TEXT NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued','running','done','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  progress INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_library_jobs_book ON public.library_processing_jobs(book_id);
CREATE INDEX idx_library_jobs_state ON public.library_processing_jobs(state);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_processing_jobs TO authenticated;
GRANT ALL ON public.library_processing_jobs TO service_role;
ALTER TABLE public.library_processing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage jobs"
  ON public.library_processing_jobs FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_library_jobs_updated_at
  BEFORE UPDATE ON public.library_processing_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 7) Helper for future subscription access
-- ============================================================================
CREATE OR REPLACE FUNCTION public.has_library_access(_user_id UUID, _tier TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _tier = 'free' THEN true
    ELSE false  -- placeholder: extend once library subscriptions are introduced
  END;
$$;

REVOKE ALL ON FUNCTION public.has_library_access(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_library_access(UUID, TEXT) TO authenticated, service_role;

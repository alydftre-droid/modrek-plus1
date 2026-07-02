
-- =====================================================================
-- MODREK AI LIBRARY — Phase 1: Generic Knowledge Base Foundation
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- shared updated_at trigger ----------
CREATE OR REPLACE FUNCTION public.mlib_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- =====================================================================
-- TAXONOMY
-- =====================================================================

CREATE TABLE public.library_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_stages TO authenticated;
GRANT ALL ON public.library_stages TO service_role;
ALTER TABLE public.library_stages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.library_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,      -- 'general' | 'azhar'
  name_ar TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_sections TO authenticated;
GRANT ALL ON public.library_sections TO service_role;
ALTER TABLE public.library_sections ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.library_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES public.library_stages(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(stage_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_grades TO authenticated;
GRANT ALL ON public.library_grades TO service_role;
ALTER TABLE public.library_grades ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.library_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,      -- 'sci_science' | 'sci_math' | 'literary' | 'none'
  name_ar TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_tracks TO authenticated;
GRANT ALL ON public.library_tracks TO service_role;
ALTER TABLE public.library_tracks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.library_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  stage_id UUID REFERENCES public.library_stages(id) ON DELETE SET NULL,
  section_id UUID REFERENCES public.library_sections(id) ON DELETE SET NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(code, stage_id, section_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_subjects TO authenticated;
GRANT ALL ON public.library_subjects TO service_role;
ALTER TABLE public.library_subjects ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.library_sub_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES public.library_subjects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(subject_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_sub_subjects TO authenticated;
GRANT ALL ON public.library_sub_subjects TO service_role;
ALTER TABLE public.library_sub_subjects ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- SOURCE TYPES + SOURCES + VERSIONS + UNITS
-- =====================================================================

CREATE TABLE public.knowledge_source_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,   -- book | booklet | notes | exam | ministry_model | question_bank | worksheet | teacher_file | summary | other
  name_ar TEXT NOT NULL,
  icon TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_source_types TO authenticated;
GRANT ALL ON public.knowledge_source_types TO service_role;
ALTER TABLE public.knowledge_source_types ENABLE ROW LEVEL SECURITY;

CREATE TYPE public.knowledge_source_status AS ENUM (
  'draft','processing','ready','archived','failed'
);

CREATE TABLE public.knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE,
  source_type_id UUID NOT NULL REFERENCES public.knowledge_source_types(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT,
  author TEXT,
  publisher TEXT,
  publication_year INT,
  language TEXT NOT NULL DEFAULT 'ar',

  stage_id UUID REFERENCES public.library_stages(id) ON DELETE SET NULL,
  grade_id UUID REFERENCES public.library_grades(id) ON DELETE SET NULL,
  section_id UUID REFERENCES public.library_sections(id) ON DELETE SET NULL,
  track_id UUID REFERENCES public.library_tracks(id) ON DELETE SET NULL,
  subject_id UUID REFERENCES public.library_subjects(id) ON DELETE SET NULL,
  sub_subject_id UUID REFERENCES public.library_sub_subjects(id) ON DELETE SET NULL,
  term SMALLINT,                      -- 1 | 2 | NULL

  status public.knowledge_source_status NOT NULL DEFAULT 'draft',
  cover_asset_id UUID,                -- populated after storage_assets exists
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_sources TO authenticated;
GRANT ALL ON public.knowledge_sources TO service_role;
ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.knowledge_sources(source_type_id);
CREATE INDEX ON public.knowledge_sources(stage_id, grade_id, section_id, track_id, subject_id);
CREATE INDEX ON public.knowledge_sources(status);

CREATE TABLE public.knowledge_source_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  notes TEXT,
  is_current BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_id, version_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_source_versions TO authenticated;
GRANT ALL ON public.knowledge_source_versions TO service_role;
ALTER TABLE public.knowledge_source_versions ENABLE ROW LEVEL SECURITY;

-- Polymorphic hierarchical units (unit/chapter/lesson/page/question/section/...)
CREATE TYPE public.knowledge_unit_kind AS ENUM (
  'unit','chapter','lesson','section','page','question','model_answer','glossary','other'
);

CREATE TABLE public.knowledge_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES public.knowledge_source_versions(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.knowledge_units(id) ON DELETE CASCADE,
  kind public.knowledge_unit_kind NOT NULL,
  title TEXT,
  ordinal INT NOT NULL DEFAULT 0,
  page_from INT,
  page_to INT,
  content_text TEXT,           -- optional inline text
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_units TO authenticated;
GRANT ALL ON public.knowledge_units TO service_role;
ALTER TABLE public.knowledge_units ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.knowledge_units(version_id);
CREATE INDEX ON public.knowledge_units(parent_id);
CREATE INDEX ON public.knowledge_units(kind);

-- =====================================================================
-- STORAGE ASSETS (SHA-256 dedup)
-- =====================================================================

CREATE TABLE public.storage_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sha256 TEXT NOT NULL UNIQUE,
  storage_provider TEXT NOT NULL DEFAULT 'supabase', -- 'supabase' | 'bunny'
  bucket TEXT NOT NULL,
  object_path TEXT NOT NULL,
  mime_type TEXT,
  byte_size BIGINT,
  original_filename TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storage_assets TO authenticated;
GRANT ALL ON public.storage_assets TO service_role;
ALTER TABLE public.storage_assets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.knowledge_sources
  ADD CONSTRAINT knowledge_sources_cover_asset_fk
  FOREIGN KEY (cover_asset_id) REFERENCES public.storage_assets(id) ON DELETE SET NULL;

CREATE TABLE public.knowledge_source_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  version_id UUID REFERENCES public.knowledge_source_versions(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.knowledge_units(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.storage_assets(id) ON DELETE RESTRICT,
  role TEXT NOT NULL DEFAULT 'primary', -- primary | cover | attachment | derivative
  ordinal INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_source_assets TO authenticated;
GRANT ALL ON public.knowledge_source_assets TO service_role;
ALTER TABLE public.knowledge_source_assets ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.knowledge_source_assets(source_id);
CREATE INDEX ON public.knowledge_source_assets(version_id);
CREATE INDEX ON public.knowledge_source_assets(unit_id);
CREATE INDEX ON public.knowledge_source_assets(asset_id);

-- =====================================================================
-- AI PROVIDERS + MODELS (provider-agnostic)
-- =====================================================================

CREATE TABLE public.ai_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,   -- google | openai | anthropic | xai | deepseek | lovable
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_providers TO authenticated;
GRANT ALL ON public.ai_providers TO service_role;
ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;

CREATE TYPE public.ai_model_use_case AS ENUM (
  'text','vision','ocr','embedding','tts','stt','image_gen','multimodal'
);

CREATE TABLE public.ai_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.ai_providers(id) ON DELETE CASCADE,
  code TEXT NOT NULL,          -- e.g. 'gemini-2.5-pro'
  name TEXT NOT NULL,
  use_case public.ai_model_use_case NOT NULL,
  context_tokens INT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_models TO authenticated;
GRANT ALL ON public.ai_models TO service_role;
ALTER TABLE public.ai_models ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- PROCESSING PIPELINE (OCR / Parse / Chunk / Embed / Index)
-- =====================================================================

CREATE TYPE public.processing_job_kind AS ENUM (
  'ocr','parse','normalize','chunk','embed','index','classify','extract_questions','custom'
);
CREATE TYPE public.processing_job_status AS ENUM (
  'pending','running','succeeded','failed','cancelled','retrying'
);

CREATE TABLE public.processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  version_id UUID REFERENCES public.knowledge_source_versions(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES public.storage_assets(id) ON DELETE CASCADE,
  kind public.processing_job_kind NOT NULL,
  status public.processing_job_status NOT NULL DEFAULT 'pending',
  provider_id UUID REFERENCES public.ai_providers(id) ON DELETE SET NULL,
  model_id UUID REFERENCES public.ai_models(id) ON DELETE SET NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  priority INT NOT NULL DEFAULT 100,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.processing_jobs TO authenticated;
GRANT ALL ON public.processing_jobs TO service_role;
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.processing_jobs(status, priority, created_at);
CREATE INDEX ON public.processing_jobs(source_id);
CREATE INDEX ON public.processing_jobs(kind);

CREATE TABLE public.processing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.processing_jobs(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info',  -- info | warn | error | debug
  message TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.processing_events TO authenticated;
GRANT ALL ON public.processing_events TO service_role;
ALTER TABLE public.processing_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.processing_events(job_id);

-- =====================================================================
-- CONTENT CHUNKS + EMBEDDINGS (pgvector, ready for Phase 2)
-- =====================================================================

CREATE TABLE public.content_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES public.knowledge_source_versions(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.knowledge_units(id) ON DELETE CASCADE,
  ordinal INT NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  token_count INT,
  embedding vector(768),
  embedding_model_id UUID REFERENCES public.ai_models(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_chunks TO authenticated;
GRANT ALL ON public.content_chunks TO service_role;
ALTER TABLE public.content_chunks ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.content_chunks(source_id);
CREATE INDEX ON public.content_chunks(version_id);
CREATE INDEX ON public.content_chunks(unit_id);
CREATE INDEX content_chunks_embedding_hnsw
  ON public.content_chunks USING hnsw (embedding vector_cosine_ops);

-- =====================================================================
-- TAGS
-- =====================================================================

CREATE TABLE public.knowledge_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_tags TO authenticated;
GRANT ALL ON public.knowledge_tags TO service_role;
ALTER TABLE public.knowledge_tags ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.knowledge_tag_map (
  tag_id UUID NOT NULL REFERENCES public.knowledge_tags(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tag_id, source_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_tag_map TO authenticated;
GRANT ALL ON public.knowledge_tag_map TO service_role;
ALTER TABLE public.knowledge_tag_map ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- RLS — developers/admins only (uses existing public.has_role)
-- =====================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'library_stages','library_sections','library_grades','library_tracks',
    'library_subjects','library_sub_subjects',
    'knowledge_source_types','knowledge_sources','knowledge_source_versions',
    'knowledge_units','storage_assets','knowledge_source_assets',
    'ai_providers','ai_models','processing_jobs','processing_events',
    'content_chunks','knowledge_tags','knowledge_tag_map'
  ])
  LOOP
    EXECUTE format(
      'CREATE POLICY "admin_full_%1$s" ON public.%1$I FOR ALL TO authenticated
         USING (public.has_role(auth.uid(), ''admin''))
         WITH CHECK (public.has_role(auth.uid(), ''admin''));', t);
  END LOOP;
END $$;

-- =====================================================================
-- updated_at triggers
-- =====================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'library_stages','library_sections','library_grades','library_tracks',
    'library_subjects','library_sub_subjects',
    'knowledge_source_types','knowledge_sources','knowledge_source_versions',
    'knowledge_units','storage_assets','knowledge_source_assets',
    'ai_providers','ai_models','processing_jobs',
    'content_chunks','knowledge_tags'
  ])
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_touch BEFORE UPDATE ON public.%1$I
         FOR EACH ROW EXECUTE FUNCTION public.mlib_touch_updated_at();', t);
  END LOOP;
END $$;

-- =====================================================================
-- SEEDS
-- =====================================================================

INSERT INTO public.library_stages(code,name_ar,sort_order) VALUES
  ('primary','المرحلة الابتدائية',1),
  ('preparatory','المرحلة الإعدادية',2),
  ('secondary','المرحلة الثانوية',3);

INSERT INTO public.library_sections(code,name_ar,sort_order) VALUES
  ('general','عام',1),
  ('azhar','أزهر',2);

INSERT INTO public.library_tracks(code,name_ar,sort_order) VALUES
  ('none','بدون شعبة',0),
  ('sci_science','علمي علوم',1),
  ('sci_math','علمي رياضة',2),
  ('literary','أدبي',3);

INSERT INTO public.knowledge_source_types(code,name_ar,icon,sort_order) VALUES
  ('book','كتاب','book',1),
  ('booklet','ملزمة','booklet',2),
  ('notes','مذكرة','notebook',3),
  ('summary','ملخص','file-text',4),
  ('worksheet','ورقة مراجعة','clipboard',5),
  ('exam','امتحان','file-check',6),
  ('ministry_model','نموذج وزارة','landmark',7),
  ('question_bank','بنك أسئلة','database',8),
  ('teacher_file','ملف معلم','user',9),
  ('other','أخرى','file',99);

INSERT INTO public.ai_providers(code,name) VALUES
  ('google','Google (Gemini)'),
  ('openai','OpenAI'),
  ('anthropic','Anthropic (Claude)'),
  ('xai','xAI (Grok)'),
  ('deepseek','DeepSeek'),
  ('lovable','Lovable AI Gateway');

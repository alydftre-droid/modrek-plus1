-- Additive, reversible: no existing library data is modified or deleted.
CREATE TABLE IF NOT EXISTS public.knowledge_pdf_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.knowledge_source_versions(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.storage_assets(id) ON DELETE SET NULL,
  part_index integer NOT NULL,
  page_from integer NOT NULL,
  page_to integer NOT NULL,
  object_path text,
  byte_size bigint,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, part_index)
);

GRANT ALL ON public.knowledge_pdf_parts TO service_role;
GRANT SELECT ON public.knowledge_pdf_parts TO authenticated;
ALTER TABLE public.knowledge_pdf_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read pdf parts" ON public.knowledge_pdf_parts;
CREATE POLICY "admins read pdf parts"
  ON public.knowledge_pdf_parts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS knowledge_pdf_parts_version_idx
  ON public.knowledge_pdf_parts (version_id, part_index);

ALTER TABLE public.knowledge_source_versions
  ADD COLUMN IF NOT EXISTS pages_total integer,
  ADD COLUMN IF NOT EXISTS pages_processed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pages_failed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pipeline_health text;

-- ============ ADS / ANNOUNCEMENTS SYSTEM ============

-- Enum for ad types
DO $$ BEGIN
  CREATE TYPE public.ad_type AS ENUM ('teachers','subjects','discounts','info','updates','general');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Enum for link type
DO $$ BEGIN
  CREATE TYPE public.ad_link_type AS ENUM ('none','external','internal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Enum for target type
DO $$ BEGIN
  CREATE TYPE public.ad_target_type AS ENUM ('all','stage','grade','section','specific_students');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Enum for bundles placement
DO $$ BEGIN
  CREATE TYPE public.bundles_placement AS ENUM ('hidden','sidebar','ad_slider','homepage_banner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ Tables ============
CREATE TABLE IF NOT EXISTS public.ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  short_description text,
  full_content text,
  cover_image_url text,
  additional_images text[] DEFAULT '{}'::text[],
  video_url text,
  link_type public.ad_link_type NOT NULL DEFAULT 'none',
  external_url text,
  internal_route text,
  color text DEFAULT 'emerald',
  ad_type public.ad_type NOT NULL DEFAULT 'general',
  start_date timestamptz,
  end_date timestamptz,
  display_order int NOT NULL DEFAULT 0,
  slide_duration_seconds int NOT NULL DEFAULT 5,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ads_active_order ON public.ads(is_active, display_order);

CREATE TABLE IF NOT EXISTS public.ad_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id uuid NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  target_type public.ad_target_type NOT NULL DEFAULT 'all',
  stage text,
  education_type text,
  grade text,
  section text,
  student_ids uuid[] DEFAULT '{}'::uuid[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_targets_ad ON public.ad_targets(ad_id);

CREATE TABLE IF NOT EXISTS public.ad_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id uuid NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  clicked boolean NOT NULL DEFAULT false,
  clicked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ad_views_ad ON public.ad_views(ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_views_student ON public.ad_views(student_id);

CREATE TABLE IF NOT EXISTS public.ad_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bundles_button_placement public.bundles_placement NOT NULL DEFAULT 'sidebar',
  bundles_button_order int NOT NULL DEFAULT 0,
  show_student_code_with_ads boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.ad_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- updated_at triggers
DROP TRIGGER IF EXISTS trg_ads_updated ON public.ads;
CREATE TRIGGER trg_ads_updated BEFORE UPDATE ON public.ads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ad_settings_updated ON public.ad_settings;
CREATE TRIGGER trg_ad_settings_updated BEFORE UPDATE ON public.ad_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ RLS ============
ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_settings ENABLE ROW LEVEL SECURITY;

-- ADS: admins full access; authenticated users can read active+in-window
CREATE POLICY "ads_admin_all" ON public.ads
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ads_authenticated_read_active" ON public.ads
  FOR SELECT TO authenticated
  USING (
    is_active = true
    AND (start_date IS NULL OR start_date <= now())
    AND (end_date IS NULL OR end_date >= now())
  );

-- AD_TARGETS: admins full access; authenticated read (needed to evaluate targeting client side)
CREATE POLICY "ad_targets_admin_all" ON public.ad_targets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ad_targets_authenticated_read" ON public.ad_targets
  FOR SELECT TO authenticated
  USING (true);

-- AD_VIEWS: students can insert their own; admins can read all; students read own
CREATE POLICY "ad_views_insert_self" ON public.ad_views
  FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "ad_views_update_self" ON public.ad_views
  FOR UPDATE TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "ad_views_select_self" ON public.ad_views
  FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- AD_SETTINGS: admins update; everyone authenticated reads
CREATE POLICY "ad_settings_admin_write" ON public.ad_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ad_settings_read" ON public.ad_settings
  FOR SELECT TO authenticated
  USING (true);

-- ============ Storage bucket for ad media ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('ads-media','ads-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "ads_media_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'ads-media');

CREATE POLICY "ads_media_admin_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ads-media' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ads_media_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'ads-media' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ads_media_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'ads-media' AND public.has_role(auth.uid(), 'admin'));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.ads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ad_settings;

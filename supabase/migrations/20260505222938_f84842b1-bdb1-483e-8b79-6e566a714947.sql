-- Table to track latest app versions per platform
CREATE TABLE public.app_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('android','ios')),
  latest_version TEXT NOT NULL,
  latest_build_number INTEGER NOT NULL DEFAULT 1,
  min_supported_version TEXT,
  store_url TEXT NOT NULL,
  release_notes TEXT,
  force_update BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX app_versions_active_platform_idx
  ON public.app_versions(platform) WHERE is_active = true;

ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

-- Anyone (even anonymous) can read the active version info
CREATE POLICY "Anyone can read app versions"
ON public.app_versions FOR SELECT
USING (true);

-- Only admins can insert/update/delete
CREATE POLICY "Admins can insert app versions"
ON public.app_versions FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update app versions"
ON public.app_versions FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete app versions"
ON public.app_versions FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Auto update timestamp
CREATE TRIGGER update_app_versions_updated_at
BEFORE UPDATE ON public.app_versions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial Android version row pointing to Play Store
INSERT INTO public.app_versions (platform, latest_version, latest_build_number, store_url, release_notes, force_update)
VALUES ('android', '1.0.0', 1,
  'https://play.google.com/store/apps/details?id=com.modrek.plus',
  'الإصدار الأول من تطبيق مدرك Plus.',
  false);

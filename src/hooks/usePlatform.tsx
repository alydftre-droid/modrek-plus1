import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { detectPlatformSlug, forgetPlatformSlug } from "@/lib/platformHost";

export interface PlatformBranding {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  brand_color: string | null;
  owner_teacher_id: string;
  teacher_name: string | null;
  status: string;
}

interface PlatformContextValue {
  /** null = official Modrek Plus */
  platform: PlatformBranding | null;
  slug: string | null;
  isPlatform: boolean;
  isLoading: boolean;
  /** true when a slug was detected but no active platform exists for it */
  notFound: boolean;
}

const PlatformContext = createContext<PlatformContextValue>({
  platform: null,
  slug: null,
  isPlatform: false,
  isLoading: false,
  notFound: false,
});

export const usePlatform = () => useContext(PlatformContext);

export function PlatformProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const slug = useMemo(() => detectPlatformSlug(), []);
  const [platform, setPlatform] = useState<PlatformBranding | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(slug));
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.rpc("get_platform_by_slug", { _slug: slug });
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) {
        setNotFound(true);
        setPlatform(null);
        forgetPlatformSlug();
      } else {
        setPlatform(row as PlatformBranding);
        setNotFound(false);
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Bind the signed-in student to this platform (idempotent, server-validated).
  useEffect(() => {
    if (!platform || !user) return;
    if (role && role !== "student") return;
    supabase.rpc("platform_join_as_student", { _slug: platform.slug }).then(({ error }) => {
      if (error) console.info("[platform] join_skipped", error.message);
    });
  }, [platform?.slug, user?.id, role]);

  // Tenant branding colour, scoped to this document only.
  useEffect(() => {
    if (!platform) return;
    if (platform.brand_color) {
      document.documentElement.style.setProperty("--platform-brand", platform.brand_color);
    }
    document.title = platform.name;
    return () => {
      document.documentElement.style.removeProperty("--platform-brand");
    };
  }, [platform?.brand_color, platform?.name]);

  const value = useMemo<PlatformContextValue>(
    () => ({
      platform,
      slug,
      isPlatform: Boolean(platform),
      isLoading,
      notFound,
    }),
    [platform, slug, isLoading, notFound],
  );

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

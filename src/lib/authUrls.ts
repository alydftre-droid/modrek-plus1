import { platformBasePath, platformSlugFromHostname } from "@/lib/platformHost";

export const CANONICAL_APP_ORIGIN = "https://modrekplus.com";

/**
 * Build an absolute app URL used for auth redirects (email confirmation,
 * OAuth callbacks, password reset).
 *
 * On a teacher platform the tenant must survive the round trip, otherwise the
 * user comes back as an official Modrek Plus visitor:
 *  - subdomain form  → keep the current origin (`<slug>.modrekplus.com`)
 *  - `/p/<slug>` form → keep the origin and the `/p/<slug>` prefix
 * On the official platform the canonical origin is used, unchanged.
 */
export const buildCanonicalAppUrl = (path = "/") => {
  if (typeof window !== "undefined") {
    const onTenantSubdomain = Boolean(platformSlugFromHostname(window.location.hostname));
    const base = platformBasePath();
    if (onTenantSubdomain || base) {
      return new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`, window.location.origin).toString();
    }
  }
  return new URL(path, CANONICAL_APP_ORIGIN).toString();
};

/**
 * Teacher Platforms — tenant detection.
 *
 * A teacher platform is reachable in two ways:
 *  1. Subdomain (production):  https://<slug>.modrekplus.com
 *  2. Path fallback:           https://modrekplus.com/p/<slug>
 *     (used until the wildcard subdomain is configured, and on previews)
 *
 * The slug is never trusted for authorization — it only selects branding.
 * All data access is enforced by RLS via platform membership on the server.
 */

export const PLATFORM_ROOT_DOMAIN = "modrekplus.com";
export const PLATFORM_SLUG_STORAGE_KEY = "mp_platform_slug";

/** Hosts / labels that are never a tenant slug. */
const NON_TENANT_LABELS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "cdn",
  "mail",
  "notify",
  "preview",
  "id-preview",
  "staging",
  "dev",
  "modrek",
  "modrekplus",
  "localhost",
]);

const SLUG_RE = /^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])$/;

export function isValidPlatformSlug(slug: string): boolean {
  const s = (slug || "").toLowerCase().trim();
  return SLUG_RE.test(s) && !NON_TENANT_LABELS.has(s);
}

export function normalizePlatformSlug(input: string): string {
  return (input || "")
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

/** Extract the tenant slug from a hostname, or null for the official platform. */
export function platformSlugFromHostname(hostname: string): string | null {
  const host = (hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host.endsWith(`.${PLATFORM_ROOT_DOMAIN}`)) return null;
  const label = host.slice(0, host.length - PLATFORM_ROOT_DOMAIN.length - 1);
  if (!label || label.includes(".")) return null;
  return isValidPlatformSlug(label) ? label : null;
}

/** Extract the tenant slug from a `/p/<slug>` pathname, or null. */
export function platformSlugFromPathname(pathname: string): string | null {
  const match = /^\/p\/([^/?#]+)/.exec(pathname || "");
  if (!match) return null;
  const slug = normalizePlatformSlug(decodeURIComponent(match[1]));
  return isValidPlatformSlug(slug) ? slug : null;
}

export function rememberPlatformSlug(slug: string) {
  try {
    window.localStorage.setItem(PLATFORM_SLUG_STORAGE_KEY, slug);
  } catch {
    /* storage unavailable */
  }
}

export function forgetPlatformSlug() {
  try {
    window.localStorage.removeItem(PLATFORM_SLUG_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

function storedPlatformSlug(): string | null {
  try {
    const slug = window.localStorage.getItem(PLATFORM_SLUG_STORAGE_KEY);
    return slug && isValidPlatformSlug(slug) ? slug : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the current tenant slug for this browsing session.
 * Priority: hostname → `/p/<slug>` path → remembered path-mode slug.
 */
export function detectPlatformSlug(): string | null {
  if (typeof window === "undefined") return null;

  const fromHost = platformSlugFromHostname(window.location.hostname);
  if (fromHost) return fromHost;

  const fromPath = platformSlugFromPathname(window.location.pathname);
  if (fromPath) {
    rememberPlatformSlug(fromPath);
    return fromPath;
  }

  return storedPlatformSlug();
}

/** Public URL of a platform (subdomain form). */
export function platformUrl(slug: string): string {
  return `https://${slug}.${PLATFORM_ROOT_DOMAIN}`;
}

/** Path-based fallback URL, always reachable without wildcard DNS. */
export function platformFallbackUrl(slug: string): string {
  return `https://${PLATFORM_ROOT_DOMAIN}/p/${slug}`;
}

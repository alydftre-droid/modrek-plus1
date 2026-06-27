import { supabase } from "@/integrations/supabase/client";

// Bunny Storage integration utilities
// Storage Zone: modrekplus-storage
// CDN: modrekplus-storage.b-cdn.net

const BUNNY_CDN_HOST = "modrekplus-storage.b-cdn.net";
const TOKEN_EXPIRY_BUFFER_MS = 60_000;
const SUPABASE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string;

export function getSupabaseFunctionsConfig() {
  return {
    supabaseUrl: SUPABASE_FUNCTIONS_URL,
    supabaseKey: SUPABASE_PUBLISHABLE_KEY,
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function isUsableAccessToken(token?: string | null): token is string {
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  const exp = typeof payload?.exp === "number" ? payload.exp * 1000 : 0;
  return !exp || exp - Date.now() > TOKEN_EXPIRY_BUFFER_MS;
}

function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.includes("auth-token")) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const token = parsed?.access_token || parsed?.currentSession?.access_token || parsed?.session?.access_token;
      if (isUsableAccessToken(token)) return token;
    }
  } catch {
    return null;
  }
  return null;
}

const objectUrlCache = new Map<string, string>();

function resolveBunnyStorageProxyUrl(path: string) {
  const { supabaseUrl, supabaseKey } = getSupabaseFunctionsConfig();
  if (!supabaseUrl || !supabaseKey) return null;
  return `${supabaseUrl}/functions/v1/bunny-storage?action=download&path=${encodeURIComponent(path)}&apikey=${supabaseKey}`;
}

/**
 * Check if a file_url is stored on Bunny Storage
 */
export function isBunnyStorageFile(fileUrl: string): boolean {
  return fileUrl?.startsWith("bstorage://") || fileUrl?.includes(BUNNY_CDN_HOST) || false;
}

/**
 * Extract the storage path from a bstorage:// URL
 */
export function extractBunnyStoragePath(fileUrl: string): string | null {
  if (fileUrl?.startsWith("bstorage://")) {
    return fileUrl.replace("bstorage://", "");
  }
  if (fileUrl?.includes(BUNNY_CDN_HOST)) {
    try {
      const url = new URL(fileUrl);
      return url.pathname.replace(/^\//, "");
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Get the CDN URL for a Bunny Storage file
 */
export function getBunnyStorageCdnUrl(path: string): string {
  return `https://${BUNNY_CDN_HOST}/${path}`;
}

/**
 * Resolve a file URL - if it's a bstorage:// URL, return the download proxy URL
 * This proxies through the edge function to avoid CDN auth issues
 */
export function resolveBunnyStorageUrl(fileUrl: string): string {
  if (fileUrl?.startsWith("bstorage://")) {
    const path = fileUrl.replace("bstorage://", "");
    return resolveBunnyStorageProxyUrl(path) || fileUrl;
  }
  return fileUrl;
}

export async function resolveBunnyStorageBlobUrl(fileUrl: string, accessTokenOverride?: string | null): Promise<string> {
  if (!fileUrl?.startsWith("bstorage://")) return fileUrl;
  if (objectUrlCache.has(fileUrl)) return objectUrlCache.get(fileUrl)!;

  const path = fileUrl.replace("bstorage://", "");
  const proxyUrl = resolveBunnyStorageProxyUrl(path);
  const accessToken = await getCurrentAccessToken(accessTokenOverride);
  if (!proxyUrl || !accessToken) return fileUrl;

  const response = await fetch(proxyUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return fileUrl;

  const objectUrl = URL.createObjectURL(await response.blob());
  objectUrlCache.set(fileUrl, objectUrl);
  return objectUrl;
}

export async function getCurrentAccessToken(fallbackToken?: string | null): Promise<string | null> {
  if (isUsableAccessToken(fallbackToken)) return fallbackToken;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } } as any));
    if (isUsableAccessToken(session?.access_token)) return session.access_token;

    const storedToken = getStoredAccessToken();
    if (storedToken) return storedToken;

    if (attempt >= 1) {
      const { data: refreshData } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } } as any));
      if (isUsableAccessToken(refreshData.session?.access_token)) return refreshData.session.access_token;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 350));
  }

  return null;
}

/**
 * Upload a file to Bunny Storage via edge function (server-side proxy)
 * Returns the bstorage:// URI for DB storage
 */
export async function uploadToBunnyStorage(
  file: File,
  storagePath: string,
  onProgress?: (loaded: number, total: number) => void,
  accessTokenOverride?: string | null,
): Promise<string> {
  const { supabaseUrl, supabaseKey } = getSupabaseFunctionsConfig();
  const accessToken = await getCurrentAccessToken(accessTokenOverride);

  if (!accessToken || !supabaseUrl || !supabaseKey) {
    throw new Error("تعذر تجهيز جلسة الحساب. أغلق نافذة الرفع وافتحها مرة أخرى ثم حاول مجددًا");
  }

  // Upload via server-side proxy (no API keys exposed to client)
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          onProgress(e.loaded, e.total);
        }
      });
    }

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status}`));
    });
    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

    xhr.open("PUT", `${supabaseUrl}/functions/v1/bunny-storage?action=upload&path=${encodeURIComponent(storagePath)}`);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", supabaseKey);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.send(file);
  });

  return `bstorage://${storagePath}`;
}

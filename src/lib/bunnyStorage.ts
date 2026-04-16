// Bunny Storage integration utilities
// Storage Zone: 301165
// CDN: 301165.b-cdn.net

const BUNNY_CDN_HOST = "301165.b-cdn.net";

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
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://qohhrliaecdtaeyfhcvb.supabase.co";
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    return `${supabaseUrl}/functions/v1/bunny-storage?action=download&path=${encodeURIComponent(path)}&apikey=${supabaseKey}`;
  }
  return fileUrl;
}

/**
 * Upload a file to Bunny Storage via edge function (server-side proxy)
 * Returns the bstorage:// URI for DB storage
 */
export async function uploadToBunnyStorage(
  file: File,
  storagePath: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://qohhrliaecdtaeyfhcvb.supabase.co";
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;

  if (!accessToken) {
    throw new Error("يجب تسجيل الدخول لرفع الملفات");
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

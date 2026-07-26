/**
 * Client-side helper to delete media assets from Bunny.net (Stream + Storage)
 * BEFORE deleting the associated database rows. The bunny edge functions
 * authorize deletion by verifying that the DB row still references the asset,
 * so this MUST run before the row is removed.
 *
 * Supported URL prefixes:
 *   - bunny://<videoId>       → Bunny Stream (video)
 *   - bstorage://<path>       → Bunny Storage (file/PDF/thumbnail)
 * Any other URL (https://…) is ignored — it points to a non-Bunny source.
 */
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function deleteBunnyVideo(videoId: string): Promise<void> {
  try {
    const headers = await authHeader();
    await fetch(
      `${SUPABASE_URL}/functions/v1/bunny-stream?action=delete-video&videoId=${encodeURIComponent(videoId)}`,
      { method: "POST", headers },
    );
  } catch (err) {
    console.warn("[bunnyCleanup] stream delete failed", videoId, err);
  }
}

async function deleteBunnyStoragePath(path: string): Promise<void> {
  try {
    const headers = await authHeader();
    await fetch(
      `${SUPABASE_URL}/functions/v1/bunny-storage?action=delete&path=${encodeURIComponent(path)}`,
      { method: "POST", headers },
    );
  } catch (err) {
    console.warn("[bunnyCleanup] storage delete failed", path, err);
  }
}

/** Delete a single asset URL (bunny:// or bstorage://). No-op for other schemes. */
export async function deleteBunnyAsset(url: string | null | undefined): Promise<void> {
  if (!url) return;
  if (url.startsWith("bunny://")) {
    await deleteBunnyVideo(url.replace("bunny://", ""));
  } else if (url.startsWith("bstorage://")) {
    await deleteBunnyStoragePath(url.replace("bstorage://", ""));
  }
}

/** Delete every Bunny asset referenced by a content row. */
export async function deleteContentBunnyAssets(input: {
  file_url?: string | null;
  thumbnail_url?: string | null;
}): Promise<void> {
  await Promise.all([
    deleteBunnyAsset(input.file_url),
    deleteBunnyAsset(input.thumbnail_url),
  ]);
}

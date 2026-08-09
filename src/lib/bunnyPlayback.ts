import { supabase } from "@/integrations/supabase/client";
import { extractBunnyVideoId, getBunnyEmbedUrl, isBunnyVideo } from "@/lib/bunnyStream";

export interface SignedPlayback {
  videoId: string;
  playbackUrl: string; // HLS .m3u8 (signed when Bunny token auth is enabled)
  embedUrl: string;    // iframe embed URL (signed when Bunny token auth is enabled)
  thumbnailUrl: string;
  expiresAt: number;   // unix seconds
  signed: boolean;
}

// Simple in-memory cache so we don't re-sign on every remount within the same session.
// We keep the URL until 5 minutes before expiry, then re-sign on next open.
const cache = new Map<string, SignedPlayback>();

function isFresh(sp: SignedPlayback): boolean {
  return sp.expiresAt * 1000 - Date.now() > 5 * 60 * 1000;
}

async function fetchEmbedFallback(videoId: string): Promise<SignedPlayback | null> {
  try {
    const embedUrl = getBunnyEmbedUrl(videoId);
    const response = await fetch(embedUrl, { credentials: "omit" });
    if (!response.ok) return null;
    const html = await response.text();
    const decode = (value: string) => {
      const textarea = document.createElement("textarea");
      textarea.innerHTML = value;
      return textarea.value;
    };
    const playbackUrl = decode(
      html.match(/<source[^>]+type=["']application\/vnd\.apple\.mpegURL["'][^>]+src=["']([^"']+playlist\.m3u8[^"']*)["']/i)?.[1]
      || html.match(/urlPlaylistUrl\s*=\s*["']([^"']+playlist\.m3u8[^"']*)["']/i)?.[1]
      || html.match(/(https:\/\/[^"'\s<>]+playlist\.m3u8[^"'\s<>]*)/i)?.[1]
      || ""
    );
    if (!playbackUrl) return null;
    const thumbnailUrl = decode(
      html.match(/data-poster=["']([^"']+thumbnail\.jpg[^"']*)["']/i)?.[1]
      || html.match(/property=["']og:image["'][^>]+content=["']([^"']+thumbnail\.jpg[^"']*)["']/i)?.[1]
      || html.match(/content=["']([^"']+thumbnail\.jpg[^"']*)["'][^>]+property=["']og:image["']/i)?.[1]
      || ""
    );
    return {
      videoId,
      playbackUrl,
      embedUrl,
      thumbnailUrl,
      expiresAt: Math.floor(Date.now() / 1000) + 60 * 60,
      signed: true,
    };
  } catch {
    return null;
  }
}

/**
 * Request a short-lived signed playback URL for a Bunny Stream video.
 * The server validates the caller has access to the underlying content row.
 * Falls back to the unsigned URL if the server cannot sign (e.g. token key not
 * configured) so playback keeps working during the initial rollout.
 */
export async function getSignedPlayback(fileUrlOrVideoId: string): Promise<SignedPlayback | null> {
  const videoId = isBunnyVideo(fileUrlOrVideoId)
    ? extractBunnyVideoId(fileUrlOrVideoId)
    : fileUrlOrVideoId;
  if (!videoId) return null;

  const cached = cache.get(videoId);
  if (cached && isFresh(cached)) return cached;

  const { data, error } = await supabase.functions.invoke("bunny-stream?action=sign-playback", {
    body: { videoId },
  });

  if (error || !data?.playbackUrl) {
    const fallback = await fetchEmbedFallback(videoId);
    if (fallback) {
      cache.set(videoId, fallback);
      return fallback;
    }
    return null;
  }

  const sp: SignedPlayback = {
    videoId: data.videoId,
    playbackUrl: data.playbackUrl,
    embedUrl: data.embedUrl,
    thumbnailUrl: data.thumbnailUrl,
    expiresAt: data.expiresAt,
    signed: !!data.signed,
  };
  cache.set(videoId, sp);
  return sp;
}

/* ------------------------------------------------------------------ */
/*  Encoding status                                                    */
/* ------------------------------------------------------------------ */

export interface BunnyVideoStatus {
  videoId: string;
  status: number;
  statusLabel: string;
  encodeProgress: number;
  availableResolutions: string[];
  isPlayable: boolean;
  isProcessing: boolean;
  isFailed: boolean;
  neverUploaded?: boolean;
  error?: string;
}

/**
 * Ask the backend for the real Bunny encoding status of a video so the UI can
 * show progress / a precise error instead of an endless "processing" screen.
 */
export async function getBunnyVideoStatus(fileUrlOrVideoId: string): Promise<BunnyVideoStatus | null> {
  const videoId = isBunnyVideo(fileUrlOrVideoId)
    ? extractBunnyVideoId(fileUrlOrVideoId)
    : fileUrlOrVideoId;
  if (!videoId) return null;
  const { data, error } = await supabase.functions.invoke("bunny-stream?action=video-status", {
    body: { videoId },
  });
  if (error || !data) return null;
  return data as BunnyVideoStatus;
}

/** Teacher/admin only: ask Bunny to re-encode a stuck or failed video. */
export async function requestBunnyReencode(fileUrlOrVideoId: string): Promise<boolean> {
  const videoId = isBunnyVideo(fileUrlOrVideoId)
    ? extractBunnyVideoId(fileUrlOrVideoId)
    : fileUrlOrVideoId;
  if (!videoId) return false;
  const { data, error } = await supabase.functions.invoke("bunny-stream?action=reencode", {
    body: { videoId },
  });
  return !error && Boolean((data as any)?.success);
}

/** Drop any cached signed URLs for a video (used after a re-encode). */
export function clearPlaybackCache(videoId?: string) {
  if (videoId) cache.delete(videoId);
  else cache.clear();
}

/* ------------------------------------------------------------------ */
/*  Signed thumbnails (video covers)                                   */
/* ------------------------------------------------------------------ */

const thumbCache = new Map<string, { url: string | null; at: number }>();
const thumbInflight = new Map<string, Promise<string | null>>();

/**
 * Bunny pull zone uses token authentication, so the plain
 * `https://<cdn>/<videoId>/thumbnail.jpg` URL always returns 403.
 * The `sign-playback` action resolves a real (signed) poster URL, so use it
 * for every video cover shown to teachers and students.
 */
export async function getSignedThumbnail(fileUrlOrVideoId: string): Promise<string | null> {
  const videoId = isBunnyVideo(fileUrlOrVideoId)
    ? extractBunnyVideoId(fileUrlOrVideoId)
    : fileUrlOrVideoId;
  if (!videoId) return null;

  const cached = thumbCache.get(videoId);
  if (cached && Date.now() - cached.at < 30 * 60 * 1000) return cached.url;

  const existing = thumbInflight.get(videoId);
  if (existing) return existing;

  const task = (async () => {
    try {
      const sp = await getSignedPlayback(videoId);
      const url = sp?.thumbnailUrl || null;
      thumbCache.set(videoId, { url, at: Date.now() });
      return url;
    } catch {
      thumbCache.set(videoId, { url: null, at: Date.now() });
      return null;
    } finally {
      thumbInflight.delete(videoId);
    }
  })();
  thumbInflight.set(videoId, task);
  return task;
}

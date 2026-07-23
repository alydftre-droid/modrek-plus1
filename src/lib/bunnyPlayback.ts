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

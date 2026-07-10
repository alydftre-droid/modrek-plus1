import { supabase } from "@/integrations/supabase/client";
import { extractBunnyVideoId, isBunnyVideo } from "@/lib/bunnyStream";

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

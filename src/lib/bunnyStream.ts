// Bunny Stream integration utilities
// Library ID: 686928
// CDN Hostname: vz-9fc4b938-1b7.b-cdn.net

const BUNNY_LIBRARY_ID = "686928";
const BUNNY_CDN_HOSTNAME = "vz-9fc4b938-1b7.b-cdn.net";

/**
 * Check if a file_url is a Bunny Stream video
 */
export function isBunnyVideo(fileUrl: string): boolean {
  return fileUrl?.startsWith("bunny://") || false;
}

/**
 * Extract Bunny video ID from bunny:// URL
 */
export function extractBunnyVideoId(fileUrl: string): string | null {
  if (!fileUrl?.startsWith("bunny://")) return null;
  return fileUrl.replace("bunny://", "");
}

/**
 * Get the HLS playlist URL for a Bunny video
 */
export function getBunnyPlaybackUrl(videoId: string): string {
  return `https://${BUNNY_CDN_HOSTNAME}/${videoId}/playlist.m3u8`;
}

/**
 * Get direct MP4 URL for a specific resolution
 */
export function getBunnyDirectUrl(videoId: string, resolution: "360p" | "480p" | "720p" | "1080p" = "720p"): string {
  return `https://${BUNNY_CDN_HOSTNAME}/${videoId}/play_${resolution}.mp4`;
}

/**
 * Get the embed URL for iframe playback
 */
export function getBunnyEmbedUrl(videoId: string): string {
  return `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${videoId}?autoplay=false&preload=true`;
}

/**
 * Get thumbnail URL
 */
export function getBunnyThumbnailUrl(videoId: string): string {
  return `https://${BUNNY_CDN_HOSTNAME}/${videoId}/thumbnail.jpg`;
}

/**
 * Resolve a file_url to the actual playable URL.
 * Bunny videos → HLS adaptive playlist (chunked + adaptive bitrate, like YouTube).
 */
export function resolveVideoUrl(fileUrl: string): { url: string; isBunny: boolean; videoId?: string; isHls: boolean } {
  if (isBunnyVideo(fileUrl)) {
    const videoId = extractBunnyVideoId(fileUrl)!;
    return {
      url: getBunnyPlaybackUrl(videoId), // HLS .m3u8 — adaptive streaming
      isBunny: true,
      videoId,
      isHls: true,
    };
  }
  const isHls = /\.m3u8(\?|$)/i.test(fileUrl);
  return { url: fileUrl, isBunny: false, isHls };
}

/**
 * Per-resolution HLS playlist for a Bunny video (used when the master playlist
 * exposes a single rendition and we want to offer manual quality selection).
 */
export function getBunnyResolutionPlaylistUrl(videoId: string, resolution: string): string {
  const res = resolution.endsWith("p") ? resolution : `${resolution}p`;
  return `https://${BUNNY_CDN_HOSTNAME}/${videoId}/${res}/video.m3u8`;
}

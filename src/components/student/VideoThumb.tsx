import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { isBunnyVideo } from "@/lib/bunnyStream";
import { getSignedThumbnail } from "@/lib/bunnyPlayback";

interface Props {
  url: string;
  /** Optional teacher-uploaded thumbnail (preferred when present) */
  thumbnailUrl?: string | null;
  /** Tailwind size classes for the wrapper */
  className?: string;
  rounded?: string;
}

/**
 * Smart video thumbnail. Picks, in order:
 *   1. Teacher's manually uploaded thumbnail
 *   2. Bunny Stream signed poster (the plain CDN thumbnail URL is 403 because
 *      the pull zone uses token authentication)
 *   3. Frame extracted from the actual video (non-Bunny sources)
 *   4. A play-icon placeholder
 */
export default function VideoThumb({ url, thumbnailUrl, className, rounded = "rounded-xl" }: Props) {
  const [extracted, setExtracted] = useState<string | null>(null);
  const [bunnyThumb, setBunnyThumb] = useState<string | null>(null);
  const [manualFailed, setManualFailed] = useState(false);
  const [bunnyFailed, setBunnyFailed] = useState(false);

  // Bunny videos: ask the backend for a signed poster URL.
  useEffect(() => {
    let cancelled = false;
    setBunnyThumb(null);
    setBunnyFailed(false);
    if ((!manualFailed && thumbnailUrl) || !url || !isBunnyVideo(url)) return;
    getSignedThumbnail(url).then((u) => {
      if (!cancelled) setBunnyThumb(u);
    });
    return () => { cancelled = true; };
  }, [url, thumbnailUrl, manualFailed]);

  useEffect(() => {
    setManualFailed(false);
    setBunnyFailed(false);
  }, [url, thumbnailUrl]);

  // Non-Bunny videos: grab a frame from the file itself.
  useEffect(() => {
    if ((!manualFailed && thumbnailUrl) || bunnyFailed || !url || isBunnyVideo(url)) return;
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "metadata";
    video.muted = true;

    const onMeta = () => {
      try { video.currentTime = Math.min(1, (video.duration || 1) * 0.1); } catch { setBunnyFailed(true); }
    };
    const onSeek = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 320; c.height = 180;
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, c.width, c.height);
          setExtracted(c.toDataURL("image/jpeg", 0.7));
        }
      } catch { setBunnyFailed(true); }
      video.remove();
    };
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("seeked", onSeek);
    const onError = () => setBunnyFailed(true);
    video.addEventListener("error", onError);
    video.src = url;
    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("seeked", onSeek);
      video.removeEventListener("error", onError);
      video.remove();
    };
  }, [url, thumbnailUrl, manualFailed, bunnyFailed]);

  const src = (!manualFailed ? thumbnailUrl : null) || (!bunnyFailed ? bunnyThumb : null) || extracted;
  const wrapperClass = className || "w-20 h-14 shrink-0";

  if (src) {
    return (
      <div className={`relative overflow-hidden bg-black/40 ${rounded} ${wrapperClass}`}>
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => {
            if (!manualFailed && thumbnailUrl && src === thumbnailUrl) setManualFailed(true);
            else setBunnyFailed(true);
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow">
            <Play className="h-4 w-4 fill-primary text-primary" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center bg-primary text-primary-foreground ${rounded} ${wrapperClass}`}>
      <Play className="h-6 w-6" />
    </div>
  );
}

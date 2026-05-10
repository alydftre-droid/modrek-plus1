import { useEffect, useMemo, useState } from "react";
import { Play } from "lucide-react";
import { extractBunnyVideoId, getBunnyThumbnailUrl, isBunnyVideo } from "@/lib/bunnyStream";

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
 *   2. Bunny Stream auto thumbnail
 *   3. Frame extracted from the actual video
 *   4. A play-icon placeholder
 */
export default function VideoThumb({ url, thumbnailUrl, className, rounded = "rounded-xl" }: Props) {
  const [extracted, setExtracted] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const bunnyThumb = useMemo(() => {
    if (!isBunnyVideo(url)) return null;
    const id = extractBunnyVideoId(url);
    return id ? getBunnyThumbnailUrl(id) : null;
  }, [url]);

  useEffect(() => {
    if (thumbnailUrl || bunnyThumb || failed || !url || isBunnyVideo(url)) return;
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "metadata";
    video.muted = true;

    const onMeta = () => {
      try { video.currentTime = Math.min(1, (video.duration || 1) * 0.1); } catch { setFailed(true); }
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
      } catch { setFailed(true); }
      video.remove();
    };
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("seeked", onSeek);
    video.addEventListener("error", () => setFailed(true));
    video.src = url;
    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("seeked", onSeek);
      video.remove();
    };
  }, [url, thumbnailUrl, bunnyThumb, failed]);

  const src = thumbnailUrl || bunnyThumb || extracted;
  const wrapperClass = className || "w-20 h-14 shrink-0";

  if (src) {
    return (
      <div className={`relative overflow-hidden bg-black/40 ${rounded} ${wrapperClass}`}>
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
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

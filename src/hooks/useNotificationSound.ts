import { useCallback, useRef } from "react";

/**
 * Plays a short notification ding. Browser autoplay policies require a prior
 * user interaction; we keep a single Audio instance and ignore failures.
 */
export function useNotificationSound(src: string = "/notification.wav") {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = useCallback(() => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(src);
        audioRef.current.volume = 0.5;
      }
      audioRef.current.currentTime = 0;
      const p = audioRef.current.play();
      if (p && typeof (p as Promise<void>).catch === "function") {
        (p as Promise<void>).catch(() => {});
      }
    } catch {
      // ignore
    }
  }, [src]);

  return play;
}

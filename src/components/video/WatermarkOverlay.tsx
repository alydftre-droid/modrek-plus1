import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const POSITIONS = [
  { top: "6%",  left: "5%",  right: "auto",  bottom: "auto" },
  { top: "6%",  left: "auto", right: "5%",   bottom: "auto" },
  { top: "45%", left: "5%",  right: "auto",  bottom: "auto" },
  { top: "45%", left: "auto", right: "5%",   bottom: "auto" },
  { top: "auto", left: "5%",  right: "auto", bottom: "8%"   },
  { top: "auto", left: "auto", right: "5%",  bottom: "8%"   },
];

interface WatermarkOverlayProps {
  /** show for this many seconds each cycle */
  showSeconds?: number;
  /** cycle length in seconds */
  intervalSeconds?: number;
}

/**
 * Subtle rotating watermark that shows only "ID: {student_id}" for a few
 * seconds every couple of minutes, in a randomised corner. Never displays
 * name / email / phone. Pointer-events disabled so it never blocks the video.
 */
const WatermarkOverlay = ({ showSeconds = 4, intervalSeconds = 120 }: WatermarkOverlayProps) => {
  const { user } = useAuth();
  const [studentId, setStudentId] = useState<string>("");
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState(POSITIONS[0]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) return;
      // Prefer the human-readable unique_id; fall back to a short slice of the auth uid.
      let id = "";
      try {
        const { data } = await supabase
          .from("profiles")
          .select("unique_id")
          .eq("id", user.id)
          .maybeSingle();
        if (data && (data as any).unique_id) id = String((data as any).unique_id);
      } catch {}
      if (!id) id = user.id.replace(/-/g, "").slice(-6).toUpperCase();
      if (!cancelled) setStudentId(id);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!studentId) return;
    let timeout: ReturnType<typeof setTimeout>;
    const show = () => {
      setPos(POSITIONS[Math.floor(Math.random() * POSITIONS.length)]);
      setVisible(true);
      timeout = setTimeout(() => {
        setVisible(false);
        timeout = setTimeout(show, intervalSeconds * 1000);
      }, showSeconds * 1000);
    };
    // First appearance after ~30s so it does not overlap the first frame.
    timeout = setTimeout(show, 30 * 1000);
    return () => clearTimeout(timeout);
  }, [studentId, showSeconds, intervalSeconds]);

  if (!studentId || !visible) return null;

  return (
    <div
      aria-hidden
      className="absolute z-[110] select-none pointer-events-none transition-opacity duration-700"
      style={{
        ...pos,
        opacity: visible ? 0.55 : 0,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "11px",
        letterSpacing: "0.05em",
        color: "#ffffff",
        textShadow: "0 1px 2px rgba(0,0,0,0.85)",
        padding: "2px 6px",
        borderRadius: "4px",
        background: "rgba(0,0,0,0.18)",
        backdropFilter: "blur(1px)",
      }}
    >
      ID: {studentId}
    </div>
  );
};

export default WatermarkOverlay;

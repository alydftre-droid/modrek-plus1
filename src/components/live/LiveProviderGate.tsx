import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { isZoomEnabled } from "@/lib/zoomMeeting";
import LiveClassTeacher from "./LiveClassTeacher";
import LiveClassStudent from "./LiveClassStudent";
import ZoomMeetingView from "./ZoomMeetingView";

/**
 * Chooses the live provider at runtime:
 * - Zoom, when the server has Zoom credentials AND (for students) the session
 *   was created by Zoom.
 * - Otherwise the existing Jitsi flow, unchanged.
 */
interface Props {
  mode: "host" | "attendee";
  groupId: string;
  groupTitle: string;
  session?: any;
  onClose: () => void;
}

export default function LiveProviderGate({ mode, groupId, groupTitle, session, onClose }: Props) {
  const sessionProvider = session?.provider as string | undefined;
  const [provider, setProvider] = useState<"loading" | "zoom" | "jitsi">(() => {
    // An existing session dictates its own provider — never switch mid-session.
    if (sessionProvider === "jitsi") return "jitsi";
    if (sessionProvider === "zoom") return "zoom";
    return "loading";
  });

  useEffect(() => {
    if (provider !== "loading") return;
    let cancelled = false;
    isZoomEnabled().then((enabled) => {
      if (!cancelled) setProvider(enabled ? "zoom" : "jitsi");
    });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  if (provider === "loading") {
    return (
      <div className="fixed inset-0 z-[80] bg-background/95 flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground">جاري تحضير البث المباشر...</p>
      </div>
    );
  }

  if (provider === "zoom") {
    return (
      <ZoomMeetingView
        mode={mode}
        groupId={groupId}
        groupTitle={groupTitle}
        sessionId={session?.id}
        title={session?.title}
        onClose={onClose}
        onUnavailable={() => setProvider("jitsi")}
      />
    );
  }

  if (mode === "host") {
    return <LiveClassTeacher groupId={groupId} groupTitle={groupTitle} onClose={onClose} />;
  }

  return <LiveClassStudent session={session} onClose={onClose} />;
}

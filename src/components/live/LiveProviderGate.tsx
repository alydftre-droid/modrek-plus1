import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import ZoomMeetingView from "./ZoomMeetingView";
import LiveClassroomShell from "./LiveClassroomShell";

/**
 * Modrek Live runs exclusively on the Zoom Meeting SDK.
 * The legacy Jitsi path has been removed — there is no live fallback.
 */
interface Props {
  mode: "host" | "attendee";
  groupId: string;
  groupTitle: string;
  session?: any;
  onClose: () => void;
}

export default function LiveProviderGate({ mode, groupId, groupTitle, session, onClose }: Props) {
  const { user } = useAuth();
  const [activeSession, setActiveSession] = useState<any>(null);
  return (
    <>
      <ZoomMeetingView mode={mode} groupId={groupId} groupTitle={groupTitle} sessionId={session?.id} title={session?.title} onSessionReady={setActiveSession} onClose={onClose} />
      {activeSession?.id && (
        <LiveClassroomShell
          sessionId={activeSession.id}
          groupId={groupId}
          title={activeSession.title || session?.title || groupTitle}
          viewerCount={Number(activeSession.viewer_count || session?.viewer_count || 0)}
          startedAt={activeSession.started_at || session?.started_at}
          isTeacher={mode === "host"}
          userName={String(user?.user_metadata?.full_name || user?.email?.split("@")[0] || "مستخدم")}
          joinUrl={String(activeSession.zoom_join_url || session?.zoom_join_url || "")}
        />
      )}
    </>
  );
}

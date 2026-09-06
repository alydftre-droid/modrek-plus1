import ZoomMeetingView from "./ZoomMeetingView";

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
  return (
    <ZoomMeetingView
      mode={mode}
      groupId={groupId}
      groupTitle={groupTitle}
      sessionId={session?.id}
      title={session?.title}
      onClose={onClose}
    />
  );
}

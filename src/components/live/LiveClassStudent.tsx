import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { getLiveKitErrorMessage, logLiveKitDiagnostic } from "@/lib/livekit";
import { createJitsiApi, type JitsiApi } from "@/lib/jitsi";
import { toast } from "sonner";
import {
  Mic, MicOff, PhoneOff, Eye, Radio,
  Maximize2, Minimize2, Camera, CameraOff
} from "lucide-react";

interface Props {
  session: {
    id: string;
    title: string;
    room_name: string;
    teacher_id: string;
    allow_student_camera: boolean;
    allow_student_mic: boolean;
    viewer_count: number;
  };
  onClose: () => void;
}

export default function LiveClassStudent({ session, onClose }: Props) {
  const { user } = useAuth();
  const [connecting, setConnecting] = useState(true);
  const [viewerCount, setViewerCount] = useState(session.viewer_count || 0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isCamEnabled, setIsCamEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [canPublishVideo, setCanPublishVideo] = useState(session.allow_student_camera);
  const [canPublishAudio, setCanPublishAudio] = useState(session.allow_student_mic);
  const [teacherName, setTeacherName] = useState("");
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const jitsiApiRef = useRef<JitsiApi | null>(null);
  const [meetingRoomName, setMeetingRoomName] = useState<string | null>(null);
  const hasLeftRef = useRef(false);

  useEffect(() => {
    void joinSession();
    supabase.from("profiles").select("full_name").eq("id", session.teacher_id).single()
      .then(({ data }) => setTeacherName(data?.full_name || "المعلم"));
    return () => {
      jitsiApiRef.current?.dispose();
      jitsiApiRef.current = null;
    };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`live-viewer-${session.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_sessions", filter: `id=eq.${session.id}` }, (payload) => {
        const d = payload.new as any;
        if (d.status === "ended") {
          toast.info("انتهى البث المباشر");
          jitsiApiRef.current?.dispose();
          onClose();
        }
        if (d.viewer_count !== undefined) setViewerCount(d.viewer_count);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session.id, onClose]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`live-mod-${session.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "live_session_actions",
        filter: `session_id=eq.${session.id}`,
      }, (payload) => {
        const action = payload.new as any;
        if (action.student_id !== user.id) return;
        if (action.action === "mute") {
          setIsMuted(true);
          if (isMicEnabled) {
            jitsiApiRef.current?.executeCommand("toggleAudio");
            setIsMicEnabled(false);
          }
          toast.warning("تم كتم صوتك من قبل المعلم");
        } else if (action.action === "unmute") {
          setIsMuted(false);
          toast.success("تم إلغاء كتم صوتك");
        } else if (action.action === "ban") {
          toast.error("تم حظرك من البث المباشر");
          void leaveLive();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isMicEnabled, onClose, session.id, user]);

  useEffect(() => {
    if (!meetingRoomName || !jitsiContainerRef.current) return;

    let disposed = false;

    const initializeMeeting = async () => {
      try {
        const api = await createJitsiApi({
          roomName: meetingRoomName,
          parentNode: jitsiContainerRef.current!,
          userInfo: {
            displayName: typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "طالب",
          },
          configOverwrite: {
            prejoinPageEnabled: false,
            startWithAudioMuted: true,
            startWithVideoMuted: true,
            disableDeepLinking: true,
            doNotStoreRoom: true,
          },
          interfaceConfigOverwrite: {
            TOOLBAR_BUTTONS: [],
          },
        });

        if (disposed) {
          api.dispose();
          return;
        }

        jitsiApiRef.current = api;

        api.addListener("participantJoined", () => {
          setViewerCount((current) => current + 1);
        });

        api.addListener("participantLeft", () => {
          setViewerCount((current) => Math.max(0, current - 1));
        });

        api.addListener("videoConferenceJoined", async () => {
          const countResult = await api.getNumberOfParticipants?.();
          if (typeof countResult === "number") {
            setViewerCount(Math.max(0, countResult - 1));
          }
          setConnecting(false);
        });

        api.addListener("videoConferenceLeft", () => {
          if (!hasLeftRef.current) onClose();
        });
      } catch (e) {
        logLiveKitDiagnostic("LiveClassStudent.initializeJitsi", e, { sessionId: session.id, roomName: meetingRoomName });
        toast.error(getLiveKitErrorMessage(e, "فشل الانضمام للبث"));
        onClose();
      } finally {
        if (!disposed) setConnecting(false);
      }
    };

    void initializeMeeting();

    return () => {
      disposed = true;
      jitsiApiRef.current?.dispose();
      jitsiApiRef.current = null;
    };
  }, [meetingRoomName, onClose, session.id, user?.id]);

  const joinSession = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("livekit-token", {
        body: { action: "join", sessionId: session.id },
      });
      if (error || !data?.meetingRoomName) {
        logLiveKitDiagnostic("LiveClassStudent.invokeJoin", error || data, { sessionId: session.id, response: data });
        throw new Error(data?.error || error?.message || "فشل الانضمام");
      }

      setIsMuted(data.isMuted);
      setCanPublishVideo(data.canPublishVideo);
      setCanPublishAudio(data.canPublishAudio);
      setMeetingRoomName(data.meetingRoomName);
    } catch (e: any) {
      logLiveKitDiagnostic("LiveClassStudent.joinSession", e, { sessionId: session.id, roomName: session.room_name });
      toast.error(getLiveKitErrorMessage(e, "فشل الانضمام للبث"));
      onClose();
    }
  };

  const toggleMic = async () => {
    if (!jitsiApiRef.current || isMuted || !canPublishAudio) {
      if (isMuted) toast.warning("صوتك مكتوم من قبل المعلم");
      if (!canPublishAudio && !isMuted) toast.warning("التحدث معطل في هذه الحصة");
      return;
    }
    jitsiApiRef.current.executeCommand("toggleAudio");
    setIsMicEnabled((current) => !current);
  };

  const toggleCamera = async () => {
    if (!jitsiApiRef.current || !canPublishVideo) {
      if (!canPublishVideo) toast.warning("الكاميرا معطلة من قبل المعلم");
      return;
    }
    jitsiApiRef.current.executeCommand("toggleVideo");
    setIsCamEnabled((current) => !current);
  };

  const toggleFullscreen = () => {
    if (!videoContainerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    } else {
      videoContainerRef.current.requestFullscreen();
      setIsFullscreen(true);
    }
  };

  const leaveLive = () => {
    if (hasLeftRef.current) return;
    hasLeftRef.current = true;
    void supabase.functions.invoke("livekit-token", {
      body: { action: "leave", sessionId: session.id },
    });
    jitsiApiRef.current?.executeCommand("hangup");
    jitsiApiRef.current?.dispose();
    jitsiApiRef.current = null;
    onClose();
  };

  if (connecting) {
    return (
      <div className="fixed inset-0 z-[70] bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <Radio className="h-12 w-12 mx-auto mb-4 animate-pulse text-red-500" />
          <p className="text-lg font-bold">جاري الانضمام للبث...</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={videoContainerRef} className="fixed inset-0 z-[70] bg-black flex flex-col" dir="rtl">
      <div className="flex-1 relative">
        <div ref={jitsiContainerRef} className="w-full h-full bg-black" />

        <div className="absolute top-0 inset-x-0 p-4 bg-gradient-to-b from-black/60 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className="bg-red-600 text-white gap-1 animate-pulse">
              <Radio className="h-3 w-3" /> مباشر
            </Badge>
            <Badge variant="secondary" className="bg-black/50 text-white gap-1">
              <Eye className="h-3 w-3" /> {viewerCount}
            </Badge>
          </div>
          <div className="text-white text-right">
            <p className="text-sm font-bold">{teacherName}</p>
            <p className="text-xs text-white/70 truncate max-w-[180px]">{session.title}</p>
          </div>
        </div>

        <button
          onClick={toggleFullscreen}
          className="absolute bottom-4 left-4 p-2 rounded-full bg-black/50 text-white"
        >
          {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
        </button>
      </div>

      <div className="bg-black/90 p-4 flex items-center justify-center gap-4 safe-area-pb">
        {session.allow_student_mic && (
          <button
            onClick={toggleMic}
            className={`w-11 h-11 rounded-full flex items-center justify-center ${isMicEnabled ? "bg-white/20" : "bg-white/10"} ${isMuted ? "opacity-50" : ""}`}
            disabled={isMuted || !canPublishAudio}
          >
            {isMicEnabled && !isMuted ? <Mic className="h-5 w-5 text-white" /> : <MicOff className="h-5 w-5 text-white/60" />}
          </button>
        )}
        {session.allow_student_camera && (
          <button
            onClick={toggleCamera}
            className={`w-11 h-11 rounded-full flex items-center justify-center ${isCamEnabled ? "bg-white/20" : "bg-white/10"} ${!canPublishVideo ? "opacity-50" : ""}`}
            disabled={!canPublishVideo}
          >
            {isCamEnabled ? <Camera className="h-5 w-5 text-white" /> : <CameraOff className="h-5 w-5 text-white/60" />}
          </button>
        )}
        <button
          onClick={leaveLive}
          className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center"
        >
          <PhoneOff className="h-5 w-5 text-white" />
        </button>
      </div>
    </div>
  );
}

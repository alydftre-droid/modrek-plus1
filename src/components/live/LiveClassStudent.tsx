import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { getLiveKitErrorMessage, logLiveKitDiagnostic } from "@/lib/livekit";
import { createJitsiApi, type JitsiApi } from "@/lib/jitsi";
import { toast } from "sonner";
import {
  Mic, MicOff, PhoneOff, Eye, Radio,
  Maximize2, Minimize2, Camera, CameraOff,
  ZoomIn, ZoomOut, SwitchCamera,
  Wifi, WifiOff, RefreshCw
} from "lucide-react";
import LiveSessionChat from "./LiveSessionChat";

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

type ConnectionState = "connecting" | "connected" | "reconnecting" | "failed";

export default function LiveClassStudent({ session, onClose }: Props) {
  const { user } = useAuth();
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [viewerCount, setViewerCount] = useState(session.viewer_count || 0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isCamEnabled, setIsCamEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [canPublishVideo, setCanPublishVideo] = useState(session.allow_student_camera);
  const [canPublishAudio, setCanPublishAudio] = useState(session.allow_student_mic);
  const [teacherName, setTeacherName] = useState("");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const jitsiApiRef = useRef<JitsiApi | null>(null);
  const [meetingRoomName, setMeetingRoomName] = useState<string | null>(null);
  const hasLeftRef = useRef(false);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const joinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-hide controls
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      if (connectionState === "connected") setShowControls(false);
    }, 5000);
  }, [connectionState]);

  useEffect(() => {
    void joinSession();
    supabase.from("profiles").select("full_name").eq("id", session.teacher_id).single()
      .then(({ data }) => setTeacherName(data?.full_name || "المعلم"));
    return () => {
      if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      jitsiApiRef.current?.dispose();
      jitsiApiRef.current = null;
    };
  }, []);

  // Realtime session updates
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

  // Moderation actions
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

  // Initialize Jitsi when meetingRoomName is set
  useEffect(() => {
    if (!meetingRoomName || !jitsiContainerRef.current) return;

    let disposed = false;

    const initializeMeeting = async () => {
      try {
        // Set a timeout - if not connected in 20s, show retry
        joinTimeoutRef.current = setTimeout(() => {
          if (!disposed && connectionState === "connecting") {
            setConnectionState("failed");
          }
        }, 20000);

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
            toolbarButtons: [],
            hideConferenceSubject: true,
            hideConferenceTimer: true,
            disableInviteFunctions: true,
            disableJoinLeaveSounds: false,
            enableWelcomePage: false,
            enableClosePage: false,
            readOnlyName: true,
            notifications: [],
          },
          interfaceConfigOverwrite: {
            TOOLBAR_BUTTONS: [],
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_BRAND_WATERMARK: false,
            SHOW_CHROME_EXTENSION_BANNER: false,
            MOBILE_APP_PROMO: false,
            HIDE_INVITE_MORE_HEADER: true,
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
            FILM_STRIP_MAX_HEIGHT: 0,
            VERTICAL_FILMSTRIP: false,
          },
        });

        if (disposed) {
          api.dispose();
          return;
        }

        jitsiApiRef.current = api;

        api.addListener("participantJoined", () => {
          setViewerCount((c) => c + 1);
        });

        api.addListener("participantLeft", () => {
          setViewerCount((c) => Math.max(0, c - 1));
        });

        api.addListener("videoConferenceJoined", async () => {
          if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
          const countResult = await api.getNumberOfParticipants?.();
          if (typeof countResult === "number") {
            setViewerCount(Math.max(0, countResult - 1));
          }
          setConnectionState("connected");
          resetControlsTimer();
        });

        api.addListener("videoConferenceLeft", () => {
          if (!hasLeftRef.current) onClose();
        });

        // Handle connection failures
        api.addListener("suspendDetected", () => {
          setConnectionState("reconnecting");
        });

      } catch (e) {
        logLiveKitDiagnostic("LiveClassStudent.initializeJitsi", e, { sessionId: session.id, roomName: meetingRoomName });
        if (!disposed) setConnectionState("failed");
      }
    };

    void initializeMeeting();

    return () => {
      disposed = true;
      if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
      jitsiApiRef.current?.dispose();
      jitsiApiRef.current = null;
    };
  }, [meetingRoomName]);

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
      logLiveKitDiagnostic("LiveClassStudent.joinSession", e, { sessionId: session.id });
      toast.error(getLiveKitErrorMessage(e, "فشل الانضمام للبث"));
      setConnectionState("failed");
    }
  };

  const retryJoin = async () => {
    setConnectionState("connecting");
    jitsiApiRef.current?.dispose();
    jitsiApiRef.current = null;
    setMeetingRoomName(null);
    await joinSession();
  };

  const toggleMic = () => {
    if (!jitsiApiRef.current || isMuted || !canPublishAudio) {
      if (isMuted) toast.warning("صوتك مكتوم من قبل المعلم");
      else if (!canPublishAudio) toast.warning("التحدث معطل في هذه الحصة");
      return;
    }
    jitsiApiRef.current.executeCommand("toggleAudio");
    setIsMicEnabled((c) => !c);
    resetControlsTimer();
  };

  const toggleCamera = () => {
    if (!jitsiApiRef.current || !canPublishVideo) {
      toast.warning("الكاميرا معطلة من قبل المعلم");
      return;
    }
    jitsiApiRef.current.executeCommand("toggleVideo");
    setIsCamEnabled((c) => !c);
    resetControlsTimer();
  };

  const flipCamera = () => {
    if (!jitsiApiRef.current || !canPublishVideo || !isCamEnabled) {
      toast.warning("فعّل الكاميرا أولاً");
      return;
    }
    jitsiApiRef.current.executeCommand("toggleCamera");
    resetControlsTimer();
  };

  const handleZoom = (direction: "in" | "out") => {
    setZoomLevel((current) => {
      const next = direction === "in" ? Math.min(current + 0.25, 3) : Math.max(current - 0.25, 1);
      return next;
    });
    resetControlsTimer();
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
    resetControlsTimer();
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

  // Connection status indicator
  const ConnectionIndicator = () => {
    if (connectionState === "connected") {
      return <Wifi className="h-3 w-3 text-green-400" />;
    }
    if (connectionState === "reconnecting") {
      return <WifiOff className="h-3 w-3 text-yellow-400 animate-pulse" />;
    }
    return <WifiOff className="h-3 w-3 text-red-400" />;
  };

  const showJoinOverlay = connectionState === "connecting" || connectionState === "failed";

  return (
    <div
      ref={videoContainerRef}
      className="fixed inset-0 z-[70] bg-black flex flex-col"
      dir="rtl"
      onClick={resetControlsTimer}
    >
      {/* Video area */}
      <div className="flex-1 relative overflow-hidden">
        <div
          ref={jitsiContainerRef}
          className="w-full h-full bg-black transition-transform duration-200 origin-center"
          style={{ transform: `scale(${zoomLevel})` }}
        />

        {showJoinOverlay && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20">
            <div className="text-center text-white space-y-4 px-6">
              {connectionState === "connecting" ? (
                <>
                  <Radio className="h-14 w-14 mx-auto animate-pulse text-red-500" />
                  <p className="text-lg font-bold">جاري الانضمام للبث...</p>
                  <p className="text-sm text-white/60">يتم تحميل خدمة البث المباشر</p>
                  <div className="w-48 mx-auto h-1 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full"
                      style={{ width: "60%", animation: "pulse 1.5s ease-in-out infinite" }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <WifiOff className="h-14 w-14 mx-auto text-red-400" />
                  <p className="text-lg font-bold">تعذر الاتصال بالبث</p>
                  <p className="text-sm text-white/60">تحقق من اتصالك بالإنترنت وحاول مرة أخرى</p>
                  <div className="flex gap-3 justify-center mt-4">
                    <button
                      onClick={retryJoin}
                      className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-xl text-white font-semibold flex items-center gap-2 transition-colors"
                    >
                      <RefreshCw className="h-4 w-4" /> إعادة المحاولة
                    </button>
                    <button
                      onClick={onClose}
                      className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white font-semibold transition-colors"
                    >
                      إلغاء
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Top overlay */}
        <div
          className={`absolute top-0 inset-x-0 pt-[calc(0.75rem+env(safe-area-inset-top))] px-3 pb-3 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge className="bg-red-600 text-white gap-1 animate-pulse text-xs px-2 py-0.5">
                <Radio className="h-2.5 w-2.5" /> مباشر
              </Badge>
              <Badge variant="secondary" className="bg-black/50 text-white gap-1 text-xs px-2 py-0.5">
                <Eye className="h-2.5 w-2.5" /> {viewerCount}
              </Badge>
              <Badge variant="secondary" className="bg-black/50 text-white gap-1 text-xs px-2 py-0.5">
                <ConnectionIndicator />
              </Badge>
            </div>
            <div className="text-white text-right">
              <p className="text-xs font-bold">{teacherName}</p>
              <p className="text-[10px] text-white/60 truncate max-w-[140px]">{session.title}</p>
            </div>
          </div>
        </div>

        {/* Side controls (zoom + fullscreen) */}
        <div
          className={`absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-2 transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        >
          <button
            onClick={() => handleZoom("in")}
            className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform"
            disabled={zoomLevel >= 3}
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={() => handleZoom("out")}
            className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform"
            disabled={zoomLevel <= 1}
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          {zoomLevel > 1 && (
            <span className="text-[10px] text-white/70 text-center">{zoomLevel.toFixed(1)}x</span>
          )}
          <button
            onClick={toggleFullscreen}
            className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>

        {/* Reconnecting overlay */}
        {connectionState === "reconnecting" && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
            <div className="text-center text-white space-y-2">
              <WifiOff className="h-10 w-10 mx-auto animate-pulse text-yellow-400" />
              <p className="text-sm font-semibold">جاري إعادة الاتصال...</p>
            </div>
          </div>
        )}
      </div>

      {/* Live Chat */}
      {connectionState === "connected" && (
        <LiveSessionChat
          sessionId={session.id}
          isTeacher={false}
          userName={typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "طالب"}
        />
      )}

      {/* Bottom controls */}
      <div
        className={`bg-black/95 backdrop-blur-sm px-4 py-3 transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0"}`}
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-center gap-3 max-w-sm mx-auto">
          {/* Mic */}
          {session.allow_student_mic && (
            <button
              onClick={toggleMic}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                isMicEnabled ? "bg-white/25" : "bg-white/10"
              } ${isMuted ? "opacity-40" : ""}`}
              disabled={isMuted || !canPublishAudio}
            >
              {isMicEnabled && !isMuted ? <Mic className="h-5 w-5 text-white" /> : <MicOff className="h-5 w-5 text-white/60" />}
            </button>
          )}

          {/* Camera */}
          {session.allow_student_camera && (
            <button
              onClick={toggleCamera}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                isCamEnabled ? "bg-white/25" : "bg-white/10"
              } ${!canPublishVideo ? "opacity-40" : ""}`}
              disabled={!canPublishVideo}
            >
              {isCamEnabled ? <Camera className="h-5 w-5 text-white" /> : <CameraOff className="h-5 w-5 text-white/60" />}
            </button>
          )}

          {/* Flip camera */}
          {session.allow_student_camera && isCamEnabled && (
            <button
              onClick={flipCamera}
              className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center transition-all active:scale-90"
            >
              <SwitchCamera className="h-5 w-5 text-white" />
            </button>
          )}

          {/* Leave */}
          <button
            onClick={leaveLive}
            className="w-13 h-13 rounded-full bg-red-600 flex items-center justify-center shadow-lg shadow-red-600/30 active:scale-90 transition-transform px-4 py-3"
          >
            <PhoneOff className="h-5 w-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}

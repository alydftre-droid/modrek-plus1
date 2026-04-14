import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getLiveKitErrorMessage, logLiveKitDiagnostic } from "@/lib/livekit";
import { createJitsiApi, type JitsiApi } from "@/lib/jitsi";
import { toast } from "sonner";
import {
  Video, VideoOff, Mic, MicOff, PhoneOff, Users,
  Radio, Camera, Eye, SwitchCamera, ZoomIn, ZoomOut,
  Wifi, WifiOff, RefreshCw, Ban, VolumeX, Volume2,
  Maximize2, Minimize2
} from "lucide-react";
import LiveSessionChat from "./LiveSessionChat";

interface Props {
  groupId: string;
  groupTitle: string;
  onClose: () => void;
}

interface LiveSessionResponse {
  meetingRoomName: string;
  meetingUrl: string;
  session: {
    id: string;
    title: string;
  };
}

type ConnectionState = "setup" | "connecting" | "connected" | "reconnecting" | "failed";

export default function LiveClassTeacher({ groupId, groupTitle, onClose }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<"setup" | "live">("setup");
  const [title, setTitle] = useState(`حصة مباشرة - ${groupTitle}`);
  const [allowCamera, setAllowCamera] = useState(false);
  const [allowMic, setAllowMic] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [connectionState, setConnectionState] = useState<ConnectionState>("setup");
  const [participants, setParticipants] = useState<Array<{ id: string; name: string }>>([]);
  const [showParticipants, setShowParticipants] = useState(false);
  const [meetingRoomName, setMeetingRoomName] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const jitsiApiRef = useRef<JitsiApi | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const joinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const viewerCount = participants.length;

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      if (connectionState === "connected") setShowControls(false);
    }, 5000);
  }, [connectionState]);

  const syncViewerCount = async (participantsCount: number) => {
    if (!sessionId) return;
    await supabase
      .from("live_sessions")
      .update({ viewer_count: Math.max(0, participantsCount) })
      .eq("id", sessionId);
  };

  const upsertParticipant = (participant: { id: string; displayName?: string }) => {
    setParticipants((current) => {
      if (current.some((item) => item.id === participant.id)) return current;
      const next = [...current, { id: participant.id, name: participant.displayName || "طالب" }];
      void syncViewerCount(next.length);
      return next;
    });
  };

  const removeParticipant = (participantId: string) => {
    setParticipants((current) => {
      const next = current.filter((item) => item.id !== participantId);
      void syncViewerCount(next.length);
      return next;
    });
  };

  const startLive = async () => {
    if (!user) return;
    setConnectionState("connecting");
    try {
      const { data, error } = await supabase.functions.invoke("livekit-token", {
        body: { action: "start", groupId, title, allowCamera, allowMic },
      });
      if (error || !data?.meetingRoomName || !data?.session?.id) {
        logLiveKitDiagnostic("LiveClassTeacher.invokeStart", error || data, { groupId, title });
        throw new Error(data?.error || error?.message || "فشل بدء البث");
      }

      const response = data as LiveSessionResponse;
      setParticipants([]);
      setSessionId(response.session.id);
      setMeetingRoomName(response.meetingRoomName);
      setStep("live");
      toast.success("تم تجهيز الحصة المباشرة 🔴");
    } catch (e: any) {
      logLiveKitDiagnostic("LiveClassTeacher.startLive", e, { groupId, title });
      toast.error(getLiveKitErrorMessage(e, "فشل بدء البث"));
      setConnectionState("setup");
    }
  };

  useEffect(() => {
    if (step !== "live" || !meetingRoomName || !jitsiContainerRef.current) return;

    let disposed = false;

    const initializeMeeting = async () => {
      joinTimeoutRef.current = setTimeout(() => {
        if (!disposed && connectionState !== "connected") {
          setConnectionState("failed");
        }
      }, 25000);

      try {
        const api = await createJitsiApi({
          roomName: meetingRoomName,
          parentNode: jitsiContainerRef.current!,
          userInfo: {
            displayName: typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "المعلم",
          },
          configOverwrite: {
            prejoinPageEnabled: false,
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            disableDeepLinking: true,
            doNotStoreRoom: true,
            toolbarButtons: [],
            hideConferenceSubject: true,
            hideConferenceTimer: true,
            disableInviteFunctions: true,
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
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
          },
        });

        if (disposed) {
          api.dispose();
          return;
        }

        jitsiApiRef.current = api;
        setIsAudioEnabled(true);
        setIsVideoEnabled(true);

        api.addListener("participantJoined", (participant) => {
          upsertParticipant(participant as { id: string; displayName?: string });
        });

        api.addListener("participantLeft", (participant) => {
          removeParticipant((participant as { id: string }).id);
        });

        api.addListener("videoConferenceJoined", async () => {
          if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
          const countResult = await api.getNumberOfParticipants?.();
          if (typeof countResult === "number") {
            const count = Math.max(0, countResult - 1);
            setParticipants((current) => current.slice(0, count));
            await syncViewerCount(count);
          }
          setConnectionState("connected");
          resetControlsTimer();
        });

        api.addListener("videoConferenceLeft", () => {
          toast.info("تم قطع الاتصال");
          onClose();
        });

        api.addListener("suspendDetected", () => {
          setConnectionState("reconnecting");
        });
      } catch (error) {
        logLiveKitDiagnostic("LiveClassTeacher.initializeJitsi", error, { meetingRoomName, sessionId });
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
  }, [meetingRoomName, step]);

  const toggleVideo = () => {
    jitsiApiRef.current?.executeCommand("toggleVideo");
    setIsVideoEnabled((c) => !c);
    resetControlsTimer();
  };

  const toggleAudio = () => {
    jitsiApiRef.current?.executeCommand("toggleAudio");
    setIsAudioEnabled((c) => !c);
    resetControlsTimer();
  };

  const flipCamera = () => {
    jitsiApiRef.current?.executeCommand("toggleCamera");
    resetControlsTimer();
  };

  const handleZoom = (direction: "in" | "out") => {
    setZoomLevel((current) => {
      return direction === "in" ? Math.min(current + 0.25, 3) : Math.max(current - 0.25, 1);
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

  const moderateStudent = async (studentId: string, action: "mute" | "unmute" | "ban") => {
    if (!sessionId) return;
    await supabase.functions.invoke("livekit-token", {
      body: { action: "moderate", sessionId, studentId, moderateAction: action },
    });
    const labels: Record<string, string> = { mute: "تم كتم الطالب", unmute: "تم إلغاء كتم الطالب", ban: "تم حظر الطالب" };
    toast.success(labels[action]);
    if (action === "ban") {
      removeParticipant(studentId);
    }
  };

  const endLive = async () => {
    if (sessionId) {
      await supabase.functions.invoke("livekit-token", {
        body: { action: "end", sessionId },
      });
    }
    jitsiApiRef.current?.executeCommand("hangup");
    jitsiApiRef.current?.dispose();
    jitsiApiRef.current = null;
    toast.success("تم إنهاء البث");
    onClose();
  };

  const retryConnection = () => {
    setConnectionState("connecting");
    jitsiApiRef.current?.dispose();
    jitsiApiRef.current = null;
    // Force re-trigger the effect
    const room = meetingRoomName;
    setMeetingRoomName(null);
    setTimeout(() => setMeetingRoomName(room), 100);
  };

  useEffect(() => {
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
      jitsiApiRef.current?.dispose();
      jitsiApiRef.current = null;
    };
  }, []);

  // Setup screen
  if (step === "setup") {
    return (
      <div className="fixed inset-0 z-[70] bg-background flex flex-col" dir="rtl">
        <header className="p-4 border-b flex items-center justify-between">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Radio className="h-5 w-5 text-red-500" />
            إعدادات البث المباشر
          </h1>
          <Button variant="ghost" size="sm" onClick={onClose}>إلغاء</Button>
        </header>

        <div className="flex-1 overflow-auto p-6 max-w-lg mx-auto w-full space-y-6">
          <div>
            <label className="text-sm font-medium mb-2 block">عنوان الحصة</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="عنوان الحصة..." />
          </div>

          <Card className="p-4 space-y-4">
            <h3 className="font-semibold text-sm">صلاحيات الطلاب</h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">السماح بفتح الكاميرا</span>
              </div>
              <Switch checked={allowCamera} onCheckedChange={setAllowCamera} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">السماح بالتحدث</span>
              </div>
              <Switch checked={allowMic} onCheckedChange={setAllowMic} />
            </div>
          </Card>

          <Button
            className="w-full gap-2 bg-red-600 hover:bg-red-700 text-white h-12 text-base"
            onClick={startLive}
            disabled={connectionState === "connecting" || !title.trim()}
          >
            {connectionState === "connecting" ? (
              <span className="animate-spin">⏳</span>
            ) : (
              <Radio className="h-5 w-5" />
            )}
            {connectionState === "connecting" ? "جاري الاتصال..." : "بدء البث المباشر 🔴"}
          </Button>
        </div>
      </div>
    );
  }

  // Live screen
  return (
    <div
      ref={videoContainerRef}
      className="fixed inset-0 z-[70] bg-black flex flex-col"
      dir="rtl"
      onClick={resetControlsTimer}
    >
      <div className="flex-1 relative overflow-hidden">
        <div
          ref={jitsiContainerRef}
          className="w-full h-full transition-transform duration-200 origin-center"
          style={{ transform: `scale(${zoomLevel})` }}
        />

        {/* Connecting / Failed overlay */}
        {(connectionState === "connecting" || connectionState === "failed") && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10">
            <div className="text-center text-white space-y-4 px-6">
              {connectionState === "connecting" ? (
                <>
                  <Radio className="h-14 w-14 mx-auto animate-pulse text-red-500" />
                  <p className="text-lg font-bold">جاري تشغيل البث...</p>
                  <p className="text-sm text-white/60">يرجى الانتظار</p>
                </>
              ) : (
                <>
                  <WifiOff className="h-14 w-14 mx-auto text-red-400" />
                  <p className="text-lg font-bold">تعذر الاتصال</p>
                  <div className="flex gap-3 justify-center">
                    <button onClick={retryConnection} className="px-5 py-2.5 bg-red-600 hover:bg-red-700 rounded-xl text-white font-semibold flex items-center gap-2 transition-colors">
                      <RefreshCw className="h-4 w-4" /> إعادة المحاولة
                    </button>
                    <button onClick={endLive} className="px-5 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-white font-semibold transition-colors">
                      إنهاء
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {connectionState === "reconnecting" && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
            <div className="text-center text-white space-y-2">
              <WifiOff className="h-10 w-10 mx-auto animate-pulse text-yellow-400" />
              <p className="text-sm font-semibold">جاري إعادة الاتصال...</p>
            </div>
          </div>
        )}

        {/* Top bar */}
        <div className={`absolute top-0 inset-x-0 p-3 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge className="bg-red-600 text-white gap-1 animate-pulse text-xs px-2 py-0.5">
                <Radio className="h-2.5 w-2.5" /> مباشر
              </Badge>
              <Badge variant="secondary" className="bg-black/50 text-white gap-1 text-xs px-2 py-0.5">
                <Eye className="h-2.5 w-2.5" /> {viewerCount}
              </Badge>
              <Badge variant="secondary" className="bg-black/50 text-white gap-1 text-xs px-2 py-0.5">
                {connectionState === "connected" ? <Wifi className="h-2.5 w-2.5 text-green-400" /> : <WifiOff className="h-2.5 w-2.5 text-yellow-400" />}
              </Badge>
            </div>
            <span className="text-white text-xs font-medium truncate max-w-[160px]">{title}</span>
          </div>
        </div>

        {/* Side controls */}
        <div className={`absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-2 transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
          <button onClick={() => handleZoom("in")} className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform" disabled={zoomLevel >= 3}>
            <ZoomIn className="h-4 w-4" />
          </button>
          <button onClick={() => handleZoom("out")} className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform" disabled={zoomLevel <= 1}>
            <ZoomOut className="h-4 w-4" />
          </button>
          {zoomLevel > 1 && <span className="text-[10px] text-white/70 text-center">{zoomLevel.toFixed(1)}x</span>}
          <button onClick={toggleFullscreen} className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform">
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>

        {/* Participants button */}
        <button
          onClick={() => { setShowParticipants(true); resetControlsTimer(); }}
          className={`absolute top-14 left-2 p-2 rounded-full bg-black/60 backdrop-blur-sm text-white transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        >
          <Users className="h-5 w-5" />
          {viewerCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] flex items-center justify-center font-bold">
              {viewerCount}
            </span>
          )}
        </button>
      </div>

      {/* Bottom controls */}
      <div
        className={`bg-black/95 backdrop-blur-sm px-4 py-3 transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0"}`}
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-center gap-3 max-w-md mx-auto">
          <button
            onClick={toggleAudio}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90 ${isAudioEnabled ? "bg-white/25" : "bg-red-500"}`}
          >
            {isAudioEnabled ? <Mic className="h-5 w-5 text-white" /> : <MicOff className="h-5 w-5 text-white" />}
          </button>
          <button
            onClick={toggleVideo}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90 ${isVideoEnabled ? "bg-white/25" : "bg-red-500"}`}
          >
            {isVideoEnabled ? <Video className="h-5 w-5 text-white" /> : <VideoOff className="h-5 w-5 text-white" />}
          </button>
          {isVideoEnabled && (
            <button
              onClick={flipCamera}
              className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center transition-all active:scale-90"
            >
              <SwitchCamera className="h-5 w-5 text-white" />
            </button>
          )}
          <button
            onClick={endLive}
            className="w-13 h-13 rounded-full bg-red-600 flex items-center justify-center shadow-lg shadow-red-600/30 active:scale-90 transition-transform px-4 py-3"
          >
            <PhoneOff className="h-5 w-5 text-white" />
          </button>
        </div>
      </div>

      {/* Live Chat */}
      {sessionId && connectionState === "connected" && (
        <LiveSessionChat
          sessionId={sessionId}
          isTeacher={true}
          userName={typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "المعلم"}
        />
      )}

      {/* Participants Dialog with moderation */}
      <Dialog open={showParticipants} onOpenChange={setShowParticipants}>
        <DialogContent className="max-h-[70vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> المشاهدون ({viewerCount})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {participants.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">لا يوجد مشاهدون حالياً</p>
            ) : (
              participants.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="font-medium text-sm">{p.name}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moderateStudent(p.id, "mute")}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="كتم"
                    >
                      <VolumeX className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => moderateStudent(p.id, "unmute")}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="إلغاء الكتم"
                    >
                      <Volume2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => moderateStudent(p.id, "ban")}
                      className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-colors"
                      title="حظر"
                    >
                      <Ban className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

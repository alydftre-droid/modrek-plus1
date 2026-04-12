import { useEffect, useRef, useState } from "react";
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
  Radio, Camera, Eye
} from "lucide-react";

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

export default function LiveClassTeacher({ groupId, groupTitle, onClose }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<"setup" | "live">("setup");
  const [title, setTitle] = useState(`حصة مباشرة - ${groupTitle}`);
  const [allowCamera, setAllowCamera] = useState(false);
  const [allowMic, setAllowMic] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [participants, setParticipants] = useState<Array<{ id: string; name: string }>>([]);
  const [showParticipants, setShowParticipants] = useState(false);
  const [meetingRoomName, setMeetingRoomName] = useState<string | null>(null);
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const jitsiApiRef = useRef<JitsiApi | null>(null);

  const viewerCount = participants.length;

  const syncViewerCount = async (participantsCount: number) => {
    if (!sessionId) return;
    await supabase
      .from("live_sessions")
      .update({ viewer_count: Math.max(0, participantsCount) })
      .eq("id", sessionId);
  };

  const upsertParticipant = async (participant: { id: string; displayName?: string }) => {
    setParticipants((current) => {
      if (current.some((item) => item.id === participant.id)) return current;
      const next = [...current, { id: participant.id, name: participant.displayName || "طالب" }];
      void syncViewerCount(next.length);
      return next;
    });
  };

  const removeParticipant = async (participantId: string) => {
    setParticipants((current) => {
      const next = current.filter((item) => item.id !== participantId);
      void syncViewerCount(next.length);
      return next;
    });
  };

  const startLive = async () => {
    if (!user) return;
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("livekit-token", {
        body: { action: "start", groupId, title, allowCamera, allowMic },
      });
      if (error || !data?.meetingRoomName || !data?.session?.id) {
        logLiveKitDiagnostic("LiveClassTeacher.invokeStart", error || data, {
          groupId,
          title,
          allowCamera,
          allowMic,
          response: data,
        });
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
      setConnecting(false);
    }
  };

  useEffect(() => {
    if (step !== "live" || !meetingRoomName || !jitsiContainerRef.current) return;

    let disposed = false;

    const initializeMeeting = async () => {
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
        setIsAudioEnabled(true);
        setIsVideoEnabled(true);

        api.addListener("participantJoined", (participant) => {
          void upsertParticipant(participant as { id: string; displayName?: string });
        });

        api.addListener("participantLeft", (participant) => {
          void removeParticipant((participant as { id: string }).id);
        });

        api.addListener("videoConferenceJoined", async () => {
          const countResult = await api.getNumberOfParticipants?.();
          if (typeof countResult === "number") {
            const count = Math.max(0, countResult - 1);
            setParticipants((current) => current.slice(0, count));
            await syncViewerCount(count);
          }
          setConnecting(false);
        });

        api.addListener("videoConferenceLeft", () => {
          toast.info("تم قطع الاتصال");
          onClose();
        });
      } catch (error) {
        logLiveKitDiagnostic("LiveClassTeacher.initializeJitsi", error, { meetingRoomName, sessionId });
        toast.error(getLiveKitErrorMessage(error, "تعذر تشغيل البث المباشر"));
        if (sessionId) {
          await supabase.functions.invoke("livekit-token", { body: { action: "end", sessionId } });
        }
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
  }, [meetingRoomName, onClose, sessionId, step, user?.id]);

  const toggleVideo = async () => {
    jitsiApiRef.current?.executeCommand("toggleVideo");
    setIsVideoEnabled((current) => !current);
  };

  const toggleAudio = async () => {
    jitsiApiRef.current?.executeCommand("toggleAudio");
    setIsAudioEnabled((current) => !current);
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

  useEffect(() => {
    return () => {
      jitsiApiRef.current?.dispose();
      jitsiApiRef.current = null;
    };
  }, []);

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
            disabled={connecting || !title.trim()}
          >
            {connecting ? (
              <span className="animate-spin">⏳</span>
            ) : (
              <Radio className="h-5 w-5" />
            )}
            {connecting ? "جاري الاتصال..." : "بدء البث المباشر 🔴"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col" dir="rtl">
      <div className="flex-1 relative">
        <div ref={jitsiContainerRef} className="w-full h-full" />

        {connecting && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10">
            <div className="text-center text-white">
              <Radio className="h-12 w-12 mx-auto mb-4 animate-pulse text-red-500" />
              <p className="text-lg font-bold">جاري تشغيل البث...</p>
            </div>
          </div>
        )}

        <div className="absolute top-0 inset-x-0 p-4 bg-gradient-to-b from-black/60 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge className="bg-red-600 text-white gap-1 animate-pulse">
              <Radio className="h-3 w-3" /> مباشر
            </Badge>
            <Badge variant="secondary" className="bg-black/50 text-white gap-1">
              <Eye className="h-3 w-3" /> {viewerCount}
            </Badge>
          </div>
          <span className="text-white text-sm font-medium truncate max-w-[200px]">{title}</span>
        </div>

        <button
          onClick={() => setShowParticipants(true)}
          className="absolute top-4 left-4 p-2 rounded-full bg-black/50 text-white"
        >
          <Users className="h-5 w-5" />
          {viewerCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] flex items-center justify-center">
              {viewerCount}
            </span>
          )}
        </button>
      </div>

      <div className="bg-black/90 p-4 flex items-center justify-center gap-4 safe-area-pb">
        <button
          onClick={toggleAudio}
          className={`w-12 h-12 rounded-full flex items-center justify-center ${isAudioEnabled ? "bg-white/20" : "bg-red-500"}`}
        >
          {isAudioEnabled ? <Mic className="h-5 w-5 text-white" /> : <MicOff className="h-5 w-5 text-white" />}
        </button>
        <button
          onClick={toggleVideo}
          className={`w-12 h-12 rounded-full flex items-center justify-center ${isVideoEnabled ? "bg-white/20" : "bg-red-500"}`}
        >
          {isVideoEnabled ? <Video className="h-5 w-5 text-white" /> : <VideoOff className="h-5 w-5 text-white" />}
        </button>
        <button
          onClick={endLive}
          className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center shadow-lg shadow-red-600/40"
        >
          <PhoneOff className="h-6 w-6 text-white" />
        </button>
      </div>

      {/* Participants Dialog */}
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
                  <Badge variant="secondary">مشاهد</Badge>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

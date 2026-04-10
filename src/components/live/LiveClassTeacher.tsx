import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getLiveKitErrorMessage, logLiveKitDiagnostic } from "@/lib/livekit";
import { toast } from "sonner";
import {
  Video, VideoOff, Mic, MicOff, PhoneOff, Users,
  Radio, Camera, RotateCcw, Eye, Ban, VolumeX, Volume2
} from "lucide-react";
import {
  Room, RoomEvent, Track, createLocalTracks,
  VideoPresets,
} from "livekit-client";

interface Props {
  groupId: string;
  groupTitle: string;
  onClose: () => void;
}

export default function LiveClassTeacher({ groupId, groupTitle, onClose }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<"setup" | "live">("setup");
  const [title, setTitle] = useState(`حصة مباشرة - ${groupTitle}`);
  const [allowCamera, setAllowCamera] = useState(false);
  const [allowMic, setAllowMic] = useState(true);
  const [room, setRoom] = useState<Room | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [participants, setParticipants] = useState<Array<{ id: string; name: string; isMuted: boolean; isBanned: boolean }>>([]);
  const [showParticipants, setShowParticipants] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const startLive = async () => {
    if (!user) return;
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("livekit-token", {
        body: { action: "start", groupId, title, allowCamera, allowMic },
      });
      if (error || !data?.token) {
        logLiveKitDiagnostic("LiveClassTeacher.invokeStart", error || data, {
          groupId,
          title,
          allowCamera,
          allowMic,
          response: data,
        });
        throw new Error(data?.error || error?.message || "فشل بدء البث");
      }

      const newRoom = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
      });

      newRoom.on(RoomEvent.ParticipantConnected, () => updateViewerCount(newRoom));
      newRoom.on(RoomEvent.ParticipantDisconnected, () => updateViewerCount(newRoom));
      newRoom.on(RoomEvent.Disconnected, () => { toast.info("تم قطع الاتصال"); onClose(); });

      await newRoom.connect(String(data.url).trim(), data.token);
      await newRoom.localParticipant.enableCameraAndMicrophone();

      // Attach local video
      const videoTrack = newRoom.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
      if (videoTrack && videoRef.current) {
        videoTrack.attach(videoRef.current);
      }

      setRoom(newRoom);
      setSessionId(data.session.id);
      setStep("live");
      toast.success("تم بدء البث المباشر 🔴");
    } catch (e: any) {
      logLiveKitDiagnostic("LiveClassTeacher.startLive", e, { groupId, title });
      toast.error(getLiveKitErrorMessage(e, "فشل بدء البث"));
    } finally {
      setConnecting(false);
    }
  };

  const updateViewerCount = (r: Room) => {
    const count = r.remoteParticipants.size;
    setViewerCount(count);
    // Update participants list
    const parts: typeof participants = [];
    r.remoteParticipants.forEach((p) => {
      const meta = JSON.parse(p.metadata || "{}");
      parts.push({
        id: p.identity,
        name: meta.name || p.identity,
        isMuted: !p.isMicrophoneEnabled,
        isBanned: false,
      });
    });
    setParticipants(parts);
  };

  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel(`live-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_sessions", filter: `id=eq.${sessionId}` }, (payload) => {
        const data = payload.new as any;
        if (data?.viewer_count !== undefined) setViewerCount(data.viewer_count);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  const toggleVideo = async () => {
    if (!room) return;
    await room.localParticipant.setCameraEnabled(!isVideoEnabled);
    setIsVideoEnabled(!isVideoEnabled);
  };

  const toggleAudio = async () => {
    if (!room) return;
    await room.localParticipant.setMicrophoneEnabled(!isAudioEnabled);
    setIsAudioEnabled(!isAudioEnabled);
  };

  const switchCamera = async () => {
    if (!room) return;
    const tracks = room.localParticipant.getTrackPublication(Track.Source.Camera);
    if (tracks?.track) {
      const facingMode = (tracks.track as any).mediaStreamTrack?.getSettings()?.facingMode;
      const newFacing = facingMode === "user" ? "environment" : "user";
      await room.localParticipant.setCameraEnabled(false);
      const [newTrack] = await createLocalTracks({
        video: { facingMode: newFacing, resolution: VideoPresets.h720.resolution },
      });
      await room.localParticipant.publishTrack(newTrack);
      if (videoRef.current) newTrack.attach(videoRef.current);
    }
  };

  const endLive = async () => {
    if (sessionId) {
      await supabase.functions.invoke("livekit-token", {
        body: { action: "end", sessionId },
      });
    }
    room?.disconnect();
    setRoom(null);
    toast.success("تم إنهاء البث");
    onClose();
  };

  const moderateStudent = async (studentId: string, moderateAction: string) => {
    await supabase.functions.invoke("livekit-token", {
      body: { action: "moderate", sessionId, studentId, moderateAction },
    });
    toast.success(moderateAction === "mute" ? "تم كتم الطالب" : moderateAction === "ban" ? "تم حظر الطالب" : "تم الإجراء");
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => { room?.disconnect(); };
  }, [room]);

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
      {/* Video Area */}
      <div className="flex-1 relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />

        {/* Overlay - Top */}
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

        {/* Participants Button */}
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

      {/* Controls */}
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
        <button onClick={switchCamera} className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
          <RotateCcw className="h-5 w-5 text-white" />
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
                  <div className="flex gap-1">
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => moderateStudent(p.id, p.isMuted ? "unmute" : "mute")}
                      title={p.isMuted ? "إلغاء الكتم" : "كتم الصوت"}
                    >
                      {p.isMuted ? <VolumeX className="h-4 w-4 text-red-500" /> : <Volume2 className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-red-500"
                      onClick={() => moderateStudent(p.id, "ban")}
                      title="حظر مؤقت"
                    >
                      <Ban className="h-4 w-4" />
                    </Button>
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

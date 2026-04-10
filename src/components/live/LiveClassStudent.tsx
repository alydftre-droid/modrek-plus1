import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { getLiveKitErrorMessage, logLiveKitDiagnostic } from "@/lib/livekit";
import { toast } from "sonner";
import {
  Mic, MicOff, PhoneOff, Eye, Radio,
  Maximize2, Minimize2, Camera, CameraOff
} from "lucide-react";
import { Room, RoomEvent, Track } from "livekit-client";

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
  const [room, setRoom] = useState<Room | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [viewerCount, setViewerCount] = useState(session.viewer_count || 0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isCamEnabled, setIsCamEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [canPublishVideo, setCanPublishVideo] = useState(session.allow_student_camera);
  const [teacherName, setTeacherName] = useState("");
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const mainVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    joinSession();
    // Load teacher name
    supabase.from("profiles").select("full_name").eq("id", session.teacher_id).single()
      .then(({ data }) => setTeacherName(data?.full_name || "المعلم"));
    return () => { room?.disconnect(); };
  }, []);

  // Realtime viewer count
  useEffect(() => {
    const channel = supabase
      .channel(`live-viewer-${session.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_sessions", filter: `id=eq.${session.id}` }, (payload) => {
        const d = payload.new as any;
        if (d.status === "ended") {
          toast.info("انتهى البث المباشر");
          room?.disconnect();
          onClose();
        }
        if (d.viewer_count !== undefined) setViewerCount(d.viewer_count);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session.id, room]);

  // Listen for moderation actions
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
          setIsMicEnabled(false);
          room?.localParticipant.setMicrophoneEnabled(false);
          toast.warning("تم كتم صوتك من قبل المعلم");
        } else if (action.action === "unmute") {
          setIsMuted(false);
          toast.success("تم إلغاء كتم صوتك");
        } else if (action.action === "ban") {
          toast.error("تم حظرك من البث المباشر");
          room?.disconnect();
          onClose();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session.id, user, room]);

  const joinSession = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("livekit-token", {
        body: { action: "join", sessionId: session.id },
      });
      if (error || !data?.token) {
        logLiveKitDiagnostic("LiveClassStudent.invokeJoin", error || data, { sessionId: session.id, response: data });
        throw new Error(data?.error || error?.message || "فشل الانضمام");
      }

      setIsMuted(data.isMuted);
      setCanPublishVideo(data.canPublishVideo);

      const newRoom = new Room({ adaptiveStream: true, dynacast: true });

      newRoom.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Video && track.source === Track.Source.Camera) {
          if (mainVideoRef.current) track.attach(mainVideoRef.current);
        }
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          document.body.appendChild(el);
        }
      });

      newRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach(el => el.remove());
      });

      newRoom.on(RoomEvent.ParticipantConnected, () => setViewerCount(newRoom.remoteParticipants.size + 1));
      newRoom.on(RoomEvent.ParticipantDisconnected, () => setViewerCount(Math.max(0, newRoom.remoteParticipants.size)));
      newRoom.on(RoomEvent.Disconnected, () => { onClose(); });

      await newRoom.connect(String(data.url).trim(), data.token);
      setRoom(newRoom);

      // Attach existing tracks
      newRoom.remoteParticipants.forEach(p => {
        p.trackPublications.forEach(pub => {
          if (pub.track) {
            if (pub.track.kind === Track.Kind.Video && mainVideoRef.current) {
              pub.track.attach(mainVideoRef.current);
            }
            if (pub.track.kind === Track.Kind.Audio) {
              const el = pub.track.attach();
              document.body.appendChild(el);
            }
          }
        });
      });
    } catch (e: any) {
      logLiveKitDiagnostic("LiveClassStudent.joinSession", e, { sessionId: session.id, roomName: session.room_name });
      toast.error(getLiveKitErrorMessage(e, "فشل الانضمام للبث"));
      onClose();
    } finally {
      setConnecting(false);
    }
  };

  const toggleMic = async () => {
    if (!room || isMuted) {
      if (isMuted) toast.warning("صوتك مكتوم من قبل المعلم");
      return;
    }
    const next = !isMicEnabled;
    await room.localParticipant.setMicrophoneEnabled(next);
    setIsMicEnabled(next);
  };

  const toggleCamera = async () => {
    if (!room || !canPublishVideo) {
      if (!canPublishVideo) toast.warning("الكاميرا معطلة من قبل المعلم");
      return;
    }
    const next = !isCamEnabled;
    await room.localParticipant.setCameraEnabled(next);
    setIsCamEnabled(next);
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
    room?.disconnect();
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
      {/* Video */}
      <div className="flex-1 relative">
        <video ref={mainVideoRef} autoPlay playsInline className="w-full h-full object-contain bg-black" />

        {/* Top overlay */}
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

        {/* Fullscreen button */}
        <button
          onClick={toggleFullscreen}
          className="absolute bottom-4 left-4 p-2 rounded-full bg-black/50 text-white"
        >
          {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
        </button>
      </div>

      {/* Controls */}
      <div className="bg-black/90 p-4 flex items-center justify-center gap-4 safe-area-pb">
        {session.allow_student_mic && (
          <button
            onClick={toggleMic}
            className={`w-11 h-11 rounded-full flex items-center justify-center ${isMicEnabled ? "bg-white/20" : "bg-white/10"} ${isMuted ? "opacity-50" : ""}`}
            disabled={isMuted}
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

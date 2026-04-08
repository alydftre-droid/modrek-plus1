import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Radio, Eye, Play, Video as VideoIcon } from "lucide-react";
import LiveClassTeacher from "./LiveClassTeacher";
import LiveClassStudent from "./LiveClassStudent";

interface LiveSession {
  id: string;
  title: string;
  room_name: string;
  teacher_id: string;
  group_id: string;
  allow_student_camera: boolean;
  allow_student_mic: boolean;
  viewer_count: number;
  started_at: string;
  status: string;
}

interface Props {
  groupId: string;
  groupTitle: string;
  isTeacher: boolean;
}

export default function LiveTabContent({ groupId, groupTitle, isTeacher }: Props) {
  const { user } = useAuth();
  const [liveSession, setLiveSession] = useState<LiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTeacherLive, setShowTeacherLive] = useState(false);
  const [showStudentLive, setShowStudentLive] = useState(false);

  useEffect(() => {
    fetchLiveSession();
  }, [groupId]);

  // Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel(`live-tab-${groupId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "live_sessions",
        filter: `group_id=eq.${groupId}`,
      }, () => fetchLiveSession())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [groupId]);

  const fetchLiveSession = async () => {
    const { data } = await supabase
      .from("live_sessions")
      .select("*")
      .eq("group_id", groupId)
      .eq("status", "live")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLiveSession(data as LiveSession | null);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Teacher view
  if (isTeacher) {
    return (
      <>
        <div className="space-y-4">
          {liveSession && liveSession.teacher_id === user?.id ? (
            <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
              <CardContent className="p-6 text-center space-y-3">
                <Badge className="bg-red-600 text-white gap-1 animate-pulse text-sm px-3 py-1">
                  <Radio className="h-3.5 w-3.5" /> بث مباشر الآن
                </Badge>
                <h3 className="text-lg font-bold">{liveSession.title}</h3>
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Eye className="h-4 w-4" />
                  <span>{liveSession.viewer_count} مشاهد</span>
                </div>
                <Button onClick={() => setShowTeacherLive(true)} className="gap-2 bg-red-600 hover:bg-red-700">
                  <Play className="h-4 w-4" /> العودة للبث
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <Radio className="h-8 w-8 text-red-500" />
                </div>
                <h3 className="text-lg font-bold">حصص مباشرة</h3>
                <p className="text-muted-foreground text-sm">
                  ابدأ بث مباشر لطلابك المشتركين في هذه المجموعة
                </p>
                <Button
                  onClick={() => setShowTeacherLive(true)}
                  className="gap-2 bg-red-600 hover:bg-red-700 text-white"
                >
                  <Radio className="h-4 w-4" /> بدء بث مباشر
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {showTeacherLive && (
          <LiveClassTeacher
            groupId={groupId}
            groupTitle={groupTitle}
            onClose={() => { setShowTeacherLive(false); fetchLiveSession(); }}
          />
        )}
      </>
    );
  }

  // Student view
  return (
    <>
      <div className="space-y-4">
        {liveSession ? (
          <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 overflow-hidden">
            <CardContent className="p-6 text-center space-y-4">
              <Badge className="bg-red-600 text-white gap-1 animate-pulse text-sm px-3 py-1">
                <Radio className="h-3.5 w-3.5" /> بث مباشر الآن!
              </Badge>
              <h3 className="text-lg font-bold">{liveSession.title}</h3>
              <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
                <Eye className="h-4 w-4" />
                <span>{liveSession.viewer_count} مشاهد</span>
              </div>
              <Button
                onClick={() => setShowStudentLive(true)}
                className="gap-2 bg-red-600 hover:bg-red-700 text-white w-full h-12 text-base"
              >
                <Play className="h-5 w-5" /> انضم للبث المباشر
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-8 text-center space-y-3">
              <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
                <VideoIcon className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">لا يوجد بث مباشر</h3>
              <p className="text-muted-foreground text-sm">
                سيتم إشعارك فور بدء المعلم بث مباشر
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {showStudentLive && liveSession && (
        <LiveClassStudent
          session={liveSession}
          onClose={() => { setShowStudentLive(false); fetchLiveSession(); }}
        />
      )}
    </>
  );
}

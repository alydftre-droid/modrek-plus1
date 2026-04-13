import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Video, Play, Trash2, Clock, Calendar } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface Recording {
  id: string;
  title: string;
  video_url: string;
  duration: string | null;
  created_at: string;
  teacher_id: string;
}

interface Props {
  groupId: string;
  isTeacher: boolean;
}

export default function SessionRecordingsList({ groupId, isTeacher }: Props) {
  const { user } = useAuth();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [playingTitle, setPlayingTitle] = useState("");

  useEffect(() => {
    fetchRecordings();
  }, [groupId]);

  const fetchRecordings = async () => {
    const { data } = await supabase
      .from("live_session_recordings" as any)
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false });
    setRecordings((data as any as Recording[]) || []);
    setLoading(false);
  };

  const deleteRecording = async (id: string) => {
    const { error } = await supabase
      .from("live_session_recordings" as any)
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("فشل حذف التسجيل");
    } else {
      toast.success("تم حذف التسجيل");
      setRecordings(prev => prev.filter(r => r.id !== id));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (recordings.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Video className="h-4 w-4" />
        تسجيلات الحصص السابقة ({recordings.length})
      </h3>

      {recordings.map((rec) => (
        <Card key={rec.id} className="overflow-hidden">
          <CardContent className="p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">{rec.title}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(rec.created_at), "d MMM yyyy", { locale: ar })}
                  </span>
                  {rec.duration && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {rec.duration}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="default"
                  className="gap-1 h-8"
                  onClick={() => { setPlayingUrl(rec.video_url); setPlayingTitle(rec.title); }}
                >
                  <Play className="h-3.5 w-3.5" /> مشاهدة
                </Button>
                {isTeacher && rec.teacher_id === user?.id && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    onClick={() => deleteRecording(rec.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!playingUrl} onOpenChange={() => setPlayingUrl(null)}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden" dir="rtl">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-sm">{playingTitle}</DialogTitle>
          </DialogHeader>
          {playingUrl && (
            <div className="w-full aspect-video bg-black">
              <video
                src={playingUrl}
                controls
                autoPlay
                className="w-full h-full"
                controlsList="nodownload"
                onContextMenu={e => e.preventDefault()}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

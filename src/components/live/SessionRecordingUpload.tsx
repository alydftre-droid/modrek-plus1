import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Upload, Video, X, Check } from "lucide-react";

interface Props {
  sessionId: string;
  groupId: string;
  sessionTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: () => void;
}

export default function SessionRecordingUpload({ sessionId, groupId, sessionTitle, open, onOpenChange, onUploaded }: Props) {
  const { user } = useAuth();
  const [title, setTitle] = useState(`تسجيل - ${sessionTitle}`);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    if (!file || !user) return;
    setUploading(true);
    setProgress(10);

    try {
      const ext = file.name.split(".").pop() || "mp4";

      setProgress(30);
      const { uploadVideo } = await import("@/lib/storage");
      const stored = await uploadVideo({
        scope: { kind: "user", id: user.id },
        category: "live-recordings",
        file,
        fileName: `${sessionId}_${Date.now()}.${ext}`,
        onProgress: (loaded, total) => setProgress(30 + Math.round((loaded / Math.max(total, 1)) * 40)),
      });
      setProgress(70);

      const { error: dbError } = await supabase
        .from("live_session_recordings" as any)
        .insert({
          session_id: sessionId,
          group_id: groupId,
          teacher_id: user.id,
          title: title.trim() || `تسجيل حصة`,
          video_url: stored.url,
        });

      if (dbError) throw dbError;
      setProgress(100);
      toast.success("تم رفع التسجيل بنجاح ✅");
      onUploaded();
      onOpenChange(false);
      setFile(null);
      setTitle(`تسجيل - ${sessionTitle}`);
    } catch (e: any) {
      toast.error(e.message || "فشل رفع التسجيل");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" /> رفع تسجيل الحصة
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">عنوان التسجيل</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="عنوان التسجيل..." />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">ملف الفيديو</label>
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={e => setFile(e.target.files?.[0] || null)}
            />
            {file ? (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Video className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      ({(file.size / 1024 / 1024).toFixed(1)} MB)
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setFile(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Button
                variant="outline"
                className="w-full h-20 border-dashed gap-2"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-5 w-5" />
                اختر ملف فيديو
              </Button>
            )}
          </div>

          {uploading && (
            <div className="space-y-1">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">جاري الرفع... {progress}%</p>
            </div>
          )}

          <Button
            onClick={handleUpload}
            disabled={!file || !title.trim() || uploading}
            className="w-full gap-2"
          >
            {uploading ? (
              <span className="animate-spin">⏳</span>
            ) : (
              <Check className="h-4 w-4" />
            )}
            {uploading ? "جاري الرفع..." : "رفع التسجيل"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

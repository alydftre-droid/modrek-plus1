import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Camera,
  Video,
  Save,
  Loader2,
  CheckCircle,
  Clock,
  XCircle,
  Upload,
  User,
  FileText,
} from "lucide-react";

interface TeacherProfile {
  teacher_id: string;
  bio: string | null;
  photo_url: string | null;
  video_url: string | null;
  is_approved: boolean | null;
}

const TeacherProfileEditor = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const [bio, setBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");

  useEffect(() => {
    if (!user) return;
    fetchProfile();
  }, [user?.id]);

  const fetchProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("teacher_profiles")
        .select("*")
        .eq("teacher_id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setProfile(data);
        setBio(data.bio || "");
        setPhotoUrl(data.photo_url || "");
        setVideoUrl(data.video_url || "");
      }
    } catch (e) {
      console.error("Error fetching teacher profile:", e);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast.error("يرجى اختيار ملف صورة");
      return;
    }

    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/photo.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("teacher-profiles")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("teacher-profiles")
        .getPublicUrl(path);

      setPhotoUrl(urlData.publicUrl);
      toast.success("تم رفع الصورة بنجاح");
    } catch (e) {
      console.error("Error uploading photo:", e);
      toast.error("خطأ في رفع الصورة");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("video/")) {
      toast.error("يرجى اختيار ملف فيديو");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast.error("حجم الفيديو يجب أن يكون أقل من 50 ميجا");
      return;
    }

    setUploadingVideo(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/intro-video.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("teacher-profiles")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("teacher-profiles")
        .getPublicUrl(path);

      setVideoUrl(urlData.publicUrl);
      toast.success("تم رفع الفيديو بنجاح");
    } catch (e) {
      console.error("Error uploading video:", e);
      toast.error("خطأ في رفع الفيديو");
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (!bio.trim()) {
      toast.error("يرجى كتابة نبذة تعريفية");
      return;
    }

    setSaving(true);
    try {
      const profileData = {
        teacher_id: user.id,
        bio: bio.trim(),
        photo_url: photoUrl || null,
        video_url: videoUrl || null,
        is_approved: false, // Reset approval on edit
        updated_at: new Date().toISOString(),
      };

      if (profile) {
        const { error } = await supabase
          .from("teacher_profiles")
          .update(profileData)
          .eq("teacher_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("teacher_profiles")
          .insert(profileData);
        if (error) throw error;
      }

      toast.success("تم حفظ السيرة الذاتية وإرسالها للمراجعة");
      fetchProfile();
    } catch (e) {
      console.error("Error saving profile:", e);
      toast.error("خطأ في حفظ السيرة الذاتية");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const approvalStatus = profile?.is_approved;

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      {profile && (
        <Card className={`border-2 ${
          approvalStatus ? "border-green-500/30 bg-green-50/50 dark:bg-green-950/20" :
          "border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20"
        }`}>
          <CardContent className="p-4 flex items-center gap-3">
            {approvalStatus ? (
              <>
                <CheckCircle className="h-6 w-6 text-green-600" />
                <div>
                  <p className="font-semibold text-green-700 dark:text-green-400">تمت الموافقة على سيرتك الذاتية</p>
                  <p className="text-sm text-green-600/80 dark:text-green-400/80">سيرتك الذاتية ظاهرة للطلاب الآن</p>
                </div>
              </>
            ) : (
              <>
                <Clock className="h-6 w-6 text-amber-600" />
                <div>
                  <p className="font-semibold text-amber-700 dark:text-amber-400">سيرتك الذاتية قيد المراجعة</p>
                  <p className="text-sm text-amber-600/80 dark:text-amber-400/80">سيتم مراجعتها من قبل الإدارة قبل نشرها للطلاب</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Profile Photo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            الصورة الشخصية
          </CardTitle>
          <CardDescription>ارفع صورتك الشخصية التي ستظهر للطلاب</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <Avatar className="h-24 w-24 border-4 border-primary/20">
              <AvatarImage src={photoUrl} />
              <AvatarFallback className="bg-primary/10">
                <User className="h-10 w-10 text-primary" />
              </AvatarFallback>
            </Avatar>
            <div>
              <Label htmlFor="photo-upload" className="cursor-pointer">
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-primary/30 hover:border-primary/60 transition-colors">
                  {uploadingPhoto ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Upload className="h-5 w-5 text-primary" />
                  )}
                  <span className="text-sm font-medium">
                    {uploadingPhoto ? "جاري الرفع..." : "اختر صورة"}
                  </span>
                </div>
              </Label>
              <Input
                id="photo-upload"
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
              <p className="text-xs text-muted-foreground mt-2">JPG, PNG - حجم أقصى 5 ميجا</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bio */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            النبذة التعريفية
          </CardTitle>
          <CardDescription>اكتب نبذة عن نفسك وخبراتك التعليمية</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="اكتب نبذة تعريفية عنك... (مثال: خبرة 10 سنوات في تدريس المواد العربية، حاصل على ماجستير في النحو...)"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={6}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground mt-2">{bio.length} / 1000 حرف</p>
        </CardContent>
      </Card>

      {/* Intro Video */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            فيديو تعريفي
          </CardTitle>
          <CardDescription>ارفع فيديو تعريفي قصير يظهر للطلاب (اختياري)</CardDescription>
        </CardHeader>
        <CardContent>
          {videoUrl && (
            <div className="mb-4 rounded-lg overflow-hidden bg-black">
              <video
                src={videoUrl}
                controls
                className="w-full max-h-64 object-contain"
              />
            </div>
          )}
          <Label htmlFor="video-upload" className="cursor-pointer">
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-primary/30 hover:border-primary/60 transition-colors justify-center">
              {uploadingVideo ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Video className="h-5 w-5 text-primary" />
              )}
              <span className="text-sm font-medium">
                {uploadingVideo ? "جاري رفع الفيديو..." : videoUrl ? "تغيير الفيديو" : "رفع فيديو تعريفي"}
              </span>
            </div>
          </Label>
          <Input
            id="video-upload"
            type="file"
            accept="video/*"
            onChange={handleVideoUpload}
            className="hidden"
          />
          <p className="text-xs text-muted-foreground mt-2">MP4, MOV - حجم أقصى 50 ميجا</p>
        </CardContent>
      </Card>

      {/* Save Button */}
      <Button
        onClick={handleSave}
        disabled={saving || !bio.trim()}
        className="w-full gap-2"
        size="lg"
      >
        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
        حفظ وإرسال للمراجعة
      </Button>
    </div>
  );
};

export default TeacherProfileEditor;

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Camera, User, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { getTeacherProfileUploadErrorMessage, uploadTeacherProfileFile } from "@/lib/teacherProfileUpload";
import { appendImageCacheBuster, saveTeacherAccountAvatar, setTeacherProfileAvatarCache } from "@/lib/teacherAvatar";

export default function TeacherEditProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<any>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfile(data);
          setFullName(data.full_name);
          setPhone(data.phone || "");
          setAvatarUrl(data.avatar_url);
        }
      });
  }, [user?.id]);

  const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const publicUrl = await uploadTeacherProfileFile(file, user.id, "photo");
      const cacheBusted = appendImageCacheBuster(publicUrl);
      const updatedAt = await saveTeacherAccountAvatar(user.id, cacheBusted);
      setAvatarUrl(cacheBusted);
      setProfile((prev: any) => prev ? { ...prev, avatar_url: cacheBusted, updated_at: updatedAt } : prev);
      setTeacherProfileAvatarCache(queryClient, user.id, cacheBusted, updatedAt);
      await queryClient.invalidateQueries({ queryKey: ["teacher-profile", user.id], refetchType: "all" });
      toast.success("تم تحديث الصورة بنجاح");
    } catch (error) {
      console.error("Teacher avatar upload failed", error);
      toast.error(getTeacherProfileUploadErrorMessage(error, "خطأ في رفع الصورة"));
    } finally {
      setUploading(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleSave = async () => {
    if (!user || !fullName.trim()) return;
    setSaving(true);
    try {
      await supabase.from("profiles").update({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq("id", user.id);
      await queryClient.invalidateQueries({ queryKey: ["teacher-profile", user.id] });
      toast.success("تم حفظ التعديلات بنجاح ✓");
    } catch {
      toast.error("خطأ في حفظ البيانات");
    } finally {
      setSaving(false);
    }
  };

  return (
    <TeacherSidebarLayout title="تعديل الملف الشخصي" teacherName={profile?.full_name} teacherAvatar={avatarUrl}>
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowRight className="h-4 w-4" />
          الرجوع
        </button>

        {/* Avatar Section */}
        <div className="flex flex-col items-center py-4">
          <div className="relative">
            <div className="h-24 w-24 rounded-full bg-gradient-to-br from-[hsl(158,64%,28%)] to-[hsl(158,55%,22%)] flex items-center justify-center overflow-hidden ring-4 ring-primary/20 shadow-xl">
              {avatarUrl ? (
                <StoredImage source={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <User className="h-10 w-10 text-white" />
              )}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -left-1 h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white shadow-lg ring-2 ring-background hover:scale-110 transition-transform"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUploadAvatar} />
          </div>
          <p className="text-xs text-muted-foreground mt-3">اضغط على الكاميرا لتغيير صورتك الشخصية</p>
        </div>

        {/* Edit Form */}
        <Card className="border border-border">
          <CardContent className="p-5 space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground mb-1.5 block flex items-center gap-2">
                <User className="h-3.5 w-3.5" /> الاسم الكامل
              </Label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="أدخل اسمك الكامل" />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground mb-1.5 block flex items-center gap-2">
                📱 رقم الهاتف
              </Label>
              <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="01xxxxxxxxx" dir="ltr" />
            </div>

            <Button onClick={handleSave} disabled={saving || !fullName.trim()} className="w-full bg-gradient-to-r from-[hsl(158,64%,28%)] to-[hsl(158,55%,22%)] text-white border-0 gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              حفظ التعديلات
            </Button>
          </CardContent>
        </Card>

        {/* Info note */}
        <p className="text-xs text-muted-foreground text-center">لتغيير البريد الإلكتروني أو كلمة المرور، اذهب إلى <button onClick={() => navigate("/teacher/settings/security")} className="text-primary font-medium underline">الإعدادات → الأمان</button></p>
      </div>
    </TeacherSidebarLayout>
  );
}

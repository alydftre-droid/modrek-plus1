import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, User, Mail, Phone, Hash, Camera, Loader2, Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import { getTeacherProfileUploadErrorMessage, uploadTeacherProfileFile } from "@/lib/teacherProfileUpload";
import { appendImageCacheBuster, saveTeacherAccountAvatar, setTeacherProfileAvatarCache } from "@/lib/teacherAvatar";

export default function TeacherAccountInfoPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<any>(null);
  const [editing, setEditing] = useState(false);
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
      toast.success("تم تحديث الصورة");
    } catch (error) {
      console.error("Teacher account avatar upload failed", error);
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
      setProfile({ ...profile, full_name: fullName.trim(), phone: phone.trim() || null });
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ["teacher-profile", user.id] });
      toast.success("تم حفظ التعديلات ✓");
    } catch {
      toast.error("خطأ في حفظ البيانات");
    } finally {
      setSaving(false);
    }
  };

  const infoFields = profile ? [
    { label: "الاسم الكامل", value: profile.full_name, icon: User, color: "text-blue-600 bg-blue-50 dark:bg-blue-500/10" },
    { label: "البريد الإلكتروني", value: profile.email, icon: Mail, color: "text-violet-600 bg-violet-50 dark:bg-violet-500/10" },
    { label: "رقم الهاتف", value: profile.phone || "غير مسجل", icon: Phone, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10" },
    { label: "كود المعلم", value: profile.teacher_code || "—", icon: Hash, color: "text-amber-600 bg-amber-50 dark:bg-amber-500/10" },
  ] : [];

  return (
    <TeacherSidebarLayout title="معلومات الحساب" teacherName={profile?.full_name} teacherAvatar={avatarUrl}>
      <div className="p-4 md:p-8 max-w-lg mx-auto space-y-5">
        <button onClick={() => navigate("/teacher/settings")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowRight className="h-4 w-4" />
          الرجوع للإعدادات
        </button>

        {/* Avatar with edit button */}
        <div className="flex flex-col items-center py-3">
          <div className="relative">
            <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center overflow-hidden ring-3 ring-border shadow-lg">
              {avatarUrl ? (
                <StoredImage source={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <User className="h-8 w-8 text-primary-foreground" />
              )}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -left-1 h-7 w-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-md ring-2 ring-background hover:scale-110 transition-transform"
            >
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUploadAvatar} />
          </div>
          <p className="text-lg font-bold mt-2">{profile?.full_name || "..."}</p>
          <p className="text-xs text-muted-foreground">معلم</p>
        </div>

        {/* Info or Edit Mode */}
        {!editing ? (
          <>
            <div className="space-y-2.5">
              {infoFields.map((field, i) => (
                <Card key={i} className="border border-border">
                  <CardContent className="p-3.5 flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl ${field.color} flex items-center justify-center shrink-0`}>
                      <field.icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-muted-foreground">{field.label}</p>
                      <p className="text-sm font-semibold text-foreground truncate" dir="auto">{field.value}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Button onClick={() => setEditing(true)} variant="outline" className="w-full border-border gap-2">
              <Pencil className="h-4 w-4" />
              تعديل الاسم ورقم الهاتف
            </Button>
          </>
        ) : (
          <Card className="border border-border">
            <CardContent className="p-5 space-y-4">
              <div>
                <Label className="text-sm text-muted-foreground mb-1.5 block">الاسم الكامل</Label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="أدخل اسمك الكامل" />
              </div>
              <div>
                <Label className="text-sm text-muted-foreground mb-1.5 block">رقم الهاتف</Label>
                <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="01xxxxxxxxx" dir="ltr" />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving || !fullName.trim()} className="flex-1 bg-primary text-primary-foreground border-0 gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  حفظ
                </Button>
                <Button variant="outline" onClick={() => { setEditing(false); setFullName(profile?.full_name); setPhone(profile?.phone || ""); }} className="border-border">
                  إلغاء
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </TeacherSidebarLayout>
  );
}


import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import StudentAccountSheet from "@/components/student/StudentAccountSheet";
import { formatSectionLabelForScope } from "@/lib/educationSection";
import { getTeacherProfileUploadErrorMessage, uploadTeacherProfileFile } from "@/lib/teacherProfileUpload";
import { getPostSignOutPath, isImpersonating } from "@/lib/devImpersonation";
import {
  ArrowRight,
  Bell,
  Camera,
  Loader2,
} from "lucide-react";

interface Profile {
  full_name: string;
  email: string;
  phone: string;
  stage: string;
  grade: string;
  section: string;
  education_type: string | null;
  avatar_url: string | null;
  student_code: string;
}

const stageLabels: Record<string, string> = { preparatory: "إعدادي", secondary: "ثانوي" };
const gradeLabels: Record<string, string> = { first: "أول", second: "ثاني", third: "ثالث" };

export default function StudentProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (user) fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (data) {
      const p = data;
      setProfile({
        full_name: p.full_name || "",
        email: p.email || "",
        phone: p.phone || "",
        stage: p.stage || "",
        grade: p.grade || "",
        section: p.section || "",
        education_type: p.education_type || null,
        avatar_url: p.avatar_url,
        student_code: p.student_code || "",
      });
      setFullName(p.full_name || "");
      setPhone(p.phone || "");
    }
    setLoading(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("حجم الصورة يجب أن يكون أقل من 2 ميجابايت"); return; }
    setUploadingAvatar(true);
    try {
      const avatarUrl = await uploadTeacherProfileFile(file, user.id, "photo");
      await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);
      setProfile((prev) => prev ? { ...prev, avatar_url: avatarUrl } : prev);
      toast.success("تم تحديث الصورة بنجاح");
    } catch (error) { console.error("Student avatar upload failed", error); toast.error(getTeacherProfileUploadErrorMessage(error, "فشل رفع الصورة")); }
    finally { setUploadingAvatar(false); }
  };

  const handleSaveProfile = async () => {
    if (!user || !fullName.trim()) { toast.error("يرجى إدخال الاسم"); return; }
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName, phone, updated_at: new Date().toISOString() }).eq("id", user.id);
    setSaving(false);
    if (error) { toast.error("فشل حفظ البيانات"); } else {
      setProfile((prev) => prev ? { ...prev, full_name: fullName, phone } : prev);
      toast.success("تم حفظ التعديلات");
    }
  };

  const handleSignOut = async () => {
    const nextPath = getPostSignOutPath("/auth");
    await signOut();
    navigate(nextPath, { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  const initials = profile?.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2) || "؟";
  const sectionLabel = formatSectionLabelForScope(profile?.section, {
    stage: profile?.stage,
    grade: profile?.grade,
    educationType: profile?.education_type,
  });
  const nameParts = (profile?.full_name || "").split(" ");
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  return (
    <div className="mobile-app-page bg-background flex" dir="rtl">
      <StudentAccountSheet
        open={accountSheetOpen}
        onOpenChange={setAccountSheetOpen}
        profile={profile}
        onSignOut={handleSignOut}
        isDeveloperImpersonation={isImpersonating()}
        onAvatarClick={() => fileRef.current?.click()}
      />

      <div className="flex-1 flex min-h-0 min-w-0 flex-col">
        <header className="mobile-app-header sticky top-0 z-30 w-full border-b border-border bg-background/90 backdrop-blur-xl">
          <div className="mobile-app-header-inner flex items-center justify-between gap-3 px-4">
            <div className="flex min-w-0 items-center gap-2">
            <button onClick={() => setAccountSheetOpen(true)} className="rounded-full">
              <Avatar className="h-9 w-9 border-2 border-primary/20">
                <AvatarImage src={profile?.avatar_url || ""} />
                <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
            <button type="button" onClick={() => navigate("/notifications")} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Bell className="h-5 w-5" />
            </button>
            </div>
            <h1 className="truncate text-lg font-bold text-foreground">معلومات الطالب</h1>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary"
            >
              <ArrowRight className="h-4 w-4" />
              رجوع
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-lg mx-auto px-4 py-6">
            <div className="bg-card rounded-2xl border border-border p-6 mb-4">
              <div className="flex flex-col items-center mb-6">
                <div className="relative group mb-2">
                  <Avatar className="h-24 w-24 border-4 border-primary/20 shadow-lg">
                    <AvatarImage src={profile?.avatar_url || ""} />
                    <AvatarFallback className="bg-primary/10 text-primary text-2xl font-bold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    {uploadingAvatar ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
                  </button>
                </div>
                <button onClick={() => fileRef.current?.click()} className="text-sm text-primary font-semibold hover:underline">
                  تعديل
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </div>

              <div className="mb-3">
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="bg-muted/50 border-0 rounded-xl h-12 text-center text-sm font-medium"
                  placeholder="الاسم بالكامل"
                  maxLength={100}
                />
              </div>


              <Input
                value={profile?.email || ""}
                readOnly
                className="bg-muted/50 border-0 rounded-xl h-12 text-sm mb-3 text-muted-foreground"
                dir="ltr"
              />

              <div className="flex items-center gap-2 bg-muted/50 rounded-xl h-12 px-3 mb-3">
                <span className="text-sm font-medium text-foreground" dir="ltr">+20</span>
                <span className="text-lg">🇪🇬</span>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="bg-transparent border-0 h-full text-sm font-medium flex-1 p-0 shadow-none focus-visible:ring-0"
                  dir="ltr"
                  placeholder="رقم الهاتف"
                />
              </div>

              <div className="flex items-center justify-between bg-muted/50 rounded-xl h-12 px-4 mb-3">
                <span className="text-sm font-medium text-foreground">
                  {stageLabels[profile?.stage || ""] ? `الصف ${gradeLabels[profile?.grade || ""] || ""} ${stageLabels[profile?.stage || ""]}` : "—"}
                </span>
              </div>

              {sectionLabel && (
                <div className="flex items-center justify-between bg-muted/50 rounded-xl h-12 px-4 mb-3">
                  <span className="text-sm text-muted-foreground">الشعبة</span>
                  <span className="text-sm font-bold text-foreground">{sectionLabel}</span>
                </div>
              )}

              {profile?.student_code && (
                <div className="flex items-center justify-between bg-muted/50 rounded-xl h-12 px-4">
                  <span className="text-sm text-muted-foreground">كود الطالب</span>
                  <span className="text-sm font-bold text-foreground" dir="ltr">{profile.student_code}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={saving}
                className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-70"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ التغييرات"}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
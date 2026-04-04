import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Loader2,
  Save,
  LogOut,
  Lock,
  Eye,
  EyeOff,
  Camera,
  User,
  Phone,
  Mail,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import StudentLayout from "@/components/student/StudentLayout";

export default function ProfileSettings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"profile" | "security">("profile");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("full_name, phone, email, avatar_url")
      .eq("id", user?.id)
      .single();

    if (data) {
      setFullName(data.full_name || "");
      setPhone(data.phone || "");
      setEmail(data.email || "");
      setAvatarUrl(data.avatar_url);
    }
    setLoading(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("حجم الصورة يجب أن يكون أقل من 2 ميجابايت"); return; }
    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `avatars/${user.id}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("teacher-profiles").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("teacher-profiles").getPublicUrl(path);
      const newUrl = urlData.publicUrl + `?t=${Date.now()}`;
      await supabase.from("profiles").update({ avatar_url: newUrl }).eq("id", user.id);
      setAvatarUrl(newUrl);
      toast.success("تم تحديث الصورة بنجاح");
    } catch { toast.error("فشل رفع الصورة"); }
    finally { setUploadingAvatar(false); }
  };

  const handleSaveProfile = async () => {
    if (!fullName.trim()) { toast.error("يرجى إدخال الاسم بالكامل"); return; }
    setSavingProfile(true);
    const { error } = await supabase.from("profiles").update({
      full_name: fullName, phone, updated_at: new Date().toISOString(),
    }).eq("id", user?.id);
    setSavingProfile(false);
    if (error) toast.error("فشل حفظ البيانات");
    else toast.success("تم حفظ التعديلات بنجاح");
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) { toast.error("كلمة المرور يجب أن تكون 8 أحرف على الأقل"); return; }
    if (newPassword !== confirmPassword) { toast.error("كلمات المرور غير متطابقة"); return; }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) toast.error("حدث خطأ أثناء تغيير كلمة المرور");
    else { toast.success("تم تغيير كلمة المرور بنجاح"); setNewPassword(""); setConfirmPassword(""); }
  };

  const handleForgotPassword = async () => {
    if (!email) { toast.error("لا يوجد بريد إلكتروني مسجل"); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) toast.error("فشل إرسال رابط إعادة التعيين");
    else toast.success("تم إرسال رابط إعادة التعيين لبريدك الإلكتروني");
  };

  const handleLogout = async () => { await signOut(); navigate("/auth"); };

  const handleLogoutAll = async () => {
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) toast.error("فشل تسجيل الخروج");
    else { toast.success("تم تسجيل الخروج من جميع الأجهزة"); navigate("/auth"); }
  };

  const initials = fullName?.split(" ").map(n => n[0]).join("").slice(0, 2) || "؟";

  if (loading) {
    return (
      <StudentLayout title="الإعدادات">
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout title="الإعدادات">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5" dir="rtl">

        {/* Profile header card */}
        <div className="bg-gradient-to-bl from-primary via-primary to-primary/80 rounded-2xl p-5 text-primary-foreground text-center">
          <div className="relative inline-block mb-3 group">
            <Avatar className="h-20 w-20 border-4 border-primary-foreground/20 shadow-2xl">
              <AvatarImage src={avatarUrl || ""} />
              <AvatarFallback className="bg-primary-foreground/15 text-xl font-bold text-primary-foreground">{initials}</AvatarFallback>
            </Avatar>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              {uploadingAvatar ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </div>
          <h2 className="text-lg font-bold">{fullName}</h2>
          <p className="text-xs text-primary-foreground/70 mt-0.5">{email}</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 bg-muted/50 rounded-xl p-1">
          <button
            onClick={() => setActiveTab("profile")}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === "profile" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            <User className="inline h-4 w-4 ml-1.5" />
            البيانات الشخصية
          </button>
          <button
            onClick={() => setActiveTab("security")}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === "security" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            <Shield className="inline h-4 w-4 ml-1.5" />
            الأمان
          </button>
        </div>

        {activeTab === "profile" && (
          <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
            <h3 className="text-base font-bold text-foreground">تعديل البيانات</h3>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">الاسم بالكامل</Label>
              <div className="relative">
                <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="pr-10" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">رقم الهاتف</Label>
              <div className="relative">
                <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="pr-10" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">البريد الإلكتروني</Label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={email} readOnly className="pr-10 bg-muted/50 text-muted-foreground cursor-not-allowed" />
              </div>
            </div>

            <Button onClick={handleSaveProfile} disabled={savingProfile} className="w-full rounded-xl h-11 gap-2 bg-primary">
              {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ التغييرات
            </Button>
          </div>
        )}

        {activeTab === "security" && (
          <div className="space-y-4">
            {/* Password change */}
            <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                تغيير كلمة المرور
              </h3>

              <div className="space-y-1.5">
                <Label className="text-xs">كلمة المرور الجديدة</Label>
                <div className="relative">
                  <Input
                    type={showNewPass ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="8 أحرف على الأقل"
                  />
                  <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowNewPass(!showNewPass)}>
                    {showNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">تأكيد كلمة المرور</Label>
                <div className="relative">
                  <Input
                    type={showConfirmPass ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="أعد كتابة كلمة المرور"
                  />
                  <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowConfirmPass(!showConfirmPass)}>
                    {showConfirmPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button onClick={handleChangePassword} disabled={changingPassword} className="w-full rounded-xl h-11 gap-2">
                {changingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                تحديث كلمة المرور
              </Button>

              <button onClick={handleForgotPassword} className="text-sm text-blue-600 hover:underline w-full text-center">
                نسيت كلمة المرور؟
              </button>
            </div>

            {/* Logout all */}
            <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Shield className="h-4 w-4 text-red-500" />
                إدارة الجلسات
              </h3>
              <p className="text-xs text-muted-foreground">سجّل الخروج من جميع الأجهزة الأخرى لحماية حسابك.</p>
              <Button variant="destructive" onClick={handleLogoutAll} className="w-full rounded-xl h-11 gap-2">
                <LogOut className="h-4 w-4" />
                تسجيل الخروج من جميع الأجهزة
              </Button>
            </div>
          </div>
        )}
      </div>
    </StudentLayout>
  );
}

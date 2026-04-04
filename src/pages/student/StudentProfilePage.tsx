import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Camera,
  Loader2,
  LogOut,
  Wallet,
  Home,
  User,
  Bell,
  Settings,
  Menu,
  X,
  Globe,
  Key,
  ChevronLeft,
  Mail,
} from "lucide-react";

interface Profile {
  full_name: string;
  email: string;
  phone: string;
  stage: string;
  grade: string;
  section: string;
  avatar_url: string | null;
  student_code: string;
}

const stageLabels: Record<string, string> = { preparatory: "إعدادي", secondary: "ثانوي" };
const gradeLabels: Record<string, string> = { first: "أول", second: "ثاني", third: "ثالث" };

const navItems = [
  { label: "الصفحة الرئيسية", icon: Home, path: "/dashboard" },
  { label: "ملفي الشخصي", icon: User, path: "/student-profile" },
  { label: "محفظتي", icon: Wallet, path: "/wallet" },
  { label: "إدارة الحساب", icon: Key, path: "/student-security" },
  { label: "الإعدادات", icon: Settings, path: "/profile" },
  { label: "تواصل معنا", icon: Mail, path: "/support" },
  { label: "عن المنصة", icon: Globe, path: "/about-platform" },
];

export default function StudentProfilePage() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
      const ext = file.name.split(".").pop();
      const path = `avatars/${user.id}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("teacher-profiles").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("teacher-profiles").getPublicUrl(path);
      const avatarUrl = urlData.publicUrl + `?t=${Date.now()}`;
      await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);
      setProfile((prev) => prev ? { ...prev, avatar_url: avatarUrl } : prev);
      toast.success("تم تحديث الصورة بنجاح");
    } catch { toast.error("فشل رفع الصورة"); }
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

  const handleSignOut = async () => { await signOut(); navigate("/auth"); };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  const initials = profile?.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2) || "؟";
  const nameParts = (profile?.full_name || "").split(" ");
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  return (
    <div className="min-h-screen bg-background flex" dir="rtl">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ===== SIDEBAR - نجوى كلاسيز style ===== */}
      <aside className={cn(
        "fixed top-0 right-0 h-full w-[280px] z-50 flex flex-col bg-card border-l border-border transition-transform duration-300",
        "lg:relative lg:translate-x-0 lg:z-auto",
        sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
      )}>
        {/* Header with title */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-bold text-foreground">حسابي</h2>
          <button className="lg:hidden text-muted-foreground" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Avatar section */}
        <div className="flex flex-col items-center py-6 px-5">
          <div className="relative group mb-3">
            <Avatar className="h-24 w-24 border-4 border-blue-200 shadow-lg">
              <AvatarImage src={profile?.avatar_url || ""} />
              <AvatarFallback className="bg-[#7CB9E8] text-white text-2xl font-bold">
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
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </div>
          <h3 className="text-base font-bold text-foreground">{profile?.full_name}</h3>
        </div>

        {/* Nav items - clean list style */}
        <nav className="flex-1 overflow-y-auto px-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center justify-between px-4 py-3.5 mx-2 border-b border-border/50 text-sm font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-foreground hover:text-primary"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                    <item.icon className="h-4.5 w-4.5 text-muted-foreground" />
                  </div>
                  <span>{item.label}</span>
                </div>
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              </Link>
            );
          })}
        </nav>

        {/* Sign Out */}
        <div className="p-3 border-t border-border">
          <button
            onClick={handleSignOut}
            className="flex items-center justify-between px-4 py-3.5 mx-2 text-sm font-medium text-destructive hover:bg-destructive/10 w-full rounded-xl transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-destructive/10 flex items-center justify-center">
                <LogOut className="h-4.5 w-4.5 text-destructive" />
              </div>
              <span>تسجيل الخروج</span>
            </div>
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </aside>

      {/* ===== MAIN CONTENT ===== */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 border-b border-border bg-background/90 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-bold text-foreground">معلومات الطالب</h1>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => navigate("/notifications")}>
              <Bell className="h-5 w-5" />
            </Button>
            <button onClick={handleSaveProfile} disabled={saving} className="text-sm font-semibold text-primary hover:underline px-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
            </button>
          </div>
        </header>

        {/* Profile Form - نجوى كلاسيز style */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-lg mx-auto px-4 py-6">
            {/* Avatar Card */}
            <div className="bg-card rounded-2xl border border-border p-6 mb-4">
              {/* Avatar center */}
              <div className="flex flex-col items-center mb-6">
                <div className="relative group mb-2">
                  <Avatar className="h-24 w-24 border-4 border-blue-200 shadow-lg">
                    <AvatarImage src={profile?.avatar_url || ""} />
                    <AvatarFallback className="bg-[#7CB9E8] text-white text-2xl font-bold">
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
              </div>

              {/* Name fields side by side */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Input
                  value={lastName}
                  readOnly
                  className="bg-muted/50 border-0 rounded-xl h-12 text-center text-sm font-medium"
                  placeholder="الاسم الأخير"
                />
                <Input
                  value={firstName}
                  onChange={(e) => {
                    const newFirst = e.target.value;
                    setFullName(newFirst + (lastName ? ` ${lastName}` : ""));
                  }}
                  className="bg-muted/50 border-0 rounded-xl h-12 text-center text-sm font-medium"
                  placeholder="الاسم الأول"
                />
              </div>

              {/* Email */}
              <Input
                value={profile?.email || ""}
                readOnly
                className="bg-muted/50 border-0 rounded-xl h-12 text-sm mb-3 text-muted-foreground"
                dir="ltr"
              />

              {/* Phone */}
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

              {/* Grade */}
              <div className="flex items-center justify-between bg-muted/50 rounded-xl h-12 px-4 mb-3">
                <span className="text-sm font-medium text-foreground">
                  {stageLabels[profile?.stage || ""] ? `الصف ${gradeLabels[profile?.grade || ""] || ""} ${stageLabels[profile?.stage || ""]}` : "—"}
                </span>
              </div>

              {/* Student Code */}
              {profile?.student_code && (
                <div className="flex items-center justify-between bg-muted/50 rounded-xl h-12 px-4">
                  <span className="text-sm text-muted-foreground">كود الطالب</span>
                  <span className="text-sm font-bold text-foreground" dir="ltr">{profile.student_code}</span>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
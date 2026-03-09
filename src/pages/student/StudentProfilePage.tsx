import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Camera,
  Edit3,
  Save,
  X,
  Loader2,
  Lock,
  LogOut,
  BookOpen,
  Trophy,
  Target,
  Wallet,
  Award,
  BarChart3,
  Eye,
  EyeOff,
  Home,
  User,
  Bell,
  Settings,
  HelpCircle,
  Star,
  Zap,
  CreditCard,
  Phone,
  Mail,
  GraduationCap,
  Shield,
  Lightbulb,
  Sparkles,
  Menu,
  BookMarked,
  Calendar,
  Globe,
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

const stageLabels: Record<string, string> = {
  preparatory: "إعدادي",
  secondary: "ثانوي",
};
const gradeLabels: Record<string, string> = {
  first: "أول",
  second: "ثاني",
  third: "ثالث",
};

const navItems = [
  { label: "الصفحة الرئيسية", icon: Home, path: "/dashboard" },
  { label: "ملفي الشخصي", icon: User, path: "/student-profile" },
  { label: "محفظتي", icon: Wallet, path: "/wallet" },
  { label: "دروسي المشترك بها", icon: BookOpen, path: "/subjects" },
  { label: "أوسمتي وإنجازاتي", icon: Award, path: "#badges" },
  { label: "التقويم الدراسي", icon: Calendar, path: "#calendar" },
  { label: "عن المنصة", icon: Globe, path: "/about-platform" },
  { label: "الإعدادات الأمنية", icon: Settings, path: "/profile" },
];

export default function StudentProfilePage() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const [purchases, setPurchases] = useState<any[]>([]);
  const [examAttempts, setExamAttempts] = useState<any[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [depositHistory, setDepositHistory] = useState<any[]>([]);

  useEffect(() => {
    if (user) fetchAll();
  }, [user]);

  const fetchAll = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [profileRes, purchasesRes, examsRes, walletRes, depositsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("student_group_purchases").select("*, content_groups:group_id(title, price, image_url, lesson_count)").eq("student_id", user.id).order("purchased_at", { ascending: false }),
        supabase.from("exam_attempts").select("*, exams:exam_id(title, subject_id)").eq("student_id", user.id).order("submitted_at", { ascending: false }),
        supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
        supabase.from("deposit_requests").select("*").eq("student_id", user.id).order("created_at", { ascending: false }).limit(10),
      ]);

      if (profileRes.data) {
        const p = profileRes.data;
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
      setPurchases(purchasesRes.data || []);
      setExamAttempts(examsRes.data || []);
      setWalletBalance(walletRes.data?.balance || 0);
      setDepositHistory(depositsRes.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
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
    } catch (err) { console.error(err); toast.error("فشل رفع الصورة"); } finally { setUploadingAvatar(false); }
  };

  const handleSaveProfile = async () => {
    if (!user || !fullName.trim()) { toast.error("يرجى إدخال الاسم"); return; }
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName, phone, updated_at: new Date().toISOString() }).eq("id", user.id);
    setSaving(false);
    if (error) { toast.error("فشل حفظ البيانات"); } else {
      setProfile((prev) => prev ? { ...prev, full_name: fullName, phone } : prev);
      setEditing(false);
      toast.success("تم حفظ التعديلات");
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) { toast.error("كلمة المرور يجب أن تكون 8 أحرف على الأقل"); return; }
    if (newPassword !== confirmPassword) { toast.error("كلمات المرور غير متطابقة"); return; }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) { toast.error("فشل تغيير كلمة المرور"); } else {
      toast.success("تم تغيير كلمة المرور بنجاح");
      setNewPassword(""); setConfirmPassword(""); setShowPasswordSection(false);
    }
  };

  const handleSignOut = async () => { await signOut(); navigate("/auth"); };

  const totalExams = examAttempts.length;
  const avgScore = totalExams > 0 ? Math.round(examAttempts.reduce((sum, a) => sum + (a.total > 0 ? (a.score / a.total) * 100 : 0), 0) / totalExams) : 0;
  const totalCourses = purchases.length;
  const completionPercent = Math.min(100, Math.round((totalCourses * 15 + totalExams * 5 + avgScore * 0.3)));

  const achievements = [
    { icon: BookMarked, label: "ختم مادة الفقه", earned: totalCourses >= 1, color: "text-primary" },
    { icon: BarChart3, label: "المثابر الأسبوعي", earned: totalExams >= 3, color: "text-secondary" },
    { icon: Trophy, label: "بطل النحو", earned: avgScore >= 80, color: "text-primary" },
    { icon: Star, label: "نجم التفوق", earned: avgScore >= 90, color: "text-secondary" },
    { icon: Zap, label: "سرعة الإنجاز", earned: totalExams >= 5, color: "text-primary" },
    { icon: Sparkles, label: "الطالب المميز", earned: totalCourses >= 3, color: "text-secondary" },
  ];

  const recommendations = [
    { icon: Lightbulb, text: "راجع درس 'كتاب الصلاة' - بناءً على أدائك في الاختبار الأخير" },
    { icon: BookOpen, text: "أكمل مذكرة النحو - لديك تقدم 60% فيها" },
    { icon: Target, text: "جرّب اختبار الفقه التجريبي لتحسين درجاتك" },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  const initials = profile?.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2) || "؟";

  return (
    <div className="min-h-screen bg-muted/30 flex" dir="rtl">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ===== SIDEBAR ===== */}
      <aside className={cn(
        "fixed top-0 right-0 h-full w-[280px] z-50 flex flex-col transition-transform duration-300",
        "bg-gradient-to-b from-primary via-primary to-primary/90",
        "lg:relative lg:translate-x-0 lg:z-auto",
        sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
      )}>
        {/* Profile Section */}
        <div className="p-5 pb-4">
          <div className="flex items-center justify-between mb-5">
            <Badge className="bg-secondary text-secondary-foreground border-0 gap-1 text-xs font-bold px-3 py-1 rounded-full shadow-gold">
              <Star className="h-3 w-3" />
              الطالب الذهبي
            </Badge>
            <button className="lg:hidden text-primary-foreground/80" onClick={() => setSidebarOpen(false)}>
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Avatar */}
          <div className="flex flex-col items-center">
            <div className="relative group mb-3">
              <Avatar className="h-24 w-24 border-4 border-primary-foreground/20 shadow-2xl">
                <AvatarImage src={profile?.avatar_url || ""} />
                <AvatarFallback className="bg-primary-foreground/15 text-primary-foreground text-2xl font-bold">
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
              {/* Online dot */}
              <span className="absolute bottom-1 left-1 h-4 w-4 rounded-full bg-green-400 border-2 border-primary" />
            </div>
            <h3 className="text-primary-foreground font-bold text-lg">{profile?.full_name}</h3>
            <div className="w-full mt-3">
              <div className="flex justify-between text-xs text-primary-foreground/70 mb-1.5">
                <span>نسبة إتمام المنهج:</span>
                <span className="font-bold text-primary-foreground">{completionPercent}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-primary-foreground/15 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-l from-secondary to-secondary/80 transition-all duration-700"
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-secondary text-secondary-foreground shadow-gold"
                    : "text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
                )}
              >
                <item.icon className="h-4.5 w-4.5 shrink-0" />
                <span>{item.label}</span>
                {isActive && <span className="mr-auto text-[10px] font-bold opacity-80">(نشط)</span>}
              </Link>
            );
          })}
        </nav>

        {/* Sign Out */}
        <div className="p-3 border-t border-primary-foreground/10">
          <button onClick={handleSignOut} className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-red-200 hover:bg-red-500/20 w-full transition-colors">
            <LogOut className="h-4 w-4 shrink-0" />
            <span>تسجيل الخروج</span>
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
            <h1 className="text-lg font-bold text-foreground">ملفي التعليمي</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/notifications")}>
              <Bell className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate("/support")}>
              <HelpCircle className="h-5 w-5" />
            </Button>
          </div>
        </header>

        {/* Content Area - Bento Grid */}
        <main className="flex-1 overflow-y-auto p-3 md:p-5 lg:p-6">
          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-5 auto-rows-auto">

            {/* ===== Card 1: ملفي التعليمي ===== */}
            <div className="bg-card rounded-2xl border border-border shadow-sm p-5 md:col-span-1 xl:row-span-1 animate-fade-in">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  المعلومات الأساسية
                </h2>
                <div className="flex gap-1">
                  {!editing ? (
                    <button onClick={() => setEditing(true)} className="p-2 rounded-lg bg-muted hover:bg-accent transition-colors">
                      <Edit3 className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ) : (
                    <>
                      <button onClick={handleSaveProfile} disabled={saving} className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      </button>
                      <button onClick={() => { setEditing(false); setFullName(profile?.full_name || ""); setPhone(profile?.phone || ""); }} className="p-2 rounded-lg bg-muted hover:bg-accent transition-colors">
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">الاسم الكامل</label>
                  {editing ? (
                    <div className="relative">
                      <Edit3 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="pr-10 bg-muted/50 border-border" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/40">
                      <Edit3 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm">{profile?.full_name}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">رقم الهاتف</label>
                  {editing ? (
                    <div className="relative">
                      <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="pr-10 bg-muted/50 border-border" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/40">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm">{profile?.phone || "لم يُحدد"}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">المرحلة الدراسية</label>
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/40">
                    <GraduationCap className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm">
                      {stageLabels[profile?.stage || ""] || "—"} {gradeLabels[profile?.grade || ""] || ""}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">البريد الإلكتروني</label>
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/40">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm text-muted-foreground truncate">{profile?.email}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ===== Card 2: أوسمتي وإنجازاتي ===== */}
            <div className="bg-card rounded-2xl border border-border shadow-sm p-5 animate-fade-in delay-100">
              <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-secondary/20">
                  <Award className="h-4 w-4 text-secondary" />
                </div>
                أوسمتي وإنجازاتي
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {achievements.map((ach, i) => (
                  <div key={i} className="flex flex-col items-center text-center group">
                    <div className={cn(
                      "w-14 h-14 rounded-full flex items-center justify-center mb-2 transition-all duration-300",
                      ach.earned
                        ? "bg-gradient-to-br from-primary/15 to-secondary/15 border-2 border-secondary/40 shadow-sm group-hover:scale-110"
                        : "bg-muted border-2 border-border opacity-40"
                    )}>
                      <ach.icon className={cn("h-6 w-6", ach.earned ? ach.color : "text-muted-foreground")} />
                    </div>
                    <span className={cn("text-[11px] font-medium leading-tight", ach.earned ? "text-foreground" : "text-muted-foreground")}>
                      {ach.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* ===== Card 3: محفظتي الذكية ===== */}
            <div className="bg-card rounded-2xl border border-border shadow-sm p-5 animate-fade-in delay-200">
              <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <Wallet className="h-4 w-4 text-primary" />
                </div>
                محفظتي الذكية
              </h2>

              {/* Credit Card Style */}
              <div className="relative rounded-2xl overflow-hidden bg-gradient-to-bl from-primary via-primary to-primary/80 p-5 text-primary-foreground mb-4 shadow-azhari">
                <div className="absolute top-3 left-3 flex gap-1">
                  <div className="w-7 h-7 rounded-full bg-red-400/80" />
                  <div className="w-7 h-7 rounded-full bg-secondary/80 -mr-3" />
                </div>
                <div className="mt-8 mb-1">
                  <p className="text-xs text-primary-foreground/60">الرصيد الحالي:</p>
                  <p className="text-3xl font-bold tracking-wide mt-1" dir="ltr">
                    {walletBalance.toLocaleString("ar-EG")} <span className="text-base font-normal">ج.م</span>
                  </p>
                </div>
                <div className="absolute -bottom-4 -left-4 w-24 h-24 rounded-full bg-primary-foreground/5" />
              </div>

              <Button
                onClick={() => navigate("/wallet")}
                className="w-full gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl h-11 font-bold"
              >
                <CreditCard className="h-4 w-4" />
                + شحن الرصيد
              </Button>
            </div>

            {/* ===== Card 4: التقدم الدراسي ===== */}
            <div className="bg-card rounded-2xl border border-border shadow-sm p-5 animate-fade-in delay-100">
              <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <BarChart3 className="h-4 w-4 text-primary" />
                </div>
                التقدم الدراسي
              </h2>

              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { icon: Trophy, label: "الامتحانات", value: totalExams, bg: "bg-primary/10", color: "text-primary" },
                  { icon: Target, label: "المعدل", value: `${avgScore}%`, bg: "bg-secondary/15", color: "text-secondary" },
                  { icon: BookOpen, label: "الكورسات", value: totalCourses, bg: "bg-primary/10", color: "text-primary" },
                ].map((s, i) => (
                  <div key={i} className="text-center p-3 rounded-xl bg-muted/40">
                    <div className={cn("h-10 w-10 mx-auto rounded-xl flex items-center justify-center mb-2", s.bg)}>
                      <s.icon className={cn("h-5 w-5", s.color)} />
                    </div>
                    <p className="text-xl font-bold text-foreground">{s.value}</p>
                    <p className="text-[11px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">متوسط الأداء</span>
                  <span className="font-bold text-foreground">{avgScore}%</span>
                </div>
                <Progress value={avgScore} className="h-2.5" />
              </div>

              {examAttempts.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">آخر الامتحانات</p>
                  {examAttempts.slice(0, 2).map((a) => {
                    const pct = a.total > 0 ? Math.round((a.score / a.total) * 100) : 0;
                    return (
                      <div key={a.id} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/40 text-sm">
                        <span className="truncate flex-1 text-foreground">{(a.exams as any)?.title || "امتحان"}</span>
                        <Badge className={cn("mr-2 border-0 text-xs", pct >= 50 ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive")}>
                          {pct}%
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ===== Card 5: توصيات ذكية ===== */}
            <div className="bg-card rounded-2xl border border-border shadow-sm p-5 animate-fade-in delay-200">
              <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-secondary/20">
                  <Sparkles className="h-4 w-4 text-secondary" />
                </div>
                توصيات ذكية
              </h2>
              <div className="space-y-3">
                {recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 hover:bg-accent/50 transition-colors cursor-pointer group">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0 group-hover:bg-primary/20 transition-colors">
                      <rec.icon className="h-4 w-4 text-primary" />
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{rec.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ===== Card 6: الأمان ===== */}
            <div className="bg-card rounded-2xl border border-border shadow-sm p-5 animate-fade-in delay-300">
              <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <Shield className="h-4 w-4 text-primary" />
                </div>
                أمان الحساب
              </h2>

              <Button
                variant="outline"
                className="w-full justify-start gap-2 rounded-xl mb-3 border-border"
                onClick={() => setShowPasswordSection(!showPasswordSection)}
              >
                <Lock className="h-4 w-4" />
                تغيير كلمة المرور
              </Button>

              {showPasswordSection && (
                <div className="space-y-3 p-4 rounded-xl bg-muted/40 mb-3">
                  <div className="space-y-1">
                    <Label className="text-xs">كلمة المرور الجديدة</Label>
                    <div className="relative">
                      <Input type={showNewPass ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="8 أحرف على الأقل" className="bg-background" />
                      <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowNewPass(!showNewPass)}>
                        {showNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">تأكيد كلمة المرور</Label>
                    <div className="relative">
                      <Input type={showConfirmPass ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="أعد كتابة كلمة المرور" className="bg-background" />
                      <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowConfirmPass(!showConfirmPass)}>
                        {showConfirmPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button onClick={handleChangePassword} disabled={changingPassword} className="w-full rounded-xl">
                    {changingPassword ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Lock className="h-4 w-4 ml-2" />}
                    تحديث كلمة المرور
                  </Button>
                </div>
              )}

              <Button variant="destructive" size="sm" className="w-full gap-2 rounded-xl" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
                تسجيل الخروج من جميع الأجهزة
              </Button>
            </div>

            {/* ===== Card 7: كورساتي المشتركة (Full Width) ===== */}
            <div className="bg-card rounded-2xl border border-border shadow-sm p-5 md:col-span-2 xl:col-span-3 animate-fade-in delay-300">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10">
                    <BookOpen className="h-4 w-4 text-primary" />
                  </div>
                  دروسي المشترك بها
                </h2>
                <Badge className="bg-primary/10 text-primary border-0 text-xs">{totalCourses} كورس</Badge>
              </div>

              {purchases.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-muted flex items-center justify-center mb-3">
                    <BookOpen className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">لم تشترك في أي كورس بعد</p>
                  <Button variant="outline" size="sm" className="mt-3 rounded-xl" onClick={() => navigate("/subjects")}>
                    تصفح الكورسات
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {purchases.map((p) => {
                    const group = p.content_groups as any;
                    return (
                      <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 hover:bg-accent/40 transition-colors">
                        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <BookOpen className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate text-foreground">{group?.title || "كورس"}</p>
                          <p className="text-xs text-muted-foreground">{group?.lesson_count || 0} درس · {p.amount_paid || 0} ج.م</p>
                        </div>
                        <Badge className="bg-primary/10 text-primary border-0 text-[10px] shrink-0">مشترك</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}

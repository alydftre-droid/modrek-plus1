import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import StudentSidebarLayout from "@/components/student/StudentSidebarLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  Camera,
  Edit3,
  Save,
  X,
  Loader2,
  ShieldCheck,
  Lock,
  Smartphone,
  LogOut,
  BookOpen,
  Trophy,
  Target,
  Wallet,
  CheckCircle,
  Clock,
  XCircle,
  TrendingUp,
  Award,
  BarChart3,
  Eye,
  EyeOff,
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
  preparatory: "المرحلة الإعدادية",
  secondary: "المرحلة الثانوية",
};

const gradeLabels: Record<string, string> = {
  first: "الصف الأول",
  second: "الصف الثاني",
  third: "الصف الثالث",
};

export default function StudentProfilePage() {
  const { user, signOut } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Edit fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  // Password
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  // Courses & Progress
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

    if (file.size > 2 * 1024 * 1024) {
      toast.error("حجم الصورة يجب أن يكون أقل من 2 ميجابايت");
      return;
    }

    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `avatars/${user.id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("teacher-profiles")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("teacher-profiles")
        .getPublicUrl(path);

      const avatarUrl = urlData.publicUrl + `?t=${Date.now()}`;

      await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);

      setProfile((prev) => prev ? { ...prev, avatar_url: avatarUrl } : prev);
      toast.success("تم تحديث الصورة بنجاح");
    } catch (err) {
      console.error(err);
      toast.error("فشل رفع الصورة");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user || !fullName.trim()) {
      toast.error("يرجى إدخال الاسم");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, phone, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    setSaving(false);

    if (error) {
      toast.error("فشل حفظ البيانات");
    } else {
      setProfile((prev) => prev ? { ...prev, full_name: fullName, phone } : prev);
      setEditing(false);
      toast.success("تم حفظ التعديلات");
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast.error("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("كلمات المرور غير متطابقة");
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);

    if (error) {
      toast.error("فشل تغيير كلمة المرور");
    } else {
      toast.success("تم تغيير كلمة المرور بنجاح");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordSection(false);
    }
  };

  const handleLogoutAll = async () => {
    await signOut();
    toast.success("تم تسجيل الخروج من جميع الأجهزة");
  };

  // Stats
  const totalExams = examAttempts.length;
  const avgScore = totalExams > 0
    ? Math.round(examAttempts.reduce((sum, a) => sum + (a.total > 0 ? (a.score / a.total) * 100 : 0), 0) / totalExams)
    : 0;
  const totalCourses = purchases.length;

  if (loading) {
    return (
      <StudentSidebarLayout title="ملفي الشخصي">
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      </StudentSidebarLayout>
    );
  }

  return (
    <StudentSidebarLayout title="ملفي الشخصي">
      <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
        {/* Hero Card */}
        <Card className="overflow-hidden border-0 shadow-lg">
          <div className="bg-gradient-to-bl from-primary via-primary/90 to-primary/70 p-6 md:p-8">
            <div className="flex flex-col sm:flex-row items-center gap-5">
              {/* Avatar */}
              <div className="relative group">
                <Avatar className="h-24 w-24 md:h-28 md:w-28 border-4 border-primary-foreground/30 shadow-xl">
                  <AvatarImage src={profile?.avatar_url || ""} />
                  <AvatarFallback className="bg-primary-foreground/20 text-primary-foreground text-2xl font-bold">
                    {profile?.full_name?.charAt(0) || "؟"}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                  ) : (
                    <Camera className="h-6 w-6 text-white" />
                  )}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
              </div>

              {/* Info */}
              <div className="text-center sm:text-right flex-1">
                <h2 className="text-2xl md:text-3xl font-bold text-primary-foreground">
                  {profile?.full_name}
                </h2>
                <p className="text-primary-foreground/70 text-sm mt-1">{profile?.email}</p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3">
                  <Badge className="bg-primary-foreground/20 text-primary-foreground border-0">
                    {stageLabels[profile?.stage || ""] || profile?.stage}
                  </Badge>
                  <Badge className="bg-primary-foreground/20 text-primary-foreground border-0">
                    {gradeLabels[profile?.grade || ""] || profile?.grade}
                  </Badge>
                  {profile?.student_code && (
                    <Badge variant="outline" className="border-primary-foreground/30 text-primary-foreground">
                      كود: {profile.student_code}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Quick stats */}
              <div className="flex gap-4 sm:gap-6">
                {[
                  { icon: BookOpen, label: "كورس", value: totalCourses },
                  { icon: Trophy, label: "امتحان", value: totalExams },
                  { icon: Target, label: "المعدل", value: `${avgScore}%` },
                ].map((stat, i) => (
                  <div key={i} className="text-center">
                    <div className="h-10 w-10 mx-auto rounded-xl bg-primary-foreground/15 flex items-center justify-center mb-1">
                      <stat.icon className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <p className="text-xl font-bold text-primary-foreground">{stat.value}</p>
                    <p className="text-xs text-primary-foreground/60">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Personal Info */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-primary" />
                المعلومات الشخصية
              </CardTitle>
              {!editing ? (
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                  <Edit3 className="h-4 w-4 ml-1" />
                  تعديل
                </Button>
              ) : (
                <div className="flex gap-1">
                  <Button size="sm" onClick={handleSaveProfile} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 ml-1" />}
                    حفظ
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setFullName(profile?.full_name || ""); setPhone(profile?.phone || ""); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">الاسم الكامل</Label>
                {editing ? (
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                ) : (
                  <p className="font-medium">{profile?.full_name}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">البريد الإلكتروني</Label>
                <p className="font-medium text-muted-foreground">{profile?.email}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">رقم الهاتف</Label>
                {editing ? (
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                ) : (
                  <p className="font-medium">{profile?.phone || "لم يُحدد"}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">المرحلة</Label>
                  <p className="font-medium">{stageLabels[profile?.stage || ""] || profile?.stage || "—"}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">الصف</Label>
                  <p className="font-medium">{gradeLabels[profile?.grade || ""] || profile?.grade || "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                الأمان والخصوصية
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Change Password */}
              <div>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => setShowPasswordSection(!showPasswordSection)}
                >
                  <Lock className="h-4 w-4" />
                  تغيير كلمة المرور
                </Button>

                {showPasswordSection && (
                  <div className="mt-4 space-y-3 p-4 rounded-lg bg-muted/50">
                    <div className="space-y-1">
                      <Label className="text-xs">كلمة المرور الجديدة</Label>
                      <div className="relative">
                        <Input
                          type={showNewPass ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="8 أحرف على الأقل"
                        />
                        <button
                          type="button"
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                          onClick={() => setShowNewPass(!showNewPass)}
                        >
                          {showNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">تأكيد كلمة المرور</Label>
                      <div className="relative">
                        <Input
                          type={showConfirmPass ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="أعد كتابة كلمة المرور"
                        />
                        <button
                          type="button"
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                          onClick={() => setShowConfirmPass(!showConfirmPass)}
                        >
                          {showConfirmPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <Button onClick={handleChangePassword} disabled={changingPassword} className="w-full">
                      {changingPassword ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Lock className="h-4 w-4 ml-2" />}
                      تحديث كلمة المرور
                    </Button>
                  </div>
                )}
              </div>

              <Separator />

              {/* Connected Devices */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Smartphone className="h-4 w-4 text-primary" />
                  الأجهزة المتصلة
                </div>
                <div className="p-3 rounded-lg bg-accent/50 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Smartphone className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">هذا الجهاز</p>
                    <p className="text-xs text-muted-foreground">الجهاز الحالي المتصل</p>
                  </div>
                  <Badge className="bg-green-500/15 text-green-600 border-0 text-xs">نشط</Badge>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full gap-2"
                  onClick={handleLogoutAll}
                >
                  <LogOut className="h-4 w-4" />
                  تسجيل الخروج من جميع الأجهزة
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* My Courses */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                كورساتي المشتركة
                <Badge variant="secondary" className="mr-auto">{totalCourses}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {purchases.length === 0 ? (
                <p className="text-center text-muted-foreground py-6 text-sm">لم تشترك في أي كورس بعد</p>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto">
                  {purchases.map((p) => {
                    const group = p.content_groups as any;
                    return (
                      <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/30 transition-colors">
                        <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <BookOpen className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{group?.title || "كورس"}</p>
                          <p className="text-xs text-muted-foreground">
                            {group?.lesson_count || 0} درس · {p.amount_paid || 0} جنيه
                          </p>
                        </div>
                        <Badge className="bg-green-500/15 text-green-600 border-0 text-xs shrink-0">مشترك</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Academic Progress */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                التقدم الدراسي
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: Award, label: "الامتحانات", value: totalExams, color: "text-blue-500", bg: "bg-blue-500/10" },
                  { icon: BarChart3, label: "المعدل", value: `${avgScore}%`, color: "text-green-500", bg: "bg-green-500/10" },
                  { icon: BookOpen, label: "الكورسات", value: totalCourses, color: "text-amber-500", bg: "bg-amber-500/10" },
                ].map((s, i) => (
                  <div key={i} className="text-center p-3 rounded-lg bg-muted/50">
                    <div className={`h-9 w-9 mx-auto rounded-lg ${s.bg} flex items-center justify-center mb-2`}>
                      <s.icon className={`h-4 w-4 ${s.color}`} />
                    </div>
                    <p className="text-lg font-bold">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Average Progress Bar */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">متوسط الأداء</span>
                  <span className="font-bold">{avgScore}%</span>
                </div>
                <Progress value={avgScore} className="h-3" />
              </div>

              {/* Recent Exams */}
              {examAttempts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">آخر الامتحانات</p>
                  {examAttempts.slice(0, 3).map((a) => {
                    const pct = a.total > 0 ? Math.round((a.score / a.total) * 100) : 0;
                    return (
                      <div key={a.id} className="flex items-center justify-between p-2 rounded-lg border text-sm">
                        <span className="truncate flex-1">{(a.exams as any)?.title || "امتحان"}</span>
                        <Badge variant={pct >= 50 ? "default" : "destructive"} className="mr-2">
                          {pct}%
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Wallet Overview */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                المحفظة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Balance */}
                <div className="flex-1 p-5 rounded-xl bg-gradient-to-bl from-primary to-primary/80 text-primary-foreground text-center sm:text-right">
                  <p className="text-sm opacity-70">الرصيد الحالي</p>
                  <p className="text-3xl font-bold mt-1">{walletBalance.toLocaleString("ar-EG")} جنيه</p>
                </div>

                {/* Recent deposits */}
                <div className="flex-1">
                  <p className="text-xs font-medium text-muted-foreground mb-2">آخر العمليات</p>
                  {depositHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">لا توجد عمليات</p>
                  ) : (
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {depositHistory.slice(0, 4).map((d) => (
                        <div key={d.id} className="flex items-center justify-between text-sm p-2 rounded-lg border">
                          <span className="font-medium">{d.amount} جنيه</span>
                          {d.status === "pending" && <Badge variant="secondary" className="text-xs gap-1"><Clock className="h-3 w-3" />قيد المراجعة</Badge>}
                          {d.status === "approved" && <Badge className="bg-green-500 text-xs gap-1"><CheckCircle className="h-3 w-3" />مقبول</Badge>}
                          {d.status === "rejected" && <Badge variant="destructive" className="text-xs gap-1"><XCircle className="h-3 w-3" />مرفوض</Badge>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </StudentSidebarLayout>
  );
}

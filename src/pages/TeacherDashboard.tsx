import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, LogOut, BookOpen, User, Users, Settings, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherProfileEditor from "@/components/teacher/TeacherProfileEditor";
import TeacherStudentAnalytics from "@/components/teacher/TeacherStudentAnalytics";

type TeacherAssignment = {
  stage: string;
  grade: string;
  section: string | null;
  category: string;
};

const TeacherDashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [syncingAssignments, setSyncingAssignments] = useState(false);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [teacherName, setTeacherName] = useState("");
  const [activeTab, setActiveTab] = useState("subjects");

  useEffect(() => {
    if (!user) return;
    fetchTeacherData();
  }, [user?.id]);

  const fetchTeacherData = async () => {
    setLoading(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user!.id)
      .maybeSingle();

    if (profile) {
      setTeacherName(profile.full_name);
    }

    const syncAssignmentsFromApprovedRequestIfNeeded = async (
      currentAssignments: TeacherAssignment[]
    ) => {
      if (currentAssignments.length > 0) return currentAssignments;

      setSyncingAssignments(true);
      try {
        const { data: approvedReq, error: reqError } = await supabase
          .from("teacher_requests")
          .select("assigned_stages, assigned_grades, assigned_category, status, created_at")
          .eq("user_id", user!.id)
          .eq("status", "approved")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (reqError) {
          console.error("Error loading teacher request for sync:", reqError);
          return currentAssignments;
        }

        const stage = approvedReq?.assigned_stages?.[0] ?? "secondary";
        const category = approvedReq?.assigned_category ?? "";
        const grades = approvedReq?.assigned_grades ?? [];

        if (!category || grades.length === 0) return currentAssignments;

        const { data: existing } = await supabase
          .from("teacher_assignments")
          .select("stage, grade, section, category")
          .eq("teacher_id", user!.id);

        const existingKeys = new Set(
          (existing || []).map(
            (a) => `${a.category}|${a.stage}|${a.grade}|${a.section ?? ""}`
          )
        );

        const toInsert = grades
          .map((grade) => ({
            teacher_id: user!.id,
            stage,
            grade,
            category,
            section: null,
          }))
          .filter((a) => !existingKeys.has(`${a.category}|${a.stage}|${a.grade}|`));

        if (toInsert.length > 0) {
          const { error: insertError } = await supabase
            .from("teacher_assignments")
            .insert(toInsert);

          if (insertError) {
            console.error("Error syncing teacher assignments:", insertError);
            return currentAssignments;
          }
        }

        const { data: refreshed } = await supabase
          .from("teacher_assignments")
          .select("stage, grade, section, category")
          .eq("teacher_id", user!.id);

        return (refreshed || []) as TeacherAssignment[];
      } finally {
        setSyncingAssignments(false);
      }
    };

    const { data, error } = await supabase
      .from("teacher_assignments")
      .select("stage, grade, section, category")
      .eq("teacher_id", user!.id);

    if (error) {
      console.error("Error loading teacher assignments:", error);
      setAssignments([]);
    } else {
      const synced = await syncAssignmentsFromApprovedRequestIfNeeded(
        (data || []) as TeacherAssignment[]
      );
      setAssignments(synced);
    }

    setLoading(false);
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  // Group by category & stage
  const groupedAssignments = assignments.reduce((acc, curr) => {
    const key = `${curr.category}-${curr.stage}`;
    if (!acc[key]) {
      acc[key] = { category: curr.category, stage: curr.stage, grades: [] };
    }
    if (!acc[key].grades.includes(curr.grade)) {
      acc[key].grades.push(curr.grade);
    }
    return acc;
  }, {} as Record<string, { category: string; stage: string; grades: string[] }>);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">جاري تحميل لوحة المعلم...</p>
        </div>
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-4">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-bold mb-2">لم يتم ربطك بأي مادة حتى الآن</h2>
          <p className="text-muted-foreground mb-4">
            {syncingAssignments
              ? "جاري مزامنة تعييناتك تلقائياً..."
              : "إذا تمت الموافقة ولم تظهر المواد، اضغط إعادة المحاولة."}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button onClick={fetchTeacherData} disabled={syncingAssignments} className="gap-2">
              {syncingAssignments && <Loader2 className="h-4 w-4 animate-spin" />}
              إعادة المحاولة
            </Button>
            <Button variant="outline" onClick={handleLogout}>تسجيل الخروج</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl gradient-azhari flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-lg">لوحة المعلم</h1>
              <p className="text-sm text-muted-foreground">{teacherName}</p>
            </div>
          </div>

          <Button variant="ghost" onClick={handleLogout} className="gap-2">
            <LogOut className="h-4 w-4" />
            تسجيل الخروج
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="subjects" className="gap-1.5 text-xs sm:text-sm">
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">المواد</span>
            </TabsTrigger>
            <TabsTrigger value="profile" className="gap-1.5 text-xs sm:text-sm">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">السيرة الذاتية</span>
            </TabsTrigger>
            <TabsTrigger value="students" className="gap-1.5 text-xs sm:text-sm">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">إدارة الطلاب</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5 text-xs sm:text-sm">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">الإعدادات</span>
            </TabsTrigger>
          </TabsList>

          {/* Subjects Tab */}
          <TabsContent value="subjects" className="space-y-6">
            {Object.values(groupedAssignments).map((group) => (
              <Card key={`${group.category}-${group.stage}`}>
                <CardContent className="p-6 space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-primary">{group.category}</h2>
                    <p className="text-sm text-muted-foreground">
                      المرحلة: {group.stage === "secondary" ? "ثانوي" : "إعدادي"}
                    </p>
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {group.grades.map((grade) => (
                      <Card
                        key={grade}
                        className="hover:shadow-md transition cursor-pointer"
                        onClick={() =>
                          navigate(
                            `/teacher/subject?category=${encodeURIComponent(group.category)}&grade=${encodeURIComponent(grade)}&stage=${group.stage}`
                          )
                        }
                      >
                        <CardContent className="p-4 text-center">
                          <h3 className="font-semibold">{grade}</h3>
                          <Button className="w-full mt-3" size="sm">إدارة المحتوى</Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Profile/CV Tab */}
          <TabsContent value="profile">
            <TeacherProfileEditor />
          </TabsContent>

          {/* Students Tab */}
          <TabsContent value="students">
            <TeacherStudentAnalytics />
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <TeacherSettingsSection />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

// Teacher Settings Component
const TeacherSettingsSection = () => {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("email, phone")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setEmail(data.email);
        setPhone(data.phone || "");
      }
    };
    fetchProfile();
  }, [user?.id]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ email, phone, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) throw error;

      // Update auth email if changed
      const { error: authError } = await supabase.auth.updateUser({ email });
      if (authError) console.error("Error updating auth email:", authError);

      const { toast } = await import("sonner");
      toast.success("تم تحديث البيانات بنجاح");
    } catch (e) {
      console.error(e);
      const { toast } = await import("sonner");
      toast.error("خطأ في تحديث البيانات");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      const { toast } = await import("sonner");
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      const { toast } = await import("sonner");
      toast.success("تم تغيير كلمة المرور بنجاح");
    } catch (e) {
      console.error(e);
      const { toast } = await import("sonner");
      toast.error("خطأ في تغيير كلمة المرور");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleWhatsApp = () => {
    window.open("https://wa.me/201223909712?text=مرحباً، أنا معلم على منصة أزهاريون وأحتاج مساعدة", "_blank");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6 space-y-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Settings className="h-5 w-5" />
            معلومات الحساب
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-muted-foreground">البريد الإلكتروني</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-foreground"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">رقم الهاتف</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-foreground"
              />
            </div>
            <Button onClick={handleSaveProfile} disabled={saving} className="w-full gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              حفظ التغييرات
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h3 className="font-bold text-lg">تغيير كلمة المرور</h3>
          <div>
            <label className="text-sm font-medium text-muted-foreground">كلمة المرور الجديدة</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="أدخل كلمة المرور الجديدة"
              className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-foreground"
            />
          </div>
          <Button onClick={handleChangePassword} disabled={changingPassword} variant="outline" className="w-full gap-2">
            {changingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
            تغيير كلمة المرور
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h3 className="font-bold text-lg">الدعم والتواصل</h3>
          <p className="text-sm text-muted-foreground">تواصل مع إدارة المنصة عبر واتساب للمساعدة</p>
          <Button onClick={handleWhatsApp} className="w-full gap-2 bg-green-600 hover:bg-green-700">
            <FileText className="h-4 w-4" />
            تواصل عبر واتساب
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default TeacherDashboard;

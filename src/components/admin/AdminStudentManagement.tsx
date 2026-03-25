import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/manualClient";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, Users, Eye, Ban, CheckCircle, Loader2, User, Mail, Phone,
  Calendar, Hash, GraduationCap, BookOpen, Video, FileText, Wallet,
  TrendingUp, Clock, Download, Edit, Shield, ChevronRight, ChevronLeft,
  Star, ArrowLeft, Activity, CreditCard, ShoppingCart, BarChart3
} from "lucide-react";

// Types
interface StudentProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  student_code: string | null;
  stage: string | null;
  grade: string | null;
  section: string | null;
  is_banned: boolean | null;
  created_at: string | null;
  avatar_url: string | null;
}

interface StudentPurchase {
  id: string;
  group_id: string;
  purchased_at: string;
  amount_paid: number | null;
  group_title?: string;
  teacher_name?: string;
}

interface StudentDeposit {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  payment_method: string | null;
}

// Stage/Grade config
const stageConfig = [
  { key: "اعدادي", label: "المرحلة الإعدادية", icon: "📘", color: "from-blue-500 to-indigo-600", grades: ["الصف الأول", "الصف الثاني", "الصف الثالث"] },
  { key: "ثانوي", label: "المرحلة الثانوية", icon: "📕", color: "from-purple-500 to-pink-600", grades: ["الصف الأول", "الصف الثاني", "الصف الثالث"] },
];

// Format date helper
const fmtDate = (d: string | null) => {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
};

// ============================================
// MAIN COMPONENT
// ============================================
const AdminStudentManagement = () => {
  const [view, setView] = useState<"main" | "grade" | "detail">("main");
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      {view !== "main" && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (view === "detail") { setView(selectedGrade ? "grade" : "main"); setSelectedStudent(null); }
            else { setView("main"); setSelectedStage(null); setSelectedGrade(null); }
          }}
          className="gap-2 text-muted-foreground hover:text-foreground mb-2"
        >
          <ArrowLeft className="h-4 w-4" />
          رجوع
        </Button>
      )}

      {view === "main" && (
        <MainView
          onSelectStage={(s) => { setSelectedStage(s); setView("main"); }}
          onSelectGrade={(s, g) => { setSelectedStage(s); setSelectedGrade(g); setView("grade"); }}
          onSelectStudent={(s) => { setSelectedStudent(s); setView("detail"); }}
        />
      )}

      {view === "grade" && selectedStage && selectedGrade && (
        <GradeStudentsView
          stage={selectedStage}
          grade={selectedGrade}
          onSelectStudent={(s) => { setSelectedStudent(s); setView("detail"); }}
        />
      )}

      {view === "detail" && selectedStudent && (
        <StudentDetailView
          student={selectedStudent}
          onBack={() => { setView(selectedGrade ? "grade" : "main"); setSelectedStudent(null); }}
          onRefresh={() => {}}
        />
      )}
    </div>
  );
};

// ============================================
// MAIN VIEW - Search + Stages + Recent
// ============================================
const MainView = ({ onSelectStage, onSelectGrade, onSelectStudent }: {
  onSelectStage: (s: string) => void;
  onSelectGrade: (s: string, g: string) => void;
  onSelectStudent: (s: StudentProfile) => void;
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<StudentProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [recentStudents, setRecentStudents] = useState<StudentProfile[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [gradeStudentCounts, setGradeStudentCounts] = useState<Record<string, number>>({});
  const [totalStudents, setTotalStudents] = useState(0);

  // Fetch recent students & counts
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [{ data: recent }, { count: total }] = await Promise.all([
          supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(50),
          supabase.from("profiles").select("*", { count: "exact", head: true }),
        ]);
        setRecentStudents(recent || []);
        setTotalStudents(total || 0);

        // Count by stage
        const counts: Record<string, number> = {};
        (recent || []).forEach((s: any) => {
          if (s.stage) counts[s.stage] = (counts[s.stage] || 0) + 1;
        });

        // Get accurate counts from DB
        for (const sc of stageConfig) {
          const { count } = await supabase.from("profiles").select("*", { count: "exact", head: true }).eq("stage", sc.key);
          counts[sc.key] = count || 0;
        }
        setStageCounts(counts);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingRecent(false);
      }
    };
    fetchData();
  }, []);

  // Load grade counts when stage expanded
  useEffect(() => {
    if (!expandedStage) return;
    const cfg = stageConfig.find(s => s.key === expandedStage);
    if (!cfg) return;
    const loadGradeCounts = async () => {
      const counts: Record<string, number> = {};
      for (const g of cfg.grades) {
        const { count } = await supabase.from("profiles").select("*", { count: "exact", head: true }).eq("stage", expandedStage).eq("grade", g);
        counts[`${expandedStage}-${g}`] = count || 0;
      }
      setGradeStudentCounts(prev => ({ ...prev, ...counts }));
    };
    loadGradeCounts();
  }, [expandedStage]);

  // Search
  useEffect(() => {
    if (!searchTerm.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const term = searchTerm.trim();
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .or(`full_name.ilike.%${term}%,email.ilike.%${term}%,student_code.ilike.%${term}%`)
          .limit(20);
        setSearchResults(data || []);
      } catch (e) { console.error(e); }
      finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const gradeColors = [
    "from-cyan-400 to-blue-500",
    "from-violet-400 to-purple-500",
    "from-rose-400 to-pink-500",
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-blue-600 via-indigo-600 to-purple-700 p-6 text-white">
        <div className="absolute top-0 left-0 w-40 h-40 bg-white/5 rounded-full -translate-x-10 -translate-y-10" />
        <div className="absolute bottom-0 right-0 w-32 h-32 bg-white/5 rounded-full translate-x-8 translate-y-8" />
        <div className="relative">
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <Users className="h-5 w-5" />
            </div>
            إدارة الطلاب
          </h1>
          <p className="text-white/70 mt-1 text-sm">متابعة وتحليل بيانات الطلاب</p>
          <div className="mt-4 flex items-center gap-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2">
              <p className="text-2xl font-bold">{totalStudents}</p>
              <p className="text-xs text-white/60">إجمالي الطلاب</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          placeholder="ابحث بالاسم / الكود / البريد الإلكتروني..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pr-12 h-14 text-base rounded-xl border-2 shadow-sm focus:shadow-md transition-shadow"
        />
        {searching && <Loader2 className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-primary" />}
      </div>

      {/* Search Results */}
      {searchTerm.trim() && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">نتائج البحث ({searchResults.length})</h3>
          {searchResults.length === 0 && !searching ? (
            <p className="text-center py-8 text-muted-foreground">لا توجد نتائج</p>
          ) : (
            <div className="grid gap-3">
              {searchResults.map((s) => (
                <StudentCard key={s.id} student={s} onClick={() => onSelectStudent(s)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stage Selection */}
      {!searchTerm.trim() && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {stageConfig.map((sc) => (
              <div key={sc.key}>
                <button
                  onClick={() => setExpandedStage(expandedStage === sc.key ? null : sc.key)}
                  className={`w-full rounded-xl bg-gradient-to-bl ${sc.color} text-white p-4 text-center transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg`}
                >
                  <span className="text-3xl block mb-2">{sc.icon}</span>
                  <p className="font-bold text-sm">{sc.label}</p>
                  <p className="text-white/70 text-xs mt-1">{stageCounts[sc.key] || 0} طالب</p>
                </button>
                {expandedStage === sc.key && (
                  <div className="mt-2 space-y-2 animate-in slide-in-from-top-2">
                    {sc.grades.map((g, i) => (
                      <button
                        key={g}
                        onClick={() => onSelectGrade(sc.key, g)}
                        className={`w-full rounded-lg bg-gradient-to-l ${gradeColors[i % 3]} text-white p-3 flex items-center justify-between transition-all hover:scale-[1.01] active:scale-[0.99] shadow-md`}
                      >
                        <div className="flex items-center gap-2">
                          <GraduationCap className="h-4 w-4" />
                          <span className="text-sm font-medium">{g}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-white/20 text-white border-0 text-xs">
                            {gradeStudentCounts[`${sc.key}-${g}`] ?? "..."}
                          </Badge>
                          <ChevronLeft className="h-4 w-4" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Recent Students */}
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2 mb-3">
              <Clock className="h-5 w-5 text-orange-500" />
              آخر الطلاب المسجلين
              <Badge className="bg-orange-100 text-orange-700 border-0">{recentStudents.length}</Badge>
            </h3>
            {loadingRecent ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
            ) : (
              <div className="grid gap-3 max-h-[60vh] overflow-y-auto pr-1">
                {recentStudents.slice(0, 50).map((s) => (
                  <StudentCard key={s.id} student={s} onClick={() => onSelectStudent(s)} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ============================================
// STUDENT CARD
// ============================================
const StudentCard = ({ student, onClick }: { student: StudentProfile; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="w-full text-right bg-card rounded-xl border-2 border-border/50 p-4 flex items-center gap-3 transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.99] group"
  >
    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center flex-shrink-0 shadow-md">
      {student.avatar_url ? (
        <img src={student.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
      ) : (
        <User className="h-5 w-5 text-white" />
      )}
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-bold text-foreground truncate">{student.full_name}</p>
      <div className="flex items-center gap-2 mt-0.5">
        {student.stage && student.grade && (
          <span className="text-xs text-muted-foreground">{student.stage} - {student.grade}</span>
        )}
        {student.student_code && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{student.student_code}</Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(student.created_at)}</p>
    </div>
    <div className="flex flex-col items-center gap-1">
      {student.is_banned && <Badge variant="destructive" className="text-[10px]">محظور</Badge>}
      <Eye className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
    </div>
  </button>
);

// ============================================
// GRADE STUDENTS VIEW
// ============================================
const GradeStudentsView = ({ stage, grade, onSelectStudent }: {
  stage: string; grade: string; onSelectStudent: (s: StudentProfile) => void;
}) => {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionCounts, setSectionCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("stage", stage)
        .eq("grade", grade)
        .order("created_at", { ascending: false });
      const list = data || [];
      setStudents(list);

      const counts: Record<string, number> = {};
      list.forEach((s: any) => {
        const sec = s.section || "غير محدد";
        counts[sec] = (counts[sec] || 0) + 1;
      });
      setSectionCounts(counts);
      setLoading(false);
    };
    fetch();
  }, [stage, grade]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-gradient-to-l from-violet-500 to-indigo-600 text-white p-5">
        <h2 className="text-xl font-bold">{stage} - {grade}</h2>
        <p className="text-white/70 text-sm mt-1">إجمالي {students.length} طالب</p>
        <div className="flex gap-3 mt-3 flex-wrap">
          {Object.entries(sectionCounts).map(([sec, cnt]) => (
            <div key={sec} className="bg-white/15 backdrop-blur-sm rounded-lg px-3 py-1.5">
              <p className="text-xs text-white/60">{sec}</p>
              <p className="font-bold text-sm">{cnt}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3 max-h-[65vh] overflow-y-auto pr-1">
        {students.map((s) => (
          <StudentCard key={s.id} student={s} onClick={() => onSelectStudent(s)} />
        ))}
      </div>
    </div>
  );
};

// ============================================
// STUDENT DETAIL VIEW
// ============================================
const StudentDetailView = ({ student, onBack, onRefresh }: {
  student: StudentProfile; onBack: () => void; onRefresh: () => void;
}) => {
  const [activeTab, setActiveTab] = useState("overview");
  const [purchases, setPurchases] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<StudentDeposit[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [videoProgress, setVideoProgress] = useState<any[]>([]);
  const [examAttempts, setExamAttempts] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [teacherChoices, setTeacherChoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [banLoading, setBanLoading] = useState(false);
  const [editDialog, setEditDialog] = useState(false);
  const [editForm, setEditForm] = useState({ full_name: student.full_name, phone: student.phone || "", stage: student.stage || "", grade: student.grade || "", section: student.section || "" });
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [
          { data: purch },
          { data: deps },
          { data: wall },
          { data: vids },
          { data: exams },
          { data: subs },
          { data: teachers },
        ] = await Promise.all([
          supabase.from("student_group_purchases").select("*").eq("student_id", student.id).order("purchased_at", { ascending: false }),
          supabase.from("deposit_requests").select("*").eq("student_id", student.id).order("created_at", { ascending: false }),
          supabase.from("wallets").select("balance").eq("user_id", student.id).maybeSingle(),
          supabase.from("video_progress").select("*, content(title, type)").eq("user_id", student.id),
          supabase.from("exam_attempts").select("*, exams(title, subject_id)").eq("student_id", student.id).order("submitted_at", { ascending: false }),
          supabase.from("subscriptions").select("*, subjects(name)").eq("student_id", student.id),
          supabase.from("student_teacher_choices").select("*").eq("student_id", student.id),
        ]);

        // Enrich purchases with group titles
        const purchList = purch || [];
        if (purchList.length > 0) {
          const groupIds = [...new Set(purchList.map((p: any) => p.group_id))];
          const { data: groups } = await supabase.from("content_groups").select("id, title, teacher_id").in("id", groupIds);
          const groupMap = Object.fromEntries((groups || []).map((g: any) => [g.id, g]));

          const teacherIds = [...new Set((groups || []).map((g: any) => g.teacher_id).filter(Boolean))];
          let teacherMap: Record<string, string> = {};
          if (teacherIds.length > 0) {
            const { data: teacherProfiles } = await supabase.from("profiles").select("id, full_name").in("id", teacherIds);
            teacherMap = Object.fromEntries((teacherProfiles || []).map((t: any) => [t.id, t.full_name]));
          }

          purchList.forEach((p: any) => {
            const g = groupMap[p.group_id];
            if (g) {
              p.group_title = g.title;
              p.teacher_name = teacherMap[g.teacher_id] || "-";
            }
          });
        }

        setPurchases(purchList);
        setDeposits(deps || []);
        setWalletBalance(wall?.balance || 0);
        setVideoProgress(vids || []);
        setExamAttempts(exams || []);
        setSubscriptions(subs || []);
        setTeacherChoices(teachers || []);
      } catch (e) {
        console.error(e);
        toast.error("خطأ في تحميل بيانات الطالب");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [student.id]);

  const handleBan = async () => {
    setBanLoading(true);
    try {
      const { error } = await supabase.from("profiles").update({ is_banned: !student.is_banned }).eq("id", student.id);
      if (error) throw error;
      student.is_banned = !student.is_banned;
      toast.success(student.is_banned ? "تم حظر الطالب" : "تم فك حظر الطالب");
    } catch (e) { toast.error("خطأ"); }
    finally { setBanLoading(false); }
  };

  const handleEdit = async () => {
    try {
      const { error } = await supabase.from("profiles").update(editForm).eq("id", student.id);
      if (error) throw error;
      Object.assign(student, editForm);
      setEditDialog(false);
      toast.success("تم تحديث البيانات");
    } catch (e) { toast.error("خطأ في التحديث"); }
  };

  const totalSpent = purchases.reduce((s, p) => s + (p.amount_paid || 0), 0);
  const totalDeposited = deposits.filter(d => d.status === "approved").reduce((s, d) => s + d.amount, 0);
  const videosWatched = videoProgress.length;
  const totalWatchSecs = videoProgress.reduce((s, v) => s + (v.progress_seconds || 0), 0);
  const examsTaken = examAttempts.length;
  const avgScore = examsTaken > 0 ? Math.round(examAttempts.reduce((s, e) => s + (e.total > 0 ? (e.score / e.total) * 100 : 0), 0) / examsTaken) : 0;

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      // Build text content for a simple downloadable report
      let report = `سجل الطالب - ${student.full_name}\n`;
      report += `${"=".repeat(50)}\n\n`;
      report += `الاسم: ${student.full_name}\n`;
      report += `البريد: ${student.email}\n`;
      report += `الهاتف: ${student.phone || "-"}\n`;
      report += `الكود: ${student.student_code || "-"}\n`;
      report += `المرحلة: ${student.stage || "-"} - ${student.grade || "-"}\n`;
      report += `القسم: ${student.section || "-"}\n`;
      report += `تاريخ التسجيل: ${fmtDate(student.created_at)}\n`;
      report += `الحالة: ${student.is_banned ? "محظور" : "نشط"}\n\n`;
      
      report += `--- المحفظة ---\n`;
      report += `الرصيد الحالي: ${walletBalance} جنيه\n`;
      report += `إجمالي الإيداعات: ${totalDeposited} جنيه\n`;
      report += `إجمالي الإنفاق: ${totalSpent} جنيه\n\n`;

      report += `--- الإيداعات ---\n`;
      deposits.forEach(d => {
        report += `${fmtDate(d.created_at)} | ${d.amount} جنيه | ${d.status === "approved" ? "مقبول" : d.status === "rejected" ? "مرفوض" : "معلق"}\n`;
      });

      report += `\n--- المجموعات المشتراة ---\n`;
      purchases.forEach(p => {
        report += `${p.group_title || p.group_id} | ${p.amount_paid || 0} جنيه | ${fmtDate(p.purchased_at)} | معلم: ${p.teacher_name || "-"}\n`;
      });

      report += `\n--- الامتحانات ---\n`;
      examAttempts.forEach(e => {
        report += `${e.exams?.title || "-"} | ${e.score}/${e.total} | ${fmtDate(e.submitted_at)}\n`;
      });

      report += `\n--- الفيديوهات (${videosWatched}) ---\n`;
      report += `إجمالي وقت المشاهدة: ${Math.round(totalWatchSecs / 60)} دقيقة\n`;

      // Download as text file
      const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `student_${student.student_code || student.id}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("تم تحميل سجل الطالب");
    } catch (e) {
      toast.error("خطأ في التصدير");
    } finally {
      setExportingPdf(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      {/* Student Header Card */}
      <div className="rounded-2xl bg-gradient-to-l from-slate-700 via-slate-800 to-slate-900 text-white p-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-48 h-48 bg-blue-500/10 rounded-full -translate-x-16 -translate-y-16" />
        <div className="relative flex items-start gap-4">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center shadow-xl flex-shrink-0">
            {student.avatar_url ? (
              <img src={student.avatar_url} alt="" className="h-16 w-16 rounded-2xl object-cover" />
            ) : (
              <User className="h-7 w-7 text-white" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold truncate">{student.full_name}</h2>
            <p className="text-white/60 text-sm">{student.email}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge className="bg-white/15 text-white border-0 text-xs">{student.stage || "-"} - {student.grade || "-"}</Badge>
              {student.student_code && <Badge className="bg-blue-500/30 text-white border-0 text-xs font-mono">#{student.student_code}</Badge>}
              {student.is_banned ? (
                <Badge variant="destructive" className="text-xs">محظور</Badge>
              ) : (
                <Badge className="bg-emerald-500/30 text-emerald-200 border-0 text-xs">نشط</Badge>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-4 flex-wrap">
          <Button size="sm" variant="secondary" onClick={() => setEditDialog(true)} className="gap-1 text-xs">
            <Edit className="h-3 w-3" /> تعديل
          </Button>
          <Button
            size="sm"
            variant={student.is_banned ? "default" : "destructive"}
            onClick={handleBan}
            disabled={banLoading}
            className="gap-1 text-xs"
          >
            {banLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : student.is_banned ? <CheckCircle className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
            {student.is_banned ? "فك الحظر" : "حظر"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportPdf} disabled={exportingPdf} className="gap-1 text-xs border-white/20 text-white hover:bg-white/10">
            {exportingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            تحميل السجل
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "الرصيد", value: `${walletBalance} ج`, icon: Wallet, color: "from-emerald-400 to-green-500" },
          { label: "الإنفاق", value: `${totalSpent} ج`, icon: ShoppingCart, color: "from-orange-400 to-red-500" },
          { label: "الفيديوهات", value: videosWatched, icon: Video, color: "from-blue-400 to-indigo-500" },
          { label: "الامتحانات", value: examsTaken, icon: FileText, color: "from-purple-400 to-pink-500" },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl bg-gradient-to-br ${s.color} text-white p-3 shadow-md`}>
            <s.icon className="h-5 w-5 mb-1 opacity-80" />
            <p className="text-lg font-bold">{s.value}</p>
            <p className="text-[11px] text-white/70">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
        <TabsList className="w-full h-auto flex-wrap gap-1 bg-muted/50 p-1 rounded-xl">
          {[
            { v: "overview", l: "نظرة عامة", i: BarChart3 },
            { v: "subscriptions", l: "الاشتراكات", i: CreditCard },
            { v: "wallet", l: "المحفظة", i: Wallet },
            { v: "exams", l: "الامتحانات", i: FileText },
            { v: "videos", l: "الفيديوهات", i: Video },
            { v: "activity", l: "النشاط", i: Activity },
          ].map(t => (
            <TabsTrigger key={t.v} value={t.v} className="text-xs gap-1 flex-1 min-w-0">
              <t.i className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{t.l}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <Card className="border-2 border-blue-100">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4 text-blue-500" /> البيانات الأساسية</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              {[
                { l: "الهاتف", v: student.phone || "-", i: Phone },
                { l: "تاريخ التسجيل", v: fmtDate(student.created_at), i: Calendar },
                { l: "القسم", v: student.section || "-", i: BookOpen },
                { l: "المتوسط", v: `${avgScore}%`, i: TrendingUp },
              ].map(i => (
                <div key={i.l} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                  <i.i className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground">{i.l}</p>
                    <p className="font-medium truncate">{i.v}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Teachers */}
          {teacherChoices.length > 0 && (
            <Card className="border-2 border-purple-100">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><GraduationCap className="h-4 w-4 text-purple-500" /> المعلمين المشترك معهم</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {teacherChoices.map(tc => (
                  <div key={tc.id} className="flex items-center gap-2 p-2 bg-purple-50 rounded-lg text-sm">
                    <div className="h-8 w-8 rounded-full bg-purple-200 flex items-center justify-center">
                      <GraduationCap className="h-4 w-4 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{tc.category} - {tc.stage} {tc.grade}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Subscriptions */}
        <TabsContent value="subscriptions" className="space-y-3 mt-4">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-orange-500" />
            المجموعات المشتراة ({purchases.length})
          </h3>
          {purchases.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">لا توجد مشتريات</p>
          ) : purchases.map(p => (
            <Card key={p.id} className="border-l-4 border-l-orange-400">
              <CardContent className="p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-sm">{p.group_title || "مجموعة"}</p>
                    <p className="text-xs text-muted-foreground">معلم: {p.teacher_name || "-"}</p>
                  </div>
                  <Badge className="bg-orange-100 text-orange-700 border-0">{p.amount_paid || 0} ج</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{fmtDate(p.purchased_at)}</p>
              </CardContent>
            </Card>
          ))}

          <Separator />
          <h3 className="text-sm font-bold flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-blue-500" />
            الاشتراكات ({subscriptions.length})
          </h3>
          {subscriptions.map(s => (
            <Card key={s.id} className="border-l-4 border-l-blue-400">
              <CardContent className="p-3">
                <div className="flex justify-between items-start">
                  <p className="font-medium text-sm">{s.subjects?.name || "-"}</p>
                  <Badge className={s.is_active ? "bg-green-100 text-green-700 border-0" : "bg-gray-100 text-gray-500 border-0"}>
                    {s.is_active ? "نشط" : "منتهي"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">من {fmtDate(s.start_date)} إلى {fmtDate(s.end_date)}</p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Wallet */}
        <TabsContent value="wallet" className="space-y-4 mt-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { l: "الرصيد", v: `${walletBalance}`, c: "from-emerald-400 to-green-500" },
              { l: "الإيداعات", v: `${totalDeposited}`, c: "from-blue-400 to-indigo-500" },
              { l: "الإنفاق", v: `${totalSpent}`, c: "from-rose-400 to-red-500" },
            ].map(s => (
              <div key={s.l} className={`rounded-xl bg-gradient-to-br ${s.c} text-white p-3 text-center`}>
                <p className="text-lg font-bold">{s.v}</p>
                <p className="text-[10px] text-white/70">{s.l} (ج)</p>
              </div>
            ))}
          </div>
          <h3 className="text-sm font-bold">سجل الإيداعات</h3>
          {deposits.length === 0 ? (
            <p className="text-center py-6 text-muted-foreground text-sm">لا توجد إيداعات</p>
          ) : deposits.map(d => (
            <div key={d.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center ${d.status === "approved" ? "bg-green-100" : d.status === "rejected" ? "bg-red-100" : "bg-yellow-100"}`}>
                {d.status === "approved" ? <CheckCircle className="h-4 w-4 text-green-600" /> : d.status === "rejected" ? <Ban className="h-4 w-4 text-red-600" /> : <Clock className="h-4 w-4 text-yellow-600" />}
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">{d.amount} جنيه</p>
                <p className="text-[11px] text-muted-foreground">{d.payment_method || "-"} · {fmtDate(d.created_at)}</p>
              </div>
              <Badge className={
                d.status === "approved" ? "bg-green-100 text-green-700 border-0" :
                d.status === "rejected" ? "bg-red-100 text-red-700 border-0" :
                "bg-yellow-100 text-yellow-700 border-0"
              }>
                {d.status === "approved" ? "مقبول" : d.status === "rejected" ? "مرفوض" : "معلق"}
              </Badge>
            </div>
          ))}
        </TabsContent>

        {/* Exams */}
        <TabsContent value="exams" className="space-y-3 mt-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-xl bg-gradient-to-br from-purple-400 to-pink-500 text-white p-3 flex-1 text-center">
              <p className="text-xl font-bold">{examsTaken}</p>
              <p className="text-[10px] text-white/70">امتحان</p>
            </div>
            <div className="rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white p-3 flex-1 text-center">
              <p className="text-xl font-bold">{avgScore}%</p>
              <p className="text-[10px] text-white/70">متوسط</p>
            </div>
          </div>
          {examAttempts.map(e => (
            <div key={e.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
                <FileText className="h-5 w-5 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{e.exams?.title || "امتحان"}</p>
                <p className="text-[11px] text-muted-foreground">{fmtDate(e.submitted_at)}</p>
              </div>
              <div className="text-left">
                <p className="font-bold text-sm">{e.score}/{e.total}</p>
                <p className="text-[10px] text-muted-foreground">{e.total > 0 ? Math.round((e.score / e.total) * 100) : 0}%</p>
              </div>
            </div>
          ))}
          {examsTaken === 0 && <p className="text-center py-6 text-muted-foreground text-sm">لا توجد امتحانات</p>}
        </TabsContent>

        {/* Videos */}
        <TabsContent value="videos" className="space-y-3 mt-4">
          <div className="rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 text-white p-4">
            <div className="flex items-center gap-3">
              <Video className="h-6 w-6" />
              <div>
                <p className="text-xl font-bold">{videosWatched}</p>
                <p className="text-xs text-white/70">فيديو مشاهد · {Math.round(totalWatchSecs / 60)} دقيقة</p>
              </div>
            </div>
          </div>
          {videoProgress.map(v => (
            <div key={v.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl">
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                <Video className="h-4 w-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{(v.content as any)?.title || "فيديو"}</p>
                <div className="w-full h-1.5 bg-gray-200 rounded-full mt-1">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${v.duration_seconds > 0 ? Math.min((v.progress_seconds / v.duration_seconds) * 100, 100) : 0}%` }} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{Math.round(v.progress_seconds / 60)}د</p>
            </div>
          ))}
          {videosWatched === 0 && <p className="text-center py-6 text-muted-foreground text-sm">لم يشاهد أي فيديو</p>}
        </TabsContent>

        {/* Activity */}
        <TabsContent value="activity" className="space-y-3 mt-4">
          <Card className="border-2 border-amber-100">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-amber-500" /> ملخص النشاط</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-blue-50 rounded-lg text-center">
                  <p className="text-lg font-bold text-blue-700">{subscriptions.length}</p>
                  <p className="text-[11px] text-blue-500">اشتراك</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg text-center">
                  <p className="text-lg font-bold text-purple-700">{purchases.length}</p>
                  <p className="text-[11px] text-purple-500">مجموعة</p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-lg text-center">
                  <p className="text-lg font-bold text-emerald-700">{deposits.length}</p>
                  <p className="text-[11px] text-emerald-500">إيداع</p>
                </div>
                <div className="p-3 bg-rose-50 rounded-lg text-center">
                  <p className="text-lg font-bold text-rose-700">{teacherChoices.length}</p>
                  <p className="text-[11px] text-rose-500">معلم</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>تعديل بيانات الطالب</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>الاسم</Label><Input value={editForm.full_name} onChange={e => setEditForm(p => ({ ...p, full_name: e.target.value }))} /></div>
            <div><Label>الهاتف</Label><Input value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} /></div>
            <div><Label>المرحلة</Label><Input value={editForm.stage} onChange={e => setEditForm(p => ({ ...p, stage: e.target.value }))} /></div>
            <div><Label>الصف</Label><Input value={editForm.grade} onChange={e => setEditForm(p => ({ ...p, grade: e.target.value }))} /></div>
            <div><Label>القسم</Label><Input value={editForm.section} onChange={e => setEditForm(p => ({ ...p, section: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button onClick={handleEdit} className="w-full">حفظ التعديلات</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminStudentManagement;

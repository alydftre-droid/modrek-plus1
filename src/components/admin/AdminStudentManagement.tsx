import { useCallback, useEffect, useMemo, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/manualClient";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Activity,
  ArrowLeft,
  Ban,
  BookOpen,
  CreditCard,
  Download,
  Edit3,
  Eye,
  FileText,
  GraduationCap,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  Search,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  User,
  Users,
  Video,
  Wallet,
  Clock3,
  CheckCircle2,
  XCircle,
  Calendar,
  Hash,
  ChevronLeft,
  BarChart3,
  Target,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { buildStudentReportHtml } from "./student-management/report";
import {
  formatArabicDate,
  formatCurrency,
  gradeDisplayLabel,
  sectionDisplayLabel,
  STUDENT_STAGES,
  type GradeSummary,
  type StudentDeposit,
  type StudentProfile,
  type StudentPurchase,
} from "./student-management/types";

type ViewMode = "home" | "stage" | "grade" | "recent" | "detail";
type ListSource = "home" | "stage" | "grade" | "recent";

const emptyArray = <T,>(value: T[] | null | undefined) => value ?? [];

const useRealtimeRefresh = (channelKey: string, tables: string[], refresh: () => void) => {
  useEffect(() => {
    const channel = supabase.channel(channelKey);
    tables.forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => refresh());
    });
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelKey, tables, refresh]);
};

const buildSubscribedStudentSet = async (studentIds: string[]) => {
  if (studentIds.length === 0) return new Set<string>();
  const [{ data: subscriptions }, { data: purchases }] = await Promise.all([
    supabase.from("subscriptions").select("student_id").eq("is_active", true).in("student_id", studentIds),
    supabase.from("student_group_purchases").select("student_id").in("student_id", studentIds),
  ]);
  return new Set<string>([
    ...emptyArray(subscriptions).map((item) => item.student_id),
    ...emptyArray(purchases).map((item) => item.student_id),
  ]);
};

/* ─── Animation variants ─── */
const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };
const stagger = { visible: { transition: { staggerChildren: 0.06 } } };

const AdminStudentManagement = () => {
  const [view, setView] = useState<ViewMode>("home");
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);
  const [lastListSource, setLastListSource] = useState<ListSource>("home");

  const handleOpenStudent = (student: StudentProfile, source: ListSource) => {
    setSelectedStudent(student);
    setLastListSource(source);
    setView("detail");
  };

  const handleBack = () => {
    if (view === "detail") {
      if (lastListSource === "recent") setView("recent");
      else if (lastListSource === "grade") setView("grade");
      else if (lastListSource === "stage") setView("stage");
      else setView("home");
      return;
    }
    if (view === "grade") { setView("stage"); return; }
    setView("home");
  };

  return (
    <div className="sa-root" dir="rtl">
      {view !== "home" && (
        <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
          <Button variant="ghost" onClick={handleBack} className="sa-back-btn">
            <ChevronLeft className="h-4 w-4 rotate-180" /> رجوع
          </Button>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {view === "home" && (
          <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <StudentManagementHome
              onOpenStage={(stage) => { setSelectedStage(stage); setSelectedGrade(null); setView("stage"); }}
              onOpenRecent={() => setView("recent")}
              onOpenStudent={(student) => handleOpenStudent(student, "home")}
            />
          </motion.div>
        )}
        {view === "stage" && selectedStage && (
          <motion.div key="stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <StageGradesView stageKey={selectedStage} onOpenGrade={(stage, grade) => { setSelectedStage(stage); setSelectedGrade(grade); setView("grade"); }} />
          </motion.div>
        )}
        {view === "grade" && selectedStage && selectedGrade && (
          <motion.div key="grade" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <GradeStudentsView stageKey={selectedStage} grade={selectedGrade} onOpenStudent={(student) => handleOpenStudent(student, "grade")} />
          </motion.div>
        )}
        {view === "recent" && (
          <motion.div key="recent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <RecentStudentsView onOpenStudent={(student) => handleOpenStudent(student, "recent")} />
          </motion.div>
        )}
        {view === "detail" && selectedStudent && (
          <motion.div key="detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <StudentDetailView student={selectedStudent} onStudentUpdated={setSelectedStudent} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════ */
/*  HOME                                                          */
/* ═══════════════════════════════════════════════════════════════ */
const StudentManagementHome = ({ onOpenStage, onOpenRecent, onOpenStudent }: { onOpenStage: (stage: string) => void; onOpenRecent: () => void; onOpenStudent: (student: StudentProfile) => void }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<StudentProfile[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [overview, setOverview] = useState({ totalStudents: 0, paidStudents: 0, recentCount: 0, stageCounts: {} as Record<string, number> });

  const loadOverview = useCallback(async () => {
    try {
      const [{ data: profiles }, { data: recent }] = await Promise.all([
        supabase.from("profiles").select("id, stage"),
        supabase.from("profiles").select("id").order("created_at", { ascending: false }).limit(50),
      ]);
      const studentIds = emptyArray(profiles).map((i) => i.id);
      const subscribedSet = await buildSubscribedStudentSet(studentIds);
      const stageCounts = STUDENT_STAGES.reduce<Record<string, number>>((acc, s) => {
        acc[s.key] = emptyArray(profiles).filter((i) => i.stage === s.key).length;
        return acc;
      }, {});
      setOverview({ totalStudents: profiles?.length ?? 0, paidStudents: subscribedSet.size, recentCount: recent?.length ?? 0, stageCounts });
    } catch { toast.error("تعذر تحميل ملخص الطلاب"); }
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useRealtimeRefresh("admin-students-home-live", ["profiles", "subscriptions", "student_group_purchases"], loadOverview);

  useEffect(() => {
    if (!searchTerm.trim()) { setSearchResults([]); return; }
    const timeout = setTimeout(async () => {
      setLoadingSearch(true);
      try {
        const t = searchTerm.trim();
        const { data, error } = await supabase.from("profiles")
          .select("id, full_name, email, phone, student_code, stage, grade, section, is_banned, created_at, avatar_url")
          .or(`full_name.ilike.%${t}%,email.ilike.%${t}%,student_code.ilike.%${t}%`)
          .order("created_at", { ascending: false }).limit(8);
        if (error) throw error;
        setSearchResults(data ?? []);
      } catch { toast.error("تعذر تنفيذ البحث"); } finally { setLoadingSearch(false); }
    }, 350);
    return () => clearTimeout(timeout);
  }, [searchTerm]);

  return (
    <div className="space-y-6">
      {/* ── Hero Banner ── */}
      <motion.div className="sa-hero" variants={fadeUp} initial="hidden" animate="visible">
        <div className="sa-hero-bg" />
        <div className="relative z-10">
          <div className="sa-live-badge"><span className="sa-live-dot" /> تحديث مباشر</div>
          <h1 className="sa-hero-title">إدارة الطلاب</h1>
          <p className="sa-hero-sub">لوحة تحكم شاملة لمتابعة وتحليل بيانات جميع الطلاب المسجلين في المنصة</p>
        </div>
        {/* Stats row overlapping */}
        <div className="sa-stats-row">
          <StatCard icon={Users} label="إجمالي الطلاب" value={overview.totalStudents} color="blue" />
          <StatCard icon={CreditCard} label="مشتركون مدفوعون" value={overview.paidStudents} color="green" />
          <StatCard icon={Clock3} label="آخر 50 مسجل" value={overview.recentCount} color="purple" />
        </div>
      </motion.div>

      {/* ── Search ── */}
      <motion.div className="sa-search-wrap" variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.1 }}>
        <Search className="sa-search-icon" />
        <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="🔍 ابحث بالاسم أو الكود أو البريد الإلكتروني ..." className="sa-search-input" />
        {loadingSearch && <Loader2 className="sa-search-loader" />}
      </motion.div>

      {searchTerm.trim() ? (
        <motion.div className="space-y-4" variants={stagger} initial="hidden" animate="visible">
          <h2 className="sa-section-title">نتائج البحث</h2>
          {loadingSearch ? (
            <div className="grid gap-3 lg:grid-cols-2">{[1, 2].map((k) => <Skeleton key={k} className="h-40 rounded-3xl" />)}</div>
          ) : searchResults.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {searchResults.map((s, i) => (
                <motion.div key={s.id} variants={fadeUp}>
                  <SearchResultCard student={s} onOpen={() => onOpenStudent(s)} />
                </motion.div>
              ))}
            </div>
          ) : (
            <EmptyState title="لا توجد نتائج" description="جرب البحث بالاسم الكامل أو كود الطالب أو البريد الإلكتروني." />
          )}
        </motion.div>
      ) : (
        <motion.div className="space-y-6" variants={stagger} initial="hidden" animate="visible">
          <h2 className="sa-section-title">المراحل التعليمية</h2>
          <p className="sa-section-desc">اختر المرحلة للوصول إلى الصفوف وقوائم الطلاب</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STUDENT_STAGES.map((stage) => (
              <motion.div key={stage.key} variants={fadeUp}>
                <button type="button" onClick={() => onOpenStage(stage.key)} className={`sa-stage-card ${stage.key === "اعدادي" ? "sa-stage-card--blue" : "sa-stage-card--purple"}`}>
                  <div className="sa-stage-header">
                    <span className="sa-stage-emoji">{stage.icon}</span>
                    <span className="sa-stage-count">{overview.stageCounts[stage.key] ?? 0}</span>
                  </div>
                  <h3 className="sa-stage-name">{stage.label}</h3>
                  <p className="sa-stage-desc">{stage.description}</p>
                  <div className="sa-stage-footer">
                    <span>3 صفوف دراسية</span>
                    <ChevronLeft className="h-4 w-4 rotate-180" />
                  </div>
                </button>
              </motion.div>
            ))}
            <motion.div variants={fadeUp}>
              <button type="button" onClick={onOpenRecent} className="sa-stage-card sa-stage-card--green">
                <div className="sa-stage-header">
                  <span className="sa-stage-emoji">🕘</span>
                  <span className="sa-stage-count">{overview.recentCount}</span>
                </div>
                <h3 className="sa-stage-name">آخر الطلبة المسجلين</h3>
                <p className="sa-stage-desc">أحدث 50 حساب مسجل في المنصة</p>
                <div className="sa-stage-footer">
                  <span>تحديث تلقائي</span>
                  <ChevronLeft className="h-4 w-4 rotate-180" />
                </div>
              </button>
            </motion.div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════ */
/*  STAGE GRADES VIEW                                             */
/* ═══════════════════════════════════════════════════════════════ */
const StageGradesView = ({ stageKey, onOpenGrade }: { stageKey: string; onOpenGrade: (stage: string, grade: string) => void }) => {
  const stage = STUDENT_STAGES.find((i) => i.key === stageKey);
  const [gradeSummaries, setGradeSummaries] = useState<GradeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalStage, setTotalStage] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);

  const loadStage = useCallback(async () => {
    if (!stage) return;
    setLoading(true);
    try {
      const { data: profiles, error } = await supabase.from("profiles").select("id, grade").eq("stage", stage.key);
      if (error) throw error;
      const studentIds = emptyArray(profiles).map((i) => i.id);
      const subscribedSet = await buildSubscribedStudentSet(studentIds);
      const summaries = stage.grades.map((grade) => {
        const gs = emptyArray(profiles).filter((i) => i.grade === grade);
        return { grade, totalStudents: gs.length, activeSubscribers: gs.filter((i) => subscribedSet.has(i.id)).length };
      });
      setGradeSummaries(summaries);
      setTotalStage(profiles?.length ?? 0);
      setTotalPaid(subscribedSet.size);
    } catch { toast.error("تعذر تحميل الصفوف"); } finally { setLoading(false); }
  }, [stage]);

  useEffect(() => { loadStage(); }, [loadStage]);
  useRealtimeRefresh(`admin-stage-${stageKey}`, ["profiles", "subscriptions", "student_group_purchases"], loadStage);
  if (!stage) return null;

  const gradeColors = ["blue", "purple", "green"];

  return (
    <motion.div className="space-y-5" variants={stagger} initial="hidden" animate="visible">
      {/* Stage header */}
      <motion.div className="sa-page-header" variants={fadeUp}>
        <div>
          <span className="sa-label">{stage.icon} واجهة المرحلة</span>
          <h2 className="sa-page-title">{stage.label}</h2>
          <p className="sa-page-desc">اختر الصف للاطلاع على الإجماليات وقوائم الطلاب</p>
        </div>
        <div className="sa-header-stats">
          <div className="sa-header-stat sa-header-stat--blue">
            <Users className="h-4 w-4" />
            <span>{totalStage} طالب</span>
          </div>
          <div className="sa-header-stat sa-header-stat--green">
            <CreditCard className="h-4 w-4" />
            <span>{totalPaid} مشترك</span>
          </div>
        </div>
      </motion.div>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-3">{[1, 2, 3].map((k) => <Skeleton key={k} className="h-52 rounded-3xl" />)}</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {gradeSummaries.map((s, i) => (
            <motion.div key={s.grade} variants={fadeUp}>
              <button type="button" onClick={() => onOpenGrade(stage.key, s.grade)} className={`sa-grade-card sa-grade-card--${gradeColors[i]}`}>
                <span className="sa-grade-label">الانتقال إلى</span>
                <h3 className="sa-grade-name">{gradeDisplayLabel(stage.key, s.grade)}</h3>
                <div className="sa-grade-stats">
                  <div className="sa-grade-stat-box">
                    <strong>{s.totalStudents}</strong>
                    <span>إجمالي الطلاب</span>
                  </div>
                  <div className="sa-grade-stat-box">
                    <strong>{s.activeSubscribers}</strong>
                    <span>مشتركون مدفوعون</span>
                  </div>
                </div>
                <div className="sa-stage-footer">
                  <span>عرض القائمة</span>
                  <ChevronLeft className="h-4 w-4 rotate-180" />
                </div>
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

/* ═══════════════════════════════════════════════════════════════ */
/*  GRADE STUDENTS VIEW                                           */
/* ═══════════════════════════════════════════════════════════════ */
const GradeStudentsView = ({ stageKey, grade, onOpenStudent }: { stageKey: string; grade: string; onOpenStudent: (student: StudentProfile) => void }) => {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [paidStudentIds, setPaidStudentIds] = useState<Set<string>>(new Set());

  const loadGradeStudents = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("profiles")
        .select("id, full_name, email, phone, student_code, stage, grade, section, is_banned, created_at, avatar_url")
        .eq("stage", stageKey).eq("grade", grade).order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      setStudents(rows);
      setPaidStudentIds(await buildSubscribedStudentSet(rows.map((i) => i.id)));
    } catch { toast.error("تعذر تحميل طلاب الصف"); } finally { setLoading(false); }
  }, [grade, stageKey]);

  useEffect(() => { loadGradeStudents(); }, [loadGradeStudents]);
  useRealtimeRefresh(`admin-grade-${stageKey}-${grade}`, ["profiles", "subscriptions", "student_group_purchases"], loadGradeStudents);

  const sectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    students.forEach((s) => { const k = sectionDisplayLabel(s.section); counts.set(k, (counts.get(k) ?? 0) + 1); });
    return Array.from(counts.entries());
  }, [students]);
  const paidCount = useMemo(() => students.filter((s) => paidStudentIds.has(s.id)).length, [students, paidStudentIds]);

  return (
    <motion.div className="space-y-5" variants={stagger} initial="hidden" animate="visible">
      <motion.div className="sa-page-header" variants={fadeUp}>
        <div>
          <span className="sa-label">📋 تفاصيل الصف</span>
          <h2 className="sa-page-title">{gradeDisplayLabel(stageKey, grade)}</h2>
          <p className="sa-page-desc">قائمة مرتبة بأحدث الطلاب مع الكود وحالة الاشتراك</p>
        </div>
        <div className="sa-header-stats">
          <div className="sa-header-stat sa-header-stat--blue"><Users className="h-4 w-4" /><span>{students.length} طالب</span></div>
          <div className="sa-header-stat sa-header-stat--green"><CreditCard className="h-4 w-4" /><span>{paidCount} مشترك</span></div>
        </div>
      </motion.div>

      {sectionCounts.length > 0 && (
        <motion.div className="flex flex-wrap gap-2" variants={fadeUp}>
          {sectionCounts.map(([sec, cnt]) => (
            <span key={sec} className="sa-chip">{sec}: {cnt}</span>
          ))}
        </motion.div>
      )}

      <motion.div variants={fadeUp}>
        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((k) => <Skeleton key={k} className="h-20 rounded-2xl" />)}</div>
        ) : students.length > 0 ? (
          <div className="space-y-3">
            {students.map((s, i) => (
              <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <StudentRowCard student={s} isPaid={paidStudentIds.has(s.id)} onOpen={() => onOpenStudent(s)} />
              </motion.div>
            ))}
          </div>
        ) : (
          <EmptyState title="لا يوجد طلاب في هذا الصف" description="عند تسجيل طالب جديد سيظهر هنا مباشرة." />
        )}
      </motion.div>
    </motion.div>
  );
};

/* ═══════════════════════════════════════════════════════════════ */
/*  RECENT STUDENTS                                               */
/* ═══════════════════════════════════════════════════════════════ */
const RecentStudentsView = ({ onOpenStudent }: { onOpenStudent: (student: StudentProfile) => void }) => {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentProfile[]>([]);

  const loadRecent = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("profiles")
        .select("id, full_name, email, phone, student_code, stage, grade, section, is_banned, created_at, avatar_url")
        .order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      setStudents(data ?? []);
    } catch { toast.error("تعذر تحميل آخر الطلبة"); } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadRecent(); }, [loadRecent]);
  useRealtimeRefresh("admin-students-recent", ["profiles"], loadRecent);

  return (
    <motion.div className="space-y-5" variants={stagger} initial="hidden" animate="visible">
      <motion.div className="sa-page-header" variants={fadeUp}>
        <div>
          <span className="sa-label">🕘 قائمة مستقلة</span>
          <h2 className="sa-page-title">آخر الطلبة المسجلين</h2>
          <p className="sa-page-desc">أحدث 50 حسابًا مسجلاً في المنصة</p>
        </div>
        <div className="sa-header-stat sa-header-stat--purple"><Users className="h-4 w-4" /><span>{students.length} طالب</span></div>
      </motion.div>
      <motion.div variants={fadeUp}>
        {loading ? (
          <div className="space-y-3">{[1, 2, 3, 4].map((k) => <Skeleton key={k} className="h-20 rounded-2xl" />)}</div>
        ) : students.length > 0 ? (
          <div className="space-y-3">{students.map((s, i) => (
            <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
              <StudentRowCard student={s} isPaid={false} onOpen={() => onOpenStudent(s)} />
            </motion.div>
          ))}</div>
        ) : (
          <EmptyState title="لا توجد حسابات حديثة" description="سيظهر آخر المسجلين هنا تلقائياً." />
        )}
      </motion.div>
    </motion.div>
  );
};

/* ═══════════════════════════════════════════════════════════════ */
/*  STUDENT DETAIL VIEW (CV STYLE)                                */
/* ═══════════════════════════════════════════════════════════════ */
const StudentDetailView = ({ student, onStudentUpdated }: { student: StudentProfile; onStudentUpdated: (student: StudentProfile) => void }) => {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [banLoading, setBanLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [editForm, setEditForm] = useState({ full_name: student.full_name, phone: student.phone || "", stage: student.stage || "", grade: student.grade || "", section: student.section || "" });
  const [walletBalance, setWalletBalance] = useState(0);
  const [deposits, setDeposits] = useState<StudentDeposit[]>([]);
  const [purchases, setPurchases] = useState<StudentPurchase[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [teacherChoices, setTeacherChoices] = useState<any[]>([]);

  const loadStudentDetails = useCallback(async () => {
    setLoading(true);
    try {
      const [depositsRes, purchasesRes, walletRes, videosRes, examsRes, subscriptionsRes, teacherChoicesRes, activityRes, profileRes] = await Promise.all([
        supabase.from("deposit_requests").select("id, amount, status, created_at, payment_method").eq("student_id", student.id).order("created_at", { ascending: false }),
        supabase.from("student_group_purchases").select("id, group_id, purchased_at, amount_paid").eq("student_id", student.id).order("purchased_at", { ascending: false }),
        supabase.from("wallets").select("balance").eq("user_id", student.id).maybeSingle(),
        supabase.from("video_progress").select("id, progress_seconds, duration_seconds, content(title, type)").eq("user_id", student.id),
        supabase.from("exam_attempts").select("id, score, total, submitted_at, exams(title)").eq("student_id", student.id).order("submitted_at", { ascending: false }),
        supabase.from("subscriptions").select("id, start_date, end_date, is_active, teacher_id, subjects(name)").eq("student_id", student.id).order("created_at", { ascending: false }),
        supabase.from("student_teacher_choices").select("id, teacher_id, category, stage, grade").eq("student_id", student.id),
        supabase.from("usage_logs").select("id, action, duration_minutes, created_at, content(title, type)").eq("user_id", student.id).order("created_at", { ascending: false }).limit(50),
        supabase.from("profiles").select("id, full_name, email, phone, student_code, stage, grade, section, is_banned, created_at, avatar_url").eq("id", student.id).maybeSingle(),
      ]);
      const purchasesData = purchasesRes.data ?? [];
      const subscriptionsData = subscriptionsRes.data ?? [];
      const teacherChoicesData = teacherChoicesRes.data ?? [];
      const groupIds = purchasesData.map((i) => i.group_id);
      const teacherIds = [...subscriptionsData.map((i: any) => i.teacher_id).filter(Boolean), ...teacherChoicesData.map((i: any) => i.teacher_id).filter(Boolean)];
      const [{ data: groupsData }, { data: teacherProfiles }] = await Promise.all([
        groupIds.length ? supabase.from("content_groups").select("id, title, teacher_id").in("id", groupIds) : Promise.resolve({ data: [] as any[] }),
        teacherIds.length ? supabase.from("profiles").select("id, full_name").in("id", [...new Set(teacherIds)]) : Promise.resolve({ data: [] as any[] }),
      ]);
      const teacherMap = new Map((teacherProfiles ?? []).map((i: any) => [i.id, i.full_name]));
      const groupMap = new Map((groupsData ?? []).map((i: any) => [i.id, i]));
      if (profileRes.data) onStudentUpdated(profileRes.data as StudentProfile);
      setWalletBalance(walletRes.data?.balance ?? 0);
      setDeposits(depositsRes.data ?? []);
      setVideos(videosRes.data ?? []);
      setExams(examsRes.data ?? []);
      setActivities(activityRes.data ?? []);
      setTeacherChoices((teacherChoicesData ?? []).map((i: any) => ({ ...i, teacher_name: i.teacher_id ? teacherMap.get(i.teacher_id) : undefined })));
      setSubscriptions((subscriptionsData ?? []).map((i: any) => ({ ...i, teacher_name: i.teacher_id ? teacherMap.get(i.teacher_id) : undefined })));
      setPurchases((purchasesData ?? []).map((i: any) => { const g = groupMap.get(i.group_id); return { ...i, group_title: g?.title, teacher_name: g?.teacher_id ? teacherMap.get(g.teacher_id) : undefined }; }));
    } catch { toast.error("تعذر تحميل ملف الطالب"); } finally { setLoading(false); }
  }, [onStudentUpdated, student.id]);

  useEffect(() => { loadStudentDetails(); }, [loadStudentDetails]);
  useRealtimeRefresh(`admin-student-detail-${student.id}`, ["profiles", "wallets", "deposit_requests", "student_group_purchases", "subscriptions", "video_progress", "exam_attempts", "usage_logs", "student_teacher_choices"], loadStudentDetails);

  const totalSpent = purchases.reduce((sum, i) => sum + (i.amount_paid || 0), 0);
  const totalDeposited = deposits.filter((i) => i.status === "approved").reduce((sum, i) => sum + i.amount, 0);
  const watchedMinutes = Math.round(videos.reduce((sum, i) => sum + (i.progress_seconds || 0), 0) / 60);
  const averageScore = exams.length > 0 ? Math.round(exams.reduce((sum, i) => sum + (i.total > 0 ? (i.score / i.total) * 100 : 0), 0) / exams.length) : 0;

  const handleToggleBan = async () => {
    setBanLoading(true);
    try {
      const next = !student.is_banned;
      const { error } = await supabase.from("profiles").update({ is_banned: next }).eq("id", student.id);
      if (error) throw error;
      onStudentUpdated({ ...student, is_banned: next });
      toast.success(next ? "تم حظر الطالب" : "تم فك حظر الطالب");
    } catch { toast.error("تعذر تحديث حالة الحظر"); } finally { setBanLoading(false); }
  };

  const handleSaveEdit = async () => {
    try {
      const { error } = await supabase.from("profiles").update(editForm).eq("id", student.id);
      if (error) throw error;
      onStudentUpdated({ ...student, ...editForm });
      toast.success("تم حفظ التعديلات");
      setEditDialogOpen(false);
    } catch { toast.error("تعذر حفظ بيانات الطالب"); }
  };

  const handleExportPdf = async () => {
    setExportLoading(true);
    const container = document.createElement("div");
    container.style.cssText = "position:fixed;top:0;left:-20000px;width:794px;pointer-events:none;opacity:1;z-index:-1;background:#fff";
    container.dir = "rtl";
    try {
      container.innerHTML = buildStudentReportHtml({ student, walletBalance, totalDeposited, totalSpent, totalWatchMinutes: watchedMinutes, averageScore, deposits, purchases, subscriptions, exams, videos, activities, teacherChoices });
      document.body.appendChild(container);
      await document.fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const target = container.firstElementChild as HTMLElement | null;
      if (!target) throw new Error("missing");
      const canvas = await html2canvas(target, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false });
      const pdf = new jsPDF("p", "mm", "a4");
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const m = 8;
      const cw = pw - m * 2;
      const ch = ph - m * 2;
      const ih = (canvas.height * cw) / canvas.width;
      const img = canvas.toDataURL("image/png", 1);
      let rem = ih, pos = m;
      pdf.addImage(img, "PNG", m, pos, cw, ih, undefined, "FAST");
      rem -= ch;
      while (rem > 0) { pos = m - (ih - rem); pdf.addPage(); pdf.addImage(img, "PNG", m, pos, cw, ih, undefined, "FAST"); rem -= ch; }
      pdf.save(`student-report-${student.student_code || student.id.slice(0, 8)}.pdf`);
      toast.success("تم تحميل تقرير الطالب PDF");
    } catch { toast.error("تعذر إنشاء ملف PDF"); } finally {
      if (container.parentNode) container.parentNode.removeChild(container);
      setExportLoading(false);
    }
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-52 rounded-3xl" /><Skeleton className="h-72 rounded-3xl" /></div>;

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      {/* ── CV Header ── */}
      <div className="sa-cv-shell">
        <div className="sa-cv-banner" />
        <div className="sa-cv-body">
          <div className="sa-cv-avatar">
            {student.avatar_url ? <img src={student.avatar_url} alt={student.full_name} className="h-full w-full rounded-full object-cover" /> : <User className="h-10 w-10 text-white" />}
          </div>
          <div className="sa-cv-info">
            <h2 className="sa-cv-name">{student.full_name}</h2>
            <p className="sa-cv-sub">{student.stage || "-"} · {student.grade || "-"}</p>
            <div className="sa-cv-badges">
              <span className="sa-badge sa-badge--blue"><Hash className="h-3 w-3" /> {student.student_code || student.id.slice(0, 8)}</span>
              <span className={`sa-badge ${student.is_banned ? "sa-badge--red" : "sa-badge--green"}`}>
                {student.is_banned ? "محظور" : "نشط"}
              </span>
              <span className="sa-badge sa-badge--gray"><Calendar className="h-3 w-3" /> {formatArabicDate(student.created_at)}</span>
            </div>
            <div className="sa-cv-contact">
              <span><Mail className="h-3.5 w-3.5" /> {student.email}</span>
              {student.phone && <span><Phone className="h-3.5 w-3.5" /> {student.phone}</span>}
              <span><GraduationCap className="h-3.5 w-3.5" /> {sectionDisplayLabel(student.section)}</span>
            </div>
          </div>
          <div className="sa-cv-actions">
            <Button onClick={() => setEditDialogOpen(true)} className="sa-btn sa-btn--blue"><Edit3 className="h-4 w-4" /> تعديل البيانات</Button>
            <Button onClick={handleExportPdf} disabled={exportLoading} className="sa-btn sa-btn--purple">{exportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} تحميل PDF</Button>
            <Button onClick={handleToggleBan} disabled={banLoading} className={`sa-btn ${student.is_banned ? "sa-btn--green" : "sa-btn--red"}`}>{banLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} {student.is_banned ? "فك الحظر" : "حظر الطالب"}</Button>
          </div>
        </div>
      </div>

      {/* ── Quick Stats ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <QuickStat icon={Wallet} label="الرصيد الحالي" value={formatCurrency(walletBalance)} color="blue" />
        <QuickStat icon={ShoppingCart} label="إجمالي الإنفاق" value={formatCurrency(totalSpent)} color="red" />
        <QuickStat icon={Video} label="دقائق المشاهدة" value={`${watchedMinutes}`} color="purple" />
        <QuickStat icon={Target} label="متوسط الدرجات" value={`${averageScore}%`} color="green" />
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl" className="space-y-4">
        <TabsList className="sa-tabs-list">
          <TabsTrigger value="overview" className="sa-tab">نظرة عامة</TabsTrigger>
          <TabsTrigger value="subscriptions" className="sa-tab">الكورسات</TabsTrigger>
          <TabsTrigger value="progress" className="sa-tab">التقدم</TabsTrigger>
          <TabsTrigger value="exams" className="sa-tab">الامتحانات</TabsTrigger>
          <TabsTrigger value="wallet" className="sa-tab">المحفظة</TabsTrigger>
          <TabsTrigger value="activity" className="sa-tab">النشاط</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="sa-card">
              <CardHeader className="pb-3"><CardTitle className="sa-card-title"><User className="h-5 w-5 text-[hsl(217,91%,60%)]" /> البيانات الأساسية</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <InfoItem icon={Phone} label="الهاتف" value={student.phone || "-"} />
                <InfoItem icon={Calendar} label="تاريخ التسجيل" value={formatArabicDate(student.created_at)} />
                <InfoItem icon={GraduationCap} label="المرحلة والصف" value={`${student.stage || "-"} · ${student.grade || "-"}`} />
                <InfoItem icon={BookOpen} label="القسم" value={sectionDisplayLabel(student.section)} />
              </CardContent>
            </Card>
            <Card className="sa-card">
              <CardHeader className="pb-3"><CardTitle className="sa-card-title"><Users className="h-5 w-5 text-[hsl(258,90%,66%)]" /> المعلمون المختارون</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {teacherChoices.length > 0 ? teacherChoices.map((t: any) => (
                  <div key={t.id} className="sa-list-item">
                    <div><p className="font-semibold">{t.teacher_name || "معلم"}</p><p className="text-xs text-muted-foreground">{t.category || "-"} · {t.stage || "-"} · {t.grade || "-"}</p></div>
                    <span className="sa-badge sa-badge--blue">متصل</span>
                  </div>
                )) : <EmptyState title="لا توجد اختيارات" description="سيظهر هنا كل معلم اختاره الطالب." compact />}
              </CardContent>
            </Card>
          </div>
          {/* Recent activity preview */}
          <Card className="sa-card">
            <CardHeader className="pb-3"><CardTitle className="sa-card-title"><Activity className="h-5 w-5 text-[hsl(160,84%,39%)]" /> النشاط الأخير</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {activities.length > 0 ? activities.slice(0, 5).map((a: any) => (
                <div key={a.id} className="sa-list-item">
                  <div><p className="text-sm font-semibold">{a.action}</p><p className="text-xs text-muted-foreground">{a.content?.title || "-"}</p></div>
                  <span className="text-xs text-muted-foreground">{formatArabicDate(a.created_at)}</span>
                </div>
              )) : <EmptyState title="لا يوجد نشاط" description="ستظهر هنا آخر حركات الطالب." compact />}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subscriptions */}
        <TabsContent value="subscriptions" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="sa-card">
              <CardHeader className="pb-3"><CardTitle className="sa-card-title"><ShoppingCart className="h-5 w-5 text-[hsl(217,91%,60%)]" /> المجموعات المدفوعة</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {purchases.length > 0 ? purchases.map((p) => (
                  <div key={p.id} className="sa-list-item">
                    <div><p className="font-semibold">{p.group_title || "مجموعة"}</p><p className="text-xs text-muted-foreground">{p.teacher_name || "-"} · {formatArabicDate(p.purchased_at)}</p></div>
                    <span className="sa-badge sa-badge--orange">{formatCurrency(p.amount_paid || 0)}</span>
                  </div>
                )) : <EmptyState title="لا توجد مجموعات" description="ستظهر هنا المجموعات المشتراة." compact />}
              </CardContent>
            </Card>
            <Card className="sa-card">
              <CardHeader className="pb-3"><CardTitle className="sa-card-title"><CreditCard className="h-5 w-5 text-[hsl(258,90%,66%)]" /> الاشتراكات</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {subscriptions.length > 0 ? subscriptions.map((s: any) => (
                  <div key={s.id} className="sa-list-item">
                    <div><p className="font-semibold">{s.subjects?.name || "-"}</p><p className="text-xs text-muted-foreground">{s.teacher_name || "-"} · من {formatArabicDate(s.start_date)}</p></div>
                    <span className={`sa-badge ${s.is_active ? "sa-badge--green" : "sa-badge--gray"}`}>{s.is_active ? "نشط" : "منتهي"}</span>
                  </div>
                )) : <EmptyState title="لا توجد اشتراكات" description="ستظهر الاشتراكات الحالية والسابقة." compact />}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Progress */}
        <TabsContent value="progress" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
            <Card className="sa-card">
              <CardHeader className="pb-3"><CardTitle className="sa-card-title"><BarChart3 className="h-5 w-5 text-[hsl(217,91%,60%)]" /> مؤشرات سريعة</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <ProgressItem label="متوسط الدرجات" value={averageScore} suffix="%" color="blue" />
                <ProgressItem label="الفيديوهات المشاهدة" value={videos.length > 0 ? Math.round((videos.filter((v: any) => v.progress_seconds > 60).length / videos.length) * 100) : 0} suffix="%" color="green" />
                <div className="sa-list-item"><span className="text-sm">عدد الامتحانات</span><strong>{exams.length}</strong></div>
                <div className="sa-list-item"><span className="text-sm">دقائق المشاهدة</span><strong>{watchedMinutes}</strong></div>
                <div className="sa-list-item"><span className="text-sm">سجل النشاط</span><strong>{activities.length} حركة</strong></div>
              </CardContent>
            </Card>
            <Card className="sa-card">
              <CardHeader className="pb-3"><CardTitle className="sa-card-title"><Video className="h-5 w-5 text-[hsl(258,90%,66%)]" /> تقدم الفيديوهات</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {videos.length > 0 ? videos.slice(0, 10).map((v: any) => {
                  const pct = v.duration_seconds > 0 ? Math.min(Math.round((v.progress_seconds / v.duration_seconds) * 100), 100) : 0;
                  return (
                    <div key={v.id} className="space-y-2 rounded-2xl border border-border/60 bg-accent/30 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{v.content?.title || "فيديو"}</p>
                        <span className="sa-badge sa-badge--blue">{pct}%</span>
                      </div>
                      <Progress value={pct} className="h-2" />
                      <p className="text-xs text-muted-foreground">تمت مشاهدة {Math.round(v.progress_seconds / 60)} دقيقة</p>
                    </div>
                  );
                }) : <EmptyState title="لا توجد فيديوهات" description="ستظهر هنا نسب التقدم." compact />}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Exams */}
        <TabsContent value="exams" className="space-y-4">
          <Card className="sa-card">
            <CardHeader className="pb-3"><CardTitle className="sa-card-title"><FileText className="h-5 w-5 text-[hsl(217,91%,60%)]" /> نتائج الامتحانات</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {exams.length > 0 ? exams.map((e: any) => {
                const pct = e.total > 0 ? Math.round((e.score / e.total) * 100) : 0;
                const passed = pct >= 50;
                return (
                  <div key={e.id} className="sa-list-item">
                    <div className="flex items-center gap-3">
                      {passed ? <CheckCircle2 className="h-5 w-5 text-[hsl(160,84%,39%)]" /> : <XCircle className="h-5 w-5 text-[hsl(0,84%,60%)]" />}
                      <div>
                        <p className="font-semibold">{e.exams?.title || "امتحان"}</p>
                        <p className="text-xs text-muted-foreground">{formatArabicDate(e.submitted_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`sa-badge ${passed ? "sa-badge--green" : "sa-badge--red"}`}>{pct}%</span>
                      <span className="text-sm text-muted-foreground">{e.score}/{e.total}</span>
                    </div>
                  </div>
                );
              }) : <EmptyState title="لا توجد نتائج" description="ستظهر هنا كل امتحان حلّه الطالب." compact />}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Wallet */}
        <TabsContent value="wallet" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
            <Card className="sa-card">
              <CardHeader className="pb-3"><CardTitle className="sa-card-title"><Wallet className="h-5 w-5 text-[hsl(160,84%,39%)]" /> ملخص المحفظة</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="sa-wallet-stat sa-wallet-stat--blue"><span>الرصيد الحالي</span><strong>{formatCurrency(walletBalance)}</strong></div>
                <div className="sa-wallet-stat sa-wallet-stat--green"><span>الإيداعات المقبولة</span><strong>{formatCurrency(totalDeposited)}</strong></div>
                <div className="sa-wallet-stat sa-wallet-stat--red"><span>إجمالي الإنفاق</span><strong>{formatCurrency(totalSpent)}</strong></div>
              </CardContent>
            </Card>
            <Card className="sa-card">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="sa-card-title"><CreditCard className="h-5 w-5 text-[hsl(217,91%,60%)]" /> سجل الإيداعات</CardTitle>
                <Button variant="ghost" size="sm" onClick={loadStudentDetails} className="gap-2 rounded-full"><RefreshCw className="h-4 w-4" /> تحديث</Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {deposits.length > 0 ? deposits.map((d) => (
                  <div key={d.id} className="sa-list-item">
                    <div><p className="font-semibold">{formatCurrency(d.amount)}</p><p className="text-xs text-muted-foreground">{d.payment_method || "-"} · {formatArabicDate(d.created_at)}</p></div>
                    <span className={`sa-badge ${d.status === "approved" ? "sa-badge--green" : d.status === "rejected" ? "sa-badge--red" : "sa-badge--orange"}`}>
                      {d.status === "approved" ? "مقبول" : d.status === "rejected" ? "مرفوض" : "معلق"}
                    </span>
                  </div>
                )) : <EmptyState title="لا توجد إيداعات" description="ستظهر هنا كل الإيداعات وحالتها." compact />}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Activity */}
        <TabsContent value="activity" className="space-y-4">
          <Card className="sa-card">
            <CardHeader className="pb-3"><CardTitle className="sa-card-title"><Activity className="h-5 w-5 text-[hsl(258,90%,66%)]" /> سجل النشاط الكامل</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {activities.length > 0 ? activities.map((a: any) => (
                <div key={a.id} className="sa-list-item">
                  <div><p className="text-sm font-semibold">{a.action}</p><p className="text-xs text-muted-foreground">{a.content?.title || "-"}</p></div>
                  <div className="text-left">
                    <p className="text-xs text-muted-foreground">{formatArabicDate(a.created_at)}</p>
                    {a.duration_minutes && <p className="text-xs text-muted-foreground">{a.duration_minutes} دقيقة</p>}
                  </div>
                </div>
              )) : <EmptyState title="لا يوجد سجل" description="ستظهر هنا كل حركة سجّلها الطالب." compact />}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader><DialogTitle>تعديل بيانات الطالب</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><Label>الاسم</Label><Input value={editForm.full_name} onChange={(e) => setEditForm((c) => ({ ...c, full_name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>الهاتف</Label><Input value={editForm.phone} onChange={(e) => setEditForm((c) => ({ ...c, phone: e.target.value }))} /></div>
            <div className="space-y-2"><Label>المرحلة</Label><Input value={editForm.stage} onChange={(e) => setEditForm((c) => ({ ...c, stage: e.target.value }))} /></div>
            <div className="space-y-2"><Label>الصف</Label><Input value={editForm.grade} onChange={(e) => setEditForm((c) => ({ ...c, grade: e.target.value }))} /></div>
            <div className="space-y-2"><Label>القسم</Label><Input value={editForm.section} onChange={(e) => setEditForm((c) => ({ ...c, section: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={handleSaveEdit} className="w-full rounded-full sa-btn sa-btn--blue">حفظ التعديلات</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

/* ═══════════════════════════════════════════════════════════════ */
/*  SHARED COMPONENTS                                             */
/* ═══════════════════════════════════════════════════════════════ */

const StatCard = ({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: number; color: "blue" | "green" | "purple" | "red" }) => (
  <div className={`sa-stat-card sa-stat-card--${color}`}>
    <div className={`sa-stat-icon sa-stat-icon--${color}`}><Icon className="h-5 w-5" /></div>
    <strong className="sa-stat-value">{value}</strong>
    <span className="sa-stat-label">{label}</span>
  </div>
);

const QuickStat = ({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: string; color: "blue" | "green" | "purple" | "red" }) => (
  <div className={`sa-quick-stat sa-quick-stat--${color}`}>
    <Icon className="h-5 w-5 opacity-80" />
    <strong className="text-xl font-extrabold">{value}</strong>
    <span className="text-xs opacity-80">{label}</span>
  </div>
);

const SearchResultCard = ({ student, onOpen }: { student: StudentProfile; onOpen: () => void }) => (
  <button type="button" onClick={onOpen} className="sa-search-card">
    <div className="flex items-start gap-4">
      <div className="sa-search-avatar">
        {student.avatar_url ? <img src={student.avatar_url} alt="" className="h-full w-full rounded-full object-cover" /> : <User className="h-6 w-6 text-white" />}
      </div>
      <div className="flex-1 space-y-1.5 text-right">
        <h3 className="text-xl font-bold">{student.full_name}</h3>
        <div className="flex flex-wrap gap-2">
          <span className="sa-badge sa-badge--blue"><Hash className="h-3 w-3" /> {student.student_code || "-"}</span>
          <span className="sa-badge sa-badge--gray">{student.stage || "-"} · {student.grade || "-"}</span>
          <span className={`sa-badge ${student.is_banned ? "sa-badge--red" : "sa-badge--green"}`}>{student.is_banned ? "محظور" : "نشط"}</span>
        </div>
        <p className="text-sm text-muted-foreground">{student.email}</p>
        <p className="text-xs text-muted-foreground">تاريخ التسجيل: {formatArabicDate(student.created_at)}</p>
      </div>
    </div>
    <div className="sa-search-eye"><Eye className="h-4 w-4" /> عرض التفاصيل</div>
  </button>
);

const StudentRowCard = ({ student, isPaid, onOpen }: { student: StudentProfile; isPaid: boolean; onOpen: () => void }) => (
  <button type="button" onClick={onOpen} className="sa-row-card">
    <div className="flex items-center gap-3">
      <div className="sa-row-avatar">
        {student.avatar_url ? <img src={student.avatar_url} alt="" className="h-full w-full rounded-full object-cover" /> : <User className="h-5 w-5 text-[hsl(217,91%,60%)]" />}
      </div>
      <div className="min-w-0 flex-1 text-right">
        <p className="truncate text-base font-bold">{student.full_name}</p>
        <p className="text-xs text-muted-foreground">{student.stage || "-"} · {student.grade || "-"} · {sectionDisplayLabel(student.section)} · {formatArabicDate(student.created_at)}</p>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <span className="sa-badge sa-badge--blue">#{student.student_code || "-"}</span>
      {isPaid && <span className="sa-badge sa-badge--green">مشترك</span>}
      {student.is_banned && <span className="sa-badge sa-badge--red">محظور</span>}
      <span className="sa-badge sa-badge--gray"><Eye className="h-3.5 w-3.5" /> فتح</span>
    </div>
  </button>
);

const InfoItem = ({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) => (
  <div className="sa-info-item">
    <div className="sa-info-icon"><Icon className="h-4 w-4" /></div>
    <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-semibold">{value}</p></div>
  </div>
);

const ProgressItem = ({ label, value, suffix, color }: { label: string; value: number; suffix: string; color: "blue" | "green" }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between text-sm"><span>{label}</span><strong className={color === "blue" ? "text-[hsl(217,91%,60%)]" : "text-[hsl(160,84%,39%)]"}>{value}{suffix}</strong></div>
    <Progress value={value} className="h-2" />
  </div>
);

const EmptyState = ({ title, description, compact = false }: { title: string; description: string; compact?: boolean }) => (
  <div className={`sa-empty ${compact ? "sa-empty--compact" : ""}`}>
    <div className="sa-empty-icon">✨</div>
    <h3 className="text-base font-bold">{title}</h3>
    <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
  </div>
);

export default AdminStudentManagement;

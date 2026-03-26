import { useCallback, useEffect, useMemo, useState } from "react";
import html2pdf from "html2pdf.js";
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
  User,
  Users,
  Video,
  Wallet,
  Clock3,
} from "lucide-react";
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
    if (view === "grade") {
      setView("stage");
      return;
    }
    setView("home");
  };

  return (
    <div className="student-admin-page space-y-5 rounded-[28px] p-3 sm:p-5">
      {view !== "home" && (
        <Button variant="ghost" onClick={handleBack} className="w-fit gap-2 rounded-full px-4">
          <ArrowLeft className="h-4 w-4" /> رجوع
        </Button>
      )}

      {view === "home" && (
        <StudentManagementHome
          onOpenStage={(stage) => {
            setSelectedStage(stage);
            setSelectedGrade(null);
            setView("stage");
          }}
          onOpenRecent={() => setView("recent")}
          onOpenStudent={(student) => handleOpenStudent(student, "home")}
        />
      )}

      {view === "stage" && selectedStage && (
        <StageGradesView
          stageKey={selectedStage}
          onOpenGrade={(stage, grade) => {
            setSelectedStage(stage);
            setSelectedGrade(grade);
            setView("grade");
          }}
        />
      )}

      {view === "grade" && selectedStage && selectedGrade && (
        <GradeStudentsView stageKey={selectedStage} grade={selectedGrade} onOpenStudent={(student) => handleOpenStudent(student, "grade")} />
      )}

      {view === "recent" && <RecentStudentsView onOpenStudent={(student) => handleOpenStudent(student, "recent")} />}
      {view === "detail" && selectedStudent && <StudentDetailView student={selectedStudent} onStudentUpdated={setSelectedStudent} />}
    </div>
  );
};

const StudentManagementHome = ({ onOpenStage, onOpenRecent, onOpenStudent }: { onOpenStage: (stage: string) => void; onOpenRecent: () => void; onOpenStudent: (student: StudentProfile) => void; }) => {
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
      const studentIds = emptyArray(profiles).map((item) => item.id);
      const subscribedSet = await buildSubscribedStudentSet(studentIds);
      const stageCounts = STUDENT_STAGES.reduce<Record<string, number>>((acc, stage) => {
        acc[stage.key] = emptyArray(profiles).filter((item) => item.stage === stage.key).length;
        return acc;
      }, {});
      setOverview({ totalStudents: profiles?.length ?? 0, paidStudents: subscribedSet.size, recentCount: recent?.length ?? 0, stageCounts });
    } catch (error) {
      console.error(error);
      toast.error("تعذر تحميل ملخص الطلاب");
    }
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useRealtimeRefresh("admin-students-home-live", ["profiles", "subscriptions", "student_group_purchases"], loadOverview);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setLoadingSearch(true);
      try {
        const term = searchTerm.trim();
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, email, phone, student_code, stage, grade, section, is_banned, created_at, avatar_url")
          .or(`full_name.ilike.%${term}%,email.ilike.%${term}%,student_code.ilike.%${term}%`)
          .order("created_at", { ascending: false })
          .limit(8);
        if (error) throw error;
        setSearchResults(data ?? []);
      } catch (error) {
        console.error(error);
        toast.error("تعذر تنفيذ البحث الآن");
      } finally {
        setLoadingSearch(false);
      }
    }, 350);
    return () => clearTimeout(timeout);
  }, [searchTerm]);

  return (
    <div className="space-y-5">
      <section className="student-admin-hero">
        <div className="student-admin-hero-orb student-admin-hero-orb--one" />
        <div className="student-admin-hero-orb student-admin-hero-orb--two" />
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="student-admin-live-badge"><span className="student-admin-live-dot" /> تحديث تلقائي مباشر</div>
            <h1 className="text-3xl font-bold text-primary-foreground sm:text-4xl">إدارة الطلاب</h1>
            <p className="max-w-2xl text-sm text-primary-foreground/80 sm:text-base">متابعة وتحليل بيانات الطلاب بواجهة أوضح وأقوى وتنقل أفضل بين المراحل والصفوف والتقارير الفردية.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:min-w-[360px]">
            <HeroStat label="إجمالي الطلاب" value={overview.totalStudents} />
            <HeroStat label="طلاب مدفوعون" value={overview.paidStudents} />
            <HeroStat label="آخر 50 طالب" value={overview.recentCount} />
          </div>
        </div>
      </section>

      <section className="student-admin-search-shell">
        <div className="relative">
          <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="ابحث بالاسم / الكود / البريد..." className="h-16 rounded-[22px] border-0 bg-transparent pr-12 text-base shadow-none focus-visible:ring-0" />
          {loadingSearch && <Loader2 className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-primary" />}
        </div>
      </section>

      {searchTerm.trim() ? (
        <section className="space-y-3">
          <SectionTitle title="نتائج البحث" subtitle="بطاقات أوضح للوصول السريع إلى ملف الطالب الكامل." />
          {loadingSearch ? (
            <div className="grid gap-3 lg:grid-cols-2">{[1,2].map((key) => <Skeleton key={key} className="h-48 rounded-[26px]" />)}</div>
          ) : searchResults.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">{searchResults.map((student) => <SearchResultCard key={student.id} student={student} onOpen={() => onOpenStudent(student)} />)}</div>
          ) : (
            <EmptyState title="لا توجد نتائج مطابقة" description="جرّب الاسم الكامل أو الكود أو البريد الإلكتروني." />
          )}
        </section>
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-[1fr_1fr_0.9fr]">
            {STUDENT_STAGES.map((stage) => (
              <button key={stage.key} type="button" onClick={() => onOpenStage(stage.key)} className={`student-admin-stage-card ${stage.key === "اعدادي" ? "student-admin-stage-card--prep" : "student-admin-stage-card--secondary"}`}>
                <div className="student-admin-stage-icon">{stage.icon}</div>
                <div className="space-y-2 text-right">
                  <h2 className="text-2xl font-bold text-primary-foreground">{stage.label}</h2>
                  <p className="text-sm text-primary-foreground/80">{stage.description}</p>
                  <div className="student-admin-stage-meta"><span>{overview.stageCounts[stage.key] ?? 0} طالب</span><span>3 صفوف</span></div>
                </div>
              </button>
            ))}
            <button type="button" onClick={onOpenRecent} className="student-admin-stage-card student-admin-stage-card--recent">
              <div className="student-admin-stage-icon">🕘</div>
              <div className="space-y-2 text-right">
                <h2 className="text-2xl font-bold text-primary-foreground">آخر الطلبة المسجلين</h2>
                <p className="text-sm text-primary-foreground/80">زر مستقل يعرض أحدث 50 طالب داخل صفحة منفصلة ومنظمة.</p>
                <div className="student-admin-stage-meta"><span>{overview.recentCount} طالب</span><span>محدث تلقائيًا</span></div>
              </div>
            </button>
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <Card className="student-admin-panel">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-5 w-5 text-primary" /> نظرة سريعة على النظام</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <MetricCard label="إجمالي الطلاب" value={overview.totalStudents} variant="one" icon={Users} />
                <MetricCard label="المشتركون النشطون" value={overview.paidStudents} variant="two" icon={CreditCard} />
                <MetricCard label="قنوات العرض" value={3} variant="three" icon={BookOpen} />
              </CardContent>
            </Card>
            <Card className="student-admin-panel">
              <CardHeader className="pb-2"><CardTitle className="text-lg">ما الجديد هنا؟</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p className="student-admin-note">• كل مرحلة أصبحت بداخلها صفحة مستقلة ثم الصفوف ثم تفاصيل الصف.</p>
                <p className="student-admin-note">• آخر 50 طالب انتقلوا لزر مستقل بدل الزحام في الصفحة الرئيسية.</p>
                <p className="student-admin-note">• بطاقات البحث أصبحت أوضح وتفتح التقرير الكامل مباشرة.</p>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
};

const StageGradesView = ({ stageKey, onOpenGrade }: { stageKey: string; onOpenGrade: (stage: string, grade: string) => void; }) => {
  const stage = STUDENT_STAGES.find((item) => item.key === stageKey);
  const [gradeSummaries, setGradeSummaries] = useState<GradeSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadStage = useCallback(async () => {
    if (!stage) return;
    setLoading(true);
    try {
      const { data: profiles, error } = await supabase.from("profiles").select("id, grade").eq("stage", stage.key);
      if (error) throw error;
      const studentIds = emptyArray(profiles).map((item) => item.id);
      const subscribedSet = await buildSubscribedStudentSet(studentIds);
      const summaries = stage.grades.map((grade) => {
        const gradeStudents = emptyArray(profiles).filter((item) => item.grade === grade);
        return { grade, totalStudents: gradeStudents.length, activeSubscribers: gradeStudents.filter((item) => subscribedSet.has(item.id)).length };
      });
      setGradeSummaries(summaries);
    } catch (error) {
      console.error(error);
      toast.error("تعذر تحميل الصفوف الآن");
    } finally { setLoading(false); }
  }, [stage]);

  useEffect(() => { loadStage(); }, [loadStage]);
  useRealtimeRefresh(`admin-stage-${stageKey}`, ["profiles", "subscriptions", "student_group_purchases"], loadStage);
  if (!stage) return null;

  return (
    <div className="space-y-4">
      <section className="student-admin-surface student-admin-surface--compact">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="student-admin-eyebrow">واجهة المرحلة</p>
            <h2 className="text-2xl font-bold">{stage.label}</h2>
            <p className="text-sm text-muted-foreground">اختر الصف المطلوب لعرض الإجماليات وأسماء الطلاب والمشتركين.</p>
          </div>
          <Badge className="student-admin-neutral-badge">تحديث مباشر</Badge>
        </div>
      </section>
      {loading ? (
        <div className="grid gap-3 lg:grid-cols-3">{[1,2,3].map((key) => <Skeleton key={key} className="h-52 rounded-[24px]" />)}</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {gradeSummaries.map((summary, index) => (
            <button key={summary.grade} type="button" onClick={() => onOpenGrade(stage.key, summary.grade)} className={`student-admin-grade-card student-admin-grade-card--${(index % 3) + 1}`}>
              <div className="space-y-2 text-right">
                <p className="student-admin-eyebrow student-admin-eyebrow--light">الانتقال إلى الصف</p>
                <h3 className="text-2xl font-bold text-primary-foreground">{gradeDisplayLabel(stage.key, summary.grade)}</h3>
                <p className="text-sm text-primary-foreground/80">إجماليات سريعة ثم قائمة الطلاب بترتيب التسجيل الحديث.</p>
              </div>
              <div className="grid grid-cols-2 gap-3"><div className="student-admin-grade-stat"><strong>{summary.totalStudents}</strong><span>إجمالي الطلاب</span></div><div className="student-admin-grade-stat"><strong>{summary.activeSubscribers}</strong><span>مشتركون مدفوعون</span></div></div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const GradeStudentsView = ({ stageKey, grade, onOpenStudent }: { stageKey: string; grade: string; onOpenStudent: (student: StudentProfile) => void; }) => {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [paidStudentIds, setPaidStudentIds] = useState<Set<string>>(new Set());

  const loadGradeStudents = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email, phone, student_code, stage, grade, section, is_banned, created_at, avatar_url").eq("stage", stageKey).eq("grade", grade).order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      setStudents(rows);
      setPaidStudentIds(await buildSubscribedStudentSet(rows.map((item) => item.id)));
    } catch (error) {
      console.error(error);
      toast.error("تعذر تحميل طلاب الصف");
    } finally { setLoading(false); }
  }, [grade, stageKey]);

  useEffect(() => { loadGradeStudents(); }, [loadGradeStudents]);
  useRealtimeRefresh(`admin-grade-${stageKey}-${grade}`, ["profiles", "subscriptions", "student_group_purchases"], loadGradeStudents);

  const sectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    students.forEach((student) => {
      const key = sectionDisplayLabel(student.section);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.entries());
  }, [students]);
  const paidCount = useMemo(() => students.filter((student) => paidStudentIds.has(student.id)).length, [students, paidStudentIds]);

  return (
    <div className="space-y-4">
      <section className="student-admin-surface">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="student-admin-eyebrow">تفاصيل الصف</p>
            <h2 className="text-2xl font-bold">{gradeDisplayLabel(stageKey, grade)}</h2>
            <p className="text-sm text-muted-foreground">قائمة مرتبة بأحدث الطلاب مع كود الطالب وحالة الاشتراك المدفوع.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-[320px]"><MetricCard label="إجمالي الطلاب" value={students.length} variant="one" icon={Users} /><MetricCard label="المشتركون" value={paidCount} variant="two" icon={CreditCard} /></div>
        </div>
        {sectionCounts.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{sectionCounts.map(([section, count]) => <span key={section} className="student-admin-chip">{section}: {count}</span>)}</div>}
      </section>
      <Card className="student-admin-panel">
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5 text-primary" /> قائمة الطلاب</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[1,2,3].map((key) => <Skeleton key={key} className="h-24 rounded-[20px]" />)}</div>
          ) : students.length > 0 ? (
            <div className="space-y-3">{students.map((student) => <StudentRowCard key={student.id} student={student} isPaid={paidStudentIds.has(student.id)} onOpen={() => onOpenStudent(student)} />)}</div>
          ) : (
            <EmptyState title="لا يوجد طلاب في هذا الصف" description="عند تسجيل طالب جديد سيظهر هنا مباشرة." />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const RecentStudentsView = ({ onOpenStudent }: { onOpenStudent: (student: StudentProfile) => void; }) => {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const loadRecentStudents = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email, phone, student_code, stage, grade, section, is_banned, created_at, avatar_url").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      setStudents(data ?? []);
    } catch (error) {
      console.error(error);
      toast.error("تعذر تحميل آخر الطلبة المسجلين");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadRecentStudents(); }, [loadRecentStudents]);
  useRealtimeRefresh("admin-students-recent", ["profiles"], loadRecentStudents);

  return (
    <div className="space-y-4">
      <section className="student-admin-surface student-admin-surface--compact">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="student-admin-eyebrow">قائمة مستقلة</p><h2 className="text-2xl font-bold">آخر الطلبة المسجلين</h2><p className="text-sm text-muted-foreground">أحدث 50 حسابًا داخل صفحة منفصلة بعيدًا عن الصفحة الرئيسية.</p></div>
          <Badge className="student-admin-neutral-badge">{students.length} طالب</Badge>
        </div>
      </section>
      <Card className="student-admin-panel"><CardContent className="pt-6">{loading ? <div className="space-y-3">{[1,2,3,4].map((key) => <Skeleton key={key} className="h-24 rounded-[20px]" />)}</div> : students.length > 0 ? <div className="space-y-3">{students.map((student) => <StudentRowCard key={student.id} student={student} isPaid={false} onOpen={() => onOpenStudent(student)} />)}</div> : <EmptyState title="لا توجد حسابات حديثة" description="سيظهر آخر المسجلين هنا تلقائيًا." />}</CardContent></Card>
    </div>
  );
};

const StudentDetailView = ({ student, onStudentUpdated }: { student: StudentProfile; onStudentUpdated: (student: StudentProfile) => void; }) => {
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
      const groupIds = purchasesData.map((item) => item.group_id);
      const teacherIds = [...subscriptionsData.map((item: any) => item.teacher_id).filter(Boolean), ...teacherChoicesData.map((item: any) => item.teacher_id).filter(Boolean)];
      const [{ data: groupsData }, { data: teacherProfiles }] = await Promise.all([
        groupIds.length ? supabase.from("content_groups").select("id, title, teacher_id").in("id", groupIds) : Promise.resolve({ data: [] as any[] }),
        teacherIds.length ? supabase.from("profiles").select("id, full_name").in("id", [...new Set(teacherIds)]) : Promise.resolve({ data: [] as any[] }),
      ]);
      const teacherMap = new Map((teacherProfiles ?? []).map((item: any) => [item.id, item.full_name]));
      const groupMap = new Map((groupsData ?? []).map((item: any) => [item.id, item]));
      if (profileRes.data) onStudentUpdated(profileRes.data as StudentProfile);
      setWalletBalance(walletRes.data?.balance ?? 0);
      setDeposits(depositsRes.data ?? []);
      setVideos(videosRes.data ?? []);
      setExams(examsRes.data ?? []);
      setActivities(activityRes.data ?? []);
      setTeacherChoices((teacherChoicesData ?? []).map((item: any) => ({ ...item, teacher_name: item.teacher_id ? teacherMap.get(item.teacher_id) : undefined })));
      setSubscriptions((subscriptionsData ?? []).map((item: any) => ({ ...item, teacher_name: item.teacher_id ? teacherMap.get(item.teacher_id) : undefined })));
      setPurchases((purchasesData ?? []).map((item: any) => { const group = groupMap.get(item.group_id); return { ...item, group_title: group?.title, teacher_name: group?.teacher_id ? teacherMap.get(group.teacher_id) : undefined }; }));
    } catch (error) {
      console.error(error);
      toast.error("تعذر تحميل ملف الطالب");
    } finally { setLoading(false); }
  }, [onStudentUpdated, student.id]);

  useEffect(() => { loadStudentDetails(); }, [loadStudentDetails]);
  useRealtimeRefresh(`admin-student-detail-${student.id}`, ["profiles", "wallets", "deposit_requests", "student_group_purchases", "subscriptions", "video_progress", "exam_attempts", "usage_logs", "student_teacher_choices"], loadStudentDetails);

  const totalSpent = purchases.reduce((sum, item) => sum + (item.amount_paid || 0), 0);
  const totalDeposited = deposits.filter((item) => item.status === "approved").reduce((sum, item) => sum + item.amount, 0);
  const watchedMinutes = Math.round(videos.reduce((sum, item) => sum + (item.progress_seconds || 0), 0) / 60);
  const averageScore = exams.length > 0 ? Math.round(exams.reduce((sum, item) => sum + (item.total > 0 ? (item.score / item.total) * 100 : 0), 0) / exams.length) : 0;

  const handleToggleBan = async () => {
    setBanLoading(true);
    try {
      const nextValue = !student.is_banned;
      const { error } = await supabase.from("profiles").update({ is_banned: nextValue }).eq("id", student.id);
      if (error) throw error;
      onStudentUpdated({ ...student, is_banned: nextValue });
      toast.success(nextValue ? "تم حظر الطالب" : "تم فك حظر الطالب");
    } catch (error) {
      console.error(error);
      toast.error("تعذر تحديث حالة الحظر");
    } finally { setBanLoading(false); }
  };

  const handleSaveEdit = async () => {
    try {
      const { error } = await supabase.from("profiles").update(editForm).eq("id", student.id);
      if (error) throw error;
      onStudentUpdated({ ...student, ...editForm });
      toast.success("تم حفظ التعديلات");
      setEditDialogOpen(false);
    } catch (error) {
      console.error(error);
      toast.error("تعذر حفظ بيانات الطالب");
    }
  };

  const handleExportPdf = async () => {
    setExportLoading(true);
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.inset = "0";
    container.style.pointerEvents = "none";
    container.style.opacity = "0";
    container.style.zIndex = "-1";
    container.dir = "rtl";
    try {
      await document.fonts.ready;
      container.innerHTML = buildStudentReportHtml({ student, walletBalance, totalDeposited, totalSpent, totalWatchMinutes: watchedMinutes, averageScore, deposits, purchases, subscriptions, exams, videos, activities, teacherChoices });
      document.body.appendChild(container);
      await html2pdf().set({ margin: [8,8,8,8], filename: `student-report-${student.student_code || student.id}.pdf`, image: { type: "jpeg", quality: 0.98 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" }, jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }, pagebreak: { mode: ["css", "legacy"] } }).from(container).save();
      toast.success("تم تحميل تقرير الطالب PDF");
    } catch (error) {
      console.error(error);
      toast.error("تعذر إنشاء ملف PDF بالعربية");
    } finally {
      if (container.parentNode) container.parentNode.removeChild(container);
      setExportLoading(false);
    }
  };

  if (loading) return <div className="space-y-3"><Skeleton className="h-48 rounded-[28px]" /><Skeleton className="h-80 rounded-[28px]" /></div>;

  return (
    <div className="space-y-4">
      <section className="student-admin-detail-hero">
        <div className="student-admin-detail-orb student-admin-detail-orb--one" />
        <div className="student-admin-detail-orb student-admin-detail-orb--two" />
        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="student-admin-detail-avatar">{student.avatar_url ? <img src={student.avatar_url} alt={student.full_name} className="h-full w-full rounded-[24px] object-cover" /> : <User className="h-8 w-8 text-primary-foreground" />}</div>
            <div className="space-y-2"><h2 className="text-2xl font-bold text-primary-foreground sm:text-3xl">{student.full_name}</h2><p className="text-sm text-primary-foreground/80">{student.email}</p><div className="flex flex-wrap gap-2"><span className="student-admin-detail-pill">{student.stage || "-"} · {student.grade || "-"}</span><span className="student-admin-detail-pill">#{student.student_code || student.id.slice(0, 6)}</span><span className={`student-admin-status-badge ${student.is_banned ? "student-admin-status-badge--danger" : "student-admin-status-badge--success"}`}>{student.is_banned ? "محظور" : "نشط"}</span></div></div>
          </div>
          <div className="flex flex-wrap gap-2 lg:max-w-[360px] lg:justify-end">
            <Button variant="secondary" onClick={() => setEditDialogOpen(true)} className="rounded-full px-5"><Edit3 className="h-4 w-4" /> تعديل</Button>
            <Button variant={student.is_banned ? "default" : "destructive"} onClick={handleToggleBan} disabled={banLoading} className="rounded-full px-5">{banLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} {student.is_banned ? "فك الحظر" : "حظر الطالب"}</Button>
            <Button variant="outline" onClick={handleExportPdf} disabled={exportLoading} className="student-admin-outline-button rounded-full px-5">{exportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} تحميل PDF</Button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="الرصيد الحالي" value={formatCurrency(walletBalance)} variant="one" icon={Wallet} />
        <MetricCard label="إجمالي الإنفاق" value={formatCurrency(totalSpent)} variant="three" icon={ShoppingCart} />
        <MetricCard label="الفيديوهات" value={videos.length} variant="four" icon={Video} />
        <MetricCard label="متوسط الدرجات" value={`${averageScore}%`} variant="two" icon={FileText} />
      </section>

      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl" className="space-y-4">
        <TabsList className="student-admin-tab-list">
          <TabsTrigger value="overview" className="student-admin-tab-trigger">Overview</TabsTrigger>
          <TabsTrigger value="subscriptions" className="student-admin-tab-trigger">الاشتراكات</TabsTrigger>
          <TabsTrigger value="progress" className="student-admin-tab-trigger">التقدم</TabsTrigger>
          <TabsTrigger value="videos" className="student-admin-tab-trigger">الفيديوهات</TabsTrigger>
          <TabsTrigger value="wallet" className="student-admin-tab-trigger">المحفظة</TabsTrigger>
          <TabsTrigger value="activity" className="student-admin-tab-trigger">النشاط</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="student-admin-panel"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><User className="h-5 w-5 text-primary" /> البيانات الأساسية</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><InfoCard label="الهاتف" value={student.phone || "-"} icon={Phone} /><InfoCard label="تاريخ التسجيل" value={formatArabicDate(student.created_at)} icon={Clock3} /><InfoCard label="المرحلة" value={student.stage || "-"} icon={GraduationCap} /><InfoCard label="القسم" value={sectionDisplayLabel(student.section)} icon={BookOpen} /></CardContent></Card>
          <Card className="student-admin-panel"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5 text-primary" /> المعلمون</CardTitle></CardHeader><CardContent className="space-y-3">{teacherChoices.length > 0 ? teacherChoices.map((item: any) => <div key={item.id} className="student-admin-list-item"><div><p className="font-semibold">{item.teacher_name || "معلم غير محدد"}</p><p className="text-sm text-muted-foreground">{item.category || "-"} · {item.stage || "-"} · {item.grade || "-"}</p></div><Badge className="student-admin-neutral-badge">متصل</Badge></div>) : <EmptyState title="لا توجد اختيارات معلمين" description="سيظهر هنا كل معلم اختاره الطالب داخل المنصة." compact />}</CardContent></Card>
        </TabsContent>
        <TabsContent value="subscriptions" className="grid gap-4 lg:grid-cols-2">
          <Card className="student-admin-panel"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><ShoppingCart className="h-5 w-5 text-primary" /> المجموعات المدفوعة</CardTitle></CardHeader><CardContent className="space-y-3">{purchases.length > 0 ? purchases.map((item) => <div key={item.id} className="student-admin-list-item"><div><p className="font-semibold">{item.group_title || "مجموعة"}</p><p className="text-sm text-muted-foreground">{item.teacher_name || "-"} · {formatArabicDate(item.purchased_at)}</p></div><Badge className="student-admin-status-badge student-admin-status-badge--warm">{formatCurrency(item.amount_paid || 0)}</Badge></div>) : <EmptyState title="لا توجد مجموعات مشتراة" description="سيظهر تاريخ شراء أي مجموعة هنا." compact />}</CardContent></Card>
          <Card className="student-admin-panel"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><CreditCard className="h-5 w-5 text-primary" /> الاشتراكات</CardTitle></CardHeader><CardContent className="space-y-3">{subscriptions.length > 0 ? subscriptions.map((item: any) => <div key={item.id} className="student-admin-list-item"><div><p className="font-semibold">{item.subjects?.name || "-"}</p><p className="text-sm text-muted-foreground">{item.teacher_name || "-"} · من {formatArabicDate(item.start_date)}</p></div><Badge className={`student-admin-status-badge ${item.is_active ? "student-admin-status-badge--success" : "student-admin-status-badge--neutral"}`}>{item.is_active ? "نشط" : "منتهي"}</Badge></div>) : <EmptyState title="لا توجد اشتراكات" description="تظهر هنا كل اشتراكات الطالب الحالية والسابقة." compact />}</CardContent></Card>
        </TabsContent>
        <TabsContent value="progress" className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <Card className="student-admin-panel"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><GraduationCap className="h-5 w-5 text-primary" /> مؤشرات سريعة</CardTitle></CardHeader><CardContent className="space-y-3"><ProgressSummary label="متوسط الدرجات" value={`${averageScore}%`} /><ProgressSummary label="عدد الامتحانات" value={`${exams.length}`} /><ProgressSummary label="الدقائق المشاهدة" value={`${watchedMinutes} دقيقة`} /><ProgressSummary label="سجل النشاط" value={`${activities.length} حركة`} /></CardContent></Card>
          <Card className="student-admin-panel"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><FileText className="h-5 w-5 text-primary" /> نتائج الامتحانات</CardTitle></CardHeader><CardContent className="space-y-3">{exams.length > 0 ? exams.map((item: any) => <div key={item.id} className="student-admin-list-item"><div><p className="font-semibold">{item.exams?.title || "امتحان"}</p><p className="text-sm text-muted-foreground">{formatArabicDate(item.submitted_at)}</p></div><Badge className="student-admin-status-badge student-admin-status-badge--info">{item.total > 0 ? `${Math.round((item.score / item.total) * 100)}%` : "0%"}</Badge></div>) : <EmptyState title="لا توجد نتائج امتحانات" description="سيظهر هنا كل امتحان حلّه الطالب ونسبته." compact />}</CardContent></Card>
        </TabsContent>
        <TabsContent value="videos" className="space-y-4"><Card className="student-admin-panel"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><Video className="h-5 w-5 text-primary" /> الفيديوهات والتقدم</CardTitle></CardHeader><CardContent className="space-y-3">{videos.length > 0 ? videos.map((item: any) => { const progress = item.duration_seconds > 0 ? Math.min((item.progress_seconds / item.duration_seconds) * 100, 100) : 0; return <div key={item.id} className="student-admin-video-card"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold">{item.content?.title || "فيديو"}</p><p className="text-sm text-muted-foreground">تمت مشاهدة {Math.round(item.progress_seconds / 60)} دقيقة</p></div><Badge className="student-admin-status-badge student-admin-status-badge--info">{Math.round(progress)}%</Badge></div><div className="student-admin-progress-track"><div className="student-admin-progress-bar" style={{ width: `${progress}%` }} /></div></div>; }) : <EmptyState title="لا توجد فيديوهات مشاهدة" description="عند بدء المشاهدة ستظهر هنا نسب التقدم والمدة." compact />}</CardContent></Card></TabsContent>
        <TabsContent value="wallet" className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
          <Card className="student-admin-panel"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><Wallet className="h-5 w-5 text-primary" /> ملخص المحفظة</CardTitle></CardHeader><CardContent className="space-y-3"><ProgressSummary label="الرصيد الحالي" value={formatCurrency(walletBalance)} /><ProgressSummary label="الإيداعات المقبولة" value={formatCurrency(totalDeposited)} /><ProgressSummary label="الإنفاق" value={formatCurrency(totalSpent)} /></CardContent></Card>
          <Card className="student-admin-panel"><CardHeader className="pb-3 flex flex-row items-center justify-between"><CardTitle className="flex items-center gap-2 text-lg"><CreditCard className="h-5 w-5 text-primary" /> سجل الإيداعات</CardTitle><Button variant="ghost" size="sm" onClick={loadStudentDetails} className="gap-2 rounded-full"><RefreshCw className="h-4 w-4" /> تحديث</Button></CardHeader><CardContent className="space-y-3">{deposits.length > 0 ? deposits.map((item) => <div key={item.id} className="student-admin-list-item"><div><p className="font-semibold">{formatCurrency(item.amount)}</p><p className="text-sm text-muted-foreground">{item.payment_method || "-"} · {formatArabicDate(item.created_at)}</p></div><Badge className={`student-admin-status-badge ${item.status === "approved" ? "student-admin-status-badge--success" : item.status === "rejected" ? "student-admin-status-badge--danger" : "student-admin-status-badge--warm"}`}>{item.status === "approved" ? "مقبول" : item.status === "rejected" ? "مرفوض" : "معلق"}</Badge></div>) : <EmptyState title="لا توجد إيداعات" description="سيظهر هنا كل طلب إيداع وتاريخه وحالته." compact />}</CardContent></Card>
        </TabsContent>
        <TabsContent value="activity" className="space-y-4"><Card className="student-admin-panel"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><Activity className="h-5 w-5 text-primary" /> Activity Log</CardTitle></CardHeader><CardContent className="space-y-3">{activities.length > 0 ? activities.map((item: any) => <div key={item.id} className="student-admin-list-item"><div><p className="font-semibold">{item.action}</p><p className="text-sm text-muted-foreground">{item.content?.title || "بدون محتوى"} · {formatArabicDate(item.created_at)}</p></div><Badge className="student-admin-neutral-badge">{item.duration_minutes ? `${item.duration_minutes} دقيقة` : "بدون مدة"}</Badge></div>) : <EmptyState title="لا يوجد سجل نشاط" description="تظهر هنا كل حركة مهمة سجّلها الطالب داخل المنصة." compact />}</CardContent></Card></TabsContent>
      </Tabs>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}><DialogContent className="max-w-lg rounded-[28px]"><DialogHeader><DialogTitle>تعديل بيانات الطالب</DialogTitle></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label>الاسم</Label><Input value={editForm.full_name} onChange={(event) => setEditForm((current) => ({ ...current, full_name: event.target.value }))} /></div><div className="space-y-2"><Label>الهاتف</Label><Input value={editForm.phone} onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))} /></div><div className="space-y-2"><Label>المرحلة</Label><Input value={editForm.stage} onChange={(event) => setEditForm((current) => ({ ...current, stage: event.target.value }))} /></div><div className="space-y-2"><Label>الصف</Label><Input value={editForm.grade} onChange={(event) => setEditForm((current) => ({ ...current, grade: event.target.value }))} /></div><div className="space-y-2"><Label>القسم</Label><Input value={editForm.section} onChange={(event) => setEditForm((current) => ({ ...current, section: event.target.value }))} /></div></div><DialogFooter><Button onClick={handleSaveEdit} className="w-full rounded-full">حفظ التعديلات</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
};

const SearchResultCard = ({ student, onOpen }: { student: StudentProfile; onOpen: () => void; }) => (
  <button type="button" onClick={onOpen} className="student-admin-id-card">
    <div className="student-admin-id-card-orb student-admin-id-card-orb--one" />
    <div className="student-admin-id-card-orb student-admin-id-card-orb--two" />
    <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-start gap-4"><div className="student-admin-avatar">{student.avatar_url ? <img src={student.avatar_url} alt={student.full_name} className="h-full w-full rounded-[22px] object-cover" /> : <User className="h-6 w-6 text-primary-foreground" />}</div><div className="space-y-2 text-right"><h3 className="text-2xl font-bold text-primary-foreground">{student.full_name}</h3><div className="flex flex-wrap gap-2 text-primary-foreground/85"><span className="student-admin-detail-pill"><Mail className="h-3.5 w-3.5" /> {student.email}</span><span className="student-admin-detail-pill">{student.stage || "-"} · {student.grade || "-"}</span><span className="student-admin-detail-pill">#{student.student_code || "-"}</span></div><p className="text-sm text-primary-foreground/75">تاريخ التسجيل: {formatArabicDate(student.created_at)}</p></div></div><div className="flex flex-wrap gap-2 lg:justify-end"><Badge className={`student-admin-status-badge ${student.is_banned ? "student-admin-status-badge--danger" : "student-admin-status-badge--success"}`}>{student.is_banned ? "محظور" : "نشط"}</Badge><span className="student-admin-status-badge student-admin-status-badge--glass"><Eye className="h-4 w-4" /> عرض التفاصيل</span></div></div>
  </button>
);

const StudentRowCard = ({ student, isPaid, onOpen }: { student: StudentProfile; isPaid: boolean; onOpen: () => void; }) => (
  <button type="button" onClick={onOpen} className="student-admin-student-card">
    <div className="flex items-center gap-3"><div className="student-admin-row-avatar">{student.avatar_url ? <img src={student.avatar_url} alt={student.full_name} className="h-full w-full rounded-full object-cover" /> : <User className="h-5 w-5 text-primary" />}</div><div className="min-w-0 flex-1 text-right"><p className="truncate text-lg font-bold">{student.full_name}</p><div className="mt-1 flex flex-wrap gap-2 text-sm text-muted-foreground"><span>{student.stage || "-"} - {student.grade || "-"}</span><span>•</span><span>{sectionDisplayLabel(student.section)}</span><span>•</span><span>{formatArabicDate(student.created_at)}</span></div></div></div>
    <div className="flex flex-wrap items-center gap-2 lg:justify-end"><span className="student-admin-code-badge">#{student.student_code || "-"}</span>{isPaid && <span className="student-admin-status-badge student-admin-status-badge--success">مشترك</span>}{student.is_banned && <span className="student-admin-status-badge student-admin-status-badge--danger">محظور</span>}<span className="student-admin-status-badge student-admin-status-badge--neutral"><Eye className="h-4 w-4" /> فتح</span></div>
  </button>
);

const SectionTitle = ({ title, subtitle }: { title: string; subtitle: string }) => <div className="space-y-1"><h2 className="text-2xl font-bold">{title}</h2><p className="text-sm text-muted-foreground">{subtitle}</p></div>;
const HeroStat = ({ label, value }: { label: string; value: number }) => <div className="student-admin-hero-stat"><strong>{value}</strong><span>{label}</span></div>;
const MetricCard = ({ label, value, variant, icon: Icon }: { label: string; value: string | number; variant: "one" | "two" | "three" | "four"; icon: typeof Users; }) => <div className={`student-admin-metric-card student-admin-metric-card--${variant}`}><Icon className="h-5 w-5 text-primary-foreground/80" /><strong>{value}</strong><span>{label}</span></div>;
const InfoCard = ({ label, value, icon: Icon }: { label: string; value: string; icon: typeof User; }) => <div className="student-admin-info-card"><div className="student-admin-info-icon"><Icon className="h-4 w-4 text-primary" /></div><div><p className="text-sm text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></div></div>;
const ProgressSummary = ({ label, value }: { label: string; value: string }) => <div className="student-admin-summary-row"><span>{label}</span><strong>{value}</strong></div>;
const EmptyState = ({ title, description, compact = false }: { title: string; description: string; compact?: boolean; }) => <div className={`student-admin-empty ${compact ? "student-admin-empty--compact" : ""}`}><div className="student-admin-empty-icon">✨</div><h3 className="text-lg font-bold">{title}</h3><p className="max-w-md text-sm text-muted-foreground">{description}</p></div>;

export default AdminStudentManagement;

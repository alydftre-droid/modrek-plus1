import { useCallback, useEffect, useMemo, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Activity, Ban, BookOpen, CreditCard, Download, Edit3, Eye, FileText,
  GraduationCap, Loader2, Mail, Phone, Search, ShoppingCart,
  User, Users, Video, Wallet, Clock3, CheckCircle2, XCircle,
  Calendar, Hash, ChevronRight, Trash2, AlertTriangle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { buildStudentReportHtml } from "./student-management/report";
import {
  formatArabicDate, formatArabicDateTime, formatCurrency, gradeDisplayLabel, gradeQueryValues,
  normalizeGradeKey, normalizeStageKey, paymentMethodLabel, sectionDisplayLabel, stageQueryValues, STUDENT_STAGES,
  type GradeSummary, type StudentDeposit, type StudentProfile, type StudentPurchase,
} from "./student-management/types";
import { StudentOverviewTab } from "./developer/student/StudentOverviewTab";
import { StudentExamsTab } from "./developer/student/StudentExamsTab";
import { StudentProgressTab } from "./developer/student/StudentProgressTab";
import { StudentLogsTab } from "./developer/student/StudentLogsTab";

type ViewMode = "home" | "stage" | "grade" | "recent" | "detail";

const arr = <T,>(v: T[] | null | undefined) => v ?? [];
const educationBadgeLabel = (value: string | null | undefined) => /أزهر|azhar/i.test(value || "") ? "طالب أزهري" : "طالب عام";
const educationBadgeClass = (value: string | null | undefined) => /أزهر|azhar/i.test(value || "") ? "sm-badge--orange" : "sm-badge--blue";

const buildPaidSet = async (ids: string[]) => {
  if (!ids.length) return new Set<string>();
  const [{ data: subs }, { data: purch }] = await Promise.all([
    supabase.from("subscriptions").select("student_id").eq("is_active", true).in("student_id", ids),
    supabase.from("student_group_purchases").select("student_id").in("student_id", ids),
  ]);
  return new Set([...arr(subs).map(i => i.student_id), ...arr(purch).map(i => i.student_id)]);
};

/* fade animation props */
const fadeInitial = { opacity: 0, y: 16 };
const fadeAnimate = { opacity: 1, y: 0, transition: { duration: 0.35 } };

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                 */
/* ═══════════════════════════════════════════════════════════════ */
const AdminStudentManagement = () => {
  const [view, setView] = useState<ViewMode>("home");
  const [stageKey, setStageKey] = useState<string | null>(null);
  const [gradeKey, setGradeKey] = useState<string | null>(null);
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [backTarget, setBackTarget] = useState<ViewMode>("home");

  const openStudent = (s: StudentProfile, from: ViewMode) => { setStudent(s); setBackTarget(from); setView("detail"); };
  const goBack = () => {
    if (view === "detail") { setView(backTarget); return; }
    if (view === "grade") { setView("stage"); return; }
    setView("home");
  };

  return (
    <div className="sm-root" dir="rtl">
      {view !== "home" && (
        <button onClick={goBack} className="sm-back-btn">
          <ChevronRight className="h-4 w-4" /> رجوع
        </button>
      )}
      <AnimatePresence mode="wait">
        {view === "home" && <motion.div key="home" initial={fadeInitial} animate={fadeAnimate}><HomeView onStage={k => { setStageKey(k); setView("stage"); }} onRecent={() => setView("recent")} onStudent={s => openStudent(s, "home")} /></motion.div>}
        {view === "stage" && stageKey && <motion.div key="stage" initial={fadeInitial} animate={fadeAnimate}><StageView stageKey={stageKey} onGrade={(s, g) => { setStageKey(s); setGradeKey(g); setView("grade"); }} /></motion.div>}
        {view === "grade" && stageKey && gradeKey && <motion.div key="grade" initial={fadeInitial} animate={fadeAnimate}><GradeView stageKey={stageKey} grade={gradeKey} onStudent={s => openStudent(s, "grade")} /></motion.div>}
        {view === "recent" && <motion.div key="recent" initial={fadeInitial} animate={fadeAnimate}><RecentView onStudent={s => openStudent(s, "recent")} /></motion.div>}
        {view === "detail" && student && <motion.div key="detail" initial={fadeInitial} animate={fadeAnimate}><DetailView student={student} onUpdate={setStudent} onDeleted={() => { setStudent(null); setView(backTarget); }} /></motion.div>}
      </AnimatePresence>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════ */
/*  HOME                                                           */
/* ═══════════════════════════════════════════════════════════════ */
const HomeView = ({ onStage, onRecent, onStudent }: { onStage: (k: string) => void; onRecent: () => void; onStudent: (s: StudentProfile) => void }) => {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<StudentProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [stats, setStats] = useState({ total: 0, paid: 0, recent: 0, stages: {} as Record<string, number> });

  const load = useCallback(async () => {
    try {
      const { data: profiles } = await supabase.from("profiles").select("id, stage");
      const { data: recent } = await supabase.from("profiles").select("id").order("created_at", { ascending: false }).limit(50);
      const ids = arr(profiles).map(i => i.id);
      const paidSet = await buildPaidSet(ids);
      const stages: Record<string, number> = {};
      STUDENT_STAGES.forEach(s => { stages[s.key] = arr(profiles).filter(p => normalizeStageKey(p.stage) === s.key).length; });
      setStats({ total: profiles?.length ?? 0, paid: paidSet.size, recent: recent?.length ?? 0, stages });
    } catch { toast.error("تعذر تحميل ملخص الطلاب"); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const q = search.trim();
        const { data } = await supabase.from("profiles")
          .select("id, full_name, email, phone, student_code, stage, grade, section, education_type, is_banned, created_at, avatar_url")
          .or(`full_name.ilike.%${q}%,email.ilike.%${q}%,student_code.ilike.%${q}%`)
          .order("created_at", { ascending: false }).limit(10);
        setResults(data ?? []);
      } catch { toast.error("خطأ في البحث"); } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sm-header-banner">
        <div className="sm-header-content">
          <h1 className="sm-header-title">إدارة الطلاب</h1>
          <p className="sm-header-subtitle">لوحة تحكم شاملة لمتابعة وتحليل بيانات الطلاب</p>
        </div>
        <div className="sm-header-stats">
          <div className="sm-stat-pill sm-stat-pill--blue">
            <Users className="h-5 w-5" />
            <div><strong>{stats.total}</strong><span>إجمالي الطلاب</span></div>
          </div>
          <div className="sm-stat-pill sm-stat-pill--green">
            <CreditCard className="h-5 w-5" />
            <div><strong>{stats.paid}</strong><span>مشتركون</span></div>
          </div>
          <div className="sm-stat-pill sm-stat-pill--purple">
            <Clock3 className="h-5 w-5" />
            <div><strong>{stats.recent}</strong><span>حديثو التسجيل</span></div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="sm-search-bar">
        <Search className="sm-search-icon" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث بالاسم أو الكود أو البريد الإلكتروني..." className="sm-search-input" />
        {searching && <Loader2 className="sm-search-spin" />}
      </div>

      {search.trim() ? (
        <div className="space-y-3">
          <h2 className="sm-section-title">نتائج البحث</h2>
          {searching ? <LoadingSkeleton count={2} /> : results.length > 0 ? (
            <div className="sm-results-grid">
              {results.map(s => <StudentCard key={s.id} student={s} onOpen={() => onStudent(s)} />)}
            </div>
          ) : <Empty title="لا توجد نتائج" desc="جرب البحث بالاسم الكامل أو كود الطالب" />}
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="sm-section-title">المراحل التعليمية</h2>
          <div className="sm-stages-grid">
            {STUDENT_STAGES.map(stage => (
              <button key={stage.key} onClick={() => onStage(stage.key)} className={`sm-stage-btn sm-stage-btn--${stage.key === "preparatory" ? "blue" : "purple"}`}>
                <div className="sm-stage-top">
                  <span className="sm-stage-icon">{stage.icon}</span>
                  <span className="sm-stage-badge">{stats.stages[stage.key] ?? 0} طالب</span>
                </div>
                <h3 className="sm-stage-name">{stage.label}</h3>
                <p className="sm-stage-desc">{stage.description}</p>
                <div className="sm-stage-go">عرض الصفوف <ChevronRight className="h-4 w-4 rotate-180" /></div>
              </button>
            ))}
            <button onClick={onRecent} className="sm-stage-btn sm-stage-btn--teal">
              <div className="sm-stage-top">
                <span className="sm-stage-icon">🕘</span>
                <span className="sm-stage-badge">{stats.recent} طالب</span>
              </div>
              <h3 className="sm-stage-name">آخر المسجلين</h3>
              <p className="sm-stage-desc">أحدث 50 حساب مسجل في المنصة</p>
              <div className="sm-stage-go">عرض القائمة <ChevronRight className="h-4 w-4 rotate-180" /></div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════ */
/*  STAGE VIEW                                                     */
/* ═══════════════════════════════════════════════════════════════ */
const StageView = ({ stageKey, onGrade }: { stageKey: string; onGrade: (s: string, g: string) => void }) => {
  const stage = STUDENT_STAGES.find(i => i.key === stageKey);
  const [summaries, setSummaries] = useState<GradeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalStage, setTotalStage] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);

  const load = useCallback(async () => {
    if (!stage) return;
    setLoading(true);
    try {
      const stageValues = stageQueryValues(stage.key);
      const { data: profiles } = await supabase.from("profiles").select("id, grade, section, stage").in("stage", stageValues);
      const ids = arr(profiles).map(i => i.id);
      const paidSet = await buildPaidSet(ids);
      const sums = stage.grades.map(g => {
        const gs = arr(profiles).filter(i => normalizeGradeKey(i.grade) === g);
        return { grade: g, totalStudents: gs.length, activeSubscribers: gs.filter(i => paidSet.has(i.id)).length };
      });
      setSummaries(sums);
      setTotalStage(profiles?.length ?? 0);
      setTotalPaid(paidSet.size);
    } catch { toast.error("تعذر تحميل الصفوف"); } finally { setLoading(false); }
  }, [stage]);

  useEffect(() => { load(); }, [load]);
  if (!stage) return null;

  const colors = ["blue", "purple", "teal"];

  return (
    <div className="space-y-5">
      <div className="sm-page-head">
        <div>
          <h2 className="sm-page-title">{stage.icon} {stage.label}</h2>
          <p className="sm-page-desc">اختر الصف للاطلاع على قوائم الطلاب</p>
        </div>
        <div className="sm-head-pills">
          <span className="sm-pill sm-pill--blue"><Users className="h-4 w-4" /> {totalStage} طالب</span>
          <span className="sm-pill sm-pill--green"><CreditCard className="h-4 w-4" /> {totalPaid} مشترك</span>
        </div>
      </div>
      {loading ? <LoadingSkeleton count={3} height="h-44" /> : (
        <div className="sm-stages-grid">
          {summaries.map((s, i) => (
            <button key={s.grade} onClick={() => onGrade(stage.key, s.grade)} className={`sm-grade-btn sm-grade-btn--${colors[i]}`}>
              <h3 className="sm-grade-name">{gradeDisplayLabel(stage.key, s.grade)}</h3>
              <div className="sm-grade-stats">
                <div className="sm-grade-stat"><strong>{s.totalStudents}</strong><span>إجمالي</span></div>
                <div className="sm-grade-stat"><strong>{s.activeSubscribers}</strong><span>مشترك</span></div>
              </div>
              <div className="sm-stage-go">عرض الطلاب <ChevronRight className="h-4 w-4 rotate-180" /></div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════ */
/*  GRADE VIEW                                                     */
/* ═══════════════════════════════════════════════════════════════ */
const GradeView = ({ stageKey, grade, onStudent }: { stageKey: string; grade: string; onStudent: (s: StudentProfile) => void }) => {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const stageValues = stageQueryValues(stageKey);
      const gradeValues = gradeQueryValues(grade);
      const { data } = await supabase.from("profiles")
        .select("id, full_name, email, phone, student_code, stage, grade, section, education_type, is_banned, created_at, avatar_url")
        .in("stage", stageValues)
        .in("grade", gradeValues)
        .order("created_at", { ascending: false });
      const rows = data ?? [];
      setStudents(rows);
      setPaidIds(await buildPaidSet(rows.map(i => i.id)));
    } catch { toast.error("تعذر تحميل طلاب الصف"); } finally { setLoading(false); }
  }, [grade, stageKey]);

  useEffect(() => { load(); }, [load]);

  const sectionCounts = useMemo(() => {
    const m = new Map<string, number>();
    students.forEach(s => { const k = sectionDisplayLabel(s.section); m.set(k, (m.get(k) ?? 0) + 1); });
    return Array.from(m.entries());
  }, [students]);
  const paidCount = students.filter(s => paidIds.has(s.id)).length;

  return (
    <div className="space-y-5">
      <div className="sm-page-head">
        <div>
          <h2 className="sm-page-title">📋 {gradeDisplayLabel(stageKey, grade)}</h2>
          <p className="sm-page-desc">قائمة مرتبة بأحدث الطلاب</p>
        </div>
        <div className="sm-head-pills">
          <span className="sm-pill sm-pill--blue"><Users className="h-4 w-4" /> {students.length} طالب</span>
          <span className="sm-pill sm-pill--green"><CreditCard className="h-4 w-4" /> {paidCount} مشترك</span>
          {sectionCounts.map(([sec, cnt]) => (
            <span key={sec} className="sm-pill sm-pill--gray">{sec}: {cnt}</span>
          ))}
        </div>
      </div>
      {loading ? <LoadingSkeleton count={4} /> : students.length > 0 ? (
        <div className="space-y-3">
          {students.map(s => (
            <StudentRow key={s.id} student={s} isPaid={paidIds.has(s.id)} onOpen={() => onStudent(s)} />
          ))}
        </div>
      ) : <Empty title="لا يوجد طلاب في هذا الصف" desc="عند تسجيل طالب جديد سيظهر هنا" />}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════ */
/*  RECENT VIEW                                                    */
/* ═══════════════════════════════════════════════════════════════ */
const RecentView = ({ onStudent }: { onStudent: (s: StudentProfile) => void }) => {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentProfile[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase.from("profiles")
          .select("id, full_name, email, phone, student_code, stage, grade, section, education_type, is_banned, created_at, avatar_url")
          .order("created_at", { ascending: false }).limit(50);
        setStudents(data ?? []);
      } catch { toast.error("تعذر تحميل آخر الطلبة"); } finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="space-y-5">
      <div className="sm-page-head">
        <div>
          <h2 className="sm-page-title">🕘 آخر الطلبة المسجلين</h2>
          <p className="sm-page-desc">أحدث 50 حسابًا في المنصة</p>
        </div>
        <span className="sm-pill sm-pill--purple"><Users className="h-4 w-4" /> {students.length} طالب</span>
      </div>
      {loading ? <LoadingSkeleton count={5} /> : students.length > 0 ? (
        <div className="space-y-3">{students.map(s => <StudentRow key={s.id} student={s} isPaid={false} onOpen={() => onStudent(s)} />)}</div>
      ) : <Empty title="لا توجد حسابات حديثة" desc="سيظهر آخر المسجلين هنا تلقائياً" />}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════ */
/*  DETAIL VIEW (CV)                                               */
/* ═══════════════════════════════════════════════════════════════ */
const DetailView = ({ student, onUpdate, onDeleted }: { student: StudentProfile; onUpdate: (s: StudentProfile) => void; onDeleted: () => void }) => {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [walletAdjustOpen, setWalletAdjustOpen] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustType, setAdjustType] = useState<"add" | "subtract">("add");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [banLoading, setBanLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editForm, setEditForm] = useState({ full_name: student.full_name, phone: student.phone || "", stage: student.stage || "", grade: student.grade || "", section: student.section || "" });

  const [wallet, setWallet] = useState(0);
  const [walletAdjustments, setWalletAdjustments] = useState<any[]>([]);
  const [rechargeCodeUses, setRechargeCodeUses] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<StudentDeposit[]>([]);
  const [purchases, setPurchases] = useState<StudentPurchase[]>([]);
  const [subs, setSubs] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dR, pR, wR, vR, eR, sR, tR, aR, prR, waR, rcR] = await Promise.all([
        supabase.from("deposit_requests").select("id, amount, status, created_at, payment_method").eq("student_id", student.id).order("created_at", { ascending: false }),
        supabase.from("student_group_purchases").select("id, group_id, purchased_at, amount_paid").eq("student_id", student.id).order("purchased_at", { ascending: false }),
        supabase.from("wallets").select("balance").eq("user_id", student.id).maybeSingle(),
        supabase.from("video_progress").select("id, progress_seconds, duration_seconds, content_id").eq("user_id", student.id),
        supabase.from("exam_attempts").select("id, score:total_score, total:max_score, submitted_at, exam_id").eq("student_id", student.id).order("submitted_at", { ascending: false }),
        supabase.from("subscriptions").select("id, start_date, end_date, is_active, teacher_id, subject_id").eq("student_id", student.id).order("created_at", { ascending: false }),
        supabase.from("student_teacher_choices").select("id, teacher_id, category, stage, grade").eq("student_id", student.id),
        supabase.from("usage_logs").select("id, action, duration_minutes, created_at, content_id").eq("user_id", student.id).order("created_at", { ascending: false }).limit(50),
        supabase.from("profiles").select("id, full_name, email, phone, student_code, stage, grade, section, education_type, is_banned, created_at, avatar_url").eq("id", student.id).maybeSingle(),
        supabase.from("wallet_adjustments" as any).select("*").eq("student_id", student.id).order("created_at", { ascending: false }),
        supabase.from("recharge_code_uses").select("id, used_at, code_id").eq("user_id", student.id).order("used_at", { ascending: false }),
      ]);

      // Resolve names
      const purchData = pR.data ?? [];
      const subsData = sR.data ?? [];
      const teacherData = tR.data ?? [];
      const videoData = vR.data ?? [];
      const examData = eR.data ?? [];
      const actData = aR.data ?? [];

      const groupIds = purchData.map(i => i.group_id);
      const teacherIds = [...new Set([...subsData.map((i: any) => i.teacher_id), ...teacherData.map((i: any) => i.teacher_id)].filter(Boolean))];
      const contentIds = [...new Set([...videoData.map(i => i.content_id), ...actData.map((i: any) => i.content_id)].filter(Boolean))];
      const examIds = [...new Set(examData.map(i => i.exam_id).filter(Boolean))];
      const subjectIds = [...new Set(subsData.map((i: any) => i.subject_id).filter(Boolean))];

      const [gR, tpR, cR, exR, sjR] = await Promise.all([
        groupIds.length ? supabase.from("content_groups").select("id, title, teacher_id, created_by, subject_id").in("id", groupIds) : { data: [] },
        teacherIds.length ? supabase.from("profiles").select("id, full_name").in("id", teacherIds as string[]) : { data: [] },
        contentIds.length ? supabase.from("content").select("id, title, type").in("id", contentIds as string[]) : { data: [] },
        examIds.length ? supabase.from("exams").select("id, title").in("id", examIds) : { data: [] },
        { data: [] as any[] }, // placeholder - we'll fetch subjects after getting group subject_ids
      ]);

      // Collect all subject IDs from both subscriptions AND groups
      const groupSubjectIds = (gR.data ?? []).map((g: any) => g.subject_id).filter(Boolean);
      const allSubjectIds = [...new Set([...subjectIds, ...groupSubjectIds])];
      const sjResult = allSubjectIds.length ? await supabase.from("subjects").select("id, name").in("id", allSubjectIds as string[]) : { data: [] };

      const teacherMap = new Map((tpR.data ?? []).map((i: any) => [i.id, i.full_name]));
      const groupMap = new Map((gR.data ?? []).map((i: any) => [i.id, i]));
      const contentMap = new Map((cR.data ?? []).map((i: any) => [i.id, i]));
      const examMap = new Map((exR.data ?? []).map((i: any) => [i.id, i]));
      const subjectMap = new Map((sjResult.data ?? []).map((i: any) => [i.id, i]));

      // Also get teacher names from groups
      const groupTeacherIds = (gR.data ?? []).map((g: any) => g.teacher_id).filter(Boolean).filter((id: string) => !teacherMap.has(id));
      if (groupTeacherIds.length) {
        const { data: extraTeachers } = await supabase.from("profiles").select("id, full_name").in("id", groupTeacherIds);
        (extraTeachers ?? []).forEach((t: any) => teacherMap.set(t.id, t.full_name));
      }

      if (prR.data) onUpdate(prR.data as StudentProfile);
      setWallet(wR.data?.balance ?? 0);
      setDeposits(dR.data ?? []);
      setWalletAdjustments((waR.data as any[]) ?? []);

      // Resolve recharge code uses
      const codeIds = ((rcR.data as any[]) ?? []).map((u: any) => u.code_id).filter(Boolean);
      let codeMap = new Map();
      if (codeIds.length) {
        const { data: codes } = await supabase.from("recharge_codes").select("id, code, amount").in("id", codeIds);
        codeMap = new Map((codes ?? []).map((c: any) => [c.id, c]));
      }
      setRechargeCodeUses(((rcR.data as any[]) ?? []).map((u: any) => ({ ...u, code: codeMap.get(u.code_id) })));

      setVideos(videoData.map(v => ({ ...v, content: contentMap.get(v.content_id) })));
      setExams(examData.map(e => ({ ...e, exams: examMap.get(e.exam_id) })));
      setActivities(actData.map((a: any) => ({ ...a, content: contentMap.get(a.content_id) })));
      setTeachers(teacherData.map((t: any) => ({ ...t, teacher_name: teacherMap.get(t.teacher_id) })));
      setSubs(subsData.map((s: any) => ({ ...s, teacher_name: teacherMap.get(s.teacher_id), subjects: subjectMap.get(s.subject_id) })));
      setPurchases(purchData.map(p => {
        const g = groupMap.get(p.group_id);
        const subj = g?.subject_id ? subjectMap.get(g.subject_id) : null;
        return {
          ...p,
          group_title: g?.title,
          subject_name: subj?.name,
          teacher_name: g?.teacher_id ? teacherMap.get(g.teacher_id) : (g?.created_by ? teacherMap.get(g.created_by) : undefined),
        };
      }));
    } catch (e) { console.error(e); toast.error("تعذر تحميل ملف الطالب"); } finally { setLoading(false); }
  }, [student.id, onUpdate]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const totalSpent = purchases.reduce((s, i) => s + (i.amount_paid || 0), 0);
  const totalDeposited = deposits.filter(i => i.status === "approved").reduce((s, i) => s + i.amount, 0);
  const watchMin = Math.round(videos.reduce((s, i) => s + (i.progress_seconds || 0), 0) / 60);
  const avgScore = exams.length ? Math.round(exams.reduce((s, i) => s + (i.total > 0 ? (i.score / i.total) * 100 : 0), 0) / exams.length) : 0;

  const toggleBan = async () => {
    setBanLoading(true);
    try {
      const next = !student.is_banned;
      await supabase.from("profiles").update({ is_banned: next }).eq("id", student.id);
      onUpdate({ ...student, is_banned: next });
      toast.success(next ? "تم حظر الطالب" : "تم فك الحظر");
    } catch { toast.error("تعذر تحديث الحالة"); } finally { setBanLoading(false); }
  };

  const handleDeleteStudent = async () => {
    setDeleteLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-delete-student", {
        body: { student_id: student.id },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "تعذر حذف الحساب");
      }
      toast.success("تم حذف حساب الطالب نهائيًا — أصبح البريد متاحًا للتسجيل من جديد");
      setDeleteOpen(false);
      onDeleted();
    } catch (err: any) {
      toast.error(err?.message || "تعذر حذف الحساب");
    } finally {
      setDeleteLoading(false);
    }
  };

  const saveEdit = async () => {
    try {
      await supabase.from("profiles").update(editForm).eq("id", student.id);
      onUpdate({ ...student, ...editForm });
      toast.success("تم حفظ التعديلات");
      setEditOpen(false);
    } catch { toast.error("تعذر الحفظ"); }
  };

  const handleWalletAdjust = async () => {
    const amt = parseFloat(adjustAmount);
    if (!amt || amt <= 0) { toast.error("يرجى إدخال مبلغ صحيح"); return; }
    setAdjustLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const adminId = userData?.user?.id || "";
      const delta = adjustType === "add" ? amt : -amt;
      if (adjustType === "add") {
        const { data, error } = await (supabase as any).rpc("admin_add_student_wallet_credit", {
          _student_id: student.id,
          _amount: amt,
          _reason: adjustReason || "إعادة شحن تلقائي من الإدارة",
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || "تعذر تعديل الرصيد");
      } else {
        await supabase.from("wallets").update({ balance: wallet + delta } as any).eq("user_id", student.id);
        await supabase.from("wallet_adjustments" as any).insert({
          student_id: student.id,
          admin_id: adminId,
          amount: amt,
          type: adjustType,
          reason: adjustReason || "خصم يدوي من المطور",
        });
      }
      setWallet(wallet + delta);
      toast.success(adjustType === "add" ? `تم إضافة ${amt} جنيه` : `تم خصم ${amt} جنيه`);
      setWalletAdjustOpen(false);
      setAdjustAmount("");
      setAdjustReason("");
      loadAll();
    } catch { toast.error("تعذر تعديل الرصيد"); } finally { setAdjustLoading(false); }
  };

  const exportPdf = async () => {
    setExportLoading(true);
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;top:0;left:-20000px;width:794px;opacity:1;z-index:-1;background:#fff";
    el.dir = "rtl";
    try {
      el.innerHTML = buildStudentReportHtml({ student, walletBalance: wallet, totalDeposited, totalSpent, totalWatchMinutes: watchMin, averageScore: avgScore, deposits, purchases, subscriptions: subs, exams, videos, activities, teacherChoices: teachers });
      document.body.appendChild(el);
      await document.fonts.ready;
      await new Promise(r => requestAnimationFrame(() => r(null)));
      const target = el.firstElementChild as HTMLElement;
      if (!target) throw new Error("missing");
      const canvas = await html2canvas(target, { scale: 2, useCORS: true, backgroundColor: "#fff", logging: false });
      const pdf = new jsPDF("p", "mm", "a4");
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const m = 8, cw = pw - m * 2, ch = ph - m * 2;
      const ih = (canvas.height * cw) / canvas.width;
      const img = canvas.toDataURL("image/png", 1);
      let rem = ih, pos = m;
      pdf.addImage(img, "PNG", m, pos, cw, ih, undefined, "FAST");
      rem -= ch;
      while (rem > 0) { pos = m - (ih - rem); pdf.addPage(); pdf.addImage(img, "PNG", m, pos, cw, ih, undefined, "FAST"); rem -= ch; }
      pdf.save(`student-${student.student_code || student.id.slice(0, 8)}.pdf`);
      toast.success("تم تحميل التقرير");
    } catch { toast.error("تعذر إنشاء PDF"); } finally {
      el.remove();
      setExportLoading(false);
    }
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-52 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div>;

  const stageLabel = student.stage === "preparatory" ? "الإعدادية" : student.stage === "secondary" ? "الثانوية" : student.stage || "-";
  const gradeLabel = student.grade === "first" ? "الأول" : student.grade === "second" ? "الثاني" : student.grade === "third" ? "الثالث" : student.grade || "-";

  return (
    <div className="space-y-5">
      {/* CV Header */}
      <div className="sm-cv-shell">
        <div className="sm-cv-banner" />
        <div className="sm-cv-body">
          <div className="sm-cv-avatar">
            {student.avatar_url ? <img src={student.avatar_url} alt="" className="h-full w-full rounded-full object-cover" /> : <User className="h-10 w-10 text-white" />}
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <h2 className="sm-cv-name">{student.full_name}</h2>
            <span className={`sm-badge ${educationBadgeClass(student.education_type)}`}><GraduationCap className="h-3 w-3" /> {educationBadgeLabel(student.education_type)}</span>
          </div>
          <p className="sm-cv-subtitle">الصف {gradeLabel} {stageLabel}</p>
          <div className="sm-cv-meta">
            <span className="sm-badge sm-badge--blue"><Hash className="h-3 w-3" /> {student.student_code || student.id.slice(0, 8)}</span>
            <span className={`sm-badge ${student.is_banned ? "sm-badge--red" : "sm-badge--green"}`}>{student.is_banned ? "محظور" : "نشط"}</span>
            <span className="sm-badge sm-badge--green">فحص مباشر كل 10 ثوانٍ</span>
            <span className="sm-badge sm-badge--gray"><Calendar className="h-3 w-3" /> {formatArabicDate(student.created_at)}</span>
          </div>
          <div className="sm-cv-contact">
            <span><Mail className="h-3.5 w-3.5" /> {student.email}</span>
            {student.phone && <span><Phone className="h-3.5 w-3.5" /> {student.phone}</span>}
            <span><GraduationCap className="h-3.5 w-3.5" /> {sectionDisplayLabel(student.section)}</span>
          </div>
          <div className="sm-cv-actions">
            <Button onClick={() => setEditOpen(true)} className="sm-action-btn sm-action-btn--blue"><Edit3 className="h-4 w-4" /> تعديل البيانات</Button>
            <Button onClick={exportPdf} disabled={exportLoading} className="sm-action-btn sm-action-btn--purple">{exportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} تحميل PDF</Button>
            <Button onClick={toggleBan} disabled={banLoading} className={`sm-action-btn ${student.is_banned ? "sm-action-btn--green" : "sm-action-btn--red"}`}>{banLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} {student.is_banned ? "فك الحظر" : "حظر الطالب"}</Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="sm-tabs-list">
          <TabsTrigger value="overview" className="sm-tab">
            <span>نظرة عامة</span>
            <small>#{student.student_code || student.id.slice(0, 6)}</small>
          </TabsTrigger>
          <TabsTrigger value="courses" className="sm-tab">
            <span>الكورسات</span>
            <small>{purchases.length} كورس</small>
          </TabsTrigger>
          <TabsTrigger value="progress" className="sm-tab">
            <span>التقدم</span>
            <small>{watchMin} دقيقة مشاهدة</small>
          </TabsTrigger>
          <TabsTrigger value="exams" className="sm-tab">
            <span>الامتحانات</span>
            <small>{exams.length} محاولة • {avgScore}%</small>
          </TabsTrigger>
          <TabsTrigger value="wallet" className="sm-tab">
            <span>المحفظة</span>
            <small>{formatCurrency(wallet)}</small>
          </TabsTrigger>
          <TabsTrigger value="activity" className="sm-tab">
            <span>السجلات</span>
            <small>{activities.length} حدث</small>
          </TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="sm-tab-content">
          <StudentOverviewTab key={`overview-${student.id}`} studentId={student.id} />
          <div className="sm-ov-bottom-actions mt-4">
            <Button onClick={exportPdf} disabled={exportLoading} className="sm-action-btn sm-action-btn--purple"><Download className="h-4 w-4" /> تقرير مفصل</Button>
            <Button onClick={toggleBan} disabled={banLoading} className={`sm-action-btn ${student.is_banned ? "sm-action-btn--green" : "sm-action-btn--red"}`}><Ban className="h-4 w-4" /> {student.is_banned ? "فك الحظر" : "حظر الطالب"}</Button>
          </div>
        </TabsContent>

        {/* Courses */}
        <TabsContent value="courses" className="sm-tab-content space-y-4">
          <SectionCard title="المجموعات المدفوعة" icon={<ShoppingCart className="h-5 w-5" />} color="blue">
            {purchases.length > 0 ? purchases.map(p => (
              <div key={p.id} className="sm-list-row">
                <div>
                  <p className="font-semibold">{p.group_title || "مجموعة"}</p>
                  <p className="text-xs text-muted-foreground">المادة: {p.subject_name || "غير محددة"}</p>
                  <p className="text-xs text-muted-foreground">{p.teacher_name || "-"} · {formatArabicDateTime(p.purchased_at)}</p>
                </div>
                <span className="sm-badge sm-badge--orange">{formatCurrency(p.amount_paid || 0)}</span>
              </div>
            )) : <Empty title="لا توجد مجموعات مدفوعة" desc="" compact />}
          </SectionCard>
          <SectionCard title="الاشتراكات" icon={<CreditCard className="h-5 w-5" />} color="purple">
            {subs.length > 0 ? subs.map((s: any) => (
              <div key={s.id} className="sm-list-row">
                <div><p className="font-semibold">{s.subjects?.name || "-"}</p><p className="text-xs text-muted-foreground">{s.teacher_name || "-"} · من {formatArabicDate(s.start_date)}</p></div>
                <span className={`sm-badge ${s.is_active ? "sm-badge--green" : "sm-badge--gray"}`}>{s.is_active ? "نشط" : "منتهي"}</span>
              </div>
            )) : <Empty title="لا توجد اشتراكات" desc="" compact />}
          </SectionCard>
        </TabsContent>

        {/* Progress */}
        <TabsContent value="progress" className="sm-tab-content space-y-4">
          <StudentProgressTab studentId={student.id} />
        </TabsContent>

        {/* Exams */}
        <TabsContent value="exams" className="sm-tab-content">
          <StudentExamsTab key={`exams-${student.id}`} studentId={student.id} />
        </TabsContent>

        {/* Wallet */}
        <TabsContent value="wallet" className="sm-tab-content space-y-4">
          {/* Wallet Balance + Adjust Button */}
          <div className="flex items-center justify-between p-4 bg-gradient-to-l from-primary/5 to-primary/10 rounded-xl border">
            <div>
              <p className="text-sm text-muted-foreground">الرصيد الحالي</p>
              <p className="text-2xl font-bold sm-text-primary">{formatCurrency(wallet)}</p>
            </div>
            <Button onClick={() => setWalletAdjustOpen(true)} className="sm-action-btn sm-action-btn--blue gap-1">
              <Edit3 className="h-4 w-4" /> تعديل الرصيد
            </Button>
          </div>

          <SectionCard title="سجلات الإيداع" icon={<CreditCard className="h-5 w-5" />} color="green" badge={`${deposits.length} عملية`}>
            {deposits.length > 0 ? (
              <div className="sm-table-wrap">
                <table className="sm-table">
                  <thead><tr><th>التاريخ</th><th>المبلغ</th><th>طريقة الدفع</th><th>الحالة</th></tr></thead>
                  <tbody>
                    {deposits.map(d => (
                      <tr key={d.id}>
                        <td>{formatArabicDateTime(d.created_at)}</td>
                        <td><strong className="sm-text-primary">{formatCurrency(d.amount)}</strong></td>
                        <td>{paymentMethodLabel(d.payment_method)}</td>
                        <td><span className={`sm-status-badge ${d.status === "approved" ? "sm-status--green" : d.status === "rejected" ? "sm-status--red" : "sm-status--orange"}`}>{d.status === "approved" ? "تم الإيداع" : d.status === "rejected" ? "مرفوض" : "معلق"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty title="لا توجد إيداعات" desc="" compact />}
          </SectionCard>

          {/* Recharge Code Uses */}
          <SectionCard title="أكواد الشحن المستخدمة" icon={<Hash className="h-5 w-5" />} color="blue" badge={`${rechargeCodeUses.length} كود`}>
            {rechargeCodeUses.length > 0 ? (
              <div className="sm-table-wrap">
                <table className="sm-table">
                  <thead><tr><th>التاريخ</th><th>الكود</th><th>قيمة الكود</th></tr></thead>
                  <tbody>
                    {rechargeCodeUses.map((u: any) => (
                      <tr key={u.id}>
                        <td>{formatArabicDateTime(u.used_at)}</td>
                        <td><code className="bg-muted px-2 py-0.5 rounded text-sm">{u.code?.code || "-"}</code></td>
                        <td><strong className="sm-text-success">{formatCurrency(u.code?.amount || 0)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty title="لم يستخدم أكواد شحن" desc="" compact />}
          </SectionCard>

          {/* Admin Wallet Adjustments */}
          <SectionCard title="تعديلات يدوية من المطور" icon={<Edit3 className="h-5 w-5" />} color="orange" badge={`${walletAdjustments.length} تعديل`}>
            {walletAdjustments.length > 0 ? (
              <div className="sm-table-wrap">
                <table className="sm-table">
                  <thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>السبب</th></tr></thead>
                  <tbody>
                    {walletAdjustments.map((a: any) => (
                      <tr key={a.id}>
                        <td>{formatArabicDateTime(a.created_at)}</td>
                        <td><span className={`sm-status-badge ${a.type === "add" ? "sm-status--green" : "sm-status--red"}`}>{a.type === "add" ? "إضافة" : "خصم"}</span></td>
                        <td><strong>{formatCurrency(a.amount)}</strong></td>
                        <td className="text-sm text-muted-foreground">{a.reason || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty title="لا توجد تعديلات يدوية" desc="" compact />}
          </SectionCard>

          <SectionCard title="سجل الإنفاق" icon={<Wallet className="h-5 w-5" />} color="orange" badge={formatCurrency(totalSpent)}>
            {purchases.length > 0 ? (
              <div className="sm-table-wrap">
                <table className="sm-table">
                  <thead><tr><th>التاريخ</th><th>الوصف</th><th>المبلغ</th></tr></thead>
                  <tbody>
                    {purchases.map(p => (
                      <tr key={p.id}>
                        <td>{formatArabicDateTime(p.purchased_at)}</td>
                        <td>دفع اشتراك كورس {p.group_title || ""} {p.subject_name ? `ضمن مادة ${p.subject_name}` : ""}</td>
                        <td><span className="sm-status-badge sm-status--red">{formatCurrency(p.amount_paid || 0)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty title="لا يوجد إنفاق" desc="" compact />}
          </SectionCard>
        </TabsContent>

        {/* Activity / Audit Log */}
        <TabsContent value="activity" className="sm-tab-content">
          <StudentLogsTab studentId={student.id} />
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader><DialogTitle>تعديل بيانات الطالب</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><Label>الاسم</Label><Input value={editForm.full_name} onChange={e => setEditForm(c => ({ ...c, full_name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>الهاتف</Label><Input value={editForm.phone} onChange={e => setEditForm(c => ({ ...c, phone: e.target.value }))} /></div>
            <div className="space-y-2"><Label>المرحلة</Label><Input value={editForm.stage} onChange={e => setEditForm(c => ({ ...c, stage: e.target.value }))} /></div>
            <div className="space-y-2"><Label>الصف</Label><Input value={editForm.grade} onChange={e => setEditForm(c => ({ ...c, grade: e.target.value }))} /></div>
            <div className="space-y-2"><Label>القسم</Label><Input value={editForm.section} onChange={e => setEditForm(c => ({ ...c, section: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={saveEdit} className="w-full sm-action-btn sm-action-btn--blue">حفظ التعديلات</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Wallet Adjustment Dialog */}
      <Dialog open={walletAdjustOpen} onOpenChange={setWalletAdjustOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /> تعديل رصيد المحفظة</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted/50 rounded-lg text-center">
              <p className="text-sm text-muted-foreground">الرصيد الحالي</p>
              <p className="text-xl font-bold sm-text-primary">{formatCurrency(wallet)}</p>
            </div>
            <div className="flex gap-2">
              <Button variant={adjustType === "add" ? "default" : "outline"} onClick={() => setAdjustType("add")} className="flex-1 gap-1">
                <CheckCircle2 className="h-4 w-4" /> إضافة
              </Button>
              <Button variant={adjustType === "subtract" ? "destructive" : "outline"} onClick={() => setAdjustType("subtract")} className="flex-1 gap-1">
                <XCircle className="h-4 w-4" /> خصم
              </Button>
            </div>
            <div className="space-y-2">
              <Label>المبلغ (جنيه)</Label>
              <Input type="number" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} placeholder="أدخل المبلغ" min="1" />
            </div>
            <div className="space-y-2">
              <Label>السبب (اختياري)</Label>
              <Input value={adjustReason} onChange={e => setAdjustReason(e.target.value)} placeholder="مثال: تعويض خطأ في الإيداع" />
            </div>
            {adjustAmount && parseFloat(adjustAmount) > 0 && (
              <div className="p-2 bg-muted/30 rounded text-sm text-center">
                الرصيد بعد التعديل: <strong className={adjustType === "add" ? "sm-text-success" : "sm-text-danger"}>
                  {formatCurrency(wallet + (adjustType === "add" ? parseFloat(adjustAmount) : -parseFloat(adjustAmount)))}
                </strong>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleWalletAdjust} disabled={adjustLoading} className={`w-full ${adjustType === "add" ? "sm-action-btn sm-action-btn--green" : "sm-action-btn sm-action-btn--red"}`}>
              {adjustLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {adjustType === "add" ? "إضافة المبلغ" : "خصم المبلغ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════ */
/*  SHARED UI COMPONENTS                                           */
/* ═══════════════════════════════════════════════════════════════ */

const SectionCard = ({ title, icon, color, badge, children }: { title: string; icon: React.ReactNode; color: string; badge?: string; children: React.ReactNode }) => (
  <div className={`sm-section-card sm-section-card--${color}`}>
    <div className="sm-section-head">
      <div className="flex items-center gap-2">{icon}<h3 className="font-bold text-lg">{title}</h3></div>
      {badge && <span className="sm-section-badge">{badge}</span>}
    </div>
    <div className="sm-section-body">{children}</div>
  </div>
);

const StudentCard = ({ student, onOpen }: { student: StudentProfile; onOpen: () => void }) => {
  const stageLabel = student.stage === "preparatory" ? "إعدادي" : student.stage === "secondary" ? "ثانوي" : student.stage || "-";
  const gradeLabel = student.grade === "first" ? "الأول" : student.grade === "second" ? "الثاني" : student.grade === "third" ? "الثالث" : student.grade || "-";
  return (
    <button onClick={onOpen} className="sm-student-card">
      <div className="sm-student-card-top">
        <div className="sm-student-avatar">{student.avatar_url ? <img src={student.avatar_url} alt="" className="h-full w-full rounded-full object-cover" /> : <User className="h-6 w-6 text-white" />}</div>
        <div className="flex-1 text-right">
          <h3 className="text-lg font-bold">{student.full_name}</h3>
          <div className="flex flex-wrap gap-1.5 mt-1">
            <span className="sm-badge sm-badge--blue"><Hash className="h-3 w-3" /> {student.student_code || "-"}</span>
            <span className="sm-badge sm-badge--gray">{stageLabel} · الصف {gradeLabel}</span>
            <span className={`sm-badge ${educationBadgeClass(student.education_type)}`}>{educationBadgeLabel(student.education_type)}</span>
            <span className={`sm-badge ${student.is_banned ? "sm-badge--red" : "sm-badge--green"}`}>{student.is_banned ? "محظور" : "نشط"}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{student.email}</p>
        </div>
      </div>
      <div className="sm-student-card-bottom">
        <span className="text-xs text-muted-foreground"><Calendar className="h-3 w-3 inline ml-1" />{formatArabicDate(student.created_at)}</span>
        <span className="sm-badge sm-badge--blue"><Eye className="h-3 w-3" /> عرض التفاصيل</span>
      </div>
    </button>
  );
};

const StudentRow = ({ student, isPaid, onOpen }: { student: StudentProfile; isPaid: boolean; onOpen: () => void }) => {
  const stageLabel = student.stage === "preparatory" ? "إعدادي" : student.stage === "secondary" ? "ثانوي" : student.stage || "-";
  const gradeLabel = student.grade === "first" ? "الأول" : student.grade === "second" ? "الثاني" : student.grade === "third" ? "الثالث" : student.grade || "-";
  return (
    <button onClick={onOpen} className="sm-row">
      <div className="flex items-center gap-3">
        <div className="sm-row-avatar">{student.avatar_url ? <img src={student.avatar_url} alt="" className="h-full w-full rounded-full object-cover" /> : <User className="h-5 w-5 sm-text-primary" />}</div>
        <div className="min-w-0 flex-1 text-right">
          <p className="font-bold truncate">{student.full_name}</p>
          <p className="text-xs text-muted-foreground">{stageLabel} · الصف {gradeLabel} · {sectionDisplayLabel(student.section)} · {formatArabicDate(student.created_at)}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="sm-badge sm-badge--blue">#{student.student_code || "-"}</span>
        <span className={`sm-badge ${educationBadgeClass(student.education_type)}`}>{educationBadgeLabel(student.education_type)}</span>
        {isPaid && <span className="sm-badge sm-badge--green">مشترك</span>}
        {student.is_banned && <span className="sm-badge sm-badge--red">محظور</span>}
        <span className="sm-badge sm-badge--gray"><Eye className="h-3.5 w-3.5" /></span>
      </div>
    </button>
  );
};

const Empty = ({ title, desc, compact = false }: { title: string; desc: string; compact?: boolean }) => (
  <div className={`sm-empty ${compact ? "sm-empty--compact" : ""}`}>
    <p className="font-bold">{title}</p>
    {desc && <p className="text-sm text-muted-foreground">{desc}</p>}
  </div>
);

const LoadingSkeleton = ({ count, height = "h-20" }: { count: number; height?: string }) => (
  <div className="space-y-3">{Array.from({ length: count }).map((_, i) => <Skeleton key={i} className={`${height} rounded-2xl`} />)}</div>
);

export default AdminStudentManagement;

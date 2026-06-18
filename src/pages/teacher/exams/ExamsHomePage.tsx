import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Edit3,
  Eye,
  FileText,
  MoreVertical,
  Plus,
  Send,
  Settings,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import aiBot from "@/assets/ai-bot-mascot.png";
import { useDeleteExam, usePublishExam, useUpdateExam } from "@/hooks/useExamMutations";
import { useTeacherExamDashboardStats, useTeacherExams } from "@/hooks/useExams";
import { gradeKeyFromArabicLabel, stageKeyFromValue, subjectFilterFromTeacherSelection } from "@/lib/teacherSubjectUtils";

const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleDateString("ar-EG-u-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" }) : "—";
const gradeLabel = (grade?: string | null, stage?: string | null) => {
  if (!grade) return "—";
  const stageName = stage === "preparatory" ? "الإعدادي" : stage === "secondary" ? "الثانوي" : "";
  if (grade === "first" || grade === "1") return `الصف الأول ${stageName}`.trim();
  if (grade === "second" || grade === "2") return `الصف الثاني ${stageName}`.trim();
  if (grade === "third" || grade === "3") return `الصف الثالث ${stageName}`.trim();
  return grade;
};

const statusMeta: Record<string, { label: string; className: string }> = {
  published: { label: "منشور", className: "tx-status tx-status--published" },
  draft: { label: "مسودة", className: "tx-status tx-status--draft" },
  archived: { label: "مغلق", className: "tx-status tx-status--closed" },
};

export default function ExamsHomePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const subjectId = params.get("subject_id") || params.get("subjectId") || "";
  const groupId = params.get("group_id") || params.get("groupId") || "";
  const term = params.get("term") || "";
  const subjectFilter = subjectFilterFromTeacherSelection(params.get("category") || "");
  const gradeFilter = gradeKeyFromArabicLabel(params.get("grade") || "");
  const stageFilter = stageKeyFromValue(params.get("stage") || "");
  const { data: exams = [], isLoading } = useTeacherExams({ subjectId, groupId, term });
  const { data: attemptStats } = useTeacherExamDashboardStats({ subjectId, groupId, term });
  const updateExam = useUpdateExam();
  const publishExam = usePublishExam();
  const deleteExam = useDeleteExam();
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [activePanel, setActivePanel] = useState<"recent" | "stats">("recent");

  const creationParams = new URLSearchParams();
  if (subjectId) creationParams.set("subject_id", subjectId);
  if (groupId) creationParams.set("group_id", groupId);
  if (term) creationParams.set("term", term);
  const creationQuery = creationParams.toString();

  const scopedExams = useMemo(() => exams.filter((exam: any) => {
    if (subjectId && exam.subject_id !== subjectId) return false;
    if (groupId && exam.group_id !== groupId) return false;
    if (!groupId && term && exam.term && exam.term !== term) return false;
    if (!subjectId && subjectFilter?.categoryKey && exam.subjects?.category !== subjectFilter.categoryKey) return false;
    if (!subjectId && subjectFilter?.subjectName && exam.subjects?.name !== subjectFilter.subjectName) return false;
    if (!subjectId && gradeFilter && exam.subjects?.grade !== gradeFilter) return false;
    if (!subjectId && stageFilter && exam.subjects?.stage !== stageFilter) return false;
    return true;
  }), [exams, subjectId, groupId, term, subjectFilter?.categoryKey, subjectFilter?.subjectName, gradeFilter, stageFilter]);

  const stats = {
    total: scopedExams.length,
    published: scopedExams.filter((e: any) => e.status === "published" || e.is_published).length,
    students: subjectId || groupId || term ? attemptStats?.students || 0 : scopedExams.reduce((sum: number, exam: any) => sum + Number(exam.actual_students_count || 0), 0),
    average: subjectId || groupId || term ? attemptStats?.average || 0 : scopedExams.length ? Math.round(scopedExams.reduce((sum: number, exam: any) => sum + Number(exam.average_percentage || 0), 0) / scopedExams.length) : 0,
    highest: subjectId || groupId || term ? attemptStats?.highest || 0 : Math.max(0, ...scopedExams.map((exam: any) => Number(exam.highest_percentage || 0))),
    successRate: subjectId || groupId || term ? attemptStats?.successRate || 0 : (() => {
      const attempts = scopedExams.reduce((sum: number, exam: any) => sum + Number(exam.actual_attempts_count || 0), 0);
      const passed = scopedExams.reduce((sum: number, exam: any) => sum + Number(exam.actual_passed_count || 0), 0);
      return attempts ? Math.round((passed / attempts) * 100) : 0;
    })(),
  };

  const statCards = [
    { icon: FileText, label: "إجمالي الامتحانات", value: stats.total, tone: "violet" },
    { icon: Send, label: "امتحانات منشورة", value: stats.published, tone: "mint" },
    { icon: Users, label: "طلاب أدوا الامتحانات", value: stats.students, tone: "orange" },
    { icon: BarChart3, label: "متوسط الدرجة", value: `${stats.average}%`, tone: "blue" },
    { icon: Star, label: "أعلى درجة", value: `${stats.highest}%`, tone: "pink" },
    { icon: CheckCircle2, label: "نسبة النجاح", value: `${stats.successRate}%`, tone: "emerald" },
  ];

  const openCreate = () => {
    if (!groupId) {
      toast.error("افتح الامتحانات من داخل المجموعة المحددة أولاً");
      return;
    }
    navigate(`/teacher/exams/new${creationQuery ? `?${creationQuery}` : ""}`);
  };

  const setStatus = async (exam: any, publish: boolean) => {
    try {
      if (publish && !exam.group_id) throw new Error("لا يمكن نشر امتحان غير مرتبط بالمجموعة المحددة");
      if (publish) {
        await publishExam.mutateAsync(exam.id);
      } else {
        await updateExam.mutateAsync({ id: exam.id, patch: { status: "draft", is_published: false } });
      }
      toast.success(publish ? "تم نشر الامتحان" : "تم إيقاف نشر الامتحان");
    } catch (error: any) {
      toast.error(error?.message || "تعذر تحديث الامتحان");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteExam.mutateAsync(deleteTarget.id);
      toast.success("تم حذف الامتحان");
      setDeleteTarget(null);
    } catch (error: any) {
      toast.error(error?.message || "تعذر حذف الامتحان");
    }
  };

  return (
    <div dir="rtl" className="teacher-exam-home min-h-screen overflow-x-hidden">
      <header className="tx-topbar">
        <div className="tx-topbar-inner">
          <button type="button" className="tx-settings-btn" aria-label="الإعدادات">
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="tx-main">
        <section className="tx-title-block">
          <h1>إنشاء امتحان جديد</h1>
          <p>اختر الطريقة التي تناسبك لإنشاء امتحان احترافي، بسهولة وذكاء</p>
        </section>

        <section className="tx-hero-panel">
          <div className="tx-hero-grid">
            <img src={aiBot} alt="المساعد الذكي للامتحانات" className="tx-hero-bot" />
            <div className="tx-hero-copy">
              <h2>أنشئ امتحانات احترافية في دقائق!</h2>
              <p>
                اختر "إنشاء امتحان جديد" للبدء في رحلة إنشاء امتحان متكامل باستخدام المساعد الذكي أو الإنشاء اليدوي.
              </p>
            </div>
            <div className="tx-hero-actions">
              <Button onClick={openCreate} className="tx-primary-btn">
                <Plus className="ml-2 h-5 w-5" /> إنشاء امتحان جديد
              </Button>
              <Button variant="outline" onClick={() => setActivePanel(activePanel === "stats" ? "recent" : "stats")} className="tx-outline-btn">
                <BarChart3 className="ml-2 h-5 w-5" /> إحصائيات الامتحان
              </Button>
            </div>
          </div>
        </section>

        <div className="tx-content-grid">
          <Card className={`tx-recent-card ${activePanel === "stats" ? "tx-panel-hidden-mobile" : ""}`}>
            <div className="tx-card-head">
              <button type="button" onClick={() => setActivePanel("recent")} className="tx-all-link">عرض جميع الامتحانات</button>
              <h2>الامتحانات الأخيرة</h2>
            </div>

            <div className="tx-table-wrap">
              <table className="tx-exam-table">
                <thead>
                  <tr>
                    <th className="py-3">الامتحان</th>
                    <th className="py-3">المادة</th>
                    <th className="py-3">الصف</th>
                    <th className="py-3">تاريخ الإنشاء</th>
                    <th className="py-3">الحالة</th>
                    <th className="py-3 text-left">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? <tr><td colSpan={6} className="tx-loading-cell">جاري تحميل بيانات الامتحانات...</td></tr> : null}
                  {!isLoading && scopedExams.map((exam: any) => <ExamTableRow key={exam.id} exam={exam} onSetStatus={setStatus} onDelete={() => setDeleteTarget(exam)} />)}
                  {!isLoading && scopedExams.length === 0 ? <EmptyTableRow onCreate={openCreate} /> : null}
                </tbody>
              </table>
            </div>

            <div className="tx-mobile-list">
              {isLoading ? <p className="tx-loading-cell">جاري تحميل بيانات الامتحانات...</p> : null}
              {!isLoading && scopedExams.map((exam: any) => <ExamMobileCard key={exam.id} exam={exam} onSetStatus={setStatus} onDelete={() => setDeleteTarget(exam)} />)}
              {!isLoading && scopedExams.length === 0 ? <EmptyMobile onCreate={openCreate} /> : null}
            </div>
          </Card>

          <Card className={`tx-stats-card ${activePanel === "recent" ? "tx-panel-hidden-mobile" : ""}`}>
            <div className="tx-card-head">
              <BarChart3 className="tx-head-icon" />
              <h2>إحصائيات سريعة</h2>
            </div>
            <div className="tx-stats-grid">
              {statCards.map((stat) => (
                <div key={stat.label} className="tx-stat-tile">
                  <div className="tx-stat-inner">
                    <div className="min-w-0">
                      <p>{stat.label}</p>
                      <strong>{stat.value}</strong>
                    </div>
                    <span className={`tx-stat-icon tx-stat-icon--${stat.tone}`}><stat.icon className="h-5 w-5" /></span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </main>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الامتحان؟</AlertDialogTitle>
            <AlertDialogDescription>سيتم حذف الامتحان وأسئلته نهائياً، ولا يمكن التراجع عن هذه العملية.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ExamTableRow({ exam, onSetStatus, onDelete }: { exam: any; onSetStatus: (exam: any, publish: boolean) => void; onDelete: () => void }) {
  const navigate = useNavigate();
  const status = statusMeta[exam.status] || statusMeta.draft;
  const scheduled = exam.start_at && new Date(exam.start_at).getTime() > Date.now();
  return (
    <tr>
      <td className="tx-exam-title-cell">{exam.title}</td>
      <td>{exam.subjects?.name || "—"}</td>
      <td>{gradeLabel(exam.subjects?.grade, exam.subjects?.stage)}</td>
      <td>{fmtDate(exam.created_at)}</td>
      <td><Badge className={scheduled ? "tx-status tx-status--scheduled" : status.className}>{scheduled ? "مجدول" : status.label}</Badge></td>
      <td className="py-3">
        <div className="tx-actions-row">
          <IconAction label="معاينة" onClick={() => navigate(`/teacher/exams/${exam.id}/preview`)}><Eye className="h-4 w-4" /></IconAction>
          <IconAction label="تعديل" onClick={() => navigate(`/teacher/exams/${exam.id}/edit`)}><Edit3 className="h-4 w-4" /></IconAction>
          <IconAction label="تحليل" onClick={() => navigate(`/teacher/exams/${exam.id}/analytics`)}><BarChart3 className="h-4 w-4" /></IconAction>
          <ExamActions exam={exam} onSetStatus={onSetStatus} onDelete={onDelete} />
        </div>
      </td>
    </tr>
  );
}

function ExamMobileCard({ exam, onSetStatus, onDelete }: { exam: any; onSetStatus: (exam: any, publish: boolean) => void; onDelete: () => void }) {
  const navigate = useNavigate();
  const status = statusMeta[exam.status] || statusMeta.draft;
  const scheduled = exam.start_at && new Date(exam.start_at).getTime() > Date.now();
  return (
    <div className="tx-exam-mobile-card">
      <div className="tx-mobile-card-head">
        <div className="min-w-0 flex-1">
          <h3>{exam.title}</h3>
          <p>{exam.subjects?.name || "—"} · {gradeLabel(exam.subjects?.grade, exam.subjects?.stage)}</p>
        </div>
        <Badge className={scheduled ? "tx-status tx-status--scheduled" : status.className}>{scheduled ? "مجدول" : status.label}</Badge>
      </div>
      <div className="tx-mobile-meta">
        <span><CalendarDays className="h-3.5 w-3.5" />{fmtDate(exam.created_at)}</span>
        <span><Clock3 className="h-3.5 w-3.5" />{exam.duration_minutes || 0} دقيقة</span>
        <span><Users className="h-3.5 w-3.5" />{exam.actual_students_count || 0} طالب</span>
      </div>
      <div className="tx-actions-row tx-actions-row--mobile">
        <ExamActions exam={exam} onSetStatus={onSetStatus} onDelete={onDelete} />
        <IconAction label="معاينة" onClick={() => navigate(`/teacher/exams/${exam.id}/preview`)}><Eye className="h-4 w-4" /></IconAction>
        <IconAction label="تعديل" onClick={() => navigate(`/teacher/exams/${exam.id}/edit`)}><Edit3 className="h-4 w-4" /></IconAction>
        <IconAction label="تحليل" onClick={() => navigate(`/teacher/exams/${exam.id}/analytics`)}><BarChart3 className="h-4 w-4" /></IconAction>
      </div>
    </div>
  );
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} onClick={onClick} className="tx-icon-action">{children}</button>;
}

function ExamActions({ exam, onSetStatus, onDelete }: { exam: any; onSetStatus: (exam: any, publish: boolean) => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="tx-icon-action"><MoreVertical className="h-4 w-4" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="text-right">
        <DropdownMenuItem onClick={() => onSetStatus(exam, !exam.is_published)}>{exam.is_published ? "إيقاف النشر" : "نشر الامتحان"}</DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive"><Trash2 className="ml-2 h-4 w-4" />حذف الامتحان</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EmptyTableRow({ onCreate }: { onCreate: () => void }) {
  return (
    <tr>
      <td colSpan={6} className="tx-empty-cell">
        <FileText className="mx-auto mb-3 h-12 w-12" />
        <p>لا توجد امتحانات بعد</p>
        <Button onClick={onCreate} className="tx-primary-btn tx-empty-btn"><Plus className="ml-2 h-4 w-4" />أنشئ أول امتحان</Button>
      </td>
    </tr>
  );
}

function EmptyMobile({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="tx-empty-mobile">
      <FileText className="mx-auto mb-3 h-12 w-12" />
      <p>لا توجد امتحانات بعد</p>
      <Button onClick={onCreate} className="tx-primary-btn tx-empty-btn"><Plus className="ml-2 h-4 w-4" />أنشئ أول امتحان</Button>
    </div>
  );
}
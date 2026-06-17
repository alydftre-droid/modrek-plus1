import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BarChart3,
  CheckCircle2,
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
import { useDeleteExam, useUpdateExam } from "@/hooks/useExamMutations";
import { useTeacherExamDashboardStats, useTeacherExams } from "@/hooks/useExams";

const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleDateString("ar-EG-u-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" }) : "—";

const statusMeta: Record<string, { label: string; className: string }> = {
  published: { label: "منشور", className: "bg-[#DFF8EA] text-[#16A34A]" },
  draft: { label: "مسودة", className: "bg-[#EAF3FF] text-[#2563EB]" },
  archived: { label: "مغلق", className: "bg-[#FFF3D8] text-[#D97706]" },
};

export default function ExamsHomePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: exams = [], isLoading } = useTeacherExams();
  const { data: attemptStats } = useTeacherExamDashboardStats();
  const updateExam = useUpdateExam();
  const deleteExam = useDeleteExam();
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const subjectId = params.get("subject_id") || "";
  const groupId = params.get("group_id") || "";
  const term = params.get("term") || "";
  const creationQuery = params.toString();

  const scopedExams = useMemo(() => exams.filter((exam: any) => {
    if (subjectId && exam.subject_id !== subjectId) return false;
    if (groupId && exam.group_id !== groupId) return false;
    if (term && exam.term && exam.term !== term) return false;
    return true;
  }), [exams, subjectId, groupId, term]);

  const stats = {
    total: scopedExams.length,
    published: scopedExams.filter((e: any) => e.status === "published" || e.is_published).length,
    students: attemptStats?.students || 0,
    average: attemptStats?.average || 0,
    highest: attemptStats?.highest || 0,
    successRate: attemptStats?.successRate || 0,
  };

  const statCards = [
    { icon: FileText, label: "إجمالي الامتحانات", value: stats.total, color: "#7C3AED" },
    { icon: Send, label: "امتحانات منشورة", value: stats.published, color: "#22C55E" },
    { icon: Users, label: "طلاب أدوا الامتحانات", value: stats.students, color: "#F97316" },
    { icon: BarChart3, label: "متوسط الدرجة", value: `${stats.average}%`, color: "#2563EB" },
    { icon: Star, label: "أعلى درجة", value: `${stats.highest}%`, color: "#EC4899" },
    { icon: CheckCircle2, label: "نسبة النجاح", value: `${stats.successRate}%`, color: "#10B981" },
  ];

  const openCreate = () => navigate(`/teacher/exams/new${creationQuery ? `?${creationQuery}` : ""}`);

  const setStatus = async (exam: any, publish: boolean) => {
    try {
      await updateExam.mutateAsync({ id: exam.id, patch: { status: publish ? "published" : "draft", is_published: publish } });
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
    <div dir="rtl" className="min-h-screen bg-[#FBFCFF] text-[#0F172A]">
      <header className="border-b border-[#E8EDF6] bg-white/95">
        <div className="mx-auto flex max-w-[1420px] items-center justify-between px-4 py-4 md:px-8">
          <div className="text-right">
            <p className="text-[13px] font-semibold text-[#64748B]">مرحباً أ. محمد 👋</p>
            <p className="text-[12px] text-[#94A3B8]">ماذا تريد أن تنشئ اليوم؟</p>
          </div>
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#DDE5F2] bg-white text-[#64748B] shadow-sm" aria-label="الإعدادات">
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1420px] space-y-5 px-4 py-5 md:px-8 md:py-7">
        <section className="text-center">
          <h1 className="text-[26px] font-extrabold leading-tight text-[#0F172A] md:text-3xl">إنشاء امتحان جديد</h1>
          <p className="mt-2 text-[13px] font-medium text-[#64748B] md:text-sm">اختر الطريقة التي تناسبك لإنشاء امتحان احترافي، بسهولة وذكاء</p>
        </section>

        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-[18px] border border-[#D8CCFF] bg-[linear-gradient(135deg,#FFFFFF_0%,#FCFAFF_45%,#F7F1FF_100%)] px-4 py-5 shadow-[0_18px_60px_rgba(124,58,237,0.08)] md:px-12 md:py-8">
          <div className="grid items-center gap-5 md:grid-cols-[300px_1fr_360px]">
            <img src={aiBot} alt="المساعد الذكي للامتحانات" className="mx-auto h-28 w-28 object-contain md:h-36 md:w-36" />
            <div className="text-center md:text-right">
              <h2 className="text-[20px] font-extrabold text-[#6D4AFF] md:text-2xl">أنشئ امتحانات احترافية في دقائق!</h2>
              <p className="mx-auto mt-3 max-w-xl text-[14px] font-medium leading-8 text-[#475569] md:mx-0 md:text-[15px]">
                اختر "إنشاء امتحان جديد" للبدء في رحلة إنشاء امتحان متكامل باستخدام المساعد الذكي أو الإنشاء اليدوي.
              </p>
            </div>
            <Button onClick={openCreate} className="h-14 rounded-xl bg-[linear-gradient(135deg,#7C3AED_0%,#5B2EEB_100%)] text-[15px] font-bold text-white shadow-[0_14px_30px_rgba(109,74,255,0.24)] hover:opacity-95">
              <Plus className="ml-2 h-5 w-5" /> إنشاء امتحان جديد
            </Button>
          </div>
        </motion.section>

        <div className="grid gap-4 xl:grid-cols-[1fr_520px]">
          <Card className="rounded-[14px] border-[#E4EAF4] bg-white p-4 shadow-[0_12px_45px_rgba(15,23,42,0.04)]">
            <div className="mb-4 flex items-center justify-between">
              <button type="button" onClick={() => navigate("/teacher/exams")} className="text-[13px] font-bold text-[#2563EB]">عرض جميع الامتحانات</button>
              <h2 className="text-[17px] font-extrabold text-[#0F172A]">الامتحانات الأخيرة</h2>
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-right text-sm">
                <thead className="border-b border-[#EEF2F7] text-[12px] font-bold text-[#64748B]">
                  <tr>
                    <th className="py-3">الامتحان</th>
                    <th className="py-3">المادة</th>
                    <th className="py-3">الصف</th>
                    <th className="py-3">تاريخ الإنشاء</th>
                    <th className="py-3">الحالة</th>
                    <th className="py-3 text-left">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF2F7]">
                  {isLoading ? Array.from({ length: 4 }).map((_, i) => <tr key={i}><td colSpan={6} className="py-4 text-[#94A3B8]">جاري التحميل...</td></tr>) : null}
                  {!isLoading && scopedExams.slice(0, 5).map((exam: any) => <ExamTableRow key={exam.id} exam={exam} onSetStatus={setStatus} onDelete={() => setDeleteTarget(exam)} />)}
                  {!isLoading && scopedExams.length === 0 ? <EmptyTableRow onCreate={openCreate} /> : null}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {isLoading ? <p className="py-8 text-center text-sm text-[#94A3B8]">جاري التحميل...</p> : null}
              {!isLoading && scopedExams.slice(0, 5).map((exam: any) => <ExamMobileCard key={exam.id} exam={exam} onSetStatus={setStatus} onDelete={() => setDeleteTarget(exam)} />)}
              {!isLoading && scopedExams.length === 0 ? <EmptyMobile onCreate={openCreate} /> : null}
            </div>
          </Card>

          <Card className="rounded-[14px] border-[#E4EAF4] bg-white p-4 shadow-[0_12px_45px_rgba(15,23,42,0.04)]">
            <div className="mb-4 flex items-center justify-between">
              <BarChart3 className="h-5 w-5 text-[#2563EB]" />
              <h2 className="text-[17px] font-extrabold text-[#0F172A]">إحصائيات سريعة</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {statCards.map((stat) => (
                <div key={stat.label} className="rounded-[10px] border border-[#E4EAF4] bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[12px] font-semibold text-[#64748B]">{stat.label}</p>
                      <p className="mt-1 text-2xl font-extrabold text-[#0F172A]">{stat.value}</p>
                    </div>
                    <stat.icon className="h-8 w-8" style={{ color: stat.color }} />
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
    <tr className="text-[13px] text-[#334155]">
      <td className="py-3 font-extrabold text-[#0F172A]">{exam.title}</td>
      <td className="py-3">{exam.subjects?.name || "—"}</td>
      <td className="py-3">{exam.subjects?.grade || "—"}</td>
      <td className="py-3">{fmtDate(exam.created_at)}</td>
      <td className="py-3"><Badge className={`border-0 ${scheduled ? "bg-[#EFEAFF] text-[#6D4AFF]" : status.className}`}>{scheduled ? "مجدول" : status.label}</Badge></td>
      <td className="py-3">
        <div className="flex items-center justify-end gap-2">
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
  return (
    <div className="rounded-2xl border border-[#E4EAF4] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[16px] font-extrabold text-[#0F172A]">{exam.title}</h3>
          <p className="mt-1 text-[12px] text-[#64748B]">{exam.subjects?.name || "—"} · {fmtDate(exam.created_at)}</p>
        </div>
        <Badge className={`shrink-0 border-0 ${status.className}`}>{status.label}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => navigate(`/teacher/exams/${exam.id}/edit`)}>تعديل</Button>
        <Button size="sm" variant="outline" onClick={() => navigate(`/teacher/exams/${exam.id}/attempts`)}>النتائج</Button>
        <Button size="sm" variant="outline" onClick={() => onSetStatus(exam, !exam.is_published)}>{exam.is_published ? "إيقاف" : "نشر"}</Button>
        <Button size="sm" variant="outline" onClick={onDelete}>حذف</Button>
      </div>
    </div>
  );
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} onClick={onClick} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E4EAF4] bg-white text-[#334155] hover:bg-[#F8FAFC]">{children}</button>;
}

function ExamActions({ exam, onSetStatus, onDelete }: { exam: any; onSetStatus: (exam: any, publish: boolean) => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E4EAF4] bg-white text-[#334155]"><MoreVertical className="h-4 w-4" /></button>
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
      <td colSpan={6} className="py-14 text-center">
        <FileText className="mx-auto mb-3 h-12 w-12 text-[#CBD5E1]" />
        <p className="text-sm font-semibold text-[#64748B]">لا توجد امتحانات بعد</p>
        <Button onClick={onCreate} className="mt-4 bg-[#6D4AFF] text-white hover:bg-[#5B3BE8]"><Plus className="ml-2 h-4 w-4" />أنشئ أول امتحان</Button>
      </td>
    </tr>
  );
}

function EmptyMobile({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#E4EAF4] p-8 text-center">
      <FileText className="mx-auto mb-3 h-12 w-12 text-[#CBD5E1]" />
      <p className="text-sm font-semibold text-[#64748B]">لا توجد امتحانات بعد</p>
      <Button onClick={onCreate} className="mt-4 bg-[#6D4AFF] text-white hover:bg-[#5B3BE8]"><Plus className="ml-2 h-4 w-4" />أنشئ أول امتحان</Button>
    </div>
  );
}
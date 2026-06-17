import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTeacherExams } from "@/hooks/useExams";
import { useNavigate } from "react-router-dom";
import { BarChart3, ClipboardList, Eye, FileQuestion, Plus, Send, Trophy, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  subjectId: string;
  subjectName?: string;
  groupId?: string;
  currentTerm?: string;
}

/**
 * Lightweight in-tab teacher panel. Full editor lives at /teacher/exams.
 */
export default function TeacherExamPanel({ subjectId, groupId, currentTerm }: Props) {
  const navigate = useNavigate();
  const { data: exams = [], isLoading } = useTeacherExams();

  const filtered = exams.filter((e: any) => {
    if (e.subject_id !== subjectId) return false;
    if (groupId && e.group_id !== groupId) return false;
    if (currentTerm && e.term && e.term !== currentTerm) return false;
    return true;
  });

  const createNew = () => {
    const params = new URLSearchParams({ subject_id: subjectId });
    if (groupId) params.set("group_id", groupId);
    if (currentTerm) params.set("term", currentTerm);
    navigate(`/teacher/exams/new?${params.toString()}`);
  };

  const homePath = () => {
    const params = new URLSearchParams({ subject_id: subjectId });
    if (groupId) params.set("group_id", groupId);
    if (currentTerm) params.set("term", currentTerm);
    return `/teacher/exams?${params.toString()}`;
  };

  const publishedCount = filtered.filter((exam: any) => exam.is_published || exam.status === "published").length;
  const attemptsCount = filtered.reduce((sum: number, exam: any) => sum + Number(exam.actual_attempts_count ?? exam.total_attempts_count ?? 0), 0);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-[18px] bg-[#F1F0EC] p-2 shadow-inner">
        <div className="grid grid-cols-4 items-center gap-1 text-[#587268]">
          <StatPill icon={FileQuestion} value={filtered.length} active />
          <StatPill icon={Send} value={publishedCount} />
          <StatPill icon={Users} value={attemptsCount} />
          <StatPill icon={BarChart3} value={filtered.length ? Math.round(filtered.reduce((sum: number, exam: any) => sum + Number(exam.average_percentage || 0), 0) / filtered.length) : 0} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <h3 className="shrink-0 text-[22px] font-extrabold text-[#12362D] md:text-2xl">امتحاناتي ({filtered.length})</h3>
        <div className="flex min-w-0 items-center gap-2">
          <Button type="button" onClick={createNew} className="h-11 rounded-[14px] bg-[#14815F] px-4 text-[14px] font-extrabold text-white shadow-[0_12px_22px_rgba(20,129,95,0.20)] hover:bg-[#116B50] md:px-5 md:text-base">
            <Plus className="ml-1.5 h-5 w-5" /> امتحان جديد
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(homePath())} className="h-11 rounded-[14px] border-2 border-[#14815F] bg-white px-3 text-[14px] font-extrabold text-[#14815F] hover:bg-[#EAF5F0] md:px-5 md:text-base">
            كل الامتحانات
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-[18px]" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="rounded-[18px] border border-dashed border-[#D8DDD8] bg-white/80 p-8 text-center shadow-[0_14px_34px_rgba(18,54,45,0.05)]">
          <ClipboardList className="mx-auto mb-4 h-16 w-16 text-[#587268]" />
          <p className="mb-5 text-[18px] font-medium text-[#587268]">لا توجد امتحانات بعد</p>
          <Button onClick={createNew} className="h-12 rounded-[14px] bg-[#14815F] px-7 text-base font-extrabold text-white shadow-[0_16px_28px_rgba(20,129,95,0.22)] hover:bg-[#116B50]">
            <Plus className="ml-2 h-5 w-5" /> أنشئ أول امتحان
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((exam: any) => (
            <Card key={exam.id} className="rounded-[18px] border-[#E4E7E2] bg-white p-4 shadow-[0_12px_30px_rgba(18,54,45,0.05)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge className={`rounded-full border-0 px-3 py-1 text-[11px] font-bold ${exam.is_published ? "bg-[#DFF5EA] text-[#14815F]" : "bg-[#F2F0EA] text-[#587268]"}`}>
                      {exam.is_published ? "منشور" : "مسودة"}
                    </Badge>
                    {Number(exam.highest_percentage || 0) > 0 && <Badge variant="outline" className="gap-1 rounded-full border-[#D8DDD8] text-[#587268]"><Trophy className="h-3 w-3" /> أعلى {exam.highest_percentage}%</Badge>}
                  </div>
                  <h4 className="truncate text-[17px] font-extrabold text-[#12362D]">{exam.title}</h4>
                  <p className="mt-1 text-xs font-medium text-[#587268]">{exam.duration_minutes} دقيقة · {Number(exam.actual_attempts_count ?? exam.total_attempts_count ?? 0)} محاولة · متوسط {Number(exam.average_percentage || 0)}%</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button size="icon" variant="outline" onClick={() => navigate(`/teacher/exams/${exam.id}/preview`)} className="h-9 w-9 rounded-xl border-[#D8DDD8] text-[#14815F]" aria-label="معاينة"><Eye className="h-4 w-4" /></Button>
                  <Button size="icon" variant="outline" onClick={() => navigate(`/teacher/exams/${exam.id}/attempts`)} className="h-9 w-9 rounded-xl border-[#D8DDD8] text-[#14815F]" aria-label="النتائج"><Users className="h-4 w-4" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatPill({ icon: Icon, value, active = false }: { icon: any; value: number; active?: boolean }) {
  return (
    <div className={`flex h-12 items-center justify-center gap-2 rounded-[14px] text-sm font-extrabold ${active ? "bg-white text-[#12362D] shadow-[0_8px_18px_rgba(18,54,45,0.07)]" : "text-[#587268]"}`}>
      <Icon className="h-4 w-4" />
      <span>{value}</span>
    </div>
  );
}

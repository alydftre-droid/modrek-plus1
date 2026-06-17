import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStudentExamCatalog } from "@/hooks/useExams";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Clock, ArrowLeft, Lock, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  subjectId: string;
  subjectName?: string;
  groupId?: string;
  isSubscribed?: boolean;
  currentTerm?: string;
}

/**
 * Lightweight in-tab listing of exams scoped to a subject/group.
 * Full experience lives at /student/exams.
 */
export default function StudentExamPanel({ subjectId, groupId, isSubscribed = true, currentTerm }: Props) {
  const navigate = useNavigate();
  const { data: catalog, isLoading } = useStudentExamCatalog();
  const exams = catalog?.exams || [];
  const attempts = catalog?.attempts || [];
  const attemptByExam = new Map(attempts.map((attempt: any) => [attempt.exam_id, attempt]));

  const filtered = exams.filter((e: any) => {
    if (e.subject_id !== subjectId) return false;
    if (groupId && e.group_id !== groupId) return false;
    if (currentTerm && e.term && e.term !== currentTerm) return false;
    return true;
  });

  if (!isSubscribed) {
    return (
      <Card className="text-center p-8 border-dashed">
        <Lock className="h-12 w-12 mx-auto text-[#6D4AFF] mb-3" />
        <p className="text-[#6B6B7B]">يجب الاشتراك في المجموعة لرؤية الامتحانات</p>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <Card className="text-center p-8 border-dashed">
        <ClipboardList className="h-12 w-12 mx-auto text-[#6D4AFF] mb-3" />
        <p className="text-[#6B6B7B]">لا توجد امتحانات متاحة حالياً</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-[#1A1A2E]">الامتحانات المتاحة ({filtered.length})</h3>
        <Button variant="ghost" size="sm" className="text-[#6D4AFF]" onClick={() => navigate("/student/exams")}>
          عرض الكل <ArrowLeft className="h-4 w-4 mr-1" />
        </Button>
      </div>
      {filtered.map((exam: any) => {
        const now = Date.now();
        const startsAt = exam.start_at ? new Date(exam.start_at).getTime() : null;
        const endsAt = exam.end_at ? new Date(exam.end_at).getTime() : null;
        const isUpcoming = startsAt && now < startsAt;
        const myAttempt: any = attemptByExam.get(exam.id);
        const isEnded = (endsAt && now > endsAt) || (myAttempt && myAttempt.status !== "in_progress");
        const isAvailable = !isUpcoming && !isEnded;
        return (
          <Card key={exam.id} className="cursor-pointer overflow-hidden rounded-[20px] border-[#EFEDF7] bg-white shadow-[0_2px_16px_rgba(109,74,255,0.06)] transition hover:shadow-[0_10px_26px_rgba(109,74,255,0.12)]" onClick={() => navigate(`/student/exams/${exam.id}`)}>
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EFEAFF] text-[#6D4AFF]">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-extrabold truncate text-[#1A1A2E]">{exam.title}</h4>
                  {exam.is_ai_generated && <Badge variant="outline" className="text-[10px]">AI</Badge>}
                </div>
                <div className="flex items-center gap-3 text-xs text-[#6B6B7B]">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{exam.duration_minutes} د</span>
                  {isUpcoming && <Badge variant="secondary">قادم</Badge>}
                  {isEnded && <Badge variant="destructive">{myAttempt ? `${myAttempt.percentage}%` : "منتهي"}</Badge>}
                  {isAvailable && <Badge className="border-0 bg-[#22C55E] text-white">متاح</Badge>}
                </div>
              </div>
              <Button size="sm" disabled={!isAvailable} className="bg-[#6D4AFF] text-white hover:bg-[#5B3BE8]">افتح</Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

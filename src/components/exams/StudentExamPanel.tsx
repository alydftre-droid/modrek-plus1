import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStudentExamCatalog } from "@/hooks/useExams";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Clock, ArrowLeft, Lock, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizeSectionForSubjects } from "@/lib/educationSection";

interface Props {
  subjectId: string;
  subjectName?: string;
  groupId?: string;
  subSubjectId?: string;
  isSubscribed?: boolean;
  currentTerm?: string;
  onRequireSubscription?: () => void;
}

/**
 * Lightweight in-tab listing of exams scoped to a subject/group.
 * Full experience lives at /student/exams.
 */
export default function StudentExamPanel({ subjectId, groupId, subSubjectId, isSubscribed = true, currentTerm, onRequireSubscription }: Props) {
  const navigate = useNavigate();
  const { data: catalog, isLoading } = useStudentExamCatalog({ subjectId, groupId, term: currentTerm, subSubjectId });
  const exams = catalog?.exams || [];
  const attempts = catalog?.attempts || [];
  const attemptByExam = new Map(attempts.map((attempt: any) => [attempt.exam_id, attempt]));
  const activeSubject = useMemo(() => exams.find((exam: any) => exam.subject_id === subjectId)?.subjects, [exams, subjectId]);

  const filtered = exams.filter((e: any) => {
    if (groupId && e.group_id !== groupId) return false;
    if (subSubjectId && e.sub_subject_id !== subSubjectId) return false;
    if (!groupId && currentTerm && e.term && e.term !== currentTerm) return false;
    if (!groupId && e.subject_id !== subjectId) return false;
    if (groupId && e.subject_id !== subjectId && activeSubject && e.subjects) {
      const sameSubjectScope =
        e.subjects.name === activeSubject.name &&
        e.subjects.stage === activeSubject.stage &&
        e.subjects.grade === activeSubject.grade &&
        normalizeSectionForSubjects(e.subjects.section) === normalizeSectionForSubjects(activeSubject.section);
      if (!sameSubjectScope) return false;
    }
    return true;
  });

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
        const isLockedBySubscription = !isSubscribed || exam.is_accessible === false;
        const canOpenExam = !isLockedBySubscription && isAvailable;
        return (
          <Card
            key={exam.id}
            className="cursor-pointer overflow-hidden rounded-[20px] border-border bg-card shadow-sm transition hover:shadow-md"
            onClick={() => {
              if (canOpenExam) navigate(`/student/exams/${exam.id}`);
              else if (isLockedBySubscription) onRequireSubscription?.();
            }}
          >
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                {isSubscribed ? <Sparkles className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-extrabold truncate text-foreground">{exam.title}</h4>
                  {exam.is_ai_generated && <Badge variant="outline" className="text-[10px]">AI</Badge>}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{exam.duration_minutes} د</span>
                  {isLockedBySubscription && <Badge variant="secondary" className="gap-1"><Lock className="h-3 w-3" />مقفول</Badge>}
                  {isUpcoming && <Badge variant="secondary">قادم</Badge>}
                  {isEnded && <Badge variant="destructive">{myAttempt ? `${myAttempt.percentage}%` : "منتهي"}</Badge>}
                  {!isLockedBySubscription && isAvailable && <Badge className="border-0 bg-primary text-primary-foreground">متاح</Badge>}
                </div>
              </div>
              <Button
                size="sm"
                disabled={!canOpenExam && !isLockedBySubscription}
                onClick={(event) => {
                  event.stopPropagation();
                  if (canOpenExam) navigate(`/student/exams/${exam.id}`);
                  else if (isLockedBySubscription) onRequireSubscription?.();
                }}
              >
                {isLockedBySubscription ? "اشترك أولًا" : "افتح"}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

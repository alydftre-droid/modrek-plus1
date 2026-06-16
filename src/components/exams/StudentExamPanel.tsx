import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStudentExams } from "@/hooks/useExams";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Clock, ArrowLeft, Lock } from "lucide-react";
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
  const { data: exams = [], isLoading } = useStudentExams();

  const filtered = exams.filter((e: any) => {
    if (e.subject_id !== subjectId) return false;
    if (groupId && e.group_id !== groupId) return false;
    if (currentTerm && e.term && e.term !== currentTerm) return false;
    return true;
  });

  if (!isSubscribed) {
    return (
      <Card className="text-center p-8 border-dashed">
        <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">يجب الاشتراك في المجموعة لرؤية الامتحانات</p>
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
        <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">لا توجد امتحانات متاحة حالياً</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">الامتحانات المتاحة ({filtered.length})</h3>
        <Button variant="ghost" size="sm" onClick={() => navigate("/student/exams")}>
          عرض الكل <ArrowLeft className="h-4 w-4 mr-1" />
        </Button>
      </div>
      {filtered.map((exam: any) => {
        const now = Date.now();
        const startsAt = exam.start_at ? new Date(exam.start_at).getTime() : null;
        const endsAt = exam.end_at ? new Date(exam.end_at).getTime() : null;
        const isUpcoming = startsAt && now < startsAt;
        const isEnded = endsAt && now > endsAt;
        const isAvailable = !isUpcoming && !isEnded;
        return (
          <Card key={exam.id} className="hover:shadow-mudrik transition-all cursor-pointer" onClick={() => navigate(`/student/exams/${exam.id}`)}>
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-bold truncate">{exam.title}</h4>
                  {exam.is_ai_generated && <Badge variant="outline" className="text-[10px]">AI</Badge>}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{exam.duration_minutes} د</span>
                  {isUpcoming && <Badge variant="secondary">قادم</Badge>}
                  {isEnded && <Badge variant="destructive">منتهي</Badge>}
                  {isAvailable && <Badge className="bg-green-500">متاح</Badge>}
                </div>
              </div>
              <Button size="sm" disabled={!isAvailable}>افتح</Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

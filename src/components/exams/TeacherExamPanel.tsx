import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTeacherExams } from "@/hooks/useExams";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Plus, Settings, Users } from "lucide-react";
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">امتحاناتي ({filtered.length})</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate("/teacher/exams")}>كل الامتحانات</Button>
          <Button size="sm" onClick={createNew}><Plus className="h-4 w-4 ml-1" />امتحان جديد</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="text-center p-8 border-dashed">
          <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground mb-4">لا توجد امتحانات بعد</p>
          <Button onClick={createNew}><Plus className="h-4 w-4 ml-1" />أنشئ أول امتحان</Button>
        </Card>
      ) : (
        filtered.map((exam: any) => (
          <Card key={exam.id} className="hover:shadow-mudrik transition-all">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <h4 className="font-bold truncate flex-1">{exam.title}</h4>
                <Badge variant={exam.is_published ? "default" : "secondary"}>
                  {exam.is_published ? "منشور" : "مسودة"}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                <span>{exam.duration_minutes} دقيقة</span>
                <span>•</span>
                <span>{exam.total_attempts_count || 0} محاولة</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => navigate(`/teacher/exams/${exam.id}/edit`)}>
                  <Settings className="h-3 w-3 ml-1" />تعديل
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate(`/teacher/exams/${exam.id}/attempts`)}>
                  <Users className="h-3 w-3 ml-1" />النتائج
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

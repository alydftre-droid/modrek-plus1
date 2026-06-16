import { useParams, useNavigate } from "react-router-dom";
import { useExam, useExamLeaderboard } from "@/hooks/useExams";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Trophy, Medal } from "lucide-react";
import StudentLayout from "@/components/student/StudentLayout";
import { useAuth } from "@/hooks/useAuth";

export default function ExamLeaderboardPage() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: exam } = useExam(examId);
  const { data: lb = [], isLoading } = useExamLeaderboard(examId);

  return (
    <StudentLayout>
      <div className="container max-w-2xl mx-auto p-4 space-y-4">
        <Button variant="ghost" onClick={() => navigate(-1)}><ArrowRight className="h-4 w-4 ml-1" />رجوع</Button>
        <Card className="bg-gradient-mudrik text-white">
          <CardContent className="p-6 text-center">
            <Trophy className="h-12 w-12 mx-auto mb-2" />
            <h1 className="text-xl font-extrabold">ترتيب الطلاب</h1>
            <p className="text-sm opacity-90">{exam?.title}</p>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : lb.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">لا توجد محاولات بعد</Card>
        ) : (
          <div className="space-y-2">
            {lb.map((row: any) => {
              const isMe = row.student_id === user?.id;
              const medal = row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : null;
              return (
                <Card key={row.student_id} className={`${isMe ? "border-primary border-2 shadow-mudrik" : ""}`}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-bold text-lg">
                      {medal || `#${row.rank}`}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-sm">{row.student_name} {isMe && <Badge variant="secondary" className="mr-1">أنت</Badge>}</div>
                      <div className="text-xs text-muted-foreground">{Math.floor(row.time_spent_seconds / 60)} د {row.time_spent_seconds % 60} ث</div>
                    </div>
                    <Badge className="text-base px-3 py-1">{row.percentage}%</Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </StudentLayout>
  );
}

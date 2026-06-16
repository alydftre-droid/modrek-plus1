import { useMemo, useState } from "react";
import { useStudentExams, useMyAttempts } from "@/hooks/useExams";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Clock, ClipboardList, Search, Trophy, Sparkles, BarChart3 } from "lucide-react";
import StudentLayout from "@/components/student/StudentLayout";

type ExamRow = any;

function getExamState(e: ExamRow): "available" | "upcoming" | "ended" {
  const now = Date.now();
  const startsAt = e.start_at ? new Date(e.start_at).getTime() : null;
  const endsAt = e.end_at ? new Date(e.end_at).getTime() : null;
  if (startsAt && now < startsAt) return "upcoming";
  if (endsAt && now > endsAt) return "ended";
  return "available";
}

export default function ExamsListPage() {
  const navigate = useNavigate();
  const { data: exams = [], isLoading } = useStudentExams();
  const { data: attempts = [] } = useMyAttempts();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("available");

  const attemptByExam = useMemo(() => {
    const m = new Map<string, any>();
    for (const a of attempts) {
      const cur = m.get(a.exam_id);
      if (!cur || new Date(a.started_at) > new Date(cur.started_at)) m.set(a.exam_id, a);
    }
    return m;
  }, [attempts]);

  const filtered = useMemo(() => {
    return exams.filter((e: ExamRow) => {
      if (search && !e.title?.toLowerCase().includes(search.toLowerCase())) return false;
      if (tab === "all") return true;
      return getExamState(e) === tab;
    });
  }, [exams, search, tab]);

  return (
    <StudentLayout>
      <div className="container mx-auto p-4 space-y-6 max-w-5xl">
        {/* Header */}
        <div className="rounded-3xl p-6 bg-gradient-mudrik text-white shadow-mudrik relative overflow-hidden">
          <div className="absolute -top-10 -left-10 w-40 h-40 bg-white/20 rounded-full blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-white/20 backdrop-blur-md rounded-2xl">
                <ClipboardList className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold">الامتحانات</h1>
                <p className="text-sm opacity-90">قياس مستواك وتحدّي زملائك</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="secondary" size="sm" onClick={() => navigate("/student/exams/stats")}>
                <BarChart3 className="h-4 w-4 ml-1" /> إحصائياتي
              </Button>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث في الامتحانات..." className="pr-10" />
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="available">متاحة</TabsTrigger>
            <TabsTrigger value="upcoming">قادمة</TabsTrigger>
            <TabsTrigger value="ended">منتهية</TabsTrigger>
            <TabsTrigger value="all">الكل</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-4 space-y-3">
            {isLoading ? (
              [...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)
            ) : filtered.length === 0 ? (
              <Card className="text-center p-12 border-dashed">
                <ClipboardList className="h-16 w-16 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">لا توجد امتحانات في هذا التصنيف</p>
              </Card>
            ) : (
              filtered.map((exam: ExamRow) => {
                const state = getExamState(exam);
                const myAttempt = attemptByExam.get(exam.id);
                return (
                  <Card
                    key={exam.id}
                    className="hover:shadow-mudrik transition-all cursor-pointer overflow-hidden group"
                    onClick={() => navigate(`/student/exams/${exam.id}`)}
                  >
                    <CardContent className="p-0">
                      <div className="flex gap-3 p-4">
                        <div className="p-3 bg-gradient-mudrik rounded-2xl text-white shrink-0 group-hover:scale-110 transition-transform">
                          <ClipboardList className="h-6 w-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2 mb-1">
                            <h3 className="font-bold text-base truncate flex-1">{exam.title}</h3>
                            {exam.is_ai_generated && (
                              <Badge variant="outline" className="text-[10px] gap-1"><Sparkles className="h-3 w-3" />AI</Badge>
                            )}
                          </div>
                          {exam.description && (
                            <p className="text-xs text-muted-foreground truncate mb-2">{exam.description}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <Badge variant="secondary" className="gap-1">
                              <Clock className="h-3 w-3" />{exam.duration_minutes} د
                            </Badge>
                            {exam.subjects?.name && <Badge variant="outline">{exam.subjects.name}</Badge>}
                            {state === "available" && <Badge className="bg-green-500">متاح الآن</Badge>}
                            {state === "upcoming" && <Badge className="bg-amber-500">قادم</Badge>}
                            {state === "ended" && <Badge variant="destructive">منتهي</Badge>}
                            {myAttempt && (
                              <Badge variant="outline" className="gap-1">
                                <Trophy className="h-3 w-3" />
                                {myAttempt.status === "in_progress" ? "جاري" : `${myAttempt.percentage}%`}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors self-center" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </div>
    </StudentLayout>
  );
}

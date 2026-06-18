import { useMemo, useState } from "react";
import { useStudentExamCatalog } from "@/hooks/useExams";
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

function getExamState(e: ExamRow, attempt?: any): "available" | "upcoming" | "ended" {
  if (attempt && attempt.status !== "in_progress") return "ended";
  const now = Date.now();
  const startsAt = e.start_at ? new Date(e.start_at).getTime() : null;
  const endsAt = e.end_at ? new Date(e.end_at).getTime() : null;
  if (startsAt && now < startsAt) return "upcoming";
  if (endsAt && now > endsAt) return "ended";
  return "available";
}

export default function ExamsListPage() {
  const navigate = useNavigate();
  const { data: catalog, isLoading } = useStudentExamCatalog();
  const exams = catalog?.exams || [];
  const attempts = catalog?.attempts || [];
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
      return getExamState(e, attemptByExam.get(e.id)) === tab;
    });
  }, [exams, search, tab, attemptByExam]);

  return (
    <StudentLayout>
      <div className="mx-auto min-h-screen max-w-5xl space-y-5 bg-[#F8F8FC] p-3 sm:p-4">
        {/* Header */}
        <div className="relative overflow-hidden rounded-[22px] border border-[#EFEDF7] bg-white p-5 shadow-[0_2px_16px_rgba(109,74,255,0.06)]">
          <div className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="rounded-2xl bg-[#EFEAFF] p-3 text-[#6D4AFF]">
                <ClipboardList className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-[#1A1A2E]">الامتحانات</h1>
                <p className="text-sm text-[#6B6B7B]">قياس مستواك وتحدّي زملائك</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button size="sm" className="bg-[#6D4AFF] text-white hover:bg-[#5B3BE8]" onClick={() => navigate("/student/exams/stats")}>
                <BarChart3 className="h-4 w-4 ml-1" /> إحصائياتي
              </Button>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6D4AFF]" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث في الامتحانات..." className="h-12 rounded-2xl border-[#EFEDF7] bg-white pr-10 text-[#1A1A2E] shadow-[0_2px_12px_rgba(109,74,255,0.04)]" />
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid h-12 w-full grid-cols-4 rounded-2xl bg-white p-1 shadow-[0_2px_12px_rgba(109,74,255,0.04)]">
            <TabsTrigger value="available">متاحة</TabsTrigger>
            <TabsTrigger value="upcoming">قادمة</TabsTrigger>
            <TabsTrigger value="ended">منتهية</TabsTrigger>
            <TabsTrigger value="all">الكل</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-4 space-y-3">
            {isLoading ? (
              [...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)
            ) : filtered.length === 0 ? (
              <Card className="rounded-[20px] border-dashed border-[#EFEDF7] bg-white p-12 text-center">
                <ClipboardList className="h-16 w-16 mx-auto text-[#6D4AFF] mb-3" />
                <p className="text-[#6B6B7B]">لا توجد امتحانات في هذا التصنيف</p>
              </Card>
            ) : (
              filtered.map((exam: ExamRow) => {
                const myAttempt = attemptByExam.get(exam.id);
                const state = getExamState(exam, myAttempt);
                return (
                  <Card
                    key={exam.id}
                    className="group cursor-pointer overflow-hidden rounded-[20px] border-[#EFEDF7] bg-white shadow-[0_2px_16px_rgba(109,74,255,0.06)] transition hover:shadow-[0_10px_26px_rgba(109,74,255,0.12)]"
                    onClick={() => {
                      if (myAttempt && myAttempt.status !== "in_progress") {
                        navigate(`/student/exams/${exam.id}/result/${myAttempt.id}`);
                      } else {
                        navigate(`/student/exams/${exam.id}`);
                      }
                    }}
                  >
                    <CardContent className="p-0">
                      <div className="flex gap-3 p-4">
                        <div className="shrink-0 rounded-2xl bg-[#EFEAFF] p-3 text-[#6D4AFF] transition-transform group-hover:scale-110">
                          <ClipboardList className="h-6 w-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2 mb-1">
                            <h3 className="flex-1 truncate text-base font-extrabold text-[#1A1A2E]">{exam.title}</h3>
                            {exam.is_ai_generated && (
                              <Badge variant="outline" className="gap-1 border-[#DCD6FF] text-[10px] text-[#6D4AFF]"><Sparkles className="h-3 w-3" />AI</Badge>
                            )}
                          </div>
                          {exam.description && (
                            <p className="mb-2 truncate text-xs text-[#6B6B7B]">{exam.description}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <Badge variant="secondary" className="gap-1">
                              <Clock className="h-3 w-3" />{exam.duration_minutes} د
                            </Badge>
                            {exam.subjects?.name && <Badge variant="outline">{exam.subjects.name}</Badge>}
                            {state === "available" && <Badge className="border-0 bg-[#22C55E] text-white">متاح الآن</Badge>}
                            {state === "upcoming" && <Badge className="border-0 bg-[#F59E0B] text-white">قادم</Badge>}
                            {state === "ended" && <Badge variant="destructive">منتهي</Badge>}
                            {myAttempt && (
                              <Badge variant="outline" className="gap-1">
                                <Trophy className="h-3 w-3" />
                                {myAttempt.status === "in_progress" ? "جاري" : `${myAttempt.percentage}%`}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <ArrowRight className="h-5 w-5 self-center text-[#6D4AFF] transition-colors" />
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

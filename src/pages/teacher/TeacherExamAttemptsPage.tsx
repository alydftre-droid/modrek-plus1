import { useParams, useNavigate } from "react-router-dom";
import { saveFile } from "@/lib/fileDownload";
import { useExam, useTeacherExamRoster } from "@/hooks/useExams";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Search,
  Download,
  Eye,
  Clock,
  AlertTriangle,
  Users,
  UserCheck,
  UserX,
  Trophy,
  Target,
  Timer,
  Sparkles,
  FileQuestion,
  CircleDashed,
  CheckCircle2,
} from "lucide-react";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";

type FilterMode = "all" | "solved" | "absent" | "in_progress";

export default function TeacherExamAttemptsPage() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { data: exam } = useExam(examId);
  const { data: roster, isLoading, isError } = useTeacherExamRoster(examId);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");

  const rows = roster?.rows || [];
  const stats = roster?.stats || { enrolled: 0, solved: 0, absent: 0, inProgress: 0, average: 0, highest: 0, passCount: 0 };
  const totalMarks = Number(exam?.total_marks || roster?.exam?.total_marks || 0);
  const passMarks = Number(exam?.pass_marks || roster?.exam?.pass_marks || 0);
  const solvedRate = stats.enrolled > 0 ? Math.round((stats.solved / stats.enrolled) * 100) : 0;
  const passRate = stats.solved > 0 ? Math.round((stats.passCount / stats.solved) * 100) : 0;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row: any) => {
      const profile = row.profile || {};
      const matchesSearch = !term
        || String(profile.full_name || "").toLowerCase().includes(term)
        || String(profile.student_code || "").toLowerCase().includes(term);
      const matchesFilter = filter === "all"
        || (filter === "solved" && row.solved)
        || (filter === "absent" && row.absent && !row.in_progress)
        || (filter === "in_progress" && row.in_progress);
      return matchesSearch && matchesFilter;
    });
  }, [rows, search, filter]);

  const exportCSV = () => {
    const csvRows = [["اسم الطالب", "كود", "حالة الحل", "عدد المحاولات", "الدرجة", "النسبة", "نجح", "وقت التسليم"]];
    filtered.forEach((row: any) => csvRows.push([
      row.profile?.full_name || "طالب", row.profile?.student_code || "",
      row.solved ? "حل الامتحان" : row.in_progress ? "بدأ ولم يسلم" : "لم يحل",
      String(row.attempts_count || 0),
      row.attempt ? `${row.attempt.total_score || 0}/${row.attempt.max_score || totalMarks}` : `0/${totalMarks}`,
      row.attempt ? `${row.attempt.percentage || 0}%` : "0%",
      row.attempt?.passed ? "نعم" : "لا",
      row.attempt?.submitted_at ? new Date(row.attempt.submitted_at).toLocaleString("ar") : "",
    ]));
    const csv = csvRows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    void saveFile(`attempts-${exam?.title}.csv`, blob);
  };

  return (
    <TeacherSidebarLayout title="إحصائيات الامتحان">
      <div className="container mx-auto p-4 max-w-6xl space-y-5 pb-24">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => navigate("/teacher/exams")} className="gap-1">
            <ArrowRight className="h-4 w-4" />الامتحانات
          </Button>
          <Button variant="outline" onClick={exportCSV} disabled={filtered.length === 0} className="gap-1">
            <Download className="h-4 w-4" />تصدير
          </Button>
        </div>

        <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
          <div className="bg-primary/10 p-5 md:p-7 space-y-4">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div className="space-y-2">
                <Badge variant="secondary" className="w-fit gap-1"><FileQuestion className="h-3 w-3" />لوحة متابعة امتحان</Badge>
                <h1 className="text-2xl md:text-3xl font-black tracking-normal text-foreground">{exam?.title || "إحصائيات الامتحان"}</h1>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>الدرجة النهائية: {totalMarks || "—"}</span>
                  <span>•</span>
                  <span>درجة النجاح: {passMarks || "—"}</span>
                  {exam?.duration_minutes && <><span>•</span><span>{exam.duration_minutes} دقيقة</span></>}
                </div>
              </div>
              <div className="rounded-2xl bg-background/80 border p-4 min-w-[170px]">
                <div className="text-xs text-muted-foreground mb-1">نسبة من أدوا الامتحان</div>
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-black text-primary">{solvedRate}%</span>
                  <span className="text-xs text-muted-foreground pb-2">من الطلاب</span>
                </div>
                <ProgressLine value={solvedRate} />
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard icon={<Users className="h-5 w-5" />} label="طلاب المجموعة" value={stats.enrolled || 0} hint="كل المشتركين" />
          <MetricCard icon={<UserCheck className="h-5 w-5" />} label="حلّوا الامتحان" value={stats.solved || 0} hint={`${solvedRate}% مشاركة`} tone="primary" />
          <MetricCard icon={<UserX className="h-5 w-5" />} label="لم يحلّوا" value={stats.absent || 0} hint={stats.inProgress ? `${stats.inProgress} بدأ ولم يسلم` : "متغيبون"} tone="warning" />
          <MetricCard icon={<Trophy className="h-5 w-5" />} label="أعلى درجة" value={`${stats.highest || 0}%`} hint={`متوسط ${stats.average || 0}%`} tone="success" />
        </div>

        <div className="grid lg:grid-cols-[1.25fr_0.75fr] gap-4">
          <Card className="overflow-hidden">
            <CardContent className="p-4 md:p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-black text-lg">تحليل سريع</h2>
                  <p className="text-sm text-muted-foreground">ملخص أداء هذا الامتحان فقط</p>
                </div>
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-4">
                <InsightRow label="نسبة الحضور" value={solvedRate} />
                <InsightRow label="نسبة النجاح بين من حلّوا" value={passRate} />
                <InsightRow label="متوسط الدرجات" value={stats.average || 0} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 md:p-5 space-y-3">
              <h2 className="font-black text-lg">إجراءات المراجعة</h2>
              <div className="grid gap-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" />اضغط على أي طالب قام بالتسليم لمراجعة الإجابات.</div>
                <div className="flex items-center gap-2"><Target className="h-4 w-4 text-primary" />يمكن تعديل درجة كل سؤال يدويًا بعد التصحيح الذكي.</div>
                <div className="flex items-center gap-2"><Timer className="h-4 w-4 text-primary" />الطلاب المتغيبون يظهرون في نفس القائمة.</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="p-4 md:p-5 border-b space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <h2 className="font-black text-xl">كشف الطلاب</h2>
                  <p className="text-sm text-muted-foreground">الأسماء، حالة الحل، الدرجة، وإمكانية مراجعة كل محاولة</p>
                </div>
                <div className="relative w-full md:w-80">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث بالاسم أو الكود..." className="pr-10" />
                </div>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="الكل" count={rows.length} />
                <FilterChip active={filter === "solved"} onClick={() => setFilter("solved")} label="حلّوا" count={stats.solved || 0} />
                <FilterChip active={filter === "absent"} onClick={() => setFilter("absent")} label="لم يحلّوا" count={Math.max(0, (stats.absent || 0) - (stats.inProgress || 0))} />
                <FilterChip active={filter === "in_progress"} onClick={() => setFilter("in_progress")} label="بدأ ولم يسلم" count={stats.inProgress || 0} />
              </div>
            </div>

            {isLoading ? (
              <div className="p-4 space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
            ) : isError ? (
              <div className="p-10 text-center text-destructive">تعذر تحميل بيانات الطلاب. أعد المحاولة بعد لحظات.</div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <CircleDashed className="h-10 w-10 mx-auto text-muted-foreground" />
                <div className="font-bold">لا توجد نتائج مطابقة</div>
                <div className="text-sm text-muted-foreground">غيّر البحث أو الفلتر لعرض الطلاب.</div>
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((row: any) => <StudentExamRow key={row.student_id} row={row} totalMarks={totalMarks} onOpen={() => row.attempt && navigate(`/teacher/exams/${examId}/attempts/${row.attempt.id}`)} />)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TeacherSidebarLayout>
  );
}

function MetricCard({ icon, label, value, hint, tone = "default" }: { icon: JSX.Element; label: string; value: string | number; hint: string; tone?: "default" | "primary" | "warning" | "success" }) {
  const toneClass = tone === "primary" ? "bg-primary/10 text-primary" : tone === "warning" ? "bg-destructive/10 text-destructive" : tone === "success" ? "bg-accent text-accent-foreground" : "bg-muted text-foreground";
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${toneClass}`}>{icon}</div>
        <div>
          <div className="text-3xl font-black leading-none">{value}</div>
          <div className="font-bold text-sm mt-2">{label}</div>
          <div className="text-xs text-muted-foreground mt-1">{hint}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressLine({ value }: { value: number }) {
  return (
    <div className="h-2 rounded-full bg-muted overflow-hidden mt-3">
      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function InsightRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm"><span className="font-bold">{label}</span><span className="text-muted-foreground">{value}%</span></div>
      <ProgressLine value={value} />
    </div>
  );
}

function FilterChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground hover:bg-muted"}`}
    >
      {label} <span className="opacity-80">{count}</span>
    </button>
  );
}

function StudentExamRow({ row, totalMarks, onOpen }: { row: any; totalMarks: number; onOpen: () => void }) {
  const profile = row.profile || {};
  const attempt = row.attempt;
  const percentage = Number(attempt?.percentage || 0);
  const score = Number(attempt?.total_score || 0);
  const maxScore = Number(attempt?.max_score || totalMarks || 0);
  const statusLabel = row.solved ? (attempt?.status === "graded" ? "مصحح" : "تم التسليم") : row.in_progress ? "بدأ ولم يسلم" : "لم يحل";
  const initials = String(profile.full_name || "طالب").trim().slice(0, 1) || "ط";

  return (
    <div className="p-4 hover:bg-muted/40 transition-colors">
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black text-lg shrink-0">{initials}</div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-black truncate">{profile.full_name || "طالب بدون اسم"}</h3>
              <Badge variant={row.solved ? "default" : row.in_progress ? "secondary" : "outline"}>{statusLabel}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1">
              {profile.student_code && <span>كود: {profile.student_code}</span>}
              <span>محاولات: {row.attempts_count || 0}</span>
              {attempt?.time_spent_seconds ? <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{Math.floor(Number(attempt.time_spent_seconds || 0) / 60)} د</span> : null}
              {attempt?.tab_switch_count > 0 && <Badge variant="destructive" className="gap-1 text-[10px]"><AlertTriangle className="h-3 w-3" />تنبيه {attempt.tab_switch_count}</Badge>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 lg:w-[390px]">
          <MiniCell label="الدرجة" value={attempt ? `${score}/${maxScore}` : `0/${maxScore || "—"}`} />
          <MiniCell label="النسبة" value={`${percentage}%`} />
          <MiniCell label="إجابات" value={attempt ? row.answered_count : "—"} />
        </div>

        <Button
          variant={attempt ? "default" : "outline"}
          disabled={!attempt}
          onClick={onOpen}
          className="gap-1 lg:w-36"
        >
          <Eye className="h-4 w-4" />{attempt ? "مراجعة" : "لا توجد محاولة"}
        </Button>
      </div>
      {attempt && <ProgressLine value={percentage} />}
    </div>
  );
}

function MiniCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-muted/50 border px-3 py-2 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-black text-sm mt-1">{value}</div>
    </div>
  );
}

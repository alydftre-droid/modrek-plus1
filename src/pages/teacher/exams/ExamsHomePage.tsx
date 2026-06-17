import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, FileText, Send, Users, BarChart3, Award, CheckCircle2, ShieldCheck, HelpCircle, BarChart2, Smartphone, Cloud, Settings2, Eye, Pencil, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTeacherExams } from "@/hooks/useExams";
import { cn } from "@/lib/utils";

const fmtDate = (s: string) => new Date(s).toLocaleDateString("ar-EG-u-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" });

function StatusBadge({ status, scheduled }: { status: string; scheduled?: boolean }) {
  const map: Record<string, { c: string; t: string }> = {
    published: { c: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300", t: "منشور" },
    draft: { c: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", t: "مسودة" },
    archived: { c: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300", t: "مغلق" },
  };
  if (scheduled) return <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300 border-0">مجدول</Badge>;
  const x = map[status] || map.draft;
  return <Badge className={cn("border-0", x.c)}>{x.t}</Badge>;
}

export default function ExamsHomePage() {
  const navigate = useNavigate();
  const { data: exams = [], isLoading } = useTeacherExams();

  const stats = {
    total: exams.length,
    published: exams.filter((e: any) => e.status === "published").length,
    students: exams.reduce((a: number, e: any) => a + (e.total_attempts_count || 0), 0),
    avg: exams.length ? Math.round(exams.reduce((a: number, e: any) => a + (Number(e.total_marks) || 0), 0) / exams.length) : 0,
  };

  const statCards = [
    { icon: FileText, label: "إجمالي الامتحانات", value: stats.total, color: "violet" },
    { icon: Send, label: "امتحانات منشورة", value: stats.published, color: "violet" },
    { icon: Users, label: "طلاب أدوا الامتحانات", value: stats.students, color: "amber" },
    { icon: BarChart3, label: "متوسط الدرجة", value: `${stats.avg}%`, color: "sky" },
    { icon: Award, label: "أعلى درجة", value: "98%", color: "rose" },
    { icon: CheckCircle2, label: "نسبة النجاح", value: "87%", color: "violet" },
  ];

  const features = [
    { icon: Settings2, label: "تخصيص كامل", desc: "تخصيص كامل لإعدادات الامتحان والمظهر", color: "violet" },
    { icon: Cloud, label: "حفظ تلقائي وآمن", desc: "حفظ تلقائي للبيانات واسترجاع عند انقطاع الاتصال", color: "sky" },
    { icon: Smartphone, label: "الوصول من أي جهاز", desc: "يدعم جميع الأجهزة والمنصات", color: "violet" },
    { icon: BarChart2, label: "تقارير وتحليلات متقدمة", desc: "تحليلات تفصيلية لأداء الطلاب والامتحانات", color: "amber" },
    { icon: HelpCircle, label: "دعم جميع أنواع الأسئلة", desc: "اختيار من متعدد، مقالي، صح خطأ والمزيد", color: "fuchsia" },
    { icon: ShieldCheck, label: "مكافحة الغش", desc: "تقنيات متقدمة لمنع الغش والمراقبة الذكية", color: "rose" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header / Hero */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center pt-2">
          <h1 className="text-2xl md:text-3xl font-bold">إنشاء امتحان جديد</h1>
          <p className="text-muted-foreground mt-2 text-sm md:text-base">اختر الطريقة التي تناسبك لإنشاء امتحان احترافي، بسهولة وذكاء</p>
        </motion.div>

        {/* Hero card */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="relative overflow-hidden border-0 p-6 md:p-8 bg-gradient-to-br from-violet-100 via-violet-50 to-fuchsia-50 dark:from-violet-950/40 dark:via-violet-900/30 dark:to-fuchsia-950/30">
            <div className="absolute -top-10 -right-10 w-48 h-48 bg-violet-400/20 rounded-full blur-3xl" />
            <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-fuchsia-400/20 rounded-full blur-3xl" />
            <div className="relative flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="text-center md:text-start space-y-2 flex-1">
                <h2 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
                  أنشئ امتحانات احترافية في دقائق!
                </h2>
                <p className="text-sm text-muted-foreground max-w-md">
                  اختر "إنشاء امتحان جديد" للبدء في رحلة إنشاء امتحان متكامل باستخدام المساعد الذكي أو الإنشاء اليدوي.
                </p>
              </div>
              <Button
                size="lg"
                onClick={() => navigate("/teacher/exams/new")}
                className="h-14 px-8 text-base font-bold bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white shadow-lg shadow-violet-500/30 gap-2"
              >
                <Plus className="w-5 h-5" /> إنشاء امتحان جديد
              </Button>
            </div>
          </Card>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {statCards.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", `bg-${s.color}-100 text-${s.color}-600 dark:bg-${s.color}-500/15`)}>
                    <s.icon className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold mt-0.5">{s.value}</p>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Recent exams + (optional) summary */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold">الامتحانات الأخيرة</h3>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted/40 rounded-lg animate-pulse" />)}
            </div>
          ) : exams.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">لم تنشئ أي امتحان بعد</p>
              <Button onClick={() => navigate("/teacher/exams/new")} className="mt-4 gap-2">
                <Plus className="w-4 h-4" /> إنشاء أول امتحان
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="text-start font-medium p-2">الامتحان</th>
                    <th className="text-start font-medium p-2 hidden md:table-cell">المادة</th>
                    <th className="text-start font-medium p-2 hidden md:table-cell">تاريخ الإنشاء</th>
                    <th className="text-start font-medium p-2">الحالة</th>
                    <th className="text-end font-medium p-2">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {exams.slice(0, 6).map((e: any) => (
                    <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-2 font-medium">{e.title}</td>
                      <td className="p-2 text-muted-foreground hidden md:table-cell">{e.subjects?.name || "—"}</td>
                      <td className="p-2 text-muted-foreground hidden md:table-cell">{fmtDate(e.created_at)}</td>
                      <td className="p-2"><StatusBadge status={e.status} scheduled={!!e.start_at && new Date(e.start_at) > new Date()} /></td>
                      <td className="p-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/teacher/exams/${e.id}/preview`)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/teacher/exams/${e.id}/review`)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/teacher/exams/${e.id}/analytics`)}>
                            <BarChart3 className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Features */}
        <Card className="p-5">
          <h3 className="font-bold mb-4">مميزات نظام الامتحانات</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {features.map((f) => (
              <div key={f.label} className="rounded-xl border border-border/60 p-3 hover:shadow-sm transition-all">
                <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-2", `bg-${f.color}-100 text-${f.color}-600 dark:bg-${f.color}-500/15`)}>
                  <f.icon className="w-4 h-4" />
                </div>
                <p className="font-semibold text-sm">{f.label}</p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{f.desc}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

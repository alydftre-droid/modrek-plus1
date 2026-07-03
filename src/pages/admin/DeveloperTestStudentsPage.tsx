import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, BookOpen, LogIn, Loader2, ShieldAlert, GraduationCap, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { startImpersonation } from "@/lib/devImpersonation";
import { cn } from "@/lib/utils";

interface TestStudent {
  id: string;
  test_account_code: string;
  full_name: string;
  stage: string | null;
  grade: string | null;
  section: string | null;
  education_type: string | null;
}

const GROUPS: { title: string; codes: string[] }[] = [
  {
    title: "المرحلة الإعدادية — أزهر",
    codes: ["AZH-PREP-1", "AZH-PREP-2", "AZH-PREP-3"],
  },
  {
    title: "المرحلة الثانوية — أزهر",
    codes: ["AZH-SEC1-SCI", "AZH-SEC1-LIT", "AZH-SEC2-SCI", "AZH-SEC2-LIT", "AZH-SEC3-SCI", "AZH-SEC3-LIT"],
  },
  {
    title: "المرحلة الإعدادية — تربية وتعليم",
    codes: ["GEN-PREP-1", "GEN-PREP-2", "GEN-PREP-3"],
  },
  {
    title: "المرحلة الثانوية — تربية وتعليم",
    codes: ["GEN-SEC1", "GEN-SEC2-SCI", "GEN-SEC2-LIT", "GEN-SEC3-SCIENCE", "GEN-SEC3-MATH", "GEN-SEC3-LIT"],
  },
];

const LABELS: Record<string, string> = {
  "AZH-PREP-1": "الصف الأول الإعدادي",
  "AZH-PREP-2": "الصف الثاني الإعدادي",
  "AZH-PREP-3": "الصف الثالث الإعدادي",
  "AZH-SEC1-SCI": "الصف الأول الثانوي — علمي",
  "AZH-SEC1-LIT": "الصف الأول الثانوي — أدبي",
  "AZH-SEC2-SCI": "الصف الثاني الثانوي — علمي",
  "AZH-SEC2-LIT": "الصف الثاني الثانوي — أدبي",
  "AZH-SEC3-SCI": "الصف الثالث الثانوي — علمي",
  "AZH-SEC3-LIT": "الصف الثالث الثانوي — أدبي",
  "GEN-PREP-1": "الصف الأول الإعدادي",
  "GEN-PREP-2": "الصف الثاني الإعدادي",
  "GEN-PREP-3": "الصف الثالث الإعدادي",
  "GEN-SEC1": "الصف الأول الثانوي",
  "GEN-SEC2-SCI": "الصف الثاني الثانوي — علمي",
  "GEN-SEC2-LIT": "الصف الثاني الثانوي — أدبي",
  "GEN-SEC3-SCIENCE": "الصف الثالث الثانوي — علمي علوم",
  "GEN-SEC3-MATH": "الصف الثالث الثانوي — علمي رياضة",
  "GEN-SEC3-LIT": "الصف الثالث الثانوي — أدبي",
};

const getStudentMeta = (code: string): TestStudent => {
  const isPreparatory = code.includes("PREP");
  const section = code.includes("SCIENCE")
    ? "علمي علوم"
    : code.includes("MATH")
      ? "علمي رياضة"
      : code.includes("SCI")
        ? "علمي"
        : code.includes("LIT")
          ? "أدبي"
          : null;

  return {
    id: code,
    test_account_code: code,
    full_name: `طالب تجريبي — ${LABELS[code] || code}`,
    stage: isPreparatory ? "preparatory" : "secondary",
    grade: code.includes("-1") || code === "GEN-SEC1" ? "first" : code.includes("-2") ? "second" : "third",
    section,
    education_type: code.startsWith("AZH") ? "أزهر" : "عام",
  };
};

const TEST_STUDENTS = GROUPS.flatMap((group) => group.codes.map(getStudentMeta));

export default function DeveloperTestStudentsPage() {
  const navigate = useNavigate();
  const [switching, setSwitching] = useState<string | null>(null);
  const byCode = useMemo(() => new Map(TEST_STUDENTS.map((s) => [s.test_account_code, s])), []);

  const handleLoginAs = async (code: string) => {
    setSwitching(code);
    try {
      const meta = await startImpersonation({ test_account_code: code });
      toast.success(`تم الدخول كـ ${meta.test_account_code}`);
      navigate("/dashboard", { replace: true });
      setTimeout(() => window.location.reload(), 250);
    } catch (e: any) {
      toast.error(e?.message || "فشل الدخول");
    } finally {
      setSwitching(null);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background p-4 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold flex items-center gap-2">
              <GraduationCap className="h-7 w-7 text-primary" />
              حسابات الطلاب التجريبية
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              حسابات دائمة داخل قاعدة البيانات مخصصة للمطور، مخفية بالكامل عن المعلمين ولا تُحتسب عليها أرباح.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/admin")}>
            <ArrowRight className="h-4 w-4 ml-1 rotate-180" />
            رجوع للوحة المطور
          </Button>
        </div>

        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900 space-y-1">
            <p className="font-semibold">ملاحظات الأمان:</p>
            <ul className="list-disc pr-5 space-y-0.5">
              <li>هذه الحسابات لا تظهر لأي معلم ولا تدخل في إحصائيات المعلمين أو أرباحهم.</li>
              <li>عند الدخول ستظهر لك تجربة الطالب كاملة مع شريط تحذير في الأعلى.</li>
              <li>البيانات (اشتراكات، امتحانات، محادثات) تبقى محفوظة بشكل دائم.</li>
            </ul>
          </div>
        </div>

        <div className="space-y-6">
            {GROUPS.map((g) => (
              <Card key={g.title}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-primary" />
                    {g.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {g.codes.map((code) => {
                      const s = byCode.get(code);
                      const isSwitching = switching === code;
                      return (
                        <div
                          key={code}
                          className={cn(
                            "rounded-xl border bg-card p-4 transition hover:border-primary/40 hover:shadow-md",
                            !s && "opacity-60"
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <Badge variant="secondary" className="font-mono text-xs">{code}</Badge>
                            <Sparkles className="h-4 w-4 text-primary/60" />
                          </div>
                          <p className="font-semibold text-sm mb-1">{LABELS[code] || code}</p>
                          <p className="text-xs text-muted-foreground mb-3">
                            {s?.education_type || "—"} • {s?.stage === "secondary" ? "ثانوي" : s?.stage === "preparatory" ? "إعدادي" : "—"}
                            {s?.section ? ` • ${s.section}` : ""}
                          </p>
                          <Button
                            className="w-full"
                            size="sm"
                            disabled={!s || isSwitching || !!switching}
                            onClick={() => handleLoginAs(code)}
                          >
                            {isSwitching ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <LogIn className="h-4 w-4 ml-1" />
                                الدخول كطالب
                              </>
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
      </div>
    </div>
  );
}

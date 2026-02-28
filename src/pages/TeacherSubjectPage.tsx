import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  ChevronLeft,
  BookOpen,
  Book,
  Upload,
  BookText,
  BookMarked,
  Beaker,
  Globe,
  Languages,
  Atom,
  Palette,
} from "lucide-react";
import {
  gradeKeyFromArabicLabel,
  subjectFilterFromTeacherSelection,
  teacherSelectionLabel,
} from "@/lib/teacherSubjectUtils";

type SubjectRow = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  stage: string;
  grade: string;
  section: string | null;
};

// Category visual info (matching admin style)
const CATEGORY_INFO: Record<string, { name: string; icon: typeof BookText; gradient: string; shadow: string }> = {
  arabic: { name: "المواد العربية", icon: BookText, gradient: "from-emerald-500 via-emerald-600 to-teal-700", shadow: "shadow-emerald-500/30" },
  sharia: { name: "المواد الشرعية", icon: BookMarked, gradient: "from-amber-500 via-amber-600 to-orange-700", shadow: "shadow-amber-500/30" },
  science: { name: "العلوم", icon: Beaker, gradient: "from-blue-500 via-blue-600 to-indigo-700", shadow: "shadow-blue-500/30" },
  studies: { name: "الدراسات", icon: Globe, gradient: "from-purple-500 via-purple-600 to-violet-700", shadow: "shadow-purple-500/30" },
  english: { name: "الإنجليزية", icon: Languages, gradient: "from-rose-500 via-rose-600 to-pink-700", shadow: "shadow-rose-500/30" },
  scientific: { name: "المواد العلمية", icon: Atom, gradient: "from-cyan-500 via-cyan-600 to-blue-700", shadow: "shadow-cyan-500/30" },
  literary: { name: "المواد الأدبية", icon: Palette, gradient: "from-indigo-500 via-indigo-600 to-purple-700", shadow: "shadow-indigo-500/30" },
  french: { name: "الفرنسية", icon: Globe, gradient: "from-sky-500 via-sky-600 to-blue-700", shadow: "shadow-sky-500/30" },
};

function stageLabel(stage: string) {
  if (stage === "preparatory") return "المرحلة الإعدادية";
  if (stage === "secondary") return "المرحلة الثانوية";
  return stage;
}

function gradeLabelFn(grade: string) {
  if (grade === "first") return "الصف الأول";
  if (grade === "second") return "الصف الثاني";
  if (grade === "third") return "الصف الثالث";
  return grade;
}

function sectionLabel(section: string | null) {
  if (section === "scientific") return "علمي";
  if (section === "literary") return "أدبي";
  return "";
}

const TeacherSubjectPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const selection = params.get("category") || "";
  const gradeParam = params.get("grade") || "";
  const stage = params.get("stage") || "";

  const [isLoading, setIsLoading] = useState(true);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);

  const headerTitle = useMemo(() => teacherSelectionLabel(selection), [selection]);

  // Get category info for styling
  const filter = useMemo(() => subjectFilterFromTeacherSelection(selection), [selection]);
  const categoryInfo = CATEGORY_INFO[filter?.categoryKey || ""] || { name: headerTitle || "المواد", icon: Book, gradient: "from-gray-500 to-gray-600", shadow: "shadow-gray-500/30" };
  const CategoryIcon = categoryInfo.icon;

  useEffect(() => {
    if (!user || !selection || !gradeParam || !stage) return;

    const run = async () => {
      setIsLoading(true);
      try {
        const gradeKey = gradeKeyFromArabicLabel(gradeParam);
        const f = subjectFilterFromTeacherSelection(selection);

        if (!gradeKey || !f) {
          setSubjects([]);
          return;
        }

        let q = supabase
          .from("subjects")
          .select("id, name, description, category, stage, grade, section")
          .eq("is_active", true)
          .eq("stage", stage)
          .eq("grade", gradeKey)
          .eq("category", f.categoryKey);

        if (f.subjectName) {
          q = q.eq("name", f.subjectName);
        }

        const { data, error } = await q.order("name", { ascending: true });
        if (error) throw error;

        setSubjects((data as SubjectRow[]) || []);
      } catch (e) {
        console.error("Error loading teacher subjects:", e);
        setSubjects([]);
      } finally {
        setIsLoading(false);
      }
    };

    run();
  }, [user, selection, gradeParam, stage]);

  const gradeKey = gradeKeyFromArabicLabel(gradeParam);
  const subtitle = `${stageLabel(stage)} - ${gradeLabelFn(gradeKey || "")}${subjects[0]?.section ? ` - ${sectionLabel(subjects[0].section)}` : ""}`;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between px-4">
          <Link to="/teacher" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-azhari shadow-lg shadow-primary/20 group-hover:shadow-primary/40 transition-shadow">
              <BookOpen className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-gradient-azhari">أزهاريون - لوحة المعلم</span>
          </Link>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
              <Upload className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">وضع الرفع</span>
            </div>
          </div>
        </div>
      </header>

      <main className="container px-4 py-8">
        <Button variant="ghost" className="mb-6 hover:bg-accent" onClick={() => navigate("/teacher")}>
          <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />
          رجوع للوحة المعلم
        </Button>

        {/* Page header with category info */}
        <div className="mb-10">
          <div className="flex items-center gap-4 mb-4">
            <div className={`p-4 rounded-2xl bg-gradient-to-br ${categoryInfo.gradient} text-white shadow-xl ${categoryInfo.shadow}`}>
              <CategoryIcon className="h-10 w-10" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">{categoryInfo.name}</h1>
              <p className="text-muted-foreground text-lg">{subtitle}</p>
            </div>
          </div>
        </div>

        {subjects.length === 0 ? (
          <Card className="border-2 border-dashed">
            <CardContent className="p-12 text-center">
              <div className={`w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br ${categoryInfo.gradient} flex items-center justify-center shadow-xl ${categoryInfo.shadow}`}>
                <CategoryIcon className="h-10 w-10 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-3">لا توجد مواد</h3>
              <p className="text-muted-foreground text-lg mb-6">
                لا توجد مواد مطابقة لتعيينك في هذا القسم
              </p>
              <Button onClick={() => navigate("/teacher")}>
                الرجوع للوحة المعلم
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {subjects.map((subject, index) => {
              const sec = sectionLabel(subject.section);
              return (
                <Card
                  key={subject.id}
                  className="border-2 border-transparent hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10 transition-all duration-300 group bg-card/50 backdrop-blur overflow-hidden cursor-pointer"
                  style={{ animationDelay: `${index * 0.05}s` }}
                  onClick={() =>
                    navigate(
                      `/teacher/upload/subject/${subject.id}?stage=${stage}&grade=${encodeURIComponent(gradeParam)}&section=${subject.section || ""}&category=${encodeURIComponent(selection)}`
                    )
                  }
                >
                  <CardContent className="p-6 relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />

                    <div className="flex items-start gap-4 relative">
                      <div
                        className={`p-3 rounded-xl bg-gradient-to-br ${categoryInfo.gradient} text-white shadow-lg ${categoryInfo.shadow} group-hover:scale-110 transition-transform duration-300`}
                      >
                        <Book className="h-6 w-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors mb-1 truncate">
                          {subject.name}
                        </h3>
                        {subject.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{subject.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between relative">
                      <span className="text-xs text-muted-foreground group-hover:text-primary">
                        {sec ? `${sec} • ` : ""}اضغط للدخول
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default TeacherSubjectPage;

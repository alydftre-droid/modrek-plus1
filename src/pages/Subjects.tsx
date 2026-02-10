import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import NotificationsDropdown from "@/components/student/NotificationsDropdown";
import TeacherBanner from "@/components/student/TeacherBanner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen,
  ChevronLeft,
  Settings,
  LogOut,
  Info,
  MessageSquare,
  Book,
  Loader2,
  BookText,
  BookMarked,
  Beaker,
  Globe,
  Languages,
  Atom,
  Palette,
} from "lucide-react";

type SubjectRow = {
  id: string;
  name: string;
  category: string;
  description: string | null;
};

const CATEGORY_INFO: Record<string, { name: string; icon: typeof BookText; gradient: string; shadow: string }> = {
  arabic: { name: "المواد العربية", icon: BookText, gradient: "from-emerald-500 via-emerald-600 to-teal-700", shadow: "shadow-emerald-500/30" },
  religious: { name: "المواد الشرعية", icon: BookMarked, gradient: "from-amber-500 via-amber-600 to-orange-700", shadow: "shadow-amber-500/30" },
  science: { name: "العلوم", icon: Beaker, gradient: "from-blue-500 via-blue-600 to-indigo-700", shadow: "shadow-blue-500/30" },
  social: { name: "الدراسات", icon: Globe, gradient: "from-purple-500 via-purple-600 to-violet-700", shadow: "shadow-purple-500/30" },
  english: { name: "الإنجليزية", icon: Languages, gradient: "from-rose-500 via-rose-600 to-pink-700", shadow: "shadow-rose-500/30" },
  scientific: { name: "المواد العلمية", icon: Atom, gradient: "from-cyan-500 via-cyan-600 to-blue-700", shadow: "shadow-cyan-500/30" },
  literary: { name: "المواد الأدبية", icon: Palette, gradient: "from-indigo-500 via-indigo-600 to-purple-700", shadow: "shadow-indigo-500/30" },
  french: { name: "الفرنسية", icon: Globe, gradient: "from-sky-500 via-sky-600 to-blue-700", shadow: "shadow-sky-500/30" },
};

function stageLabel(stage: string) {
  if (stage === "preparatory") return "المرحلة الإعدادية";
  if (stage === "secondary") return "المرحلة الثانوية";
  return "";
}

function gradeLabel(grade: string) {
  if (grade === "first") return "الصف الأول";
  if (grade === "second") return "الصف الثاني";
  if (grade === "third") return "الصف الثالث";
  return "";
}

function sectionLabel(section: string) {
  if (section === "scientific") return "علمي";
  if (section === "literary") return "أدبي";
  return "";
}

const Subjects = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { signOut, role, user } = useAuth();

  const stage = params.get("stage") || "";
  const grade = params.get("grade") || "";
  const section = params.get("section") || "";
  const category = params.get("category") || "";

  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showTeacherBanner, setShowTeacherBanner] = useState(true);

  const categoryInfo = CATEGORY_INFO[category] || { name: "المواد", icon: Book, gradient: "from-gray-500 to-gray-600", shadow: "shadow-gray-500/30" };
  const CategoryIcon = categoryInfo.icon;

  const isStudent = role === "student";

  useEffect(() => {
    const run = async () => {
      if (!stage || !grade) {
        navigate("/dashboard", { replace: true });
        return;
      }

      setIsLoading(true);
      try {
        let q = supabase
          .from("subjects")
          .select("id, name, category, description")
          .eq("is_active", true)
          .eq("stage", stage)
          .eq("grade", grade);

        if (stage === "secondary") {
          if (!section) {
            navigate("/dashboard", { replace: true });
            return;
          }
          q = q.eq("section", section);
        }

        if (category) {
          q = q.eq("category", category);
        }

        const { data, error } = await q.order("name", { ascending: true });
        if (error) throw error;

        setSubjects((data as SubjectRow[]) || []);
      } catch (e) {
        console.error(e);
        setSubjects([]);
      } finally {
        setIsLoading(false);
      }
    };

    run();
  }, [stage, grade, section, category, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const subtitle = `${stageLabel(stage)} - ${gradeLabel(grade)}${section ? ` - ${sectionLabel(section)}` : ""}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-azhari shadow-lg shadow-primary/20 group-hover:shadow-primary/40 transition-shadow">
              <BookOpen className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-gradient-azhari">أزهاريون</span>
          </Link>

          <div className="flex items-center gap-2">
            <NotificationsDropdown />

            <Button variant="ghost" size="icon" asChild className="hover:bg-accent">
              <Link to="/about-platform">
                <Info className="h-5 w-5" />
              </Link>
            </Button>

            <Button variant="ghost" size="icon" asChild className="hover:bg-accent">
              <Link to="/support">
                <MessageSquare className="h-5 w-5" />
              </Link>
            </Button>

            {role === "admin" && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
                <span className="text-sm font-medium text-primary">وضع الرفع</span>
              </div>
            )}

            <Button variant="ghost" size="icon" className="hover:bg-accent">
              <Settings className="h-5 w-5" />
            </Button>

            <Button variant="ghost" size="icon" onClick={handleSignOut} className="hover:bg-destructive/10 hover:text-destructive">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container px-4 py-8">
        <Button variant="ghost" className="mb-6 hover:bg-accent" onClick={() => navigate("/dashboard")}> 
          <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />
          رجوع للرئيسية
        </Button>

        {/* رأس الصفحة مع معلومات القسم */}
        <div className="mb-8">
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

        {/* Teacher Banner - shows at category level for students */}
        {isStudent && category && showTeacherBanner && (
          <div className="mb-8">
            <TeacherBanner
              category={category}
              stage={stage}
              grade={grade}
              section={section || null}
              onDismiss={() => setShowTeacherBanner(false)}
              onTeacherSelected={() => {
                // Refresh or stay - teacher chosen
              }}
            />
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </div>
        ) : subjects.length === 0 ? (
          <Card className="border-2 border-dashed">
            <CardContent className="p-12 text-center">
              <div className={`w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br ${categoryInfo.gradient} flex items-center justify-center shadow-xl ${categoryInfo.shadow}`}>
                <CategoryIcon className="h-10 w-10 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-3">لا توجد مواد</h3>
              <p className="text-muted-foreground text-lg mb-6">لم يتم إضافة مواد لهذا القسم بعد</p>
              <Button variant="outline" onClick={() => navigate("/dashboard")}>
                العودة للرئيسية
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {subjects.map((subject, index) => (
              <Card
                key={subject.id}
                className="cursor-pointer border-2 border-transparent hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10 transition-all duration-300 group bg-card/50 backdrop-blur overflow-hidden hover:-translate-y-1"
                style={{ animationDelay: `${index * 0.05}s` }}
                onClick={() =>
                  navigate(
                    `/subject/${subject.id}?stage=${stage}&grade=${grade}${section ? `&section=${section}` : ""}`
                  )
                }
              >
                <CardContent className="p-6 relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="flex items-start gap-4 relative">
                    <div className={`p-3 rounded-xl bg-gradient-to-br ${categoryInfo.gradient} text-white shadow-lg ${categoryInfo.shadow} group-hover:scale-110 transition-transform duration-300`}>
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

                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">اضغط للدخول</span>
                    <ChevronLeft className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:-translate-x-1 transition-all" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Subjects;

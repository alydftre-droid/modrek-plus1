import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import TeacherGroupManager from "@/components/teacher/TeacherGroupManager";
import { getCurrentTermForStageGrade } from "@/lib/termSystem";
import { categorySupportsSubSubjects } from "@/lib/subSubjectDefaults";

import {
  Loader2,
  ChevronLeft,
  BookOpen,
  Upload,
  BookText,
  BookMarked,
  Beaker,
  Globe,
  Languages,
  Atom,
  Palette,
  Package,
  Calendar,
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
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

type GroupRow = {
  id: string;
  title: string;
  description: string | null;
  month_label: string | null;
  image_url: string | null;
  price: number;
  price_approved: boolean | null;
  section_name: string;
  subject_id: string;
  is_active: boolean;
  lesson_count: number | null;
  start_date: string | null;
  end_date: string | null;
};

const CATEGORY_INFO: Record<string, { name: string; icon: typeof BookText; gradient: string; shadow: string }> = {
  arabic: { name: "المواد العربية", icon: BookText, gradient: "from-emerald-500 via-emerald-600 to-teal-700", shadow: "shadow-emerald-500/30" },
  sharia: { name: "المواد الشرعية", icon: BookMarked, gradient: "from-amber-500 via-amber-600 to-orange-700", shadow: "shadow-amber-500/30" },
  science: { name: "العلوم", icon: Beaker, gradient: "from-blue-500 via-blue-600 to-indigo-700", shadow: "shadow-blue-500/30" },
  integrated_science: { name: "العلوم المتكاملة", icon: Beaker, gradient: "from-cyan-500 via-teal-500 to-emerald-600", shadow: "shadow-cyan-500/30" },
  studies: { name: "الدراسات", icon: Globe, gradient: "from-purple-500 via-purple-600 to-violet-700", shadow: "shadow-purple-500/30" },
  math: { name: "الرياضيات", icon: Atom, gradient: "from-fuchsia-500 via-violet-600 to-indigo-700", shadow: "shadow-fuchsia-500/30" },
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

const TeacherSubjectPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const selection = params.get("category") || "";
  const gradeParam = params.get("grade") || "";
  const stage = params.get("stage") || "";

  const [isLoading, setIsLoading] = useState(true);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [editingGroup, setEditingGroup] = useState<GroupRow | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<GroupRow | null>(null);

  const headerTitle = useMemo(() => teacherSelectionLabel(selection), [selection]);
  const filter = useMemo(() => subjectFilterFromTeacherSelection(selection), [selection]);
  const categoryInfo = CATEGORY_INFO[filter?.categoryKey || ""] || { name: headerTitle || "المواد", icon: BookText, gradient: "from-gray-500 to-gray-600", shadow: "shadow-gray-500/30" };
  const CategoryIcon = categoryInfo.icon;

  // Fetch subjects and groups
  useEffect(() => {
    if (!user || !selection || !gradeParam || !stage) return;

    const run = async () => {
      setIsLoading(true);
      try {
        const gradeKey = gradeKeyFromArabicLabel(gradeParam);
        const f = subjectFilterFromTeacherSelection(selection);

        if (!gradeKey || !f) {
          setSubjects([]);
          setGroups([]);
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

        const allSubjects = (data || []) as SubjectRow[];
        setSubjects(allSubjects);

        // Fetch groups across all subjects for this teacher
        if (allSubjects.length > 0) {
          const activeTerm = await getCurrentTermForStageGrade(allSubjects[0].stage, allSubjects[0].grade);
          const subjectIds = allSubjects.map(s => s.id);
          const { data: groupsData } = await supabase
            .from("content_groups")
            .select("*")
            .in("subject_id", subjectIds)
            .eq("term", activeTerm)
            .or(`teacher_id.eq.${user.id},created_by.eq.${user.id}`)
            .eq("is_active", true)
            .order("created_at", { ascending: false });

          setGroups((groupsData as GroupRow[]) || []);
        } else {
          setGroups([]);
        }
      } catch (e) {
        console.error("Error loading teacher data:", e);
        setSubjects([]);
        setGroups([]);
      } finally {
        setIsLoading(false);
      }
    };

    run();
  }, [user, selection, gradeParam, stage]);

  const fetchGroups = async () => {
    if (!user || subjects.length === 0) return;
    try {
      const activeTerm = await getCurrentTermForStageGrade(subjects[0].stage, subjects[0].grade);
      const subjectIds = subjects.map(s => s.id);
      const { data: groupsData } = await supabase
        .from("content_groups")
        .select("*")
        .in("subject_id", subjectIds)
        .eq("term", activeTerm)
        .or(`teacher_id.eq.${user.id},created_by.eq.${user.id}`)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      setGroups((groupsData as GroupRow[]) || []);
    } catch (e) {
      console.error(e);
    }
  };

  const gradeKey = gradeKeyFromArabicLabel(gradeParam);
  const subtitle = `${stageLabel(stage)} - ${gradeLabelFn(gradeKey || "")}`;

  // Get first subject ID for group creation
  const firstSubjectId = subjects.length > 0 ? subjects[0].id : null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between px-4">
          <Link to="/teacher" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-mudrik shadow-lg shadow-primary/20 group-hover:shadow-primary/40 transition-shadow">
              <BookOpen className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-gradient-mudrik">مدرك Plus - لوحة المعلم</span>
          </Link>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
            <Upload className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">وضع الرفع</span>
          </div>
        </div>
      </header>

      <main className="container px-4 py-8">
        <Button variant="ghost" className="mb-6 hover:bg-accent" onClick={() => navigate("/teacher")}>
          <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />
          رجوع للوحة المعلم
        </Button>

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

        {/* Groups Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Package className="h-6 w-6 text-primary" />
              المجموعات / الكورسات
            </h2>
            {firstSubjectId && (
              <TeacherGroupManager
                subjectId={firstSubjectId}
                sectionName="both"
                renderTriggerOnly
                onGroupCreated={fetchGroups}
              />
            )}
          </div>

          {groups.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="p-12 text-center">
                <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-bold mb-2">لا توجد مجموعات بعد</h3>
                <p className="text-muted-foreground mb-6">أنشئ مجموعة جديدة لتنظيم المحتوى وبيعه للطلاب</p>
                {firstSubjectId && (
                  <TeacherGroupManager
                    subjectId={firstSubjectId}
                    sectionName="both"
                    renderTriggerOnly
                    onGroupCreated={fetchGroups}
                  />
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((group) => {
                const subjectCat = subjects.find(s => s.id === group.subject_id)?.category || filter?.categoryKey || "";
                const needsSubSubjects = categorySupportsSubSubjects(subjectCat);
                
                const handleGroupClick = () => {
                  const baseUrl = needsSubSubjects 
                    ? `/teacher/sub-subjects/${group.subject_id}`
                    : `/teacher/upload/subject/${group.subject_id}`;
                  navigate(
                    `${baseUrl}?stage=${stage}&grade=${encodeURIComponent(gradeParam)}&category=${encodeURIComponent(selection)}&subjectName=${encodeURIComponent(
                      subjects.find(s => s.id === group.subject_id)?.name || ""
                    )}&groupId=${group.id}`
                  );
                };
                
                return (
                <Card
                  key={group.id}
                  className="overflow-hidden cursor-pointer hover:shadow-xl hover:border-primary/30 transition-all duration-300 group/card"
                  onClick={handleGroupClick}
                >
                  {group.image_url && (
                    <div className="h-36 bg-muted overflow-hidden">
                      <img src={group.image_url} alt={group.title} className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-300" />
                    </div>
                  )}
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-lg group-hover/card:text-primary transition-colors">{group.title}</h4>
                        {group.month_label && (
                          <Badge variant="outline" className="gap-1 text-xs mt-1">
                            <Calendar className="h-3 w-3" />
                            {group.month_label}
                          </Badge>
                        )}
                      </div>
                      <Badge className="bg-primary text-primary-foreground font-bold">{group.price} جنيه</Badge>
                    </div>
                    {group.description && <p className="text-sm text-muted-foreground line-clamp-2">{group.description}</p>}
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {group.lesson_count ? <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" />{group.lesson_count} حصة</span> : null}
                      {group.start_date && <span>من: {group.start_date}</span>}
                      {group.end_date && <span>إلى: {group.end_date}</span>}
                    </div>
                    {group.price_approved === false && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <AlertTriangle className="h-3 w-3" />
                        بانتظار موافقة السعر
                      </Badge>
                    )}
                    <p className="text-xs text-primary font-medium">اضغط للدخول ورفع المحتوى ←</p>
                  </CardContent>
                </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default TeacherSubjectPage;

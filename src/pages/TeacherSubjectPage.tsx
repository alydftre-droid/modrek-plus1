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
import { SignedImage } from "@/components/common/SignedImage";
import WeeklyScheduleDisplay from "@/components/common/WeeklyScheduleDisplay";
import { parseWeeklySchedule } from "@/lib/weeklySchedule";

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
  MoreVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  weekly_schedule?: unknown;
};

const CATEGORY_INFO: Record<string, { name: string; icon: typeof BookText; gradient: string; shadow: string }> = {
  arabic: { name: "المواد العربية", icon: BookText, gradient: "linear-gradient(135deg, #f59e0b 0%, #ea580c 50%, #b45309 100%)", shadow: "0 12px 30px -8px rgba(234, 88, 12, 0.55)" },
  sharia: { name: "المواد الشرعية", icon: BookMarked, gradient: "linear-gradient(135deg, #059669 0%, #0d9488 50%, #065f46 100%)", shadow: "0 12px 30px -8px rgba(5, 150, 105, 0.55)" },
  science: { name: "العلوم", icon: Beaker, gradient: "linear-gradient(135deg, #3b82f6 0%, #2563eb 50%, #4338ca 100%)", shadow: "0 12px 30px -8px rgba(37, 99, 235, 0.55)" },
  integrated_science: { name: "العلوم المتكاملة", icon: Beaker, gradient: "linear-gradient(135deg, #06b6d4 0%, #14b8a6 50%, #059669 100%)", shadow: "0 12px 30px -8px rgba(6, 182, 212, 0.55)" },
  studies: { name: "الدراسات", icon: Globe, gradient: "linear-gradient(135deg, #a855f7 0%, #9333ea 50%, #6d28d9 100%)", shadow: "0 12px 30px -8px rgba(147, 51, 234, 0.55)" },
  math: { name: "الرياضيات", icon: Atom, gradient: "linear-gradient(135deg, #d946ef 0%, #7c3aed 50%, #4338ca 100%)", shadow: "0 12px 30px -8px rgba(124, 58, 237, 0.55)" },
  english: { name: "الإنجليزية", icon: Languages, gradient: "linear-gradient(135deg, #f43f5e 0%, #e11d48 50%, #be185d 100%)", shadow: "0 12px 30px -8px rgba(225, 29, 72, 0.55)" },
  scientific: { name: "المواد العلمية", icon: Atom, gradient: "linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #1d4ed8 100%)", shadow: "0 12px 30px -8px rgba(8, 145, 178, 0.55)" },
  literary: { name: "المواد الأدبية", icon: Palette, gradient: "linear-gradient(135deg, #6366f1 0%, #4f46e5 50%, #6d28d9 100%)", shadow: "0 12px 30px -8px rgba(79, 70, 229, 0.55)" },
  french: { name: "الفرنسية", icon: Globe, gradient: "linear-gradient(135deg, #0ea5e9 0%, #0284c7 50%, #1d4ed8 100%)", shadow: "0 12px 30px -8px rgba(2, 132, 199, 0.55)" },
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
  // Only a developer impersonating a teacher may delete groups.
  const canDeleteGroups = isDeveloperTeacherMode();

  const headerTitle = useMemo(() => teacherSelectionLabel(selection), [selection]);
  const filter = useMemo(() => subjectFilterFromTeacherSelection(selection), [selection]);
  const baseCategoryInfo = CATEGORY_INFO[filter?.categoryKey || ""] || { name: headerTitle || "المواد", icon: BookText, gradient: "linear-gradient(135deg, #64748b, #475569)", shadow: "0 12px 30px -8px rgba(71, 85, 105, 0.55)" };
  const categoryInfo = {
    ...baseCategoryInfo,
    // Keep specialised secondary subjects (geology, biology, physics, etc.)
    // labelled by their real subject instead of their broad DB category.
    name: filter?.subjectName || baseCategoryInfo.name,
  };
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
            <div
              className="p-4 rounded-2xl text-white shadow-xl"
              style={{ background: categoryInfo.gradient, boxShadow: categoryInfo.shadow }}
            >
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
                externalEditGroup={editingGroup as any}
                externalDeleteGroup={deletingGroup as any}
                onExternalActionDone={() => { setEditingGroup(null); setDeletingGroup(null); }}
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
                externalEditGroup={editingGroup as any}
                externalDeleteGroup={deletingGroup as any}
                onExternalActionDone={() => { setEditingGroup(null); setDeletingGroup(null); }}
                    onGroupCreated={fetchGroups}
                  />
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((group) => {
                const groupSubject = subjects.find(s => s.id === group.subject_id);
                const subjectCat = groupSubject?.category || filter?.categoryKey || "";
                const needsSubSubjects =
                  categorySupportsSubSubjects(subjectCat) ||
                  categorySupportsSubSubjects(groupSubject?.name || filter?.subjectName || selection);
                
                const handleGroupClick = () => {
                  const baseUrl = needsSubSubjects 
                    ? `/teacher/sub-subjects/${group.subject_id}`
                    : `/teacher/upload/subject/${group.subject_id}`;
                  navigate(
                    `${baseUrl}?stage=${stage}&grade=${encodeURIComponent(gradeParam)}&category=${encodeURIComponent(selection)}&subjectName=${encodeURIComponent(
                      groupSubject?.name || ""
                    )}&groupId=${group.id}`
                  );
                };
                
                return (
                <Card
                  key={group.id}
                  className="relative overflow-hidden cursor-pointer hover:shadow-xl hover:border-primary/30 transition-all duration-300 group/card"
                  onClick={handleGroupClick}
                >
                  {group.image_url && (
                    <div className="h-36 bg-muted overflow-hidden">
                      <SignedImage bucket="books" url={group.image_url} alt={group.title} className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-300" />
                    </div>
                  )}
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="font-bold text-lg group-hover/card:text-primary transition-colors">{group.title}</h4>
                        {group.month_label && (
                          <Badge variant="outline" className="gap-1 text-xs mt-1">
                            <Calendar className="h-3 w-3" />
                            {group.month_label}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge className="bg-primary text-primary-foreground font-bold">{group.price} جنيه</Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 rounded-full hover:bg-muted"
                              aria-label="خيارات المجموعة"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditingGroup(group); }}>
                              <Pencil className="h-4 w-4 ml-2" />
                              تعديل المجموعة
                            </DropdownMenuItem>
                            {canDeleteGroups && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={(e) => { e.stopPropagation(); setDeletingGroup(group); }}
                              >
                                <Trash2 className="h-4 w-4 ml-2" />
                                حذف المجموعة
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {group.description && <p className="text-sm text-muted-foreground line-clamp-2">{group.description}</p>}
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {group.lesson_count ? <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" />{group.lesson_count} حصة</span> : null}
                      {group.start_date && <span>من: {group.start_date}</span>}
                      {group.end_date && <span>إلى: {group.end_date}</span>}
                    </div>
                    <WeeklyScheduleDisplay variant="banner" slots={parseWeeklySchedule(group.weekly_schedule)} />
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

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import TeacherGroupManager from "@/components/teacher/TeacherGroupManager";
import { SignedImage } from "@/components/common/SignedImage";
import { categorySupportsSubSubjects } from "@/lib/subSubjectDefaults";
import StoredImage from "@/components/common/StoredImage";
import {
  BookOpen, ChevronLeft, Upload, Loader2, GraduationCap, Package, Calendar, AlertTriangle, Plus,
  BookText, BookMarked, Beaker, Globe, Languages, Atom, Palette, Pencil, Trash2,
} from "lucide-react";

type SubjectRow = { id: string; name: string; stage: string; grade: string; section: string | null; category: string; };
type TeacherOption = { id: string; name: string; photo_url: string | null; };
type GroupRow = {
  id: string; title: string; description: string | null; month_label: string | null;
  image_url: string | null; price: number; price_approved: boolean | null;
  section_name: string; subject_id: string; is_active: boolean;
  lesson_count: number | null; start_date: string | null; end_date: string | null;
};

const CATEGORY_INFO: Record<string, { name: string; icon: typeof BookText; gradient: string; shadow: string }> = {
  arabic: { name: "المواد العربية", icon: BookText, gradient: "from-emerald-500 via-emerald-600 to-teal-700", shadow: "shadow-emerald-500/30" },
  sharia: { name: "المواد الشرعية", icon: BookMarked, gradient: "from-amber-500 via-amber-600 to-orange-700", shadow: "shadow-amber-500/30" },
  religious: { name: "المواد الشرعية", icon: BookMarked, gradient: "from-amber-500 via-amber-600 to-orange-700", shadow: "shadow-amber-500/30" },
  science: { name: "العلوم", icon: Beaker, gradient: "from-blue-500 via-blue-600 to-indigo-700", shadow: "shadow-blue-500/30" },
  studies: { name: "الدراسات", icon: Globe, gradient: "from-purple-500 via-purple-600 to-violet-700", shadow: "shadow-purple-500/30" },
  social: { name: "الدراسات", icon: Globe, gradient: "from-purple-500 via-purple-600 to-violet-700", shadow: "shadow-purple-500/30" },
  english: { name: "الإنجليزية", icon: Languages, gradient: "from-rose-500 via-rose-600 to-pink-700", shadow: "shadow-rose-500/30" },
  scientific: { name: "المواد العلمية", icon: Atom, gradient: "from-cyan-500 via-cyan-600 to-blue-700", shadow: "shadow-cyan-500/30" },
  literary: { name: "المواد الأدبية", icon: Palette, gradient: "from-indigo-500 via-indigo-600 to-purple-700", shadow: "shadow-indigo-500/30" },
  french: { name: "الفرنسية", icon: Globe, gradient: "from-sky-500 via-sky-600 to-blue-700", shadow: "shadow-sky-500/30" },
};

function stageLabel(s: string) { return s === "preparatory" ? "المرحلة الإعدادية" : s === "secondary" ? "المرحلة الثانوية" : ""; }
function gradeLabel(g: string) { return g === "first" ? "الصف الأول" : g === "second" ? "الصف الثاني" : g === "third" ? "الصف الثالث" : ""; }

type TeacherAssignmentRow = {
  teacher_id: string;
  category: string | null;
  stage: string | null;
  grade: string | null;
  section: string | null;
};

function needsSubSubjects(category: string, subjectName?: string | null): boolean {
  return categorySupportsSubSubjects(category) || categorySupportsSubSubjects(subjectName);
}

function normalizeText(value: string): string {
  return (value || "").toLowerCase().trim();
}

function canonicalCategory(value: string): string {
  const v = normalizeText(value);
  if (v.includes("عربي") || v === "arabic") return "arabic";
  if (v.includes("شرع") || v === "sharia" || v === "religious") return "sharia";
  if (v.includes("انج") || v.includes("english")) return "english";
  if (v.includes("فرنسي") || v.includes("french")) return "french";
  if (v.includes("علمي") || v === "scientific") return "scientific";
  if (v.includes("أدبي") || v.includes("ادبي") || v === "literary") return "literary";
  if (v.includes("دراسات") || v === "studies" || v === "social") return "studies";
  if (v.includes("علوم") || v === "science") return "science";
  return v;
}

function canonicalSection(value: string): string {
  const v = normalizeText(value);
  if (!v) return "";
  if (v.includes("علمي") || v === "scientific") return "scientific";
  if (v.includes("أدبي") || v.includes("ادبي") || v === "literary") return "literary";
  if (v.includes("القسمين") || v === "both") return "both";
  return v;
}

function getStageAliases(stage: string): string[] {
  const v = normalizeText(stage);
  if (v === "secondary" || v.includes("ثانوي")) return ["secondary", "المرحلة الثانوية"];
  if (v === "preparatory" || v.includes("إعدادي") || v.includes("اعدادي")) return ["preparatory", "المرحلة الإعدادية", "المرحلة الاعدادية"];
  return [stage].filter(Boolean);
}

function getGradeAliases(grade: string): string[] {
  const v = normalizeText(grade);
  if (v === "first" || v.includes("الأول") || v.includes("الاول")) {
    return ["first", "الصف الأول", "الصف الاول", "الصف الأول الثانوي", "الصف الاول الثانوي", "الصف الأول الإعدادي", "الصف الاول الاعدادي"];
  }
  if (v === "second" || v.includes("الثاني")) {
    return ["second", "الصف الثاني", "الصف الثاني الثانوي", "الصف الثاني الإعدادي"];
  }
  if (v === "third" || v.includes("الثالث")) {
    return ["third", "الصف الثالث", "الصف الثالث الثانوي", "الصف الثالث الإعدادي"];
  }
  return [grade].filter(Boolean);
}

function matchesTeacherAssignment(
  assignment: TeacherAssignmentRow,
  category: string,
  selectedSection: string,
): boolean {
  const categoryMatches = canonicalCategory(assignment.category || "") === canonicalCategory(category);
  if (!categoryMatches) return false;

  if (!selectedSection || canonicalSection(selectedSection) === "both") return true;

  const assignmentSection = canonicalSection(assignment.section || "");
  if (!assignmentSection) return true; // legacy rows without section should still match

  return assignmentSection === canonicalSection(selectedSection);
}

const AdminUploadSubjectContent = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  const subjectId = searchParams.get("subjectId") || ""; // optional now
  const stageParam = searchParams.get("stage") || "";
  const gradeParam = searchParams.get("grade") || "";
  const sectionParam = searchParams.get("section") || "";
  const categoryParam = searchParams.get("category") || "";
  const subjectNameParam = searchParams.get("subject_name") || "";

  const subjectNameVariants = useMemo(() => {
    const v = subjectNameParam.trim();
    if (!v) return [] as string[];
    return [...new Set([v, v.replace(/^ال/, ""), v.startsWith("ال") ? v : `ال${v}`].filter(Boolean))];
  }, [subjectNameParam]);

  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [editingGroup, setEditingGroup] = useState<GroupRow | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<GroupRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Teacher selection
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [loadingTeachers, setLoadingTeachers] = useState(true);

  const categoryInfo = CATEGORY_INFO[categoryParam] || { name: "المواد", icon: BookText, gradient: "from-gray-500 to-gray-600", shadow: "shadow-gray-500/30" };
  const CategoryIcon = categoryInfo.icon;
  const subtitle = `${stageLabel(stageParam)} - ${gradeLabel(gradeParam)}`;

  const backTo = useMemo(() => {
    return "/admin/upload";
  }, []);

  // Fetch teachers for this subject's category
  useEffect(() => {
    const fetchTeachers = async () => {
      if (!categoryParam || !stageParam || !gradeParam) return;

      setLoadingTeachers(true);
      try {
        const { data: assignments } = await supabase
          .from("teacher_assignments")
          .select("teacher_id, category, stage, grade, section")
          .in("stage", getStageAliases(stageParam))
          .in("grade", getGradeAliases(gradeParam));

        const matchedAssignments = ((assignments || []) as TeacherAssignmentRow[]).filter((assignment) => {
          // If we have a specific subject_name (e.g. الفيزياء), match either the parent category
          // OR an assignment whose category equals the subject_name itself.
          if (subjectNameVariants.length) {
            const assignCat = (assignment.category || "").trim();
            const subjectMatches = subjectNameVariants.some(
              (v) => v === assignCat || canonicalCategory(v) === canonicalCategory(assignCat),
            );
            if (subjectMatches) return true;
          }
          return matchesTeacherAssignment(assignment, categoryParam, sectionParam);
        });

        let teacherIds = [...new Set(matchedAssignments.map((a) => a.teacher_id).filter(Boolean))];

        // Also include approved teacher_requests for this subject/category
        try {
          const variants = subjectNameVariants.length
            ? [...subjectNameVariants, categoryParam]
            : [categoryParam];
          const { data: requestRows } = await supabase
            .from("teacher_requests")
            .select("user_id, assigned_grades, assigned_stages, assigned_category, status")
            .eq("status", "approved")
            .in("assigned_category", variants);
          const stageAliases = getStageAliases(stageParam);
          const gradeAliases = getGradeAliases(gradeParam);
          const extraIds = (requestRows || [])
            .filter((r: any) =>
              (r.assigned_stages || []).some((s: string) => stageAliases.includes(s)) &&
              (r.assigned_grades || []).some((g: string) => gradeAliases.includes(g))
            )
            .map((r: any) => r.user_id);
          teacherIds = [...new Set([...teacherIds, ...extraIds])];
        } catch (err) {
          console.warn("teacher_requests lookup failed", err);
        }

        // Fallback: if no assignments matched, infer teachers from content_groups for these subjects
        if (teacherIds.length === 0) {
          let subQ = supabase
            .from("subjects")
            .select("id")
            .eq("stage", stageParam)
            .eq("grade", gradeParam)
            .eq("is_active", true);

          if (subjectNameVariants.length) {
            subQ = subQ.in("name", subjectNameVariants);
          } else {
            subQ = subQ.eq("category", categoryParam);
          }

          const { data: subjectsForFallback } = await subQ;
          const subjectIds = (subjectsForFallback || []).map(s => s.id);

          if (subjectIds.length > 0) {
            const { data: groupsData } = await supabase
              .from("content_groups")
              .select("teacher_id, created_by")
              .in("subject_id", subjectIds)
              .eq("is_active", true);

            teacherIds = [
              ...new Set(
                (groupsData || [])
                  .flatMap((row) => [row.teacher_id, row.created_by])
                  .filter((id): id is string => Boolean(id)),
              ),
            ];
          }
        }

        if (teacherIds.length === 0) {
          setTeachers([]);
          return;
        }

        const [{ data: profiles }, { data: tProfiles }] = await Promise.all([
          supabase.from("profiles").select("id, full_name").in("id", teacherIds),
          supabase.from("teacher_profiles").select("teacher_id, photo_url").in("teacher_id", teacherIds),
        ]);

        const photoMap = new Map((tProfiles || []).map((t) => [t.teacher_id, t.photo_url]));
        setTeachers(
          (profiles || []).map((p) => ({
            id: p.id,
            name: p.full_name,
            photo_url: photoMap.get(p.id) || null,
          })),
        );
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingTeachers(false);
      }
    };

    fetchTeachers();
  }, [categoryParam, stageParam, gradeParam, sectionParam, subjectId, subjectNameParam]);

  // Fetch subjects and groups after teacher selection
  useEffect(() => {
    if (!selectedTeacherId) return;
    fetchData();
  }, [selectedTeacherId, categoryParam, stageParam, gradeParam, sectionParam, subjectNameParam]);

  const fetchData = async () => {
    if (!selectedTeacherId || !categoryParam || !stageParam || !gradeParam) return;
    setIsLoading(true);
    try {
      // Get subjects: filter by subject_name if provided, else by category
      let q = supabase
        .from("subjects")
        .select("id, name, stage, grade, section, category")
        .eq("stage", stageParam)
        .eq("grade", gradeParam)
        .eq("is_active", true);

      if (subjectNameVariants.length) {
        q = q.in("name", subjectNameVariants);
      } else {
        q = q.eq("category", categoryParam);
      }

      if (sectionParam && sectionParam !== "both") {
        q = q.or(`section.eq.${sectionParam},section.is.null`);
      }

      const { data: subjectsData } = await q;
      const allSubjects = (subjectsData as SubjectRow[]) || [];
      setSubjects(allSubjects);

      if (allSubjects.length === 0) {
        setGroups([]);
        setIsLoading(false);
        return;
      }

      // Fetch groups across all subjects for this teacher
      const subjectIds = allSubjects.map(s => s.id);
      const { data: groupsData } = await supabase
        .from("content_groups").select("*")
        .in("subject_id", subjectIds)
        .or(`teacher_id.eq.${selectedTeacherId},created_by.eq.${selectedTeacherId}`)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      setGroups((groupsData as GroupRow[]) || []);
    } catch (e) {
      console.error(e);
      toast({ title: "خطأ", description: "فشل تحميل البيانات", variant: "destructive" });
    } finally { setIsLoading(false); }
  };

  const firstSubjectId = subjects.length > 0 ? subjects[0].id : subjectId;

  const handleGroupClick = (group: GroupRow) => {
    const subjectCat = subjects.find(s => s.id === group.subject_id)?.category || categoryParam;
    const subjectForGroup = subjects.find(s => s.id === group.subject_id);
    
    if (needsSubSubjects(subjectCat, subjectForGroup?.name || subjectNameParam)) {
      navigate(
        `/admin/upload/sub-subjects/${group.subject_id}?stage=${stageParam}&grade=${gradeParam}&category=${categoryParam}&subjectName=${encodeURIComponent(subjectForGroup?.name || "")}&groupId=${group.id}&teacherId=${selectedTeacherId}`
      );
    } else {
      navigate(
        `/admin/upload/subject/${group.subject_id}?stage=${stageParam}&grade=${gradeParam}&category=${categoryParam}&subjectName=${encodeURIComponent(subjectForGroup?.name || "")}&groupId=${group.id}&teacherId=${selectedTeacherId}`
      );
    }
  };

  // Teacher picker screen
  if (!selectedTeacherId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
        <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
          <div className="container flex h-16 items-center justify-between px-4">
            <Link to="/admin" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-mudrik shadow-lg shadow-primary/20">
                <BookOpen className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-gradient-mudrik">مدرك Plus - رفع المحتوى</span>
            </Link>
          </div>
        </header>
        <main className="container px-4 py-8">
          <Button variant="ghost" className="mb-6" onClick={() => navigate(backTo)}>
            <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />رجوع للأقسام
          </Button>
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold mb-2">اختر المعلم لإدارة المحتوى</h1>
            <p className="text-muted-foreground">اختر المعلم الذي تريد إدارة محتواه</p>
          </div>
          {loadingTeachers ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : teachers.length === 0 ? (
            <Card className="max-w-md mx-auto border-2 border-dashed">
              <CardContent className="p-8 text-center">
                <GraduationCap className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-bold mb-2">لا يوجد معلمين</h3>
                <p className="text-muted-foreground">لم يتم تعيين معلمين لهذه المادة</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {teachers.map(t => (
                <Card key={t.id} className="cursor-pointer hover:shadow-xl hover:border-primary/30 transition-all duration-300" onClick={() => setSelectedTeacherId(t.id)}>
                  <CardContent className="p-6 text-center">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary/20 to-accent flex items-center justify-center overflow-hidden">
                      {t.photo_url ? (
                        <StoredImage source={t.photo_url} alt={t.name} className="w-full h-full object-cover" />
                      ) : (
                        <GraduationCap className="h-10 w-10 text-primary/50" />
                      )}
                    </div>
                    <h3 className="font-bold text-lg">{t.name}</h3>
                    <Button className="mt-3 w-full">اختيار</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  // Groups view (mirrors TeacherSubjectPage)
  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between px-4">
          <Link to="/admin" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-mudrik shadow-lg shadow-primary/20">
              <BookOpen className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-gradient-mudrik">مدرك Plus - وضع المطور</span>
          </Link>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="gap-1 bg-amber-500/10 border-amber-500/30 text-amber-700">
              <GraduationCap className="h-3 w-3" />
              {teachers.find(t => t.id === selectedTeacherId)?.name || "معلم"}
            </Badge>
            <Badge className="bg-primary/10 text-primary border border-primary/20">
              <Upload className="h-3 w-3 ml-1" />
              وضع المطور
            </Badge>
            <Button variant="outline" size="sm" onClick={() => setSelectedTeacherId(null)}>تغيير المعلم</Button>
          </div>
        </div>
      </header>

      <main className="container px-4 py-8">
        <Button variant="ghost" className="mb-6 hover:bg-accent" onClick={() => navigate(backTo)}>
          <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />رجوع للأقسام
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
                teacherIdOverride={selectedTeacherId}
                renderTriggerOnly
                externalEditGroup={editingGroup as any}
                externalDeleteGroup={deletingGroup as any}
                onExternalActionDone={() => { setEditingGroup(null); setDeletingGroup(null); }}
                onGroupCreated={fetchData}
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
                    teacherIdOverride={selectedTeacherId}
                    renderTriggerOnly
                externalEditGroup={editingGroup as any}
                externalDeleteGroup={deletingGroup as any}
                onExternalActionDone={() => { setEditingGroup(null); setDeletingGroup(null); }}
                    onGroupCreated={fetchData}
                  />
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((group) => (
                <Card
                  key={group.id}
                  className="relative overflow-hidden cursor-pointer hover:shadow-xl hover:border-primary/30 transition-all duration-300 group/card"
                  onClick={() => handleGroupClick(group)}
                >
                  {group.image_url && (
                    <div className="h-36 bg-muted overflow-hidden">
                      <SignedImage bucket="books" url={group.image_url} alt={group.title} className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-300" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity z-10">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-8 w-8 rounded-full bg-white/90 shadow-sm hover:bg-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingGroup(group);
                      }}
                    >
                      <Pencil className="h-4 w-4 text-foreground" />
                    </Button>
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-8 w-8 rounded-full shadow-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingGroup(group);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
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
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AdminUploadSubjectContent;

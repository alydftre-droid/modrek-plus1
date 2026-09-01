import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import TeacherProfileCard from "@/components/teacher/TeacherProfileCard";
import PaywallDialog from "@/components/subscription/PaywallDialog";
import TeacherSelectionErrorDialog, {
  buildTeacherDataDiagnostic,
  buildTeacherSelectionDiagnostic,
  type TeacherSelectionDiagnostic,
} from "@/components/student/TeacherSelectionErrorDialog";
import mudrikLogo from "@/assets/mudrik-logo.png";
import {
  ChevronLeft,
  Loader2,
  GraduationCap,
  Info,
  MessageSquare,
  Settings,
  LogOut,
} from "lucide-react";
import NotificationsDropdown from "@/components/student/NotificationsDropdown";
import {
  buildTeacherEducationTypeMap,
  filterAssignmentsForStudent,
  TEACHER_ASSIGNMENT_CATEGORY_VARIANTS,
  TEACHER_ASSIGNMENT_GRADE_VARIANTS,
} from "@/lib/teacherFiltering";
import { normalizeSectionForSubjects } from "@/lib/educationSection";
import { choiceCategoryKeyFromSelection, choiceCategoryVariantsFromSelection, normalizeSubjectSelectionName } from "@/lib/teacherSubjectUtils";
import { getPostSignOutPath } from "@/lib/devImpersonation";

interface TeacherInfo {
  teacher_id: string;
  teacher_name: string;
  bio: string | null;
  photo_url: string | null;
  video_url: string | null;
  cover_image_url?: string | null;
  professional_title?: string | null;
  experience_years?: number;
  qualifications?: string[];
  achievements?: string[];
  category: string;
  grades: string[];
}

interface TeacherRequestMatch {
  user_id: string;
  assigned_grades: string[] | null;
  assigned_stages: string[] | null;
  education_type: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  arabic: "المواد العربية",
  religious: "المواد الشرعية",
  sharia: "المواد الشرعية",
  math: "الرياضيات",
  english: "الإنجليزية",
  french: "الفرنسية",
  science: "العلوم",
  scientific: "المواد العلمية",
  studies: "الدراسات",
  social: "الدراسات",
  literary: "المواد الأدبية",
  history_geo: "التاريخ والجغرافيا",
};

const CATEGORY_VARIANTS: Record<string, string[]> = {
  arabic: ["arabic", "المواد العربية", "لغة عربية", "اللغة العربية"],
};

const GRADE_VARIANTS_FALLBACK = (grade: string) => [grade];

const TeacherSelection = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, signOut } = useAuth();

  const stage = params.get("stage") || "";
  const grade = params.get("grade") || "";
  const section = params.get("section") || "";
  const category = params.get("category") || "";
  const subjectNameFilter = params.get("subject_name") || "";
  const normalizedSection = normalizeSectionForSubjects(section);
  const normalizedSubjectChoice = normalizeSubjectSelectionName(subjectNameFilter);
  const choiceCategoryKey = choiceCategoryKeyFromSelection(category, normalizedSubjectChoice);
  const choiceCategoryVariants = choiceCategoryVariantsFromSelection(category, normalizedSubjectChoice);

  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [existingChoice, setExistingChoice] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [selectionError, setSelectionError] = useState<TeacherSelectionDiagnostic | null>(null);

  useEffect(() => {
    if (!user || !stage || !grade || !category) return;
    fetchTeachers();
  }, [user, stage, grade, category, section]);

  const fetchTeachers = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const categoryVariants = CATEGORY_VARIANTS[category]
        || TEACHER_ASSIGNMENT_CATEGORY_VARIANTS[category]
        || [category, CATEGORY_LABELS[category] || category].filter((value, index, list) => list.indexOf(value) === index);
      const effectiveCategoryVariants = [...new Set([...categoryVariants, ...choiceCategoryVariants])];
      const gradeVariants = TEACHER_ASSIGNMENT_GRADE_VARIANTS[grade] || GRADE_VARIANTS_FALLBACK(grade);

      const [choiceRes, profileRes, assignmentsRes, requestMatchesRes] = await Promise.all([
        supabase.from("student_teacher_choices").select("teacher_id")
          .eq("student_id", user.id).in("category", choiceCategoryVariants).eq("stage", stage).eq("grade", grade).maybeSingle(),
        supabase.from("profiles").select("education_type").eq("id", user.id).maybeSingle(),
        supabase.from("teacher_assignments").select("teacher_id, grade, section, education_type")
          .in("category", effectiveCategoryVariants).eq("stage", stage).in("grade", gradeVariants),
        supabase.from("approved_teacher_assignments" as any).select("user_id, assigned_grades, assigned_stages, education_type").in("assigned_category", effectiveCategoryVariants),
      ]);

      const eduType = (profileRes.data as any)?.education_type || null;
      if (choiceRes.data) {
        setExistingChoice(choiceRes.data.teacher_id);
        setSelectedTeacherId(choiceRes.data.teacher_id);
      }

      const { data: assignments, error: assignError } = assignmentsRes;

      if (assignError) throw assignError;
      if (choiceRes.error || profileRes.error || requestMatchesRes.error) {
        const firstError = choiceRes.error || profileRes.error || requestMatchesRes.error;
        setSelectionError(buildTeacherDataDiagnostic({
          title: "تعذّر تحميل بيانات اختيار المعلم",
          reason: "فشل استعلام أساسي قبل تكوين قائمة المعلمين.",
          operation: "load_teacher_selection_prerequisites",
          source: "src/pages/student/TeacherSelection.tsx:140 :: fetchTeachers prerequisites",
          context: { stage, grade, category, choiceCategoryKey, choiceCategoryVariants, effectiveCategoryVariants },
          error: firstError,
          checks: [
            { name: "student_teacher_choices", status: choiceRes.error ? "error" : choiceRes.data ? "ok" : "empty", count: choiceRes.data ? 1 : 0, error: choiceRes.error },
            { name: "student profile", status: profileRes.error ? "error" : profileRes.data ? "ok" : "empty", count: profileRes.data ? 1 : 0, error: profileRes.error },
            { name: "teacher_assignments", status: assignmentsRes.error ? "error" : assignments?.length ? "ok" : "empty", count: assignments?.length || 0, error: assignmentsRes.error },
            { name: "approved_teacher_assignments", status: requestMatchesRes.error ? "error" : requestMatchesRes.data?.length ? "ok" : "empty", count: requestMatchesRes.data?.length || 0, error: requestMatchesRes.error },
          ],
        }));
        return;
      }

      const requestAssignments = ((requestMatchesRes.data as TeacherRequestMatch[] | null) || [])
        .filter((request) => (request.assigned_stages || []).includes(stage) && (request.assigned_grades || []).some((requestGrade) => gradeVariants.includes(requestGrade)))
        .map((request) => ({
          teacher_id: request.user_id,
          grade,
          section: null,
          education_type: request.education_type,
        }));

      const combinedAssignments = [...(assignments || []), ...requestAssignments].filter((assignment, index, list) => {
        const key = `${assignment.teacher_id}|${assignment.grade}|${assignment.section || ""}|${assignment.education_type || ""}`;
        return index === list.findIndex((item) => `${item.teacher_id}|${item.grade}|${item.section || ""}|${item.education_type || ""}` === key);
      });

      if (combinedAssignments.length === 0) {
        setTeachers([]);
        setSelectionError(buildTeacherDataDiagnostic({
          title: "لم تظهر حسابات المعلمين",
          reason: "استعلامات المعلمين نجحت، لكنها أعادت صفر تعيينات مطابقة.",
          operation: "filter_teacher_assignments",
          source: "src/pages/student/TeacherSelection.tsx:173 :: combinedAssignments empty",
          context: { stage, grade, category, educationType: eduType, choiceCategoryKey, effectiveCategoryVariants, gradeVariants },
          checks: [
            { name: "teacher_assignments", status: assignments?.length ? "ok" : "empty", count: assignments?.length || 0 },
            { name: "approved_teacher_assignments", status: requestMatchesRes.data?.length ? "ok" : "empty", count: requestMatchesRes.data?.length || 0 },
          ],
        }));
        return;
      }

      const teacherEducationTypeMap = buildTeacherEducationTypeMap(requestMatchesRes.data as TeacherRequestMatch[] | null);

      const filtered = filterAssignmentsForStudent({
        assignments: combinedAssignments,
        category,
        normalizedSection,
        studentEducationType: eduType,
        teacherEducationTypeMap,
      });

      if (filtered.length === 0) {
        setTeachers([]);
        setSelectionError(buildTeacherDataDiagnostic({
          title: "تم استبعاد جميع المعلمين",
          reason: "توجد تعيينات، لكن فلتر نوع التعليم أو القسم استبعدها كلها.",
          operation: "filter_assignments_for_student",
          source: "src/pages/student/TeacherSelection.tsx:199 :: filtered assignments empty",
          context: { stage, grade, category, normalizedSection, educationType: eduType, combinedAssignments: combinedAssignments.length },
          checks: [{ name: "filtered teacher assignments", status: "empty", count: 0 }],
        }));
        return;
      }

      // Get unique teacher IDs
      const teacherIds = [...new Set(filtered.map(a => a.teacher_id))];

      const [profileRowsRes, teacherProfilesRes, fallbackProfilesRes] = await Promise.all([
        supabase.from("teacher_profiles").select("teacher_id, bio, photo_url, video_url, cover_image_url, professional_title, experience_years, qualifications, achievements").in("teacher_id", teacherIds),
        supabase.from("public_teacher_profiles" as any).select("id, full_name, avatar_url").in("id", teacherIds),
        supabase.from("teacher_directory" as any).select("id, full_name, avatar_url").in("id", teacherIds),
      ]);
      const profileRows = profileRowsRes.data;
      const teacherProfiles = teacherProfilesRes.data;
      const fallbackProfiles = fallbackProfilesRes.data;
      const profileError = profileRowsRes.error || teacherProfilesRes.error || fallbackProfilesRes.error;
      if (profileError || !profileRows?.length) {
        setSelectionError(buildTeacherDataDiagnostic({
          title: profileError ? "فشل تحميل ملفات المعلمين" : "بيانات صور وفيديوهات المعلمين محجوبة",
          reason: profileError ? "أحد استعلامات ملف المعلم فشل." : "تم العثور على حسابات المعلمين، لكن جدول ملفات المعلمين أعاد صفر صفوف؛ غالبًا توجد مشكلة صلاحيات قراءة أو عزل منصة.",
          operation: "load_teacher_profiles_media",
          source: "src/pages/student/TeacherSelection.tsx:223 :: teacher profile queries",
          context: { stage, grade, category, teacherIds },
          error: profileError,
          checks: [
            { name: "teacher_profiles (bio/photo/video)", status: profileRowsRes.error ? "error" : profileRows?.length ? "ok" : "empty", count: profileRows?.length || 0, error: profileRowsRes.error },
            { name: "public_teacher_profiles (name/avatar)", status: teacherProfilesRes.error ? "error" : teacherProfiles?.length ? "ok" : "empty", count: teacherProfiles?.length || 0, error: teacherProfilesRes.error },
            { name: "teacher_directory fallback", status: fallbackProfilesRes.error ? "error" : fallbackProfiles?.length ? "ok" : "empty", count: fallbackProfiles?.length || 0, error: fallbackProfilesRes.error },
          ],
        }));
      }

      const normalizeName = (name?: string | null) => (name || "").trim();
      const nameMap = new Map(teacherProfiles?.map(p => [p.id, normalizeName(p.full_name)]) || []);
      const fallbackNameMap = new Map(fallbackProfiles?.map(p => [p.id, normalizeName(p.full_name)]) || []);
      const avatarMap = new Map(teacherProfiles?.map(p => [p.id, p.avatar_url as string | null]) || []);
      const fallbackAvatarMap = new Map(fallbackProfiles?.map(p => [p.id, p.avatar_url as string | null]) || []);
      const profileMap = new Map((profileRows || []).map((profile) => [profile.teacher_id, profile]));

      // Group grades per teacher
      const gradesByTeacher = new Map<string, string[]>();
      filtered.forEach(a => {
        const existing = gradesByTeacher.get(a.teacher_id) || [];
        if (!existing.includes(a.grade)) {
          existing.push(a.grade);
        }
        gradesByTeacher.set(a.teacher_id, existing);
      });

      const teacherList: TeacherInfo[] = teacherIds.map((teacherId) => {
        const profile = profileMap.get(teacherId);
        return {
          teacher_id: teacherId,
          teacher_name: nameMap.get(teacherId) || fallbackNameMap.get(teacherId) || "اسم المعلم غير متاح",
          bio: profile?.bio || null,
          photo_url: profile?.photo_url || avatarMap.get(teacherId) || fallbackAvatarMap.get(teacherId) || null,
          video_url: profile?.video_url || null,
          cover_image_url: profile?.cover_image_url || null,
          professional_title: profile?.professional_title || null,
          experience_years: profile?.experience_years || 0,
          qualifications: Array.isArray(profile?.qualifications) ? profile.qualifications.map((item: any) => item?.title).filter(Boolean) : [],
          achievements: Array.isArray(profile?.achievements) ? profile.achievements.map((item: any) => item?.title).filter(Boolean) : [],
          category,
          grades: gradesByTeacher.get(teacherId) || [],
        };
      });

      setTeachers(teacherList);
    } catch (e) {
      console.error("Error fetching teachers:", e);
      setSelectionError(buildTeacherDataDiagnostic({
        title: "خطأ في تحميل المعلمين",
        reason: "توقفت عملية تحميل قائمة المعلمين بسبب خطأ غير متوقع.",
        operation: "fetchTeachers",
        source: "src/pages/student/TeacherSelection.tsx:276 :: fetchTeachers catch",
        context: { stage, grade, category, choiceCategoryKey, choiceCategoryVariants },
        error: e,
      }));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTeacher = async (teacherId: string) => {
    if (!user) return;
    try {
      // If switching teachers, remove student's purchases from the previous teacher
      // so the student no longer counts in that teacher's dashboard.
      if (existingChoice && existingChoice !== teacherId) {
        try {
          const { data: subjectRows } = await supabase
            .from("subjects").select("id")
            .eq("category", choiceCategoryKey)
            .eq("grade", grade)
            .eq("stage", stage);
          const subjectIds = (subjectRows || []).map((s: any) => s.id);
          if (subjectIds.length > 0) {
            const { data: prevGroups } = await supabase
              .from("content_groups").select("id")
              .in("subject_id", subjectIds)
              .or(`teacher_id.eq.${existingChoice},created_by.eq.${existingChoice}`);
            const prevGroupIds = (prevGroups || []).map((g: any) => g.id);
            if (prevGroupIds.length > 0) {
              await supabase
                .from("student_group_purchases")
                .delete()
                .eq("student_id", user.id)
                .in("group_id", prevGroupIds);
            }
          }
        } catch (purgeErr) {
          console.error("Failed to purge previous teacher purchases", purgeErr);
        }
      }

      const { error } = await supabase.rpc("select_my_teacher", {
        _teacher_id: teacherId,
        _category: choiceCategoryKey,
        _stage: stage,
        _grade: grade,
      });
      if (error) throw error;


      setSelectedTeacherId(teacherId);
      setExistingChoice(teacherId);
      toast.success("تم اختيار المعلم بنجاح");

      // Show paywall after selection
      setShowPaywall(true);
    } catch (e) {
      console.error("Error selecting teacher:", e);
      setSelectionError(buildTeacherSelectionDiagnostic({
        error: e,
        source: "src/pages/student/TeacherSelection.tsx::handleSelectTeacher",
        stage,
        grade,
        category: choiceCategoryKey,
      }));
    }
  };


  const handleSignOut = async () => {
    const nextPath = getPostSignOutPath("/");
    await signOut();
    navigate(nextPath, { replace: true });
  };

  const formatStage = (s: string) => {
    if (s === "preparatory") return "المرحلة الإعدادية";
    if (s === "secondary") return "المرحلة الثانوية";
    return s;
  };

  const formatGrade = (g: string) => {
    if (g === "first") return "الصف الأول";
    if (g === "second") return "الصف الثاني";
    if (g === "third") return "الصف الثالث";
    return g;
  };

  const backUrl = `/subjects?stage=${stage}&grade=${grade}${section ? `&section=${section}` : ""}&category=${category}`;

  return (
    <div className="mobile-app-page bg-gradient-to-br from-background via-background to-accent/20">
      <header className="mobile-app-header sticky z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mobile-app-header-inner flex items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-3 group">
            <img src={mudrikLogo} alt="مدرك Plus" className="h-10 w-10 rounded-xl object-contain shadow-sm transition-transform duration-300 group-hover:scale-105" />
            <span className="text-xl font-bold">
              <span className="mudrik-wordmark-main text-foreground">مدرك</span>{" "}
              <span className="mudrik-wordmark-plus text-primary">Plus</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <NotificationsDropdown />
            <Button variant="ghost" size="icon" asChild>
              <Link to="/about-platform"><Info className="h-5 w-5" /></Link>
            </Button>
            <Button variant="ghost" size="icon" asChild>
              <Link to="/support"><MessageSquare className="h-5 w-5" /></Link>
            </Button>
            <Button variant="ghost" size="icon"><Settings className="h-5 w-5" /></Button>
            <Button variant="ghost" size="icon" onClick={handleSignOut}><LogOut className="h-5 w-5" /></Button>
          </div>
        </div>
      </header>

      <main className="mobile-page-content">
        <Button variant="ghost" className="mb-6" onClick={() => navigate(backUrl)}>
          <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />
          رجوع للمواد
        </Button>

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-xl shadow-primary/30">
            <GraduationCap className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">اختر معلمك</h1>
          <p className="text-muted-foreground">
            {formatStage(stage)} - {formatGrade(grade)} - {category}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            اختر المعلم الذي تريد الاشتراك معه لمشاهدة المحتوى الخاص به
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </div>
        ) : teachers.length === 0 ? (
          <Card className="border-2 border-dashed max-w-md mx-auto">
            <CardContent className="p-8 text-center">
              <GraduationCap className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-bold mb-2">لا يوجد معلمين متاحين</h3>
              <p className="text-muted-foreground mb-4">
                لم يتم تعيين معلمين لهذه المادة بعد أو لم يتم الموافقة على سيرهم الذاتية
              </p>
              <Button onClick={() => navigate(backUrl)}>العودة للمواد</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {teachers.map(teacher => (
              <TeacherProfileCard
                key={teacher.teacher_id}
                teacherId={teacher.teacher_id}
                teacherName={teacher.teacher_name}
                bio={teacher.bio}
                photoUrl={teacher.photo_url}
                videoUrl={teacher.video_url}
                coverImageUrl={teacher.cover_image_url}
                professionalTitle={teacher.professional_title}
                experienceYears={teacher.experience_years}
                qualifications={teacher.qualifications}
                achievements={teacher.achievements}
                category={teacher.category}
                grades={teacher.grades}
                isSelected={selectedTeacherId === teacher.teacher_id}
                onSelect={() => handleSelectTeacher(teacher.teacher_id)}
              />
            ))}
          </div>
        )}

        {/* Paywall */}
        {selectedTeacherId && (
          <PaywallDialog
            open={showPaywall}
            onOpenChange={setShowPaywall}
            subjectName={category}
            grade={grade}
            stage={stage}
            section={section}
            studentId={user?.id || ""}
          />
        )}
        <TeacherSelectionErrorDialog
          diagnostic={selectionError}
          onOpenChange={(open) => {
            if (!open) setSelectionError(null);
          }}
        />
      </main>
    </div>
  );
};

export default TeacherSelection;

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Calendar,
  CheckCircle,
  ChevronLeft,
  CreditCard,
  GraduationCap,
  Loader2,
  Plus,
  Search,
  User,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import CoursePricingManager from "@/components/admin/CoursePricingManager";
import {
  fetchBundleSubjects,
  getBundleSubjectChoices,
  getStudentDashboardButtons,
} from "@/lib/studentCategories";
import {
  buildTeacherEducationTypeMap,
  filterAssignmentsForStudent,
  TEACHER_ASSIGNMENT_CATEGORY_VARIANTS,
  TEACHER_ASSIGNMENT_GRADE_VARIANTS,
} from "@/lib/teacherFiltering";
import {
  choiceCategoryKeyFromSelection,
  choiceCategoryVariantsFromSelection,
} from "@/lib/teacherSubjectUtils";
import { normalizeSectionForSubjects } from "@/lib/educationSection";

type TabId = "hub" | "pricing" | "manage" | "status";

interface StudentProfile {
  id: string;
  full_name: string;
  email: string;
  student_code: string | null;
  stage: string | null;
  grade: string | null;
  section: string | null;
  education_type: string | null;
}

interface SubjectRow {
  id: string;
  name: string;
  stage: string;
  grade: string;
  section: string | null;
  category: string;
}

interface ManageMaterial {
  id: string;
  label: string;
  emoji: string;
  categoryKey: string;
  subjectName: string | null;
  subjectIds: string[];
  activeCount: number;
}

interface ManageTeacher {
  teacher_id: string;
  teacher_name: string;
  photo_url: string | null;
}

interface ManageCourse {
  id: string;
  title: string;
  price: number;
  subject_id: string;
  subject_name: string;
  start_date: string | null;
  end_date: string | null;
  lesson_count: number | null;
  isPurchased: boolean;
}

interface StatusRow {
  id: string;
  subject_name: string;
  teacher_name: string;
  teacher_photo: string | null;
  course_title: string | null;
  price: number | null;
  end_date: string | null;
  is_active: boolean;
  source: "purchase" | "legacy";
}

const formatStage = (stage: string | null) => {
  if (stage === "preparatory") return "إعدادي";
  if (stage === "secondary") return "ثانوي";
  return stage || "";
};

const formatGrade = (grade: string | null) => {
  if (grade === "first") return "الأول";
  if (grade === "second") return "الثاني";
  if (grade === "third") return "الثالث";
  return grade || "";
};

const formatSection = (section: string | null) => {
  if (section === "scientific") return "علمي";
  if (section === "literary") return "أدبي";
  return section || "";
};

const formatDate = (date?: string | null) => {
  if (!date) return "مفتوح";
  return new Date(date).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const getDaysRemaining = (endDate?: string | null) => {
  if (!endDate) return null;
  const end = new Date(endDate);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const isRowActive = (row: Pick<StatusRow, "is_active" | "end_date">) => {
  const days = getDaysRemaining(row.end_date);
  return row.is_active && (days === null || days >= 0);
};

const HUB_ITEMS: Array<{
  id: Exclude<TabId, "hub">;
  title: string;
  description: string;
  icon: typeof CreditCard;
  tone: string;
  iconTone: string;
  position?: string;
}> = [
  {
    id: "pricing",
    title: "تسعير الكورسات",
    description: "الأسعار الافتراضية",
    icon: CreditCard,
    tone: "border-primary/25 bg-card hover:bg-accent/40",
    iconTone: "bg-primary/10 text-primary",
  },
  {
    id: "manage",
    title: "تفعيل اشتراك",
    description: "معلم + كورس حقيقي",
    icon: Plus,
    tone: "border-secondary/30 bg-card hover:bg-accent/40",
    iconTone: "bg-secondary/20 text-foreground",
  },
  {
    id: "status",
    title: "حالة الاشتراك",
    description: "عرض الكورسات النشطة",
    icon: Search,
    tone: "border-primary/20 bg-card hover:bg-accent/40",
    iconTone: "bg-accent text-accent-foreground",
    position: "col-start-1",
  },
];

const SubscriptionsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("hub");
  const [currency, setCurrency] = useState("جنيه");
  const [allSubjects, setAllSubjects] = useState<SubjectRow[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StudentProfile[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);
  const [manageMaterials, setManageMaterials] = useState<ManageMaterial[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<ManageMaterial | null>(null);
  const [manageTeachers, setManageTeachers] = useState<ManageTeacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [manageCourses, setManageCourses] = useState<ManageCourse[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMaterials, setIsLoadingMaterials] = useState(false);
  const [isLoadingTeachers, setIsLoadingTeachers] = useState(false);
  const [activatingCourseId, setActivatingCourseId] = useState<string | null>(null);

  const [statusSearchQuery, setStatusSearchQuery] = useState("");
  const [statusSearchResult, setStatusSearchResult] = useState<{ student: StudentProfile; rows: StatusRow[] } | null>(null);
  const [isStatusSearching, setIsStatusSearching] = useState(false);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [{ data: subjects }, { data: settings }] = await Promise.all([
          supabase
            .from("subjects")
            .select("id, name, stage, grade, section, category")
            .eq("is_active", true),
          supabase
            .from("platform_settings")
            .select("key, value")
            .eq("key", "subscription_currency"),
        ]);

        setAllSubjects((subjects as SubjectRow[]) || []);
        const currencyValue = settings?.[0]?.value;
        if (currencyValue) setCurrency(currencyValue);
      } catch (error) {
        console.error("Error loading subscriptions page:", error);
        toast.error("تعذر تحميل بيانات الاشتراكات");
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, []);

  const buildMaterialsForStudent = useCallback(async (student: StudentProfile) => {
    if (!student.stage || !student.grade) return [] as ManageMaterial[];

    const buttons = getStudentDashboardButtons({
      educationType: student.education_type || "عام",
      stage: student.stage,
      grade: student.grade,
      section: student.section || undefined,
    });

    const nested = await Promise.all(
      buttons.map(async (button) => {
        if (button.hasSubjects) {
          const choices = getBundleSubjectChoices(button.key, {
            stage: student.stage!,
            grade: student.grade!,
            section: student.section,
          });

          const parts = await Promise.all(
            choices.map(async (choice) => {
              const subjects = await fetchBundleSubjects(
                supabase,
                button.key,
                { stage: student.stage!, grade: student.grade!, section: student.section },
                choice.name,
              );

              const subjectIds = Array.from(new Set((subjects || []).map((item: any) => item.id).filter(Boolean)));
              if (subjectIds.length === 0) return null;

              return {
                id: `${button.key}:${choice.id}`,
                label: choice.name,
                emoji: choice.emoji,
                categoryKey: button.key,
                subjectName: choice.name,
                subjectIds,
                activeCount: 0,
              } satisfies ManageMaterial;
            }),
          );

          return parts.filter(Boolean) as ManageMaterial[];
        }

        const subjects = await fetchBundleSubjects(
          supabase,
          button.key,
          { stage: student.stage!, grade: student.grade!, section: student.section },
          null,
        );
        const subjectIds = Array.from(new Set((subjects || []).map((item: any) => item.id).filter(Boolean)));
        if (subjectIds.length === 0) return [] as ManageMaterial[];

        return [{
          id: button.key,
          label: button.name,
          emoji: button.emoji,
          categoryKey: button.key,
          subjectName: null,
          subjectIds,
          activeCount: 0,
        } satisfies ManageMaterial];
      }),
    );

    const materials = nested.flat();
    const { data: purchases } = await supabase
      .from("student_group_purchases")
      .select("group_id")
      .eq("student_id", student.id);

    const groupIds = Array.from(new Set((purchases || []).map((item) => item.group_id).filter(Boolean)));
    const { data: groups } = groupIds.length
      ? await supabase.from("content_groups").select("id, subject_id, is_active, end_date").in("id", groupIds)
      : { data: [] as any[] };

    const activeMap = new Map<string, number>();
    (groups || []).forEach((group: any) => {
      const active = group.is_active && (!group.end_date || new Date(group.end_date).getTime() >= Date.now());
      if (!active || !group.subject_id) return;
      activeMap.set(group.subject_id, (activeMap.get(group.subject_id) || 0) + 1);
    });

    return materials.map((material) => ({
      ...material,
      activeCount: material.subjectIds.reduce((sum: number, subjectId) => sum + (activeMap.get(subjectId) || 0), 0 as number),
    }));
  }, []);

  const loadCoursesForTeacher = useCallback(async (student: StudentProfile, material: ManageMaterial, teacherId: string) => {
    const { data: groups, error } = await supabase
      .from("content_groups")
      .select("id, title, price, subject_id, start_date, end_date, is_active, lesson_count, teacher_id, created_by, education_type")
      .or(`teacher_id.eq.${teacherId},created_by.eq.${teacherId}`)
      .in("subject_id", material.subjectIds)
      .eq("is_active", true)
      .eq("price_approved", true);

    if (error) throw error;

    const filteredGroups = (groups || []).filter((group: any) => {
      if (student.stage !== "secondary" || !student.education_type) return true;
      return !group.education_type || group.education_type === student.education_type;
    });

    const groupIds = filteredGroups.map((group: any) => group.id);
    const { data: purchases } = groupIds.length
      ? await supabase
          .from("student_group_purchases")
          .select("group_id")
          .eq("student_id", student.id)
          .in("group_id", groupIds)
      : { data: [] as any[] };

    const purchasedSet = new Set((purchases || []).map((item) => item.group_id));

    const courses = filteredGroups
      .map((group: any) => ({
        id: group.id,
        title: group.title,
        price: Number(group.price || 0),
        subject_id: group.subject_id,
        subject_name: allSubjects.find((subject) => subject.id === group.subject_id)?.name || material.label,
        start_date: group.start_date,
        end_date: group.end_date,
        lesson_count: group.lesson_count,
        isPurchased: purchasedSet.has(group.id),
      }))
      .sort((a, b) => Number(a.isPurchased) - Number(b.isPurchased) || a.price - b.price);

    setManageCourses(courses);
  }, [allSubjects]);

  const openMaterial = useCallback(async (student: StudentProfile, material: ManageMaterial) => {
    if (!student.stage || !student.grade) return;

    setSelectedMaterial(material);
    setManageTeachers([]);
    setManageCourses([]);
    setSelectedTeacherId(null);
    setIsLoadingTeachers(true);

    try {
      const choiceVariants = choiceCategoryVariantsFromSelection(material.categoryKey, material.subjectName || undefined);
      const categoryVariants = Array.from(new Set([
        ...(TEACHER_ASSIGNMENT_CATEGORY_VARIANTS[material.categoryKey] || [material.categoryKey]),
        ...choiceVariants,
      ]));
      const gradeVariants = TEACHER_ASSIGNMENT_GRADE_VARIANTS[student.grade] || [student.grade];

      const [assignmentsRes, requestsRes, currentChoiceRes] = await Promise.all([
        supabase
          .from("teacher_assignments")
          .select("teacher_id, grade, section, education_type")
          .in("category", categoryVariants)
          .eq("stage", student.stage)
          .in("grade", gradeVariants),
        supabase
          .from("teacher_requests")
          .select("user_id, assigned_grades, assigned_stages, education_type")
          .eq("status", "approved")
          .in("assigned_category", categoryVariants),
        supabase
          .from("student_teacher_choices")
          .select("teacher_id")
          .eq("student_id", student.id)
          .eq("stage", student.stage)
          .eq("grade", student.grade)
          .in("category", choiceVariants)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const requestAssignments = ((requestsRes.data as any[]) || [])
        .filter((request) =>
          (request.assigned_stages || []).includes(student.stage) &&
          (request.assigned_grades || []).some((value: string) => gradeVariants.includes(value)),
        )
        .map((request) => ({
          teacher_id: request.user_id,
          grade: student.grade,
          section: null,
          education_type: request.education_type,
        }));

      const combinedAssignments = [...(assignmentsRes.data || []), ...requestAssignments].filter((assignment, index, list) => {
        const key = `${assignment.teacher_id}|${assignment.grade}|${assignment.section || ""}|${assignment.education_type || ""}`;
        return index === list.findIndex((item) => `${item.teacher_id}|${item.grade}|${item.section || ""}|${item.education_type || ""}` === key);
      });

      const filteredAssignments = filterAssignmentsForStudent({
        assignments: combinedAssignments,
        category: material.categoryKey,
        normalizedSection: normalizeSectionForSubjects(student.section || ""),
        studentEducationType: student.education_type,
        teacherEducationTypeMap: buildTeacherEducationTypeMap(requestsRes.data as any[]),
      });

      const teacherIds = Array.from(new Set(filteredAssignments.map((item) => item.teacher_id)));
      const [{ data: names }, { data: profiles }] = await Promise.all([
        teacherIds.length ? supabase.from("profiles").select("id, full_name").in("id", teacherIds) : Promise.resolve({ data: [] as any[] }),
        teacherIds.length ? supabase.from("teacher_profiles").select("teacher_id, photo_url").in("teacher_id", teacherIds) : Promise.resolve({ data: [] as any[] }),
      ]);

      const nameMap = new Map((names || []).map((item) => [item.id, item.full_name]));
      const photoMap = new Map((profiles || []).map((item) => [item.teacher_id, item.photo_url]));

      const teachers = teacherIds.map((teacherId) => ({
        teacher_id: teacherId,
        teacher_name: nameMap.get(teacherId) || "معلم",
        photo_url: photoMap.get(teacherId) || null,
      }));

      setManageTeachers(teachers);
      const initialTeacherId = currentChoiceRes.data?.teacher_id || teachers[0]?.teacher_id || null;
      setSelectedTeacherId(initialTeacherId);

      if (initialTeacherId) {
        await loadCoursesForTeacher(student, material, initialTeacherId);
      }
    } catch (error) {
      console.error("Error opening material:", error);
      toast.error("تعذر تحميل المعلمين والكورسات");
    } finally {
      setIsLoadingTeachers(false);
    }
  }, [loadCoursesForTeacher]);

  const selectStudent = useCallback(async (student: StudentProfile) => {
    setSelectedStudent(student);
    setSearchResults([]);
    setSearchQuery("");
    setSelectedMaterial(null);
    setManageTeachers([]);
    setManageCourses([]);
    setSelectedTeacherId(null);
    setIsLoadingMaterials(true);

    try {
      const materials = await buildMaterialsForStudent(student);
      setManageMaterials(materials);
    } catch (error) {
      console.error("Error selecting student:", error);
      toast.error("تعذر تحميل مواد الطالب الحقيقية");
    } finally {
      setIsLoadingMaterials(false);
    }
  }, [buildMaterialsForStudent]);

  const searchStudents = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, student_code, stage, grade, section, education_type")
        .eq("role", "student")
        .or(`full_name.ilike.%${query}%,student_code.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(20);

      if (error) throw error;
      setSearchResults((data as StudentProfile[]) || []);
    } catch (error) {
      console.error("Error searching students:", error);
      toast.error("خطأ في البحث");
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const activateCourseForStudent = useCallback(async (courseId: string) => {
    if (!selectedStudent || !selectedMaterial || !selectedTeacherId || !selectedStudent.stage || !selectedStudent.grade) return;

    const course = manageCourses.find((item) => item.id === courseId);
    if (!course) return;

    setActivatingCourseId(courseId);
    try {
      const choiceKey = choiceCategoryKeyFromSelection(selectedMaterial.categoryKey, selectedMaterial.subjectName || undefined);
      const choiceVariants = choiceCategoryVariantsFromSelection(selectedMaterial.categoryKey, selectedMaterial.subjectName || undefined);

      const { data: currentChoice } = await supabase
        .from("student_teacher_choices")
        .select("id")
        .eq("student_id", selectedStudent.id)
        .eq("stage", selectedStudent.stage)
        .eq("grade", selectedStudent.grade)
        .in("category", choiceVariants)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (currentChoice?.id) {
        const { error } = await supabase
          .from("student_teacher_choices")
          .update({ teacher_id: selectedTeacherId, category: choiceKey })
          .eq("id", currentChoice.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("student_teacher_choices").insert({
          student_id: selectedStudent.id,
          teacher_id: selectedTeacherId,
          category: choiceKey,
          stage: selectedStudent.stage,
          grade: selectedStudent.grade,
        });
        if (error) throw error;
      }

      const { data: existingPurchase } = await supabase
        .from("student_group_purchases")
        .select("id")
        .eq("student_id", selectedStudent.id)
        .eq("group_id", course.id)
        .maybeSingle();

      if (!existingPurchase) {
        const { error } = await supabase.from("student_group_purchases").insert({
          student_id: selectedStudent.id,
          group_id: course.id,
          amount_paid: course.price,
          activated_by_admin: true,
        });
        if (error) throw error;
      }

      const subscriptionEnd = course.end_date
        ? new Date(course.end_date).toISOString()
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

      const { data: existingSubscription } = await supabase
        .from("subscriptions")
        .select("id, renewal_count")
        .eq("student_id", selectedStudent.id)
        .eq("subject_id", course.subject_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingSubscription?.id) {
        const { error } = await supabase
          .from("subscriptions")
          .update({
            teacher_id: selectedTeacherId,
            is_active: true,
            end_date: subscriptionEnd,
            renewal_count: (existingSubscription.renewal_count || 0) + 1,
          })
          .eq("id", existingSubscription.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("subscriptions").insert({
          student_id: selectedStudent.id,
          subject_id: course.subject_id,
          start_date: new Date().toISOString(),
          end_date: subscriptionEnd,
          is_active: true,
          created_by: user?.id,
          teacher_id: selectedTeacherId,
        });
        if (error) throw error;
      }

      toast.success(`تم تفعيل ${course.title} للطالب`);
      const updatedMaterials = await buildMaterialsForStudent(selectedStudent);
      setManageMaterials(updatedMaterials);
      await loadCoursesForTeacher(selectedStudent, selectedMaterial, selectedTeacherId);
    } catch (error) {
      console.error("Error activating course:", error);
      toast.error("فشل تفعيل الكورس");
    } finally {
      setActivatingCourseId(null);
    }
  }, [buildMaterialsForStudent, loadCoursesForTeacher, manageCourses, selectedMaterial, selectedStudent, selectedTeacherId, user?.id]);

  const searchSubscriptionStatus = useCallback(async () => {
    const query = statusSearchQuery.trim();
    if (!query) return;

    setIsStatusSearching(true);
    try {
      const { data: students, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, student_code, stage, grade, section, education_type")
        .eq("role", "student")
        .or(`student_code.ilike.%${query}%,full_name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(1);

      if (error) throw error;
      const student = (students as StudentProfile[] | null)?.[0];
      if (!student) {
        setStatusSearchResult(null);
        toast.error("لم يتم العثور على الطالب");
        return;
      }

      const { data: purchases } = await supabase
        .from("student_group_purchases")
        .select("id, group_id")
        .eq("student_id", student.id)
        .order("purchased_at", { ascending: false });

      let rows: StatusRow[] = [];

      if ((purchases || []).length > 0) {
        const groupIds = Array.from(new Set((purchases || []).map((item) => item.group_id).filter(Boolean)));
        const { data: groups } = await supabase
          .from("content_groups")
          .select("id, title, price, end_date, is_active, teacher_id, subject_id")
          .in("id", groupIds);

        const teacherIds = Array.from(new Set((groups || []).map((item) => item.teacher_id).filter(Boolean)));
        const subjectIds = Array.from(new Set((groups || []).map((item) => item.subject_id).filter(Boolean)));

        const [{ data: names }, { data: photos }, { data: subjects }] = await Promise.all([
          teacherIds.length ? supabase.from("profiles").select("id, full_name").in("id", teacherIds) : Promise.resolve({ data: [] as any[] }),
          teacherIds.length ? supabase.from("teacher_profiles").select("teacher_id, photo_url").in("teacher_id", teacherIds) : Promise.resolve({ data: [] as any[] }),
          subjectIds.length ? supabase.from("subjects").select("id, name").in("id", subjectIds) : Promise.resolve({ data: [] as any[] }),
        ]);

        const nameMap = new Map((names || []).map((item) => [item.id, item.full_name]));
        const photoMap = new Map((photos || []).map((item) => [item.teacher_id, item.photo_url]));
        const subjectMap = new Map((subjects || []).map((item) => [item.id, item.name]));
        const groupMap = new Map((groups || []).map((item) => [item.id, item]));

        rows = (purchases || []).map((purchase) => {
          const group: any = groupMap.get(purchase.group_id);
          return {
            id: purchase.id,
            subject_name: group?.subject_id ? subjectMap.get(group.subject_id) || "—" : "—",
            teacher_name: group?.teacher_id ? nameMap.get(group.teacher_id) || "معلم" : "بدون معلم",
            teacher_photo: group?.teacher_id ? photoMap.get(group.teacher_id) || null : null,
            course_title: group?.title || null,
            price: group?.price ?? null,
            end_date: group?.end_date || null,
            is_active: Boolean(group?.is_active),
            source: "purchase",
          };
        });
      } else {
        const { data: subscriptions } = await supabase
          .from("subscriptions")
          .select("id, subject_id, teacher_id, end_date, is_active")
          .eq("student_id", student.id)
          .eq("is_active", true)
          .order("created_at", { ascending: false });

        const teacherIds = Array.from(new Set((subscriptions || []).map((item: any) => item.teacher_id).filter(Boolean)));
        const subjectIds = Array.from(new Set((subscriptions || []).map((item: any) => item.subject_id).filter(Boolean)));

        const [{ data: names }, { data: photos }, { data: subjects }, { data: groups }] = await Promise.all([
          teacherIds.length ? supabase.from("profiles").select("id, full_name").in("id", teacherIds) : Promise.resolve({ data: [] as any[] }),
          teacherIds.length ? supabase.from("teacher_profiles").select("teacher_id, photo_url").in("teacher_id", teacherIds) : Promise.resolve({ data: [] as any[] }),
          subjectIds.length ? supabase.from("subjects").select("id, name").in("id", subjectIds) : Promise.resolve({ data: [] as any[] }),
          subjectIds.length ? supabase.from("content_groups").select("title, price, subject_id, teacher_id").in("subject_id", subjectIds) : Promise.resolve({ data: [] as any[] }),
        ]);

        rows = (subscriptions || []).map((item: any) => {
          const subject = (subjects || []).find((row: any) => row.id === item.subject_id);
          const teacher = (names || []).find((row: any) => row.id === item.teacher_id);
          const photo = (photos || []).find((row: any) => row.teacher_id === item.teacher_id);
          const group = (groups || []).find((row: any) => row.subject_id === item.subject_id && (!item.teacher_id || row.teacher_id === item.teacher_id));

          return {
            id: item.id,
            subject_name: subject?.name || "—",
            teacher_name: teacher?.full_name || "بدون معلم",
            teacher_photo: photo?.photo_url || null,
            course_title: group?.title || null,
            price: group?.price ?? null,
            end_date: item.end_date,
            is_active: item.is_active,
            source: "legacy",
          };
        });
      }

      rows.sort((a, b) => Number(isRowActive(b)) - Number(isRowActive(a)));
      setStatusSearchResult({ student, rows });
    } catch (error) {
      console.error("Error searching subscription status:", error);
      toast.error("خطأ في البحث عن حالة الاشتراك");
    } finally {
      setIsStatusSearching(false);
    }
  }, [statusSearchQuery]);

  const selectedTeacher = useMemo(
    () => manageTeachers.find((teacher) => teacher.teacher_id === selectedTeacherId) || null,
    [manageTeachers, selectedTeacherId],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-5 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => (activeTab === "hub" ? navigate("/admin") : setActiveTab("hub"))}>
            <ChevronLeft className="h-5 w-5 rotate-180" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">إدارة الاشتراكات</h1>
            <p className="text-sm text-muted-foreground">
              {activeTab === "hub" ? "اختر القسم المطلوب" : "إدارة الاشتراكات والكورسات الفعلية"}
            </p>
          </div>
        </div>

        {activeTab === "hub" ? (
          <section className="mx-auto max-w-sm">
            <div className="grid grid-cols-2 gap-3">
              {HUB_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={cn(
                      "flex aspect-square flex-col items-start justify-between rounded-lg border p-3 text-right shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                      item.tone,
                      item.position,
                    )}
                  >
                    <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", item.iconTone)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-foreground">{item.title}</div>
                      <div className="text-xs leading-5 text-muted-foreground">{item.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabId)} className="w-full">
            <TabsContent value="pricing" className="mt-0">
              <CoursePricingManager />
            </TabsContent>

            <TabsContent value="manage" className="mt-0 space-y-6">
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="mb-4 flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Plus className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">تفعيل اشتراك طالب</h2>
                    <p className="text-sm text-muted-foreground">ابحث عن الطالب، ثم افتح المادة الحقيقية واختر المعلم والكورس من البيانات الفعلية.</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      onKeyDown={(event) => event.key === "Enter" && searchStudents()}
                      placeholder="كود الطالب / الاسم / البريد الإلكتروني"
                      className="pr-10"
                    />
                  </div>
                  <Button onClick={searchStudents} disabled={isSearching} className="min-w-24">
                    {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "بحث"}
                  </Button>
                </div>

                {searchResults.length > 0 && (
                  <div className="mt-4 space-y-2 rounded-xl border border-border bg-background/60 p-2">
                    {searchResults.map((student) => (
                      <button
                        key={student.id}
                        onClick={() => selectStudent(student)}
                        className="flex w-full items-center gap-3 rounded-xl border border-transparent bg-card px-3 py-3 text-right transition hover:border-primary/20 hover:bg-accent/40"
                      >
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <User className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold text-foreground">{student.full_name}</div>
                          <div className="truncate text-sm text-muted-foreground">{student.student_code || student.email}</div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {student.stage && <Badge variant="secondary">{formatStage(student.stage)}</Badge>}
                          {student.grade && <Badge variant="outline">{formatGrade(student.grade)}</Badge>}
                          {student.section && <Badge variant="outline">{formatSection(student.section)}</Badge>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedStudent && (
                <>
                  <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <GraduationCap className="h-7 w-7" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-lg font-bold text-foreground">{selectedStudent.full_name}</div>
                        <div className="text-sm text-muted-foreground">
                          {selectedStudent.student_code && `كود: ${selectedStudent.student_code} • `}
                          {formatStage(selectedStudent.stage)} • {formatGrade(selectedStudent.grade)}
                          {selectedStudent.section && ` • ${formatSection(selectedStudent.section)}`}
                          {selectedStudent.education_type && ` • ${selectedStudent.education_type}`}
                        </div>
                      </div>
                    </div>
                  </div>

                  {!selectedMaterial ? (
                    <section className="space-y-4">
                      <div>
                        <h3 className="text-xl font-bold text-foreground">مواد الطالب الحقيقية</h3>
                        <p className="text-sm text-muted-foreground">هذه نفس المواد الظاهرة لهذا الطالب في النظام.</p>
                      </div>

                      {isLoadingMaterials ? (
                        <div className="flex justify-center rounded-2xl border border-border bg-card p-10">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                      ) : manageMaterials.length === 0 ? (
                        <Card>
                          <CardContent className="p-8 text-center text-muted-foreground">لا توجد مواد مرتبطة بهذا الطالب حالياً.</CardContent>
                        </Card>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {manageMaterials.map((material) => (
                            <button
                              key={material.id}
                              onClick={() => openMaterial(selectedStudent, material)}
                              className="rounded-2xl border border-border bg-card p-4 text-right shadow-sm transition hover:border-primary/30 hover:bg-accent/40 hover:shadow-md"
                            >
                              <div className="mb-4 flex items-start justify-between gap-3">
                                <div className="text-3xl leading-none">{material.emoji}</div>
                                {material.activeCount > 0 && <Badge className="bg-primary text-primary-foreground">مفعل {material.activeCount}</Badge>}
                              </div>
                              <div className="text-lg font-bold text-foreground">{material.label}</div>
                              <div className="mt-2 text-sm text-muted-foreground">افتح المعلمين والكورسات الفعلية لهذه المادة</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </section>
                  ) : (
                    <section className="space-y-5">
                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedMaterial(null);
                            setManageTeachers([]);
                            setManageCourses([]);
                            setSelectedTeacherId(null);
                          }}
                        >
                          <ChevronLeft className="h-4 w-4 rotate-180" />
                          رجوع للمواد
                        </Button>
                        <Badge variant="secondary">{selectedMaterial.label}</Badge>
                        {selectedTeacher && <Badge variant="outline">{selectedTeacher.teacher_name}</Badge>}
                      </div>

                      <div className="space-y-3">
                        <div>
                          <h3 className="text-xl font-bold text-foreground">اختر المعلم</h3>
                          <p className="text-sm text-muted-foreground">يتم جلب المعلمين الحقيقيين المرتبطين بهذه المادة.</p>
                        </div>

                        {isLoadingTeachers ? (
                          <div className="flex justify-center rounded-2xl border border-border bg-card p-10">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          </div>
                        ) : manageTeachers.length === 0 ? (
                          <Card>
                            <CardContent className="p-8 text-center text-muted-foreground">لا يوجد معلمون فعليون لهذه المادة حالياً.</CardContent>
                          </Card>
                        ) : (
                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {manageTeachers.map((teacher) => {
                              const selected = teacher.teacher_id === selectedTeacherId;
                              return (
                                <button
                                  key={teacher.teacher_id}
                                  onClick={async () => {
                                    setSelectedTeacherId(teacher.teacher_id);
                                    if (selectedStudent && selectedMaterial) {
                                      setIsLoadingTeachers(true);
                                      try {
                                        await loadCoursesForTeacher(selectedStudent, selectedMaterial, teacher.teacher_id);
                                      } finally {
                                        setIsLoadingTeachers(false);
                                      }
                                    }
                                  }}
                                  className={cn(
                                    "rounded-2xl border p-4 text-right shadow-sm transition",
                                    selected ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/20 hover:bg-accent/40",
                                  )}
                                >
                                  <div className="flex items-center gap-3">
                                    {teacher.photo_url ? (
                                      <img src={teacher.photo_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                                    ) : (
                                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                                        <GraduationCap className="h-5 w-5" />
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate font-bold text-foreground">{teacher.teacher_name}</div>
                                      <div className="text-sm text-muted-foreground">عرض كورسات المعلم</div>
                                    </div>
                                    {selected && <CheckCircle className="h-5 w-5 text-primary" />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div>
                          <h3 className="text-xl font-bold text-foreground">الكورسات المتاحة</h3>
                          <p className="text-sm text-muted-foreground">هذه هي المجموعات الفعلية الموجودة في قاعدة البيانات لنفس المادة والمعلم.</p>
                        </div>

                        {manageCourses.length === 0 ? (
                          <Card>
                            <CardContent className="p-8 text-center text-muted-foreground">لا توجد كورسات منشورة لهذه المادة مع هذا المعلم.</CardContent>
                          </Card>
                        ) : (
                          <div className="grid gap-3 xl:grid-cols-2">
                            {manageCourses.map((course) => (
                              <Card key={course.id} className={cn("border-border shadow-sm", course.isPurchased && "border-primary/30 bg-primary/5")}>
                                <CardContent className="space-y-4 p-4">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                      <div className="text-lg font-bold text-foreground">{course.title}</div>
                                      <div className="text-sm text-muted-foreground">{course.subject_name}</div>
                                    </div>
                                    <Badge variant={course.isPurchased ? "secondary" : "outline"}>
                                      {course.isPurchased ? "مفعل" : `${course.price} ${currency}`}
                                    </Badge>
                                  </div>

                                  <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                                    <div className="flex items-center gap-2">
                                      <BookOpen className="h-4 w-4" />
                                      <span>{course.lesson_count ? `${course.lesson_count} درس` : "كورس فعلي"}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Calendar className="h-4 w-4" />
                                      <span>{course.end_date ? `ينتهي ${formatDate(course.end_date)}` : "بدون تاريخ انتهاء"}</span>
                                    </div>
                                  </div>

                                  <Button
                                    onClick={() => activateCourseForStudent(course.id)}
                                    disabled={Boolean(activatingCourseId) || course.isPurchased || !selectedTeacherId}
                                    className="w-full"
                                  >
                                    {activatingCourseId === course.id ? <Loader2 className="h-4 w-4 animate-spin" /> : course.isPurchased ? <CheckCircle className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                    {course.isPurchased ? "الكورس مفعل" : "تفعيل الكورس للطالب"}
                                  </Button>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        )}
                      </div>
                    </section>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="status" className="mt-0 space-y-6">
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="mb-4 flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Search className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">البحث عن حالة الاشتراك</h2>
                    <p className="text-sm text-muted-foreground">يعرض الكورسات الفعلية النشطة للطالب مع المعلم والسعر.</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={statusSearchQuery}
                      onChange={(event) => setStatusSearchQuery(event.target.value)}
                      onKeyDown={(event) => event.key === "Enter" && searchSubscriptionStatus()}
                      placeholder="كود الطالب / الاسم / البريد الإلكتروني"
                      className="pr-10"
                    />
                  </div>
                  <Button onClick={searchSubscriptionStatus} disabled={isStatusSearching} className="min-w-24">
                    {isStatusSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "بحث"}
                  </Button>
                </div>
              </div>

              {statusSearchResult && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <GraduationCap className="h-7 w-7" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-lg font-bold text-foreground">{statusSearchResult.student.full_name}</div>
                        <div className="text-sm text-muted-foreground">
                          {statusSearchResult.student.student_code && `كود: ${statusSearchResult.student.student_code} • `}
                          {formatStage(statusSearchResult.student.stage)} • {formatGrade(statusSearchResult.student.grade)}
                          {statusSearchResult.student.section && ` • ${formatSection(statusSearchResult.student.section)}`}
                        </div>
                      </div>
                    </div>
                  </div>

                  {statusSearchResult.rows.length === 0 ? (
                    <Card>
                      <CardContent className="p-8 text-center text-muted-foreground">لا توجد كورسات مفعلة لهذا الطالب حالياً.</CardContent>
                    </Card>
                  ) : (
                    <div className="grid gap-3 xl:grid-cols-2">
                      {statusSearchResult.rows.map((row) => {
                        const active = isRowActive(row);
                        const days = getDaysRemaining(row.end_date);
                        return (
                          <Card key={row.id} className={cn("border shadow-sm", active ? "border-primary/25" : "border-border")}>
                            <CardContent className="space-y-3 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-lg font-bold text-foreground">{row.subject_name}</div>
                                  <div className="text-sm text-muted-foreground">{row.course_title || "بدون اسم كورس"}</div>
                                </div>
                                <Badge variant={active ? "secondary" : "outline"}>
                                  {active ? (days === null ? "نشط" : `نشط • ${days} يوم`) : "غير نشط"}
                                </Badge>
                              </div>

                              <div className="flex items-center gap-2 text-sm">
                                {row.teacher_photo ? (
                                  <img src={row.teacher_photo} alt="" className="h-8 w-8 rounded-full object-cover" />
                                ) : (
                                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                                    <GraduationCap className="h-4 w-4" />
                                  </div>
                                )}
                                <span className="text-muted-foreground">المعلم:</span>
                                <span className="font-medium text-foreground">{row.teacher_name}</span>
                              </div>

                              <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                                <div className="flex items-center gap-2">
                                  <CreditCard className="h-4 w-4" />
                                  <span>{row.price !== null ? `${row.price} ${currency}` : "السعر غير محدد"}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Calendar className="h-4 w-4" />
                                  <span>{row.end_date ? `ينتهي ${formatDate(row.end_date)}` : "بدون تاريخ انتهاء"}</span>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default SubscriptionsPage;

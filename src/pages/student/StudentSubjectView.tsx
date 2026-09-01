import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import WeeklyScheduleDisplay from "@/components/common/WeeklyScheduleDisplay";
import { parseWeeklySchedule } from "@/lib/weeklySchedule";
import { resolveBunnyStorageUrl } from "@/lib/bunnyStorage";
import AuthenticatedVideo from "@/components/media/AuthenticatedVideo";
import DocumentViewerDialog from "@/components/media/DocumentViewerDialog";
import { reportRpcError } from "@/lib/rpcErrorReporter";
import AssistantLessonStudio from "@/components/student/AssistantLessonStudio";
import LiveTabContent from "@/components/live/LiveTabContent";
import ProtectedVideoPlayer from "@/components/student/ProtectedVideoPlayer";
import BunnyStreamPlayer from "@/components/video/BunnyStreamPlayer";
import { isBunnyVideo } from "@/lib/bunnyStream";
import VideoThumb from "@/components/student/VideoThumb";
import TeacherSelectionErrorDialog, {
  buildTeacherSelectionDiagnostic,
  type TeacherSelectionDiagnostic,
} from "@/components/student/TeacherSelectionErrorDialog";
import StudentTeacherChat from "@/components/student/StudentTeacherChat";
import { useAuth } from "@/hooks/useAuth";
import { isSharedSectionCategory, normalizeEducationType, normalizeSectionForSubjects } from "@/lib/educationSection";
import { getPostSignOutPath } from "@/lib/devImpersonation";
import { buildTeacherEducationTypeMap, filterAssignmentsForStudent } from "@/lib/teacherFiltering";
import { choiceCategoryKeyFromSelection, choiceCategoryVariantsFromSelection, gradeKeyFromArabicLabel, normalizeSubjectSelectionName, stageKeyFromValue } from "@/lib/teacherSubjectUtils";
import { categorySupportsSubSubjects } from "@/lib/subSubjectDefaults";
import { getCurrentTermForStageGrade } from "@/lib/termSystem";
import mudrikLogo from "@/assets/mudrik-logo.png";
import { toast } from "sonner";
import { trackViewContent, trackInitiateCheckout, trackPurchase } from "@/lib/metaPixel";
import { trackTikTokViewContent, trackTikTokInitiateCheckout, trackTikTokCompletePayment } from "@/lib/tiktokPixel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StudentExamPanel from "@/components/exams/StudentExamPanel";
import { useStudentExams, useStudentExamCatalog } from "@/hooks/useExams";
import SubSubjectsGrid, { SubSubjectRow } from "@/components/SubSubjectsGrid";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import NotificationsDropdown from "@/components/student/NotificationsDropdown";
import LessonCardText from "@/components/content/LessonCardText";
import {
  ChevronLeft,
  Loader2,
  GraduationCap,
  Info,
  MessageSquare,
  LogOut,
  Play,
  FileText,
  Lock,
  Wallet,
  Calendar,
  BookText,
  RefreshCw,
  Video,
  FileQuestion,
  Radio,
  Bot,
} from "lucide-react";

// ========== Types ==========
interface TeacherInfo {
  teacher_id: string;
  teacher_name: string;
  bio: string | null;
  photo_url: string | null;
  video_url: string | null;
  category: string;
  grades: string[];
  schedules: { day: string; time: string }[];
}

interface TeacherRequestMatch {
  user_id: string;
  assigned_grades: string[] | null;
  assigned_stages: string[] | null;
  education_type: string | null;
}

interface CourseGroup {
  id: string;
  title: string;
  description: string | null;
  month_label: string | null;
  image_url: string | null;
  price: number;
  section_name: string;
  subject_id: string;
  is_active: boolean;
  lesson_count: number | null;
  start_date: string | null;
  end_date: string | null;
  content_count: number;
  term?: string | null;
  weekly_schedule?: unknown;
}

const normalizeTeacherDisplayName = (name?: string | null) => (name || "").trim();

interface ContentRow {
  id: string;
  title: string;
  type: string;
  file_url: string;
  thumbnail_url?: string | null;
  description: string | null;
  created_at: string | null;
  is_paid: boolean;
  is_free_preview?: boolean;
  group_id: string | null;
  subject_id: string | null;
  sub_subject: string | null;
  sub_subject_id?: string | null;
  is_accessible?: boolean;
  education_type?: string | null;
  subject_section?: string | null;
}

interface StudentContentCatalogRow {
  id: string;
  title: string;
  type: string;
  file_url: string | null;
  thumbnail_url?: string | null;
  description: string | null;
  created_at: string | null;
  is_paid: boolean;
  is_free_preview: boolean;
  group_id: string | null;
  subject_id: string | null;
  sub_subject: string | null;
  sub_subject_id?: string | null;
  is_accessible: boolean;
  education_type?: string | null;
  subject_section?: string | null;
}

const isContentTargetDebugEnabled = () => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("debugContent") === "1" || window.localStorage.getItem("modrek-content-target-debug") === "1";
};

const traceContentTarget = (stage: string, payload: Record<string, unknown>) => {
  if (!isContentTargetDebugEnabled()) return;
  console.info(`[content-target-debug] ${stage}`, payload);
};

const mapStudentCatalogRowToContent = (row: StudentContentCatalogRow): ContentRow => ({
  id: row.id,
  title: row.title,
  type: row.type,
  file_url: row.file_url || "",
  thumbnail_url: row.thumbnail_url || null,
  description: row.description,
  created_at: row.created_at,
  is_paid: row.is_paid,
  is_free_preview: row.is_free_preview,
  group_id: row.group_id,
  subject_id: row.subject_id,
  sub_subject: row.sub_subject,
  sub_subject_id: row.sub_subject_id,
  is_accessible: row.is_accessible,
  education_type: (row as any).education_type || null,
  subject_section: (row as any).subject_section || null,
});

const normalizeSubSubjectLabel = (value?: string | null) =>
  String(value || "")
    .trim()
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .toLowerCase();

// Sub-subjects fallback lists
const ARABIC_SUB_SUBJECTS = ["نحو", "صرف", "بلاغة", "أدب", "نصوص", "قراءة"];
const SHARIA_SUB_SUBJECTS = ["فقه", "حديث", "تفسير", "توحيد", "سيرة"];
const STUDIES_SUB_SUBJECTS = ["التاريخ", "الجغرافيا"];
const MATH_SUB_SUBJECTS = ["الجبر", "الهندسة", "حساب المثلثات", "الهندسة التحليلية", "التفاضل والتكامل", "الاستاتيكا", "الديناميكا"];

function getSubSubjects(category: string): string[] {
  const cat = category.toLowerCase();
  if (cat.includes("عربي") || cat === "arabic") return ARABIC_SUB_SUBJECTS;
  if (cat.includes("شرعي") || cat === "religious" || cat === "sharia") return SHARIA_SUB_SUBJECTS;
  if (cat.includes("دراس") || cat === "studies" || cat === "social") return STUDIES_SUB_SUBJECTS;
  if (cat.includes("رياض") || cat === "math") return MATH_SUB_SUBJECTS;
  return [];
}

// ========== Helpers ==========
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

const normalizeSubjectStage = (value?: string | null) => stageKeyFromValue(value || "") || (value || "");
const normalizeSubjectGrade = (value?: string | null) => gradeKeyFromArabicLabel(value || "") || (value || "");

// Map URL param keys to Arabic labels used in teacher_assignments
const CATEGORY_KEY_TO_ARABIC: Record<string, string[]> = {
  arabic: ["arabic", "المواد العربية", "لغة عربية", "اللغة العربية"],
  religious: ["religious", "sharia", "المواد الشرعية"],
  science: ["science", "العلوم", "أحياء", "فيزياء", "كيمياء", "جيولوجيا"],
  integrated_science: ["integrated_science", "العلوم المتكاملة"],
  social: ["social", "studies", "الدراسات"],
  english: ["english", "الإنجليزية", "لغة إنجليزية"],
  scientific: ["scientific", "المواد العلمية"],
  physics: ["scientific", "science", "فيزياء", "الفيزياء"],
  chemistry: ["scientific", "science", "كيمياء", "الكيمياء"],
  biology: ["scientific", "science", "أحياء", "الأحياء", "احياء"],
  literary: ["literary", "المواد الأدبية", "تاريخ", "جغرافيا", "فلسفة"],
  history_geo: ["literary", "المواد الأدبية", "تاريخ", "جغرافيا"],
  history: ["literary", "تاريخ", "التاريخ"],
  geography: ["literary", "جغرافيا", "الجغرافيا"],
  math: ["math", "mathematics", "الرياضيات", "رياضيات"],
  french: ["french", "الفرنسية", "لغة فرنسية"],
};

const CATEGORY_KEY_TO_SUBJECT_CATEGORIES: Record<string, string[]> = {
  arabic: ["arabic"],
  religious: ["sharia", "religious"],
  social: ["studies", "social"],
  english: ["english"],
  french: ["french"],
  science: ["science"],
  integrated_science: ["integrated_science"],
  scientific: ["science"],
  physics: ["science"],
  chemistry: ["science"],
  biology: ["science"],
  literary: ["literary"],
  history_geo: ["literary"],
  history: ["literary"],
  geography: ["literary"],
  math: ["math"],
};

// Fallback subject-name keywords used when subjects rows are mis-categorized
// (e.g. a math subject stored under category=science). A subject is accepted
// if its name matches one of these keywords for the active category key.
const CATEGORY_KEY_TO_SUBJECT_NAME_KEYWORDS: Record<string, string[]> = {
  math: ["رياض", "math"],
  arabic: ["عرب", "arabic"],
  religious: ["شرع", "فقه", "حديث", "تفسير", "توحيد"],
  english: ["english", "إنجليز", "انجليز"],
  french: ["french", "فرنس"],
  science: ["علوم", "فيزياء", "كيمياء", "أحياء", "احياء", "جيولوجيا"],
  integrated_science: ["متكامل", "integrated"],
  scientific: ["فيزياء", "كيمياء", "أحياء", "احياء", "علوم"],
  physics: ["فيزياء"],
  chemistry: ["كيمياء"],
  biology: ["أحياء", "احياء"],
  literary: ["أدب", "تاريخ", "جغراف", "فلسف"],
  history_geo: ["تاريخ", "جغراف"],
  history: ["تاريخ"],
  geography: ["جغراف"],
  social: ["دراس", "اجتماع"],
};

const GRADE_KEY_TO_ARABIC: Record<string, string[]> = {
  first: ["first", "الصف الأول", "الصف الأول الإعدادي", "الصف الأول الثانوي"],
  second: ["second", "الصف الثاني", "الصف الثاني الإعدادي", "الصف الثاني الثانوي"],
  third: ["third", "الصف الثالث", "الصف الثالث الإعدادي", "الصف الثالث الثانوي"],
};

type ViewStep = "teacher_selection" | "groups_list" | "sub_subjects" | "subject_content";

const StudentSubjectView = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, signOut } = useAuth();

  const stage = params.get("stage") || "";
  const grade = params.get("grade") || "";
  const section = params.get("section") || "";
  const category = params.get("category") || "";
  const subjectNameFilter = params.get("subject_name") || "";
  const bundleId = params.get("bundleId") || "";
  const bundleCategory = params.get("bundleCategory") || "";
  const returnTo = params.get("returnTo") || "";
  const deepLinkGroupId = params.get("group_id") || "";
  const deepLinkSubSubjectId = params.get("sub_subject_id") || "";
  const deepLinkContentId = params.get("content_id") || "";
  const [resolvedDeepLinkGroupId, setResolvedDeepLinkGroupId] = useState(deepLinkGroupId);
  const [introVideo, setIntroVideo] = useState<{ url: string; name: string } | null>(null);
  const [resolvedDeepLinkSubSubjectId, setResolvedDeepLinkSubSubjectId] = useState(deepLinkSubSubjectId);
  const effectiveDeepLinkGroupId = resolvedDeepLinkGroupId || deepLinkGroupId;
  const effectiveDeepLinkSubSubjectId = resolvedDeepLinkSubSubjectId || deepLinkSubSubjectId;
  const inBundleMode = Boolean(bundleId && bundleCategory && returnTo);
  const normalizedSection = normalizeSectionForSubjects(section);
  const normalizedSubjectChoice = useMemo(() => normalizeSubjectSelectionName(subjectNameFilter), [subjectNameFilter]);
  const subjectNameVariants = useMemo(() => {
    const value = normalizedSubjectChoice || subjectNameFilter.trim();
    if (!value) return [];

    return [...new Set([
      value,
      value.replace(/^ال/, ""),
      value.startsWith("ال") ? value : `ال${value}`,
    ].filter(Boolean))];
  }, [subjectNameFilter]);
  // IMPORTANT: Keep choice key identical to TeacherSelection page (just the category)
  // so a student's selection persists across all entry points and never reverts.
  const choiceCategoryKey = useMemo(
    () => choiceCategoryKeyFromSelection(category, normalizedSubjectChoice),
    [category, normalizedSubjectChoice],
  );
  const choiceCategoryVariants = useMemo(
    () => choiceCategoryVariantsFromSelection(category, normalizedSubjectChoice),
    [category, normalizedSubjectChoice],
  );

  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<ViewStep>("teacher_selection");
  const [studentEducationType, setStudentEducationType] = useState<string | null>(null);
  const [studentSection, setStudentSection] = useState<string | null>(null);

  // Teacher selection
  const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
  const [existingChoice, setExistingChoice] = useState<string | null>(null);
  const [chosenTeacherName, setChosenTeacherName] = useState("");
  const [chosenTeacherPhoto, setChosenTeacherPhoto] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<TeacherSelectionDiagnostic | null>(null);

  const [showChangeWarning, setShowChangeWarning] = useState(false);
  const [hasActivePurchases, setHasActivePurchases] = useState(false);

  // Term system
  const [currentTerm, setCurrentTerm] = useState<string>("term1");

  // Groups
  const [courses, setCourses] = useState<CourseGroup[]>([]);
  const [purchasedGroups, setPurchasedGroups] = useState<Set<string>>(new Set());
  const [walletBalance, setWalletBalance] = useState(0);
  const [selectedCourse, setSelectedCourse] = useState<CourseGroup | null>(null);
  const [showSubscribeConfirm, setShowSubscribeConfirm] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  // Subject content
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [content, setContent] = useState<ContentRow[]>([]);
  const [loadingContent, setLoadingContent] = useState(false);
  const [subjects, setSubjects] = useState<{ id: string; name: string; section?: string | null }[]>([]);
  const { data: availableExamRows = [] } = useStudentExams();
  
  // Protected video player state
  const [activeVideo, setActiveVideo] = useState<ContentRow | null>(null);
  const [activeDocument, setActiveDocument] = useState<ContentRow | null>(null);
  
  // Sub-subject selection - now uses sub_subjects table
  const [selectedSubSubject, setSelectedSubSubject] = useState<SubSubjectRow | null>(null);
  
  // Get available sub-subjects based on category OR subject name (for fallback display).
  // Math/Studies/Biology are routed under "scientific"/"literary" parent categories, so we
  // must also inspect the chosen subject name to decide if sub-subjects apply.
  const availableSubSubjects = useMemo(() => {
    const fromCategory = getSubSubjects(category);
    if (fromCategory.length > 0) return fromCategory;
    return getSubSubjects(subjectNameFilter);
  }, [category, subjectNameFilter]);


  // Is the active group purchased?
  const activeGroupPurchased = activeGroupId ? purchasedGroups.has(activeGroupId) : false;
  // Unified targeting engine: every student uses the same RPC. The backend
  // matching function treats NULL target as "all" and value target as strict
  // match, which handles every combination (single section, multi section,
  // single education type, multi education type, all-students) correctly.
  const useLiteraryFallbackCatalog = false;

  // ========== Init ==========
  useEffect(() => {
    if (!user || !stage || !grade || !category) return;
    fetchInit();
  }, [user, stage, grade, category]);

  const fetchInit = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Fetch current term for this stage/grade
      const term = await getCurrentTermForStageGrade(stage, grade);
      setCurrentTerm(term);

      // Fetch student's education type
      const { data: studentProfile } = await supabase
        .from("profiles")
        .select("education_type, section")
        .eq("id", user.id)
        .maybeSingle();
      const eduType = (studentProfile as any)?.education_type || null;
      const profileSection = (studentProfile as any)?.section || null;
      setStudentEducationType(eduType);
      setStudentSection(profileSection);
      traceContentTarget("student-init.profile", {
        userId: user.id,
        stage,
        grade,
        category,
        currentTerm: term,
        educationType: eduType,
        normalizedEducationType: normalizeEducationType(eduType),
        section: profileSection,
        normalizedSection: normalizeSectionForSubjects(profileSection),
      });

      const { data: choiceData } = await supabase
        .from("student_teacher_choices")
        .select("teacher_id, category")
        .eq("student_id", user.id)
        .in("category", choiceCategoryVariants)
        .eq("stage", stage)
        .eq("grade", grade)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", user.id)
        .maybeSingle();
      setWalletBalance(wallet?.balance || 0);

      const { data: purchases } = await supabase
        .from("student_group_purchases")
        .select("group_id")
        .eq("student_id", user.id);
      const purchasedSet = new Set((purchases || []).map(p => p.group_id));
      setPurchasedGroups(purchasedSet);
      setHasActivePurchases(purchasedSet.size > 0);

      if (choiceData) {
        setExistingChoice(choiceData.teacher_id);
        const [{ data: tProfile }, { data: fallbackProfile }, { data: tPhoto }] = await Promise.all([
          supabase.from("public_teacher_profiles" as any).select("full_name, avatar_url").eq("id", choiceData.teacher_id).maybeSingle(),
          supabase.from("teacher_directory" as any).select("full_name, avatar_url").eq("id", choiceData.teacher_id).maybeSingle(),
          supabase.from("teacher_profiles").select("photo_url").eq("teacher_id", choiceData.teacher_id).maybeSingle(),
        ]);
        const teacherName = normalizeTeacherDisplayName((tProfile as any)?.full_name) || normalizeTeacherDisplayName((fallbackProfile as any)?.full_name);
        setChosenTeacherName(teacherName || "اسم المعلم غير متاح");
        setChosenTeacherPhoto((tPhoto as any)?.photo_url || (tProfile as any)?.avatar_url || (fallbackProfile as any)?.avatar_url || null);
        const loadedCourses = await fetchTeacherCourses(choiceData.teacher_id, purchasedSet, term, eduType, profileSection);
        const requestedGroup = effectiveDeepLinkGroupId
          ? loadedCourses.find((group) => group.id === effectiveDeepLinkGroupId)
          : null;

        if (requestedGroup) {
          setDeepLinkApplied(true);
          setActiveGroupId(requestedGroup.id);
          await loadGroupContent(
            requestedGroup.id,
            effectiveDeepLinkSubSubjectId || undefined,
            undefined,
            profileSection,
          );
        } else {
          setStep("groups_list");
        }
      } else {
        await fetchTeachers(eduType);
        setStep("teacher_selection");
      }
    } catch (e) {
      console.error(e);
      toast.error("خطأ في تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  // ========== Fetch Teachers ==========
  const fetchTeachers = async (educationTypeOverride?: string | null) => {
    // Special-case: "العلوم المتكاملة" (first secondary only) — only teachers who
    // explicitly opted-in (assignment.category = 'integrated_science') should appear.
    const isIntegratedScience = subjectNameFilter.trim() === "العلوم المتكاملة";

    let categoryVariants = isIntegratedScience
      ? ["integrated_science", "العلوم المتكاملة"]
      : (CATEGORY_KEY_TO_ARABIC[category] || [category]);
    if (!isIntegratedScience && subjectNameVariants.length) {
      categoryVariants = [...categoryVariants, ...subjectNameVariants];
    }
    const gradeVariants = GRADE_KEY_TO_ARABIC[grade] || [grade];

    const [{ data: assignments }, { data: requestMatches }] = await Promise.all([
      supabase
        .from("teacher_assignments")
        .select("teacher_id, grade, section, education_type")
        .in("category", categoryVariants)
        .eq("stage", stage)
        .in("grade", gradeVariants),
      supabase
        .from("approved_teacher_assignments" as any).select("user_id, assigned_grades, assigned_stages, education_type")
        .in("assigned_category", categoryVariants),
    ]);

    const requestAssignments = ((requestMatches as TeacherRequestMatch[] | null) || [])
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

    const teacherEducationTypeMap = buildTeacherEducationTypeMap(requestMatches as TeacherRequestMatch[] | null);

    const filteredAssignments = filterAssignmentsForStudent({
      assignments: combinedAssignments,
      category,
      normalizedSection,
      studentEducationType: educationTypeOverride ?? studentEducationType,
      teacherEducationTypeMap,
    });

    if (!filteredAssignments.length) { setTeachers([]); return; }
    const teacherIds = [...new Set(filteredAssignments.map(a => a.teacher_id))];

    const [{ data: profileRows }, { data: names }, { data: fallbackNames }, { data: schedules }] = await Promise.all([
      supabase.from("teacher_profiles").select("teacher_id, bio, photo_url, video_url").in("teacher_id", teacherIds),
      supabase.from("public_teacher_profiles" as any).select("id, full_name").in("id", teacherIds),
      supabase.from("teacher_directory" as any).select("id, full_name").in("id", teacherIds),
      supabase.from("teacher_schedules").select("teacher_id, day_of_week, time_slot").in("teacher_id", teacherIds),
    ]);
    const nameMap = new Map(names?.map(n => [n.id, normalizeTeacherDisplayName(n.full_name)]) || []);
    const fallbackNameMap = new Map(fallbackNames?.map(n => [n.id, normalizeTeacherDisplayName(n.full_name)]) || []);
    const profileMap = new Map((profileRows || []).map((profile) => [profile.teacher_id, profile]));
    const scheduleMap = new Map<string, { day: string; time: string }[]>();
    (schedules || []).forEach(s => {
      const arr = scheduleMap.get(s.teacher_id) || [];
      arr.push({ day: s.day_of_week, time: s.time_slot });
      scheduleMap.set(s.teacher_id, arr);
    });
    const gradesByTeacher = new Map<string, string[]>();
    filteredAssignments.forEach(a => {
      const arr = gradesByTeacher.get(a.teacher_id) || [];
      if (!arr.includes(a.grade)) arr.push(a.grade);
      gradesByTeacher.set(a.teacher_id, arr);
    });
    setTeachers(teacherIds.map((teacherId) => {
      const profile = profileMap.get(teacherId);
      return {
        teacher_id: teacherId,
        teacher_name: nameMap.get(teacherId) || fallbackNameMap.get(teacherId) || "اسم المعلم غير متاح",
        bio: profile?.bio || null,
        photo_url: profile?.photo_url || null,
        video_url: profile?.video_url || null,
        category,
        grades: gradesByTeacher.get(teacherId) || [],
        schedules: scheduleMap.get(teacherId) || [],
      };
    }));
  };

  // ========== Fetch Groups ==========
  const fetchTeacherCourses = async (
    teacherId: string,
    purchasedSet?: Set<string>,
    termOverride?: string,
    educationTypeOverride?: string | null,
    sectionOverride?: string | null,
  ) => {
    const activeTerm = termOverride || currentTerm;
    const effectiveEducationType = educationTypeOverride ?? studentEducationType;
    const effectiveStudentSection = sectionOverride ?? studentSection;
    const shouldFilterBySection = normalizedSection && !isSharedSectionCategory(category);
    const categoryVariants = CATEGORY_KEY_TO_SUBJECT_CATEGORIES[category] || [category];

    const { data: rawGroups, error: rawGroupsError } = await supabase
      .from("content_groups")
      .select("id, title, description, month_label, image_url, price, section_name, subject_id, is_active, lesson_count, start_date, end_date, teacher_id, created_by, term, education_type, weekly_schedule")
      .or(`teacher_id.eq.${teacherId},created_by.eq.${teacherId}`)
      .eq("is_active", true)
      .eq("price_approved", true);

    if (rawGroupsError) {
      console.error("[student-catalog-debug] content_groups query failed", {
        activeTerm,
        stage,
        grade,
        category,
        error: rawGroupsError,
      });
      setSubjects([]);
      setCourses([]);
      return [];
    }

    const subjectIds = [...new Set(((rawGroups as any[]) || []).map((group) => group.subject_id).filter(Boolean))];
    const { data: subjectRows } = subjectIds.length
      ? await supabase
          .from("subjects")
          .select("id, name, category, stage, grade, section")
          .in("id", subjectIds)
      : { data: [] };

    const subjectMap = new Map((subjectRows || []).map((subject) => [subject.id, subject]));

    const matchedSubjects = new Map<string, { id: string; name: string; section?: string | null }>();

    const eligibleGroups = ((rawGroups as any[]) || []).filter((group) => {
      const belongsToTeacher = group.teacher_id === teacherId || group.created_by === teacherId;
      if (!belongsToTeacher) return false;

      const subject = subjectMap.get(group.subject_id);
      if (!subject) return false;

      const normalizedSubjectStage = normalizeSubjectStage(subject.stage);
      const normalizedSubjectGrade = normalizeSubjectGrade(subject.grade);
      if (normalizedSubjectStage !== stage || normalizedSubjectGrade !== grade) return false;

      if (subjectNameVariants.length) {
        if (!subjectNameVariants.includes(subject.name)) return false;
      } else {
        const matchesCategory = categoryVariants.includes(subject.category);
        const nameKeywords = CATEGORY_KEY_TO_SUBJECT_NAME_KEYWORDS[category] || [];
        const subjectNameLower = String(subject.name || "").toLowerCase();
        const matchesName = nameKeywords.some((kw) => subjectNameLower.includes(kw.toLowerCase()));
        if (!matchesCategory && !matchesName) return false;
      }

      // Groups are visible to ALL students of the grade regardless of section.
      // Section-based filtering is applied to CONTENT only (see loadGroupContent),
      // because teachers tag each lesson/file with its target section at upload time.

      return true;
    });

    // Term isolation is enforced by the backend RLS policy (group_matches_current_system_term).
    // Do not duplicate it here: if the local term fetch is stale, the client-side filter hides
    // the whole group before the secure catalog RPC can return locked preview metadata.
    const groupsSource = eligibleGroups;

    const groups = groupsSource.filter((group) => {
      const subject = subjectMap.get(group.subject_id);
      if (!subject) return false;

      matchedSubjects.set(subject.id, {
        id: subject.id,
        name: subject.name,
        section: subject.section,
      });

      if (stage !== "secondary") return true;

      const groupEducationType = normalizeEducationType(group.education_type);
      const normalizedStudentEducationType = normalizeEducationType(effectiveEducationType);
      return !groupEducationType || (!!normalizedStudentEducationType && groupEducationType === normalizedStudentEducationType);
    });

    console.info("[student-catalog-debug] group visibility counts", {
      activeTerm,
      stage,
      grade,
      category,
      rawGroups: ((rawGroups as any[]) || []).length,
      eligibleGroups: eligibleGroups.length,
      visibleGroups: groups.length,
      visibleGroupIds: groups.map((group) => group.id),
    });
    traceContentTarget("student-groups.filtered", {
      activeTerm,
      teacherId,
      stage,
      grade,
      category,
      studentEducationType: effectiveEducationType,
      normalizedStudentEducationType: normalizeEducationType(effectiveEducationType),
      studentSection: effectiveStudentSection,
      normalizedStudentSection: normalizeSectionForSubjects(effectiveStudentSection),
      rawGroups: ((rawGroups as any[]) || []).map((group) => ({
        id: group.id,
        title: group.title,
        educationType: group.education_type || null,
        subjectId: group.subject_id,
        term: group.term,
      })),
      visibleGroups: groups.map((group) => ({
        id: group.id,
        title: group.title,
        educationType: group.education_type || null,
        subjectId: group.subject_id,
        term: group.term,
      })),
    });

    setSubjects(Array.from(matchedSubjects.values()));

    const groupIds = (groups || []).map(g => g.id);
    let contentCounts = new Map<string, number>();
    if (groupIds.length > 0) {
      const countResults = await Promise.all(
        groupIds.map(async (groupId) => {
          const { data, error } = await supabase.rpc("get_student_group_content_catalog" as any, {
            _group_id: groupId,
            _sub_subject_id: null,
          });

          if (!error) return [groupId, ((data || []) as StudentContentCatalogRow[]).length] as const;

          console.error("[student-catalog-debug] secure group catalog count failed", { groupId, error });
          return [groupId, 0] as const;
        }),
      );

      contentCounts = new Map(countResults);
    }

    const ps = purchasedSet || purchasedGroups;
    const groupsWithCounts = (groups || [])
      .map(g => ({ ...g, content_count: contentCounts.get(g.id) || 0 }));
    const sorted = groupsWithCounts
      .sort((a, b) => {
        const aPurchased = ps.has(a.id) ? 0 : 1;
        const bPurchased = ps.has(b.id) ? 0 : 1;
        return aPurchased - bPurchased;
      });
    console.info("[student-catalog-debug] group content counts", {
      hiddenEmptyGroups: groupsWithCounts
        .filter((group) => (group.content_count || 0) === 0)
        .map((group) => ({ id: group.id, title: group.title })),
      groups: sorted.map((group) => ({ id: group.id, title: group.title, content_count: group.content_count })),
    });
    setCourses(sorted);
    return sorted;
  };

  // Remove all paid purchases the student has with a specific (previous) teacher within this subject scope
  const purgePurchasesForTeacher = async (previousTeacherId: string) => {
    if (!user) return;
    try {
      const { data: subjectRows } = await supabase
        .from("subjects").select("id")
        .eq("category", choiceCategoryKey)
        .eq("grade", grade)
        .eq("stage", stage);
      const subjectIds = (subjectRows || []).map((s) => s.id);
      if (subjectIds.length === 0) return;

      const { data: prevGroups } = await supabase
        .from("content_groups").select("id")
        .in("subject_id", subjectIds)
        .or(`teacher_id.eq.${previousTeacherId},created_by.eq.${previousTeacherId}`);
      const prevGroupIds = (prevGroups || []).map((g) => g.id);
      if (prevGroupIds.length === 0) return;

      await supabase
        .from("student_group_purchases")
        .delete()
        .eq("student_id", user.id)
        .in("group_id", prevGroupIds);
    } catch (err) {
      console.error("purgePurchasesForTeacher failed", err);
    }
  };

  // ========== Select Teacher ==========
  const handleSelectTeacher = async (teacherId: string) => {
    if (!user) return;
    try {
      // If switching to a different teacher, remove the student's purchases from the old teacher
      // so they no longer appear in the old teacher's student/subscriber counts.
      if (existingChoice && existingChoice !== teacherId) {
        await purgePurchasesForTeacher(existingChoice);
      }

      const { error } = await supabase.rpc("select_my_teacher", {
        _teacher_id: teacherId,
        _category: choiceCategoryKey,
        _stage: stage,
        _grade: grade,
      });
      if (error) throw error;
      setExistingChoice(teacherId);
      const t = teachers.find(t => t.teacher_id === teacherId);
      if (t) {
        setChosenTeacherName(t.teacher_name);
        setChosenTeacherPhoto(t.photo_url);
      }
      toast.success("تم اختيار المعلم بنجاح");
      await fetchTeacherCourses(teacherId);
      setStep("groups_list");
    } catch (e) {
      console.error(e);
      setSelectionError(buildTeacherSelectionDiagnostic({
        error: e,
        source: "src/pages/student/StudentSubjectView.tsx::handleSelectTeacher",
        stage,
        grade,
        category: choiceCategoryKey,
      }));
    }
  };


  const handleChangeTeacher = () => {
    // Always show the confirmation dialog so the student is explicitly warned
    // that switching teachers will cancel their current subscription for this subject.
    setShowChangeWarning(true);
  };

  const doChangeTeacher = () => {
    setShowChangeWarning(false);
    setExistingChoice(null);
    setCourses([]);
    setStep("teacher_selection");
    fetchTeachers();
  };


  // ========== Bundle: select course for bundle (no payment, save to sessionStorage) ==========
  const selectCourseForBundle = (course: CourseGroup) => {
    if (!inBundleMode || typeof window === "undefined") return;
    const subjectName = subjects.find((s) => s.id === course.subject_id)?.name || category;
    const storageKey = `bundle-selection:${bundleId}`;
    let current: Record<string, any> = {};
    try {
      current = JSON.parse(window.sessionStorage.getItem(storageKey) || "{}");
    } catch { current = {}; }
    current[bundleCategory] = {
      categoryKey: bundleCategory,
      groupId: course.id,
      groupTitle: course.title,
      subjectName,
      teacherName: chosenTeacherName,
      price: Number(course.price || 0),
      monthLabel: course.month_label || null,
    };
    window.sessionStorage.setItem(storageKey, JSON.stringify(current));
    toast.success(`تم اختيار ${course.title} ضمن الباقة`);
    navigate(returnTo);
  };

  // ========== Subscribe ==========
  const handleSubscribe = async () => {
    if (!user || !selectedCourse) return;
    if (walletBalance < selectedCourse.price) {
      toast.error("رصيدك غير كافٍ. يرجى تعبئة المحفظة أولاً");
      return;
    }
    setSubscribing(true);
    try {
      const { data, error } = await supabase.rpc("purchase_group_with_wallet", {
        p_group_id: selectedCourse.id,
      });
      if (error) {
        console.error(error);
        toast.error("خطأ في الاشتراك");
        return;
      }
      const result = data as any;
      if (!result?.success) {
        toast.error(result?.error || "خطأ في الاشتراك");
        return;
      }
      setWalletBalance(result.remaining_balance ?? (walletBalance - selectedCourse.price));
      setPurchasedGroups(prev => new Set([...prev, selectedCourse.id]));
      // Purchase fires only here: wallet payment + subscription confirmed by the server
      trackPurchase(`${user.id}:${selectedCourse.id}`, {
        value: Number(selectedCourse.price || 0),
        content_type: "product",
        content_name: selectedCourse.title,
        content_category: category,
        content_ids: [selectedCourse.id],
      });
      trackTikTokCompletePayment(`${user.id}:${selectedCourse.id}`, {
        value: Number(selectedCourse.price || 0),
        content_type: "product",
        content_id: String(selectedCourse.id),
        content_name: selectedCourse.title,
        content_category: category,
        quantity: 1,
      });
      toast.success("تم الاشتراك بنجاح!");
      setShowSubscribeConfirm(false);
      setSelectedCourse(null);
    } catch (e) {
      console.error(e);
      toast.error("خطأ في الاشتراك");
    } finally {
      setSubscribing(false);
    }
  };

  // ---- ViewContent when the subject/teacher course list is shown ----
  useEffect(() => {
    if (loading || step === "teacher_selection") return;
    trackViewContent(`subject:${category}:${chosenTeacherName || "-"}`, {
      content_type: "product_group",
      content_name: subjectNameFilter || category,
      content_category: category,
    });
    trackTikTokViewContent(`subject:${category}:${subjectNameFilter || "-"}`, {
      content_type: "product_group",
      content_id: `subject:${category}`,
      content_name: subjectNameFilter || category,
      content_category: category,
    });
  }, [loading, step, category, subjectNameFilter, chosenTeacherName]);

  // ---- InitiateCheckout when the subscription confirmation opens ----
  useEffect(() => {
    if (!showSubscribeConfirm || !selectedCourse) return;
    trackInitiateCheckout(selectedCourse.id, {
      value: Number(selectedCourse.price || 0),
      content_type: "product",
      content_name: selectedCourse.title,
      content_category: category,
      content_ids: [selectedCourse.id],
    });
    trackTikTokInitiateCheckout(selectedCourse.id, {
      value: Number(selectedCourse.price || 0),
      content_type: "product",
      content_id: String(selectedCourse.id),
      content_name: selectedCourse.title,
      content_category: category,
      quantity: 1,
    });
  }, [showSubscribeConfirm, selectedCourse, category]);



  const shouldShowSubSubjectsForGroup = async (groupId: string) => {
    const { data, error } = await supabase
      .from("sub_subjects")
      .select("id, name")
      .eq("group_id", groupId)
      .eq("is_active", true)
      .order("order_index", { ascending: true });

    if (error) {
      console.error("[student-sub-subjects-debug] active sub-subject lookup failed", {
        groupId,
        category,
        subjectNameFilter,
        error,
      });
    }

    const groupSubjectId = courses.find((course) => course.id === groupId)?.subject_id || "";
    const parentSubjectName = subjects.find((subject) => subject.id === groupSubjectId)?.name || subjectNameFilter || category;
    const parentLabel = normalizeSubSubjectLabel(parentSubjectName);
    const realSubSubjects = ((data || []) as Array<{ id: string; name?: string | null }>).filter((sub) => {
      const subLabel = normalizeSubSubjectLabel(sub.name);
      return subLabel && subLabel !== parentLabel;
    });

    if (realSubSubjects.length > 0) {
      return true;
    }

    // Never force the student into the sub-subject workspace without real rows.
    // Some أدبي groups (especially math/literary secondary groups) have content
    // uploaded directly to the group with no sub_subjects rows; forcing the
    // workspace here showed an empty sections screen and hid all videos/files.
    if (
      categorySupportsSubSubjects(category) ||
      categorySupportsSubSubjects(subjectNameFilter) ||
      availableSubSubjects.length > 0
    ) {
      traceContentTarget("student-sub-subjects.skipped-empty-workspace", {
        groupId,
        category,
        subjectNameFilter,
      });
    }

    return false;
  };

  // ========== Enter Group - Check for sub-subjects ==========
  const enterGroupContent = async (group: CourseGroup) => {
    setActiveGroupId(group.id);
    setSelectedSubSubject(null);

    const hasSubSubjects = await shouldShowSubSubjectsForGroup(group.id);
    if (hasSubSubjects) {
      setStep("sub_subjects");
      return;
    }

    // Preview mode: non-subscribed students must see the full group catalog
    // (videos/books names + thumbnails) only when the group has no sub-subject workspace.
    if (!purchasedGroups.has(group.id)) {
      await loadGroupContent(group.id);
      return;
    }

    // No sub-subjects, go directly to content
    await loadGroupContent(group.id);
  };

  // ========== Load content for group (optionally filtered by sub_subject_id) ==========
  const loadGroupContent = async (groupId: string, subSubjectId?: string, _subSubjectName?: string, _sectionOverride?: string | null) => {
    setLoadingContent(true);
    setStep("subject_content");

    try {
      // Unified path for every student (scientific + literary). The RPC's
      // content_target_matches_student handles section/education_type/track
      // uniformly — the only input that differs between sections is the
      // caller's own profile row, never the code path.
      const { data: secureRows, error: secureError } = await supabase.rpc(
        "get_student_group_content_catalog" as any,
        {
          _group_id: groupId,
          _sub_subject_id: subSubjectId || null,
        },
      );

      const finishWithContent = (rows: ContentRow[]) => {
        setContent(rows);

        if (deepLinkContentId && !deepLinkContentOpened) {
          const targetRow = rows.find((item) => item.id === deepLinkContentId);
          if (targetRow && (purchasedGroups.has(groupId) || targetRow.is_accessible === true || targetRow.is_free_preview === true)) {
            setDeepLinkContentOpened(true);
            setTimeout(() => {
              if (targetRow.type === "video") {
                setActiveVideo(targetRow);
              } else if (targetRow.file_url) {
                setActiveDocument(targetRow);
              }
            }, 250);
          }
        }
      };

      if (!secureError) {
        const secureContentRows = ((secureRows || []) as StudentContentCatalogRow[]).map(mapStudentCatalogRowToContent);
        traceContentTarget("student-content.rpc-result", {
          groupId,
          subSubjectId: subSubjectId || null,
          studentId: user?.id || null,
          studentEducationType,
          normalizedStudentEducationType: normalizeEducationType(studentEducationType),
          studentSection,
          normalizedStudentSection: normalizeSectionForSubjects(studentSection),
          rows: secureContentRows.map((row) => ({
            id: row.id,
            title: row.title,
            type: row.type,
            educationType: row.education_type || null,
            subjectSection: row.subject_section || null,
            subjectId: row.subject_id || null,
            groupId: row.group_id || null,
            subSubjectId: row.sub_subject_id || null,
            isAccessible: row.is_accessible === true,
            isFreePreview: row.is_free_preview === true,
          })),
        });
        finishWithContent(secureContentRows);
        return;
      }

      setContent([]);
      reportRpcError({
        title: "تعذر تحميل محتوى المجموعة",
        error: secureError,
        operation: "rpc:get_student_group_content_catalog",
        sourceHint: "StudentSubjectView.loadGroupContent",
        context: {
          groupId,
          subSubjectId: subSubjectId || null,
          studentSection,
          studentEducationType,
          userId: user?.id || null,
        },
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingContent(false);
    }
  };

  // ========== Handle sub-subject selection ==========
  const handleSubSubjectSelect = (sub: SubSubjectRow) => {
    setSelectedSubSubject(sub);
    if (activeGroupId) {
      loadGroupContent(activeGroupId, sub.id, sub.name);
    }
  };

  // ========== Deep link (from notifications): auto-open group + sub-subject ==========
  const [deepLinkApplied, setDeepLinkApplied] = useState(false);
  const [deepLinkContentOpened, setDeepLinkContentOpened] = useState(false);

  useEffect(() => {
    setResolvedDeepLinkGroupId(deepLinkGroupId);
    setResolvedDeepLinkSubSubjectId(deepLinkSubSubjectId);
  }, [deepLinkGroupId, deepLinkSubSubjectId]);

  useEffect(() => {
    if (!deepLinkContentId || deepLinkGroupId || resolvedDeepLinkGroupId) return;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("content")
        .select("group_id, sub_subject_id")
        .eq("id", deepLinkContentId)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.error("Deep link content lookup failed", error);
        return;
      }

      const row = data as { group_id?: string | null; sub_subject_id?: string | null } | null;
      if (row?.group_id) setResolvedDeepLinkGroupId(row.group_id);
      if (!deepLinkSubSubjectId && row?.sub_subject_id) setResolvedDeepLinkSubSubjectId(row.sub_subject_id);
    })();

    return () => { cancelled = true; };
  }, [deepLinkContentId, deepLinkGroupId, resolvedDeepLinkGroupId, deepLinkSubSubjectId]);

  useEffect(() => {
    if (deepLinkApplied || !effectiveDeepLinkGroupId) return;
    if (step !== "groups_list" || courses.length === 0) return;
    const group = courses.find((c) => c.id === effectiveDeepLinkGroupId);
    if (!group) return;
    // Deep links and explicit group_id routes should open the group catalog even
    // for non-subscribed students, because the product supports previewing locked
    // items in place. Actual playback/opening remains guarded by canOpenContent.
    setDeepLinkApplied(true);
    (async () => {
      setActiveGroupId(group.id);
      if (effectiveDeepLinkSubSubjectId) {
        try {
          const { data: sub } = await supabase
            .from("sub_subjects")
            .select("id, name, order_index, group_id")
            .eq("id", effectiveDeepLinkSubSubjectId)
            .maybeSingle();
          if (sub) setSelectedSubSubject(sub as any);
          await loadGroupContent(group.id, effectiveDeepLinkSubSubjectId, (sub as any)?.name);
        } catch (err) {
          console.error("Deep link sub-subject load failed", err);
          await enterGroupContent(group);
        }
      } else {
        await enterGroupContent(group);
      }
    })();
  }, [deepLinkApplied, effectiveDeepLinkGroupId, effectiveDeepLinkSubSubjectId, step, courses, purchasedGroups]);



  const canOpenContent = (item: ContentRow) =>
    item.is_accessible === true || activeGroupPurchased || item.is_free_preview === true;

  const handleContentClick = (e: React.MouseEvent, item: ContentRow) => {
    e.stopPropagation();
    e.preventDefault();
    if (!canOpenContent(item)) {
      toast("🔒 يجب الاشتراك في هذه المجموعة أولاً لمشاهدة جميع المحتويات التعليمية.", {
        duration: 3500,
      });
      return;
    }
    if (item.type === "video") {
      setActiveVideo(item);
    } else {
      if (!item.file_url) {
        toast.error("رابط الملف غير متاح حاليًا");
        return;
      }
      setActiveDocument(item);
    }
  };





  const handleSignOut = async () => {
    const nextPath = getPostSignOutPath("/");
    await signOut();
    navigate(nextPath, { replace: true });
  };

  // ========== Content filtering ==========
  // The catalog RPC already applies strict sub-subject matching, including
  // sibling groups where the same sub-subject has a different UUID. Do not
  // re-filter by raw UUID here or أدبي/علمي sibling content is dropped.
  const filteredContent = useMemo(() => {
    return content;
  }, [content]);
  const videos = useMemo(() => filteredContent.filter(c => c.type === "video"), [filteredContent]);
  const learningFiles = useMemo(() => filteredContent.filter(c => c.type !== "video"), [filteredContent]);
  const activeGroupSubjectId = useMemo(() => courses.find(c => c.id === activeGroupId)?.subject_id || "", [courses, activeGroupId]);
  const activeGroupSubjectMeta = useMemo(
    () => subjects.find((subject) => subject.id === activeGroupSubjectId),
    [subjects, activeGroupSubjectId],
  );
  const { data: activeGroupExamCatalog } = useStudentExamCatalog(
    activeGroupId
      ? {
          subjectId: activeGroupSubjectId,
          groupId: activeGroupId,
          term: currentTerm,
          subSubjectId: selectedSubSubject?.id,
        }
      : undefined,
  );
  const activeGroupExamCount = useMemo(() => {
    const exams = activeGroupExamCatalog?.exams || [];
    return exams.length;
  }, [activeGroupExamCatalog]);

  // ========== Header ==========
  const renderHeader = () => (
    <header className="mobile-app-header sticky z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="mobile-app-header-inner flex items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <img src={mudrikLogo} alt="مدرك Plus" className="h-9 w-9 rounded-xl object-contain shadow-sm" />
          <span className="text-lg font-bold">
            <span className="mudrik-wordmark-main text-foreground">مدرك</span>{" "}
            <span className="mudrik-wordmark-plus text-primary">Plus</span>
          </span>
        </Link>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => navigate("/wallet")} className="student-wallet-cloud gap-1.5 h-9 text-sm font-bold px-3.5">
            <Wallet className="h-4 w-4" />
            {walletBalance} جنيه
          </Button>
        </div>
      </div>
    </header>
  );

  // ========== Subscribe Confirm Dialog ==========
  const renderSubscribeDialog = () => (
    <Dialog open={showSubscribeConfirm} onOpenChange={setShowSubscribeConfirm}>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>تأكيد الاشتراك</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p>هل تريد الاشتراك في <strong>{selectedCourse?.title}</strong>؟</p>
          <div className="p-4 rounded-lg bg-accent/30">
            <p>السعر: <strong>{selectedCourse?.price} جنيه</strong></p>
            <p>رصيدك: <strong>{walletBalance} جنيه</strong></p>
            {selectedCourse && walletBalance < selectedCourse.price && (
              <div className="mt-2">
                <p className="text-destructive text-sm">رصيدك غير كافٍ</p>
                <Button variant="link" className="text-sm p-0" onClick={() => navigate("/wallet")}>
                  اذهب لتعبئة المحفظة
                </Button>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowSubscribeConfirm(false)}>إلغاء</Button>
          <Button
            onClick={handleSubscribe}
            disabled={subscribing || (selectedCourse ? walletBalance < selectedCourse.price : true)}
          >
            {subscribing ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
            تأكيد الاشتراك
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // ========== Loading ==========
  if (loading) {
    return (
      <div className="mobile-app-page flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // ========== Step 1: Teacher Selection (Full Screen - mandatory) ==========
  if (step === "teacher_selection") {
    return (
      <div className="mobile-app-page bg-gradient-to-br from-background via-background to-accent/20 flex flex-col">
        {renderHeader()}
        <main className="mobile-page-content flex-1">
          <Button variant="ghost" className="mb-6" onClick={() => navigate("/dashboard")}>
            <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />
            رجوع للرئيسية
          </Button>

          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-primary flex items-center justify-center shadow-xl shadow-primary/30">
              <GraduationCap className="h-10 w-10 text-primary-foreground" />
            </div>
            <Badge variant="secondary" className="mb-3">معلمو هذا القسم</Badge>
            <h1 className="text-3xl font-bold mb-2">اختر معلمك المفضل</h1>
            <p className="text-muted-foreground">{formatStage(stage)} - {formatGrade(grade)} - {category}</p>
            <p className="text-sm text-muted-foreground mt-1">اختر المعلم الذي تريد الاشتراك معه وسيظهر لك محتواه الخاص فقط</p>
          </div>

          {teachers.length === 0 ? (
            <Card className="border-2 border-dashed max-w-md mx-auto">
              <CardContent className="p-8 text-center">
                <GraduationCap className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-bold mb-2">لا يوجد معلمين</h3>
                <p className="text-muted-foreground mb-4">لم يتم تعيين معلمين لهذه المادة بعد</p>
                <Button onClick={() => navigate("/dashboard")}>العودة للرئيسية</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4 max-w-3xl mx-auto">
              {teachers.map(teacher => (
                <Card key={teacher.teacher_id} className="overflow-hidden hover:shadow-lg transition-all border-2 hover:border-primary/30">
                  <CardContent className="p-0">
                    <div className="flex flex-col sm:flex-row">
                      <div className="sm:w-40 h-40 sm:h-auto bg-accent flex items-center justify-center shrink-0">
                        {teacher.photo_url ? (
                          <img src={teacher.photo_url} alt={teacher.teacher_name} className="w-full h-full object-cover" />
                        ) : (
                          <GraduationCap className="h-16 w-16 text-primary/50" />
                        )}
                      </div>
                      <div className="flex-1 p-5">
                        <h3 className="text-xl font-bold mb-2">{teacher.teacher_name}</h3>
                        {teacher.bio && <p className="text-muted-foreground text-sm mb-3 line-clamp-3">{teacher.bio}</p>}
                        {teacher.grades.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {teacher.grades.map(g => (
                              <Badge key={g} variant="outline" className="text-xs">{formatGrade(g)}</Badge>
                            ))}
                          </div>
                        )}
                        {teacher.schedules.length > 0 && (
                          <div className="mb-3">
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                              <Calendar className="h-3 w-3" /> مواعيد الحصص:
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {teacher.schedules.map((s, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">{s.day} - {s.time}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button onClick={() => handleSelectTeacher(teacher.teacher_id)} className="flex-1 gap-2">
                            <GraduationCap className="h-4 w-4" />
                            اختيار والاشتراك
                          </Button>
                          {teacher.video_url && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIntroVideo({ url: teacher.video_url!, name: teacher.teacher_name });
                              }}
                              className="gap-1"
                            >
                              <Play className="h-4 w-4" />
                              فيديو تعريفي
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
        <Dialog open={!!introVideo} onOpenChange={(o) => !o && setIntroVideo(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>فيديو تعريفي - {introVideo?.name}</DialogTitle>
            </DialogHeader>
            {introVideo?.url && (
              <AuthenticatedVideo source={introVideo.url} autoPlay className="w-full rounded-lg" />
            )}
          </DialogContent>
        </Dialog>
        <TeacherSelectionErrorDialog
          diagnostic={selectionError}
          onOpenChange={(open) => {
            if (!open) setSelectionError(null);
          }}
        />
      </div>
    );
  }

  // ========== Step 2: Groups List ==========
  if (step === "groups_list") {
    return (
      <div className="mobile-app-page bg-gradient-to-br from-background via-background to-accent/20">
        {renderHeader()}
        <main className="px-4 pt-3 pb-6 max-w-5xl mx-auto">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="h-9 gap-1 px-2">
              <ChevronLeft className="h-4 w-4 rotate-180" />
              <span className="text-sm">رجوع</span>
            </Button>
            <div className="flex items-center gap-2">
              {existingChoice && (
                <StudentTeacherChat
                  teacherId={existingChoice}
                  teacherName={chosenTeacherName || "اسم المعلم غير متاح"}
                  teacherPhotoUrl={chosenTeacherPhoto}
                />
              )}
              <button
                type="button"
                onClick={handleChangeTeacher}
                title="تغيير المعلم"
                className="flex flex-col items-center gap-1 rounded-2xl px-2 py-1 transition-all duration-300 hover:bg-primary/5"
              >
                <div className="h-8 w-8 shrink-0 rounded-full border-2 border-primary/30 bg-white flex items-center justify-center shadow-sm">
                  <RefreshCw className="h-4 w-4 text-primary" />
                </div>
                <span className="block text-[10px] font-bold leading-none whitespace-nowrap text-primary">تغيير المعلم</span>
              </button>
            </div>

          </div>

          <motion.div 
            className="mb-4 text-center"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <div className="student-course-soft-chip mx-auto mb-2 inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
              <GraduationCap className="h-3.5 w-3.5" />
              مجموعات {category}
            </div>
            <h1 className="mb-1 text-lg font-extrabold text-foreground">مجموعات المادة</h1>
            <p className="text-[11px] text-muted-foreground">{formatStage(stage)} - {formatGrade(grade)} - {category}</p>
          </motion.div>

          {courses.length === 0 ? (
            <Card className="mx-auto max-w-md border border-primary/15 bg-card/95 shadow-lg shadow-primary/10">
              <CardContent className="p-8 text-center">
                <BookText className="mx-auto mb-4 h-16 w-16 text-primary/55" />
                <h3 className="mb-2 text-xl font-bold">لا توجد مجموعات</h3>
                <p className="text-muted-foreground">لم يقم المعلم بنشر مجموعات بعد</p>
              </CardContent>
            </Card>
          ) : (
            <motion.div 
              className="mx-auto grid max-w-5xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
              initial="hidden"
              animate="visible"
              variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
            >
              {courses.map((course) => {
                const isPurchased = purchasedGroups.has(course.id);
                return (
                  <motion.div
                    key={course.id}
                    variants={{ hidden: { opacity: 0, y: 18, scale: 0.97 }, visible: { opacity: 1, y: 0, scale: 1 } }}
                    transition={{ type: "spring", stiffness: 210, damping: 20 }}
                    whileHover={{ y: -4 }}
                    whileTap={{ scale: 0.985 }}
                  >
                    <Card className={`student-group-card overflow-hidden rounded-[1.5rem] transition-all duration-300 ${isPurchased ? "student-group-card-active" : ""}`}>
                      <div className="student-group-media relative overflow-hidden">
                        {course.image_url ? (
                          <img
                            src={resolveBunnyStorageUrl(course.image_url)}
                            alt={`صورة المجموعة ${course.title}`}
                            className="student-group-media-image h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="student-group-media-fallback flex h-full w-full items-center justify-center">
                            <BookText className="h-10 w-10 text-primary-foreground" />
                          </div>
                        )}
                        <div className="student-group-media-overlay absolute inset-0" />

                        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
                          {isPurchased ? (
                            <Badge className="student-group-state-badge student-group-state-badge--subscribed rounded-full border-0 px-3 py-1 text-[11px] font-bold">
                              مشترك ✓
                            </Badge>
                          ) : (
                            <Badge className="student-group-state-badge student-group-state-badge--available rounded-full border-0 px-3 py-1 text-[11px] font-bold">
                              متاحة الآن
                            </Badge>
                          )}

                          <div className="student-group-icon-shell flex h-12 w-12 items-center justify-center rounded-2xl">
                            <BookText className="h-5 w-5 text-primary-foreground" />
                          </div>
                        </div>

                        <div className="absolute inset-x-0 bottom-0 p-4 text-primary-foreground">
                          <h3 className="line-clamp-1 text-lg font-extrabold">{course.title}</h3>
                          {course.month_label && (
                            <span className="mt-1 block text-xs font-medium text-primary-foreground/85">{course.month_label}</span>
                          )}
                        </div>
                      </div>

                      <CardContent className="space-y-3 p-4 sm:p-5">
                        {course.description && (
                          <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{course.description}</p>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="student-group-meta-chip flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium">
                            <BookText className="h-3.5 w-3.5 text-primary" />
                            <span>{course.lesson_count ?? 0} حصة</span>
                          </div>
                          <div className="flex items-baseline gap-1">
                            <span className="student-group-price text-2xl font-extrabold">{course.price}</span>
                            <span className="text-xs font-medium text-muted-foreground">جنيه</span>
                          </div>
                        </div>
                        {(course.start_date || course.end_date) && (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5 text-primary" />
                            {course.start_date && <span>من: {course.start_date}</span>}
                            {course.end_date && <span>إلى: {course.end_date}</span>}
                          </div>
                        )}
                        <WeeklyScheduleDisplay variant="banner" slots={parseWeeklySchedule(course.weekly_schedule)} />

                        {isPurchased ? (
                            <Button className="student-cloud-blue-button w-full rounded-xl py-3.5 text-sm font-bold gap-2" onClick={() => enterGroupContent(course)}>
                            <Play className="h-4 w-4" />
                            دخول المجموعة
                          </Button>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                                className="student-cloud-blue-button rounded-xl py-3.5 text-sm font-bold"
                              onClick={() => {
                                if (inBundleMode) {
                                  selectCourseForBundle(course);
                                } else {
                                  setSelectedCourse(course);
                                  setShowSubscribeConfirm(true);
                                }
                              }}
                            >
                              {inBundleMode ? "اختر هذه المجموعة" : "اشترك الآن"}
                            </Button>
                              <Button variant="outline" className="student-cloud-blue-outline rounded-xl py-3.5 text-sm font-semibold gap-1" onClick={() => enterGroupContent(course)}>
                              <BookText className="h-3.5 w-3.5 text-primary" />
                              تصفح
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </main>

        {/* Change Teacher Warning */}
        <AlertDialog open={showChangeWarning} onOpenChange={setShowChangeWarning}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>تأكيد تغيير المعلم</AlertDialogTitle>
              <AlertDialogDescription className="text-right leading-relaxed space-y-2">
                <p>هل أنت متأكد أنك تريد تغيير المعلم الحالي لهذه المادة؟</p>
                <p className="text-destructive font-semibold">سيتم إلغاء اشتراكك الحالي مع المعلم الحالي بشكل كامل، وسيُحذف من قائمة طلابه، ولن يظهر لديه بعد الآن.</p>
                <p className="font-semibold text-foreground">هذا التغيير دائم ولن يُعاد ضبطه عند إعادة الدخول إلى المنصة.</p>
                <p className="text-muted-foreground text-sm">إذا كنت قد دفعت مقابل مجموعات مع المعلم الحالي فقد تفقد الوصول إليها.</p>
              </AlertDialogDescription>

            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction onClick={doChangeTeacher} className="bg-destructive hover:bg-destructive/90">
                تغيير المعلم
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {renderSubscribeDialog()}
      </div>
    );
  }

  // ========== Step 3: Sub-Subjects Selection ==========
  if (step === "sub_subjects") {
    const activeGroup = courses.find(c => c.id === activeGroupId);
    return (
      <div className="mobile-app-page bg-gradient-to-br from-background via-background to-accent/20">
        {renderHeader()}
        <main className="mobile-page-content">
          <SubSubjectsGrid
            groupId={activeGroupId || ""}
            groupTitle={activeGroup?.title || "المجموعة"}
            category={category}
            subjectName={subjectNameFilter}
            userId={user?.id || ""}
            isTeacher={false}
            onSelectSubSubject={handleSubSubjectSelect}
            onBack={() => { setStep("groups_list"); setActiveGroupId(null); }}
          />
        </main>
        {renderSubscribeDialog()}
      </div>
    );
  }

  // ========== Step 4: Subject Content ==========
  const activeGroup = courses.find(c => c.id === activeGroupId);

  const renderContentList = (items: ContentRow[], icon: React.ReactNode, emptyMsg: string) => {
    if (items.length === 0) {
      return (
        <Card className="p-8 text-center">
          <div className="mx-auto mb-4 text-muted-foreground">{icon}</div>
          <h3 className="text-lg font-semibold mb-2">لا يوجد محتوى</h3>
          <p className="text-muted-foreground">{emptyMsg}</p>
        </Card>
      );
    }
    return (
      <div className="grid gap-3">
        {items.map(item => {
          const openable = canOpenContent(item);
          return (
          <Card
            key={item.id}
            className={`transition-shadow hover:shadow-md ${openable ? "cursor-pointer" : "cursor-pointer border-border/80 bg-card"}`}
            onClick={(e) => handleContentClick(e, item)}
          >
            <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between sm:p-4">
              <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
                {item.type === "video" ? (
                  <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-accent">
                    <VideoThumb url={item.file_url} thumbnailUrl={item.thumbnail_url} className="h-full w-full" rounded="rounded-lg" />
                  </div>
                ) : (
                  <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-accent">
                    {item.thumbnail_url ? (
                      <img
                        src={resolveBunnyStorageUrl(item.thumbnail_url)}
                        alt={item.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <FileText className="h-6 w-6 text-primary" />
                    )}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start gap-1.5">
                    <h3
                      dir="auto"
                      className="line-clamp-2 min-w-0 flex-1 break-words [overflow-wrap:anywhere] font-semibold text-foreground"
                    >
                      {item.title}
                    </h3>
                    {item.is_free_preview === true && (
                      <Badge className="shrink-0 gap-1 border border-primary/20 bg-primary/10 px-1.5 py-0 text-[10px] text-primary">
                        <Play className="h-2.5 w-2.5" />
                        مجاني
                      </Badge>
                    )}
                  </div>
                  {item.description && (
                    <LessonCardText text={item.description} className="mt-1 text-xs leading-5 text-muted-foreground" />
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-2 sm:w-auto">

                {openable ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={(e) => handleContentClick(e, item)}
                  >
                    {item.type === "video" ? (
                      <><Play className="h-4 w-4" />مشاهدة</>
                    ) : (
                      <><FileText className="h-4 w-4" />عرض</>
                    )}
                  </Button>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    <Lock className="h-2.5 w-2.5" />
                    مقفول
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
          );
        })}

      </div>
    );
  };

  return (
    <div className="mobile-app-page bg-gradient-to-br from-background via-background to-accent/20">
      {renderHeader()}
      <main className="mobile-page-content">
        <Button 
          variant="ghost" 
          className="mb-6" 
          onClick={() => { 
            if (selectedSubSubject) {
              // Go back to sub-subjects selection
              setStep("sub_subjects"); 
              setContent([]); 
            } else {
              // Go back to groups list
              setStep("groups_list"); 
              setActiveGroupId(null); 
              setContent([]); 
            }
          }}
        >
          <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />
          {selectedSubSubject ? "رجوع لأقسام المادة" : "رجوع للمجموعات"}
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">{activeGroup?.title || "محتوى المجموعة"}</h1>
          {activeGroup?.month_label && <Badge variant="secondary" className="mb-2">{activeGroup.month_label}</Badge>}
          {activeGroup?.description && <p className="text-muted-foreground">{activeGroup.description}</p>}
          <WeeklyScheduleDisplay
            variant="banner"
            className="mt-3"
            slots={parseWeeklySchedule(activeGroup?.weekly_schedule)}
          />
          {!activeGroupPurchased && (
            <div className="mt-4 p-4 rounded-lg bg-accent border border-border">
              <p className="text-foreground text-sm font-medium flex items-center gap-2">
                <Lock className="h-4 w-4" />
                يجب الاشتراك في المجموعة لمشاهدة المحتوى
              </p>
              <Button
                className="mt-2"
                onClick={() => {
                  if (!activeGroup) return;
                  if (inBundleMode) {
                    selectCourseForBundle(activeGroup);
                  } else {
                    setSelectedCourse(activeGroup);
                    setShowSubscribeConfirm(true);
                  }
                }}
              >
                {inBundleMode ? `اختر هذه المجموعة - ${activeGroup?.price} جنيه` : `اشترك الآن - ${activeGroup?.price} جنيه`}
              </Button>
            </div>
          )}
        </div>

        {loadingContent ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <>
            <Tabs defaultValue="lessons" className="w-full">
            <TabsList className="grid w-full grid-cols-5 mb-8">
              <TabsTrigger value="lessons" className="gap-1">
                <Video className="h-4 w-4" />
                <span className="hidden sm:inline">شرح الدرس</span>
                <span className="text-xs bg-muted px-1.5 rounded">{videos.length}</span>
              </TabsTrigger>
              <TabsTrigger value="books" className="gap-1">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">الكتب والملفات</span>
                <span className="text-xs bg-muted px-1.5 rounded">{learningFiles.length}</span>
              </TabsTrigger>
              <TabsTrigger value="live" className="gap-1">
                <Radio className="h-4 w-4" />
                <span className="hidden sm:inline">حصص Live</span>
              </TabsTrigger>
              <TabsTrigger value="exams" className="gap-1">
                <FileQuestion className="h-4 w-4" />
                <span className="hidden sm:inline">الامتحانات</span>
                <span className="text-xs bg-muted px-1.5 rounded">{activeGroupExamCount}</span>
              </TabsTrigger>
              <TabsTrigger value="ai" className="gap-1">
                <Bot className="h-4 w-4" />
                <span className="hidden sm:inline">المساعد الذكي</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="lessons">
              {renderContentList(videos, <Video className="h-12 w-12" />, "لم يتم رفع فيديوهات في هذه المجموعة بعد")}
            </TabsContent>
            <TabsContent value="books">
              {renderContentList(learningFiles, <FileText className="h-12 w-12" />, "لم يتم رفع كتب أو ملفات في هذه المجموعة بعد")}
            </TabsContent>
            <TabsContent value="live">
              <LiveTabContent groupId={activeGroupId || ""} groupTitle={activeGroup?.title || ""} isTeacher={false} />
            </TabsContent>
            <TabsContent value="exams">
              <StudentExamPanel
                currentTerm={currentTerm}
                groupId={activeGroup?.id || ""}
                subSubjectId={selectedSubSubject?.id || undefined}
                isSubscribed={activeGroupPurchased}
                onRequireSubscription={() => {
                  if (!activeGroup) return;
                  setSelectedCourse(activeGroup);
                  setShowSubscribeConfirm(true);
                }}
                subjectId={activeGroup?.subject_id || ""}
                subjectName={subjects.find(s => s.id === activeGroup?.subject_id)?.name || category}
              />
            </TabsContent>
            <TabsContent value="ai" className="min-h-[500px]">
              <AssistantLessonStudio
                subjectId={activeGroup?.subject_id || ""}
                subjectName={selectedSubSubject?.name || subjects.find(s => s.id === activeGroup?.subject_id)?.name || category}
                groupId={activeGroupId || undefined}
                subSubjectId={selectedSubSubject?.id || undefined}
                subSubjectName={selectedSubSubject?.name || null}
                stage={stage}
                grade={grade}
                section={section}
                educationType={studentEducationType}
              />
            </TabsContent>
            </Tabs>
          </>
        )}
      </main>

      {renderSubscribeDialog()}

      {/* Protected Video Player */}
      <AnimatePresence>
        {activeVideo && (
          isBunnyVideo(activeVideo.file_url) ? (
            <BunnyStreamPlayer
              url={activeVideo.file_url}
              title={activeVideo.title}
              contentId={activeVideo.id}
              onClose={() => setActiveVideo(null)}
            />

          ) : (
            <ProtectedVideoPlayer
              contentId={activeVideo.id}
              url={activeVideo.file_url}
              title={activeVideo.title}
              onClose={() => setActiveVideo(null)}
            />
          )
        )}
      </AnimatePresence>

      {activeDocument?.file_url && (
        <DocumentViewerDialog
          open
          fileUrl={activeDocument.file_url}
          title={activeDocument.title}
          onClose={() => setActiveDocument(null)}
        />
      )}
    </div>
  );
};

export default StudentSubjectView;

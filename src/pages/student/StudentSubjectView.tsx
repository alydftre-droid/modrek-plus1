import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveBunnyStorageUrl } from "@/lib/bunnyStorage";
import AssistantLessonStudio from "@/components/student/AssistantLessonStudio";
import LiveTabContent from "@/components/live/LiveTabContent";
import ProtectedVideoPlayer from "@/components/student/ProtectedVideoPlayer";
import StudentTeacherChat from "@/components/student/StudentTeacherChat";
import { useAuth } from "@/hooks/useAuth";
import { isSharedSectionCategory, normalizeSectionForSubjects } from "@/lib/educationSection";
import { filterAssignmentsForStudent } from "@/lib/teacherFiltering";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StudentExamPanel from "@/components/exam/StudentExamPanel";
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
import {
  BookOpen,
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
}

interface ContentRow {
  id: string;
  title: string;
  type: string;
  file_url: string;
  description: string | null;
  created_at: string | null;
  is_paid: boolean;
  group_id: string | null;
  subject_id: string | null;
  sub_subject: string | null;
}

// Sub-subjects for Arabic materials
const ARABIC_SUB_SUBJECTS = ["نحو", "صرف", "بلاغة", "أدب", "نصوص", "قراءة"];
// Sub-subjects for Sharia materials  
const SHARIA_SUB_SUBJECTS = ["فقه", "حديث", "تفسير", "توحيد", "سيرة"];

function getSubSubjects(category: string): string[] {
  const cat = category.toLowerCase();
  if (cat.includes("عربي") || cat === "arabic") return ARABIC_SUB_SUBJECTS;
  if (cat.includes("شرعي") || cat === "religious" || cat === "sharia") return SHARIA_SUB_SUBJECTS;
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

// Map URL param keys to Arabic labels used in teacher_assignments
const CATEGORY_KEY_TO_ARABIC: Record<string, string[]> = {
  arabic: ["arabic", "المواد العربية"],
  religious: ["religious", "sharia", "المواد الشرعية"],
  science: ["science", "العلوم", "أحياء", "فيزياء", "كيمياء", "جيولوجيا", "رياضيات"],
  social: ["social", "studies", "الدراسات"],
  english: ["english", "الإنجليزية", "لغة إنجليزية"],
  scientific: ["scientific", "المواد العلمية"],
  literary: ["literary", "المواد الأدبية", "تاريخ", "جغرافيا", "فلسفة"],
  history_geo: ["literary", "المواد الأدبية", "تاريخ", "جغرافيا"],
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
  scientific: ["science"],
  literary: ["literary"],
  history_geo: ["literary"],
  math: ["math", "science", "literary"],
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
  const normalizedSection = normalizeSectionForSubjects(section);
  const subjectNameVariants = useMemo(() => {
    const value = subjectNameFilter.trim();
    if (!value) return [];

    return [...new Set([
      value,
      value.replace(/^ال/, ""),
      value.startsWith("ال") ? value : `ال${value}`,
    ].filter(Boolean))];
  }, [subjectNameFilter]);
  // IMPORTANT: Keep choice key identical to TeacherSelection page (just the category)
  // so a student's selection persists across all entry points and never reverts.
  const choiceCategoryKey = useMemo(() => category, [category]);

  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<ViewStep>("teacher_selection");
  const [studentEducationType, setStudentEducationType] = useState<string | null>(null);

  // Teacher selection
  const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
  const [existingChoice, setExistingChoice] = useState<string | null>(null);
  const [chosenTeacherName, setChosenTeacherName] = useState("");
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
  
  // Protected video player state
  const [activeVideo, setActiveVideo] = useState<ContentRow | null>(null);
  
  // Sub-subject selection - now uses sub_subjects table
  const [selectedSubSubject, setSelectedSubSubject] = useState<SubSubjectRow | null>(null);
  
  // Get available sub-subjects based on category (for fallback display)
  const availableSubSubjects = useMemo(() => {
    return getSubSubjects(category);
  }, [category]);


  // Is the active group purchased?
  const activeGroupPurchased = activeGroupId ? purchasedGroups.has(activeGroupId) : false;

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
      const gradeNum = grade === "first" ? "1" : grade === "second" ? "2" : grade === "third" ? "3" : grade;
      const { data: termData } = await supabase
        .from("system_terms")
        .select("current_term")
        .eq("stage", stage)
        .eq("grade", gradeNum)
        .maybeSingle();
      const term = (termData?.current_term as string) || "term1";
      setCurrentTerm(term);

      // Fetch student's education type
      const { data: studentProfile } = await supabase
        .from("profiles")
        .select("education_type")
        .eq("id", user.id)
        .maybeSingle();
      const eduType = (studentProfile as any)?.education_type || null;
      setStudentEducationType(eduType);

      const { data: choiceData } = await supabase
        .from("student_teacher_choices")
        .select("teacher_id")
        .eq("student_id", user.id)
        .eq("category", choiceCategoryKey)
        .eq("stage", stage)
        .eq("grade", grade)
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
        const { data: tProfile } = await supabase.from("profiles").select("full_name").eq("id", choiceData.teacher_id).maybeSingle();
        if (tProfile) setChosenTeacherName(tProfile.full_name);
        await fetchTeacherCourses(choiceData.teacher_id, purchasedSet, term, eduType);
        setStep("groups_list");
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
    // If we have a specific subject_name (e.g. الفيزياء from scientific category),
    // search for teachers assigned to that specific subject OR the parent category
    let categoryVariants = CATEGORY_KEY_TO_ARABIC[category] || [category];
    if (subjectNameVariants.length) {
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
        .from("teacher_requests")
        .select("user_id, assigned_grades, assigned_stages, education_type")
        .eq("status", "approved")
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

    const filteredAssignments = filterAssignmentsForStudent({
      assignments: combinedAssignments,
      category,
      normalizedSection,
      studentEducationType: educationTypeOverride ?? studentEducationType,
    });

    if (!filteredAssignments.length) { setTeachers([]); return; }
    let teacherIds = [...new Set(filteredAssignments.map(a => a.teacher_id))];

    const [{ data: profileRows }, { data: names }, { data: schedules }] = await Promise.all([
      supabase.from("teacher_profiles").select("teacher_id, bio, photo_url, video_url").in("teacher_id", teacherIds),
      supabase.from("profiles").select("id, full_name").in("id", teacherIds),
      supabase.from("teacher_schedules").select("teacher_id, day_of_week, time_slot").in("teacher_id", teacherIds),
    ]);
    const nameMap = new Map(names?.map(n => [n.id, n.full_name]) || []);
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
        teacher_name: nameMap.get(teacherId) || "معلم",
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
  ) => {
    const activeTerm = termOverride || currentTerm;
    const effectiveEducationType = educationTypeOverride ?? studentEducationType;
    let q = supabase
      .from("subjects")
      .select("id, name, section")
      .eq("stage", stage)
      .eq("grade", grade);

    if (subjectNameVariants.length) {
      q = q.in("name", subjectNameVariants);
    } else {
      const categoryVariants = CATEGORY_KEY_TO_SUBJECT_CATEGORIES[category] || [category];
      q = q.in("category", categoryVariants);
    }

    // Section filter: math is a cross-section subject (literary students also study math),
    // so we don't filter by section for math. For other categories, match section or null.
    const shouldFilterBySection = normalizedSection && !isSharedSectionCategory(category);
    if (shouldFilterBySection) {
      q = q.or(`section.eq.${normalizedSection},section.is.null`);
    }

    const { data: allSubs } = await q;

    // Groups should be visible to ALL sections - section filtering applies only to content inside groups
    const subs = allSubs || [];
    if (!subs.length) { setCourses([]); return; }
    setSubjects(subs);
    const subjectIds = subs.map(s => s.id);

    const { data: rawGroups } = await supabase
      .from("content_groups")
      .select("*")
      .in("subject_id", subjectIds)
      .eq("is_active", true)
      .eq("price_approved", true)
      .eq("term", activeTerm);

    const groups = (rawGroups || []).filter((group) => {
      const belongsToTeacher = group.teacher_id === teacherId || group.created_by === teacherId;
      if (!belongsToTeacher) return false;

      if (stage !== "secondary" || !effectiveEducationType) return true;

      return !group.education_type || group.education_type === effectiveEducationType;
    });

    const groupIds = (groups || []).map(g => g.id);
    let contentCounts = new Map<string, number>();
    if (groupIds.length > 0) {
      const { data: contents } = await supabase
        .from("content")
        .select("group_id")
        .in("group_id", groupIds)
        .eq("is_active", true)
        .eq("term", activeTerm);
      (contents || []).forEach(c => {
        if (c.group_id) contentCounts.set(c.group_id, (contentCounts.get(c.group_id) || 0) + 1);
      });
    }

    const ps = purchasedSet || purchasedGroups;
    const sorted = (groups || [])
      .map(g => ({ ...g, content_count: contentCounts.get(g.id) || 0 }))
      .sort((a, b) => {
        const aPurchased = ps.has(a.id) ? 0 : 1;
        const bPurchased = ps.has(b.id) ? 0 : 1;
        return aPurchased - bPurchased;
      });
    setCourses(sorted);
  };

  // ========== Select Teacher ==========
  const handleSelectTeacher = async (teacherId: string) => {
    if (!user) return;
    try {
      if (existingChoice) {
        await supabase
          .from("student_teacher_choices")
          .update({ teacher_id: teacherId })
          .eq("student_id", user.id)
          .eq("category", choiceCategoryKey)
          .eq("stage", stage)
          .eq("grade", grade);
      } else {
        await supabase.from("student_teacher_choices").insert({
          student_id: user.id,
          teacher_id: teacherId,
          category: choiceCategoryKey, stage, grade,
        });
      }
      setExistingChoice(teacherId);
      const t = teachers.find(t => t.teacher_id === teacherId);
      if (t) setChosenTeacherName(t.teacher_name);
      toast.success("تم اختيار المعلم بنجاح");
      await fetchTeacherCourses(teacherId);
      setStep("groups_list");
    } catch (e) {
      console.error(e);
      toast.error("خطأ في اختيار المعلم");
    }
  };

  const handleChangeTeacher = () => {
    if (hasActivePurchases) {
      setShowChangeWarning(true);
    } else {
      doChangeTeacher();
    }
  };

  const doChangeTeacher = () => {
    setShowChangeWarning(false);
    setExistingChoice(null);
    setCourses([]);
    setStep("teacher_selection");
    fetchTeachers();
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

  // ========== Enter Group - Check for sub-subjects ==========
  const enterGroupContent = async (group: CourseGroup) => {
    setActiveGroupId(group.id);
    setSelectedSubSubject(null);
    
    // For Arabic or Sharia materials, show sub-subjects selection first
    const hasSubSubjects = availableSubSubjects.length > 0;
    if (hasSubSubjects) {
      setStep("sub_subjects");
    } else {
      // No sub-subjects, go directly to content
      await loadGroupContent(group.id);
    }
  };

  // ========== Load content for group (optionally filtered by sub_subject_id) ==========
  const loadGroupContent = async (groupId: string, subSubjectId?: string, _subSubjectName?: string) => {
    setLoadingContent(true);
    setStep("subject_content");
    
    try {
      // For cross-section subjects (math), don't section-filter; otherwise restrict by section
      const shouldFilterBySection = !isSharedSectionCategory(category);
      const studentSubjectIds = subjects
        .filter(s => !shouldFilterBySection || !normalizedSection || !(s as any).section || normalizeSectionForSubjects((s as any).section) === normalizedSection)
        .map(s => s.id);

      let query = supabase
        .from("content")
        .select("id, title, type, file_url, description, created_at, is_paid, group_id, subject_id, sub_subject, sub_subject_id, education_type")
        .eq("group_id", groupId)
        .eq("is_active", true)
        .eq("term", currentTerm)
        .order("order_index", { ascending: true });

      // Filter by student's section-specific subject IDs
      if (studentSubjectIds.length > 0) {
        query = query.in("subject_id", studentSubjectIds);
      }

      // Filter by education_type - show content matching student's type OR shared content (null = both).
      // Applied for ALL stages so Arabic teachers (عام/أزهر) only show content to matching students,
      // while Math/other content uploaded as "both" (education_type=null) is visible to everyone.
      if (studentEducationType) {
        query = query.or(`education_type.eq.${studentEducationType},education_type.is.null`);
      }

      // Filter by sub_subject_id if provided
      if (subSubjectId) {
        query = query.eq("sub_subject_id", subSubjectId);
      }
      
      const { data } = await query;
      
      // Deduplicate by file_url to prevent showing same content twice
      const seen = new Set<string>();
      const deduped = (data || []).filter(c => {
        if (seen.has(c.file_url)) return false;
        seen.add(c.file_url);
        return true;
      });
      
      setContent(deduped as ContentRow[]);
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

  const handleContentClick = (e: React.MouseEvent, item: ContentRow) => {
    e.stopPropagation();
    e.preventDefault();
    if (!activeGroupPurchased) {
      toast.error("يجب الاشتراك في الكورس أولًا لمشاهدة المحتوى");
      return;
    }
    if (item.type === "video") {
      setActiveVideo(item);
    } else {
      // For PDFs, resolve bstorage:// URLs and open in new tab
      const resolvedUrl = resolveBunnyStorageUrl(item.file_url);
      window.open(resolvedUrl, "_blank", "noopener,noreferrer");
    }
  };




  const handleSignOut = async () => { await signOut(); navigate("/"); };

  // ========== Content filtering ==========
  // Content is already filtered by sub_subject_id when loading, so just use all content
  const videos = useMemo(() => content.filter(c => c.type === "video"), [content]);
  const books = useMemo(() => content.filter(c => c.type === "pdf"), [content]);
  const exams = useMemo(() => content.filter(c => c.type === "exam"), [content]);

  // ========== Header ==========
  const renderHeader = () => (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="flex h-14 items-center justify-between px-4 max-w-5xl mx-auto">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20">
            <BookOpen className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-primary">مدرك Plus</span>
        </Link>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => navigate("/wallet")} className="gap-1 h-8 text-xs px-2.5">
            <Wallet className="h-3.5 w-3.5" />
            {walletBalance} جنيه
          </Button>
          <NotificationsDropdown />
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild><Link to="/about-platform"><Info className="h-4 w-4" /></Link></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild><Link to="/support"><MessageSquare className="h-4 w-4" /></Link></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSignOut}><LogOut className="h-4 w-4" /></Button>
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // ========== Step 1: Teacher Selection (Full Screen - mandatory) ==========
  if (step === "teacher_selection") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20 flex flex-col">
        {renderHeader()}
        <main className="flex-1 container px-4 py-8">
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
                                window.open(teacher.video_url!, "_blank", "noopener,noreferrer");
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
      </div>
    );
  }

  // ========== Step 2: Groups List ==========
  if (step === "groups_list") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
        {renderHeader()}
        <main className="px-4 pt-3 pb-6 max-w-5xl mx-auto">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="h-9 gap-1 px-2">
              <ChevronLeft className="h-4 w-4 rotate-180" />
              <span className="text-sm">رجوع</span>
            </Button>
            <div className="flex items-center gap-1.5">
              {existingChoice && (
                <StudentTeacherChat
                  teacherId={existingChoice}
                  teacherName={chosenTeacherName || "المعلم"}
                />
              )}
              <Button variant="outline" size="icon" onClick={handleChangeTeacher} className="h-9 w-9 shrink-0" title="تغيير المعلم">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <motion.div 
            className="mb-4 text-center"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <div className="mx-auto mb-2 inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
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
              className="mx-auto grid max-w-5xl gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
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
                    <Card className={`student-group-card overflow-hidden rounded-[1.75rem] transition-all duration-300 ${isPurchased ? "student-group-card-active" : ""}`}>
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
                            <Badge className="student-group-state-badge rounded-full border-0 px-3 py-1 text-[11px] font-bold">
                              مشترك ✓
                            </Badge>
                          ) : (
                            <Badge className="student-group-state-badge rounded-full border-0 px-3 py-1 text-[11px] font-bold">
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

                      <CardContent className="space-y-4 p-5">
                        {course.description && (
                          <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{course.description}</p>
                        )}

                        <div className="flex items-center justify-between gap-3">
                          <div className="student-group-meta-chip flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium">
                            <Play className="h-3.5 w-3.5 text-primary" />
                            <span>{course.content_count} محتوى</span>
                          </div>
                          <div className="flex items-baseline gap-1">
                            <span className="student-group-price text-2xl font-extrabold">{course.price}</span>
                            <span className="text-xs font-medium text-muted-foreground">جنيه</span>
                          </div>
                        </div>

                        {isPurchased ? (
                          <Button className="w-full rounded-xl py-4 text-sm font-bold gap-2" onClick={() => enterGroupContent(course)}>
                            <Play className="h-4 w-4" />
                            دخول المجموعة
                          </Button>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              className="rounded-xl py-4 text-sm font-bold"
                              onClick={() => { setSelectedCourse(course); setShowSubscribeConfirm(true); }}
                            >
                              اشترك الآن
                            </Button>
                            <Button variant="outline" className="rounded-xl py-4 text-sm font-semibold gap-1" onClick={() => enterGroupContent(course)}>
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
              <AlertDialogTitle>تحذير!</AlertDialogTitle>
              <AlertDialogDescription>
                في حالة تغيير المعلم سوف تفقد اشتراكاتك الحالية. هل أنت متأكد؟
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
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
        {renderHeader()}
        <main className="container px-4 py-8">
          <SubSubjectsGrid
            groupId={activeGroupId || ""}
            groupTitle={activeGroup?.title || "المجموعة"}
            category={category}
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
      <div className="grid gap-4">
        {items.map(item => (
          <Card
            key={item.id}
            className={`hover:shadow-md transition-shadow ${activeGroupPurchased ? "cursor-pointer" : "opacity-80"}`}
            onClick={(e) => handleContentClick(e, item)}
          >
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-4 min-w-0">
                <div className={`p-3 rounded-lg ${item.type === "video" ? "bg-primary text-primary-foreground" : "bg-accent"}`}>
                  {item.type === "video" ? <Play className="h-6 w-6" /> : <FileText className="h-6 w-6 text-primary" />}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{item.title}</h3>
                  {item.description && <p className="text-sm text-muted-foreground truncate">{item.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!activeGroupPurchased ? (
                  <Badge variant="secondary" className="gap-1">
                    <Lock className="h-3 w-3" />
                    مدفوع
                  </Badge>
                ) : (
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
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      {renderHeader()}
      <main className="container px-4 py-8">
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
          {!activeGroupPurchased && (
            <div className="mt-4 p-4 rounded-lg bg-accent border border-border">
              <p className="text-foreground text-sm font-medium flex items-center gap-2">
                <Lock className="h-4 w-4" />
                يجب الاشتراك في المجموعة لمشاهدة المحتوى
              </p>
              <Button
                className="mt-2"
                onClick={() => {
                  if (activeGroup) {
                    setSelectedCourse(activeGroup);
                    setShowSubscribeConfirm(true);
                  }
                }}
              >
                اشترك الآن - {activeGroup?.price} جنيه
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
                <span className="hidden sm:inline">الكتب</span>
                <span className="text-xs bg-muted px-1.5 rounded">{books.length}</span>
              </TabsTrigger>
              <TabsTrigger value="live" className="gap-1">
                <Radio className="h-4 w-4" />
                <span className="hidden sm:inline">حصص Live</span>
              </TabsTrigger>
              <TabsTrigger value="exams" className="gap-1">
                <FileQuestion className="h-4 w-4" />
                <span className="hidden sm:inline">الامتحانات</span>
                <span className="text-xs bg-muted px-1.5 rounded">{exams.length}</span>
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
              {renderContentList(books, <FileText className="h-12 w-12" />, "لم يتم رفع كتب في هذه المجموعة بعد")}
            </TabsContent>
            <TabsContent value="live">
              <LiveTabContent groupId={activeGroupId || ""} groupTitle={activeGroup?.title || ""} isTeacher={false} />
            </TabsContent>
            <TabsContent value="exams">
              <StudentExamPanel
                currentTerm={currentTerm}
                groupId={activeGroup?.id || ""}
                isSubscribed={activeGroupPurchased}
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
          <ProtectedVideoPlayer
            contentId={activeVideo.id}
            url={activeVideo.file_url}
            title={activeVideo.title}
            onClose={() => setActiveVideo(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default StudentSubjectView;

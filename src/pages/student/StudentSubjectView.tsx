import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AssistantLessonStudio from "@/components/student/AssistantLessonStudio";
import StudentTeacherChat from "@/components/student/StudentTeacherChat";
import { useAuth } from "@/hooks/useAuth";
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
  Download,
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
  french: ["french", "الفرنسية", "لغة فرنسية"],
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

  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<ViewStep>("teacher_selection");

  // Teacher selection
  const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
  const [existingChoice, setExistingChoice] = useState<string | null>(null);
  const [chosenTeacherName, setChosenTeacherName] = useState("");
  const [showChangeWarning, setShowChangeWarning] = useState(false);
  const [hasActivePurchases, setHasActivePurchases] = useState(false);

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
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  
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
      const { data: choiceData } = await supabase
        .from("student_teacher_choices")
        .select("teacher_id")
        .eq("student_id", user.id)
        .eq("category", category)
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
        // Fetch teacher name
        const { data: tProfile } = await supabase.from("profiles").select("full_name").eq("id", choiceData.teacher_id).maybeSingle();
        if (tProfile) setChosenTeacherName(tProfile.full_name);
        await fetchTeacherCourses(choiceData.teacher_id, purchasedSet);
        setStep("groups_list");
      } else {
        await fetchTeachers();
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
  const fetchTeachers = async () => {
    // If we have a specific subject_name (e.g. الفيزياء from scientific category),
    // search for teachers assigned to that specific subject OR the parent category
    let categoryVariants = CATEGORY_KEY_TO_ARABIC[category] || [category];
    if (subjectNameFilter) {
      // Also include the specific subject name variants for teacher lookup
      categoryVariants = [...categoryVariants, subjectNameFilter, subjectNameFilter.replace(/^ال/, "")];
    }
    const gradeVariants = GRADE_KEY_TO_ARABIC[grade] || [grade];

    const { data: assignments } = await supabase
      .from("teacher_assignments")
      .select("teacher_id, grade")
      .in("category", categoryVariants)
      .eq("stage", stage)
      .in("grade", gradeVariants);
    if (!assignments?.length) { setTeachers([]); return; }
    const teacherIds = [...new Set(assignments.map(a => a.teacher_id))];
    const { data: profiles } = await supabase
      .from("teacher_profiles")
      .select("teacher_id, bio, photo_url, video_url")
      .in("teacher_id", teacherIds)
      .eq("is_approved", true);
    if (!profiles?.length) { setTeachers([]); return; }
    const { data: names } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profiles.map(p => p.teacher_id));
    const nameMap = new Map(names?.map(n => [n.id, n.full_name]) || []);
    const { data: schedules } = await supabase
      .from("teacher_schedules")
      .select("teacher_id, day_of_week, time_slot")
      .in("teacher_id", teacherIds);
    const scheduleMap = new Map<string, { day: string; time: string }[]>();
    (schedules || []).forEach(s => {
      const arr = scheduleMap.get(s.teacher_id) || [];
      arr.push({ day: s.day_of_week, time: s.time_slot });
      scheduleMap.set(s.teacher_id, arr);
    });
    const gradesByTeacher = new Map<string, string[]>();
    assignments.forEach(a => {
      const arr = gradesByTeacher.get(a.teacher_id) || [];
      if (!arr.includes(a.grade)) arr.push(a.grade);
      gradesByTeacher.set(a.teacher_id, arr);
    });
    setTeachers(profiles.map(p => ({
      teacher_id: p.teacher_id,
      teacher_name: nameMap.get(p.teacher_id) || "معلم",
      bio: p.bio,
      photo_url: p.photo_url,
      video_url: p.video_url,
      category,
      grades: gradesByTeacher.get(p.teacher_id) || [],
      schedules: scheduleMap.get(p.teacher_id) || [],
    })));
  };

  // ========== Fetch Groups ==========
  const fetchTeacherCourses = async (teacherId: string, purchasedSet?: Set<string>) => {
    let q = supabase
      .from("subjects")
      .select("id, name")
      .eq("category", category)
      .eq("stage", stage)
      .eq("grade", grade);
    
    // Filter by specific subject name if provided (for scientific/literary sub-subjects)
    if (subjectNameFilter) {
      q = q.eq("name", subjectNameFilter);
    }
    
    const { data: subs } = await q;
    if (!subs?.length) { setCourses([]); return; }
    setSubjects(subs);
    const subjectIds = subs.map(s => s.id);

    const { data: groups } = await supabase
      .from("content_groups")
      .select("*")
      .in("subject_id", subjectIds)
      .eq("is_active", true)
      .eq("price_approved", true)
      .or(`teacher_id.eq.${teacherId},created_by.eq.${teacherId}`);

    const groupIds = (groups || []).map(g => g.id);
    let contentCounts = new Map<string, number>();
    if (groupIds.length > 0) {
      const { data: contents } = await supabase
        .from("content")
        .select("group_id")
        .in("group_id", groupIds)
        .eq("is_active", true);
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
          .eq("category", category)
          .eq("stage", stage)
          .eq("grade", grade);
      } else {
        await supabase.from("student_teacher_choices").insert({
          student_id: user.id,
          teacher_id: teacherId,
          category, stage, grade,
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
      const newBalance = walletBalance - selectedCourse.price;
      await supabase
        .from("wallets")
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
      await supabase.from("student_group_purchases").insert({
        student_id: user.id,
        group_id: selectedCourse.id,
        amount_paid: selectedCourse.price,
      });
      setWalletBalance(newBalance);
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
  const loadGroupContent = async (groupId: string, subSubjectId?: string, subSubjectName?: string) => {
    setLoadingContent(true);
    setStep("subject_content");
    
    
    try {
      let query = supabase
        .from("content")
        .select("id, title, type, file_url, description, created_at, is_paid, group_id, subject_id, sub_subject, sub_subject_id")
        .eq("group_id", groupId)
        .eq("is_active", true)
        .order("order_index", { ascending: true });
      
      // Filter by sub_subject_id if provided
      if (subSubjectId) {
        query = query.eq("sub_subject_id", subSubjectId);
      }
      
      const { data } = await query;
      setContent((data || []) as ContentRow[]);
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
    // Open in new tab without affecting current page
    window.open(item.file_url, "_blank", "noopener,noreferrer");
  };




  const handleSignOut = async () => { await signOut(); navigate("/"); };

  // ========== Content filtering ==========
  // Content is already filtered by sub_subject_id when loading, so just use all content
  const videos = useMemo(() => content.filter(c => c.type === "video"), [content]);
  const books = useMemo(() => content.filter(c => c.type === "pdf"), [content]);
  const summaries = useMemo(() => content.filter(c => c.type === "summary"), [content]);
  const exams = useMemo(() => content.filter(c => c.type === "exam"), [content]);

  // ========== Header ==========
  const renderHeader = () => (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20">
            <BookOpen className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold text-primary">أزهاريون</span>
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/wallet")} className="gap-1">
            <Wallet className="h-4 w-4" />
            {walletBalance} جنيه
          </Button>
          <NotificationsDropdown />
          <Button variant="ghost" size="icon" asChild><Link to="/about-platform"><Info className="h-5 w-5" /></Link></Button>
          <Button variant="ghost" size="icon" asChild><Link to="/support"><MessageSquare className="h-5 w-5" /></Link></Button>
          <Button variant="ghost" size="icon" onClick={handleSignOut}><LogOut className="h-5 w-5" /></Button>
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
        <main className="container px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" onClick={() => navigate("/dashboard")} className="gap-1">
              <ChevronLeft className="h-5 w-5 rotate-180" />
              رجوع للرئيسية
            </Button>
            <div className="flex items-center gap-2">
              {existingChoice && (
                <StudentTeacherChat
                  teacherId={existingChoice}
                  teacherName={chosenTeacherName || "المعلم"}
                />
              )}
              <Button variant="outline" size="sm" onClick={handleChangeTeacher} className="gap-1">
                <RefreshCw className="h-4 w-4" />
                <span className="hidden sm:inline">تغيير المعلم</span>
              </Button>
            </div>
          </div>

          <motion.div 
            className="mb-6 text-center"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h1 className="text-xl md:text-2xl font-bold mb-1">مجموعات المادة</h1>
            <p className="text-muted-foreground text-sm">{formatStage(stage)} - {formatGrade(grade)} - {category}</p>
          </motion.div>

          {courses.length === 0 ? (
            <Card className="border-2 border-dashed max-w-md mx-auto">
              <CardContent className="p-8 text-center">
                <BookText className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-bold mb-2">لا توجد مجموعات</h3>
                <p className="text-muted-foreground">لم يقم المعلم بنشر مجموعات بعد</p>
              </CardContent>
            </Card>
          ) : (
            <motion.div 
              className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto"
              initial="hidden"
              animate="visible"
              variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}
            >
              {courses.map((course, idx) => {
                const isPurchased = purchasedGroups.has(course.id);
                const gradients = [
                  "from-blue-500 to-indigo-600",
                  "from-emerald-500 to-teal-600",
                  "from-purple-500 to-violet-600",
                  "from-amber-500 to-orange-600",
                  "from-rose-500 to-pink-600",
                  "from-cyan-500 to-sky-600",
                ];
                const gradient = gradients[idx % gradients.length];
                return (
                  <motion.div
                    key={course.id}
                    variants={{
                      hidden: { opacity: 0, y: 20, scale: 0.95 },
                      visible: { opacity: 1, y: 0, scale: 1 }
                    }}
                    transition={{ type: "spring", stiffness: 200, damping: 18 }}
                    whileHover={{ y: -4 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Card className={`overflow-hidden hover:shadow-2xl transition-all duration-300 flex flex-col border-0 shadow-lg ${isPurchased ? "ring-2 ring-primary/50" : ""}`}>
                      <div className={`h-36 bg-gradient-to-br ${gradient} flex items-center justify-center relative overflow-hidden`}>
                        <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-8 translate-x-8" />
                        <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-full translate-y-6 -translate-x-6" />
                        {course.image_url ? (
                          <img src={course.image_url} alt={course.title} className="w-full h-full object-cover" />
                        ) : (
                          <BookText className="h-12 w-12 text-white/80 drop-shadow-lg" />
                        )}
                        {isPurchased && (
                          <Badge className="absolute top-3 left-3 bg-white/90 text-primary shadow-sm border-0 font-bold">
                            مشترك ✓
                          </Badge>
                        )}
                        {course.month_label && (
                          <Badge className="absolute top-3 right-3 bg-white/90 text-foreground shadow-sm border-0 text-xs">
                            {course.month_label}
                          </Badge>
                        )}
                      </div>
                      <CardContent className="p-4 flex-1 flex flex-col">
                        <h3 className="text-lg font-bold mb-1">{course.title}</h3>
                        {course.description && <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{course.description}</p>}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                          <Play className="h-4 w-4" />
                          <span>{course.content_count} محتوى</span>
                        </div>
                        <div className="mt-auto space-y-2">
                          <div className="text-center">
                            <span className="text-2xl font-bold text-primary">{course.price}</span>
                            <span className="text-sm text-muted-foreground mr-1">جنيه</span>
                          </div>
                          {isPurchased ? (
                            <Button className={`w-full gap-2 bg-gradient-to-l ${gradient} border-0 text-white hover:opacity-90`} onClick={() => enterGroupContent(course)}>
                              <Play className="h-4 w-4" />
                              دخول المجموعة
                            </Button>
                          ) : (
                            <div className="space-y-2">
                              <Button
                                className={`w-full gap-2 bg-gradient-to-l ${gradient} border-0 text-white hover:opacity-90`}
                                onClick={() => { setSelectedCourse(course); setShowSubscribeConfirm(true); }}
                              >
                                اشترك الآن
                              </Button>
                              <Button variant="outline" className="w-full gap-2" onClick={() => enterGroupContent(course)}>
                                <BookText className="h-4 w-4" />
                                تصفح مجانًا
                              </Button>
                            </div>
                          )}
                        </div>
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
                      <><Download className="h-4 w-4" />تحميل</>
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
              <TabsTrigger value="summaries" className="gap-1">
                <FileQuestion className="h-4 w-4" />
                <span className="hidden sm:inline">الملخصات</span>
                <span className="text-xs bg-muted px-1.5 rounded">{summaries.length}</span>
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
            <TabsContent value="summaries">
              {renderContentList(summaries, <FileQuestion className="h-12 w-12" />, "لم يتم رفع ملخصات في هذه المجموعة بعد")}
            </TabsContent>
            <TabsContent value="exams">
              <StudentExamPanel
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
              />
            </TabsContent>
            </Tabs>
          </>
        )}
      </main>

      {renderSubscribeDialog()}
    </div>
  );
};

export default StudentSubjectView;

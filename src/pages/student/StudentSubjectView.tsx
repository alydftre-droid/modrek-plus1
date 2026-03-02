import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Settings,
  LogOut,
  Play,
  FileText,
  Lock,
  Wallet,
  Calendar,
  BookText,
  RefreshCw,
} from "lucide-react";

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
  content_count: number;
}

const StudentSubjectView = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, signOut } = useAuth();

  const stage = params.get("stage") || "";
  const grade = params.get("grade") || "";
  const section = params.get("section") || "";
  const category = params.get("category") || "";

  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [existingChoice, setExistingChoice] = useState<string | null>(null);
  const [courses, setCourses] = useState<CourseGroup[]>([]);
  const [purchasedGroups, setPurchasedGroups] = useState<Set<string>>(new Set());
  const [walletBalance, setWalletBalance] = useState(0);
  const [showChangeWarning, setShowChangeWarning] = useState(false);
  const [pendingTeacherId, setPendingTeacherId] = useState<string | null>(null);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseGroup | null>(null);
  const [showSubscribeConfirm, setShowSubscribeConfirm] = useState(false);
  const [courseContent, setCourseContent] = useState<any[]>([]);
  const [viewingCourse, setViewingCourse] = useState<CourseGroup | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  const backUrl = `/subjects?stage=${stage}&grade=${grade}${section ? `&section=${section}` : ""}&category=${category}`;

  useEffect(() => {
    if (!user || !stage || !grade || !category) return;
    fetchAll();
  }, [user, stage, grade, category]);

  const fetchAll = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Check existing teacher choice
      const { data: choiceData } = await supabase
        .from("student_teacher_choices")
        .select("teacher_id")
        .eq("student_id", user.id)
        .eq("category", category)
        .eq("stage", stage)
        .eq("grade", grade)
        .maybeSingle();

      if (choiceData) {
        setExistingChoice(choiceData.teacher_id);
        setSelectedTeacherId(choiceData.teacher_id);
        await fetchTeacherCourses(choiceData.teacher_id);
      } else {
        await fetchTeachers();
      }

      // Fetch wallet balance
      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", user.id)
        .maybeSingle();
      setWalletBalance(wallet?.balance || 0);

      // Fetch purchased groups
      const { data: purchases } = await supabase
        .from("student_group_purchases")
        .select("group_id")
        .eq("student_id", user.id);
      setPurchasedGroups(new Set((purchases || []).map(p => p.group_id)));

      // Check active subscriptions for warning
      const { data: subs } = await supabase
        .from("student_group_purchases")
        .select("id")
        .eq("student_id", user.id)
        .limit(1);
      setHasActiveSubscription((subs?.length || 0) > 0);
    } catch (e) {
      console.error(e);
      toast.error("خطأ في تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  const fetchTeachers = async () => {
    const { data: assignments } = await supabase
      .from("teacher_assignments")
      .select("teacher_id, grade")
      .eq("category", category)
      .eq("stage", stage)
      .eq("grade", grade);

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

    // Fetch schedules
    const { data: schedules } = await supabase
      .from("teacher_schedules")
      .select("teacher_id, day_of_week, time_slot")
      .in("teacher_id", teacherIds);

    const scheduleMap = new Map<string, { day: string; time: string }[]>();
    (schedules || []).forEach(s => {
      const existing = scheduleMap.get(s.teacher_id) || [];
      existing.push({ day: s.day_of_week, time: s.time_slot });
      scheduleMap.set(s.teacher_id, existing);
    });

    const gradesByTeacher = new Map<string, string[]>();
    assignments.forEach(a => {
      const existing = gradesByTeacher.get(a.teacher_id) || [];
      if (!existing.includes(a.grade)) existing.push(a.grade);
      gradesByTeacher.set(a.teacher_id, existing);
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

  const fetchTeacherCourses = async (teacherId: string) => {
    // Fetch subjects for this category/stage/grade
    const { data: subjects } = await supabase
      .from("subjects")
      .select("id")
      .eq("category", category)
      .eq("stage", stage)
      .eq("grade", grade);

    if (!subjects?.length) { setCourses([]); return; }

    const subjectIds = subjects.map(s => s.id);

    // Fetch groups created by this teacher or admin
    const { data: groups } = await supabase
      .from("content_groups")
      .select("*")
      .in("subject_id", subjectIds)
      .eq("is_active", true)
      .or(`teacher_id.eq.${teacherId},created_by.eq.${teacherId}`);

    // Count content per group
    const groupIds = (groups || []).map(g => g.id);
    let contentCounts = new Map<string, number>();
    if (groupIds.length > 0) {
      const { data: contents } = await supabase
        .from("content")
        .select("group_id")
        .in("group_id", groupIds)
        .eq("is_active", true);

      (contents || []).forEach(c => {
        if (c.group_id) {
          contentCounts.set(c.group_id, (contentCounts.get(c.group_id) || 0) + 1);
        }
      });
    }

    setCourses((groups || []).map(g => ({
      ...g,
      content_count: contentCounts.get(g.id) || 0,
    })));
  };

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
          category,
          stage,
          grade,
        });
      }
      setSelectedTeacherId(teacherId);
      setExistingChoice(teacherId);
      toast.success("تم اختيار المعلم بنجاح");
      await fetchTeacherCourses(teacherId);
    } catch (e) {
      console.error(e);
      toast.error("خطأ في اختيار المعلم");
    }
  };

  const handleChangeTeacher = () => {
    if (hasActiveSubscription) {
      setShowChangeWarning(true);
    } else {
      setExistingChoice(null);
      setSelectedTeacherId(null);
      setCourses([]);
      fetchTeachers();
    }
  };

  const confirmChangeTeacher = () => {
    setShowChangeWarning(false);
    setExistingChoice(null);
    setSelectedTeacherId(null);
    setCourses([]);
    fetchTeachers();
  };

  const handleSubscribe = async () => {
    if (!user || !selectedCourse) return;
    if (walletBalance < selectedCourse.price) {
      toast.error("رصيدك غير كافٍ. يرجى تعبئة المحفظة أولاً");
      return;
    }
    setSubscribing(true);
    try {
      // Deduct from wallet
      const newBalance = walletBalance - selectedCourse.price;
      await supabase
        .from("wallets")
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);

      // Create purchase record
      await supabase.from("student_group_purchases").insert({
        student_id: user.id,
        group_id: selectedCourse.id,
        amount_paid: selectedCourse.price,
        activated_by_admin: false,
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

  const viewCourseContent = async (course: CourseGroup) => {
    setViewingCourse(course);
    setLoadingContent(true);
    try {
      const { data } = await supabase
        .from("content")
        .select("*")
        .eq("group_id", course.id)
        .eq("is_active", true)
        .order("order_index", { ascending: true });
      setCourseContent(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingContent(false);
    }
  };

  const handleContentClick = (item: any) => {
    if (!viewingCourse) return;
    if (!purchasedGroups.has(viewingCourse.id)) {
      toast.error("يجب الاشتراك في الكورس أولًا للمشاهدة");
      return;
    }
    window.open(item.file_url, "_blank");
  };

  const handleSignOut = async () => { await signOut(); navigate("/"); };

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // Teacher Selection View
  if (!existingChoice) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
        <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
          <div className="container flex h-16 items-center justify-between px-4">
            <Link to="/" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-azhari shadow-lg shadow-primary/20">
                <BookOpen className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-gradient-azhari">أزهاريون</span>
            </Link>
            <div className="flex items-center gap-2">
              <NotificationsDropdown />
              <Button variant="ghost" size="icon" asChild><Link to="/about-platform"><Info className="h-5 w-5" /></Link></Button>
              <Button variant="ghost" size="icon" onClick={handleSignOut}><LogOut className="h-5 w-5" /></Button>
            </div>
          </div>
        </header>

        <main className="container px-4 py-8">
          <Button variant="ghost" className="mb-6" onClick={() => navigate(backUrl)}>
            <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />
            رجوع للمواد
          </Button>

          <div className="mb-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-xl shadow-primary/30">
              <GraduationCap className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold mb-2">اختر معلمك</h1>
            <p className="text-muted-foreground">{formatStage(stage)} - {formatGrade(grade)} - {category}</p>
            <p className="text-sm text-muted-foreground mt-1">يجب اختيار معلم أولًا قبل الوصول للمحتوى</p>
          </div>

          {teachers.length === 0 ? (
            <Card className="border-2 border-dashed max-w-md mx-auto">
              <CardContent className="p-8 text-center">
                <GraduationCap className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-bold mb-2">لا يوجد معلمين</h3>
                <p className="text-muted-foreground mb-4">لم يتم تعيين معلمين لهذه المادة بعد</p>
                <Button onClick={() => navigate(backUrl)}>العودة للمواد</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6 max-w-3xl mx-auto">
              {teachers.map(teacher => (
                <Card key={teacher.teacher_id} className="overflow-hidden hover:shadow-xl transition-all duration-300">
                  <CardContent className="p-0">
                    <div className="flex flex-col md:flex-row">
                      {/* Photo */}
                      <div className="md:w-48 h-48 md:h-auto bg-gradient-to-br from-primary/20 to-accent flex items-center justify-center shrink-0">
                        {teacher.photo_url ? (
                          <img src={teacher.photo_url} alt={teacher.teacher_name} className="w-full h-full object-cover" />
                        ) : (
                          <GraduationCap className="h-16 w-16 text-primary/50" />
                        )}
                      </div>
                      {/* Info */}
                      <div className="flex-1 p-6">
                        <h3 className="text-xl font-bold mb-2">{teacher.teacher_name}</h3>
                        {teacher.bio && <p className="text-muted-foreground text-sm mb-3">{teacher.bio}</p>}
                        {teacher.schedules.length > 0 && (
                          <div className="mb-3">
                            <p className="text-sm font-medium flex items-center gap-1 mb-1">
                              <Calendar className="h-4 w-4" /> مواعيد الحصص:
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {teacher.schedules.map((s, i) => (
                                <Badge key={i} variant="outline" className="text-xs">{s.day} - {s.time}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {teacher.video_url && (
                          <div className="mb-4">
                            <video src={teacher.video_url} controls className="w-full max-h-48 rounded-lg" />
                          </div>
                        )}
                        <Button
                          onClick={() => handleSelectTeacher(teacher.teacher_id)}
                          className="w-full h-12 text-lg font-bold gap-2"
                        >
                          <GraduationCap className="h-5 w-5" />
                          الاشتراك مع المعلم
                        </Button>
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

  // Course View (after teacher selected)
  if (viewingCourse) {
    const isPurchased = purchasedGroups.has(viewingCourse.id);
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
        <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
          <div className="container flex h-16 items-center justify-between px-4">
            <Link to="/" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-azhari shadow-lg shadow-primary/20">
                <BookOpen className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-gradient-azhari">أزهاريون</span>
            </Link>
          </div>
        </header>

        <main className="container px-4 py-8 max-w-3xl mx-auto">
          <Button variant="ghost" className="mb-6" onClick={() => setViewingCourse(null)}>
            <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />
            رجوع للكورسات
          </Button>

          <div className="mb-6">
            <h1 className="text-2xl font-bold mb-2">{viewingCourse.title}</h1>
            {viewingCourse.month_label && <Badge variant="secondary" className="mb-2">{viewingCourse.month_label}</Badge>}
            {viewingCourse.description && <p className="text-muted-foreground">{viewingCourse.description}</p>}
            {!isPurchased && (
              <div className="mt-4 p-4 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-amber-800 text-sm font-medium flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  يجب الاشتراك في الكورس للمشاهدة
                </p>
                <Button
                  className="mt-2 bg-green-600 hover:bg-green-700"
                  onClick={() => { setSelectedCourse(viewingCourse); setShowSubscribeConfirm(true); }}
                >
                  اشترك الآن - {viewingCourse.price} جنيه
                </Button>
              </div>
            )}
          </div>

          {loadingContent ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : courseContent.length === 0 ? (
            <Card className="p-8 text-center">
              <BookText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">لا يوجد محتوى في هذا الكورس حالياً</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {courseContent.map((item, idx) => (
                <Card
                  key={item.id}
                  className={`hover:shadow-md transition-shadow ${isPurchased ? "cursor-pointer" : "opacity-70"}`}
                  onClick={() => handleContentClick(item)}
                >
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`p-3 rounded-lg ${item.type === "video" ? "bg-primary text-primary-foreground" : "bg-accent"}`}>
                        {item.type === "video" ? <Play className="h-5 w-5" /> : <FileText className="h-5 w-5 text-primary" />}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate">{item.title}</h3>
                        {item.description && <p className="text-sm text-muted-foreground truncate">{item.description}</p>}
                      </div>
                    </div>
                    {!isPurchased && <Lock className="h-5 w-5 text-muted-foreground shrink-0" />}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>

        {/* Subscribe Confirm */}
        <Dialog open={showSubscribeConfirm} onOpenChange={setShowSubscribeConfirm}>
          <DialogContent>
            <DialogHeader><DialogTitle>تأكيد الاشتراك</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p>هل تريد الاشتراك في <strong>{selectedCourse?.title}</strong>؟</p>
              <div className="p-4 rounded-lg bg-accent/30">
                <p>السعر: <strong>{selectedCourse?.price} جنيه</strong></p>
                <p>رصيدك: <strong>{walletBalance} جنيه</strong></p>
                {selectedCourse && walletBalance < selectedCourse.price && (
                  <p className="text-destructive text-sm mt-2">رصيدك غير كافٍ</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSubscribeConfirm(false)}>إلغاء</Button>
              <Button
                onClick={handleSubscribe}
                disabled={subscribing || (selectedCourse ? walletBalance < selectedCourse.price : true)}
                className="bg-green-600 hover:bg-green-700"
              >
                {subscribing ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
                تأكيد الاشتراك
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Courses List View
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-azhari shadow-lg shadow-primary/20">
              <BookOpen className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-gradient-azhari">أزهاريون</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/wallet")} className="gap-1">
              <Wallet className="h-4 w-4" />
              {walletBalance} جنيه
            </Button>
            <NotificationsDropdown />
            <Button variant="ghost" size="icon" onClick={handleSignOut}><LogOut className="h-5 w-5" /></Button>
          </div>
        </div>
      </header>

      <main className="container px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => navigate(backUrl)}>
            <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />
            رجوع للمواد
          </Button>
          <Button variant="outline" size="sm" onClick={handleChangeTeacher} className="gap-1">
            <RefreshCw className="h-4 w-4" />
            تغيير المعلم
          </Button>
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold mb-2">كورسات المادة</h1>
          <p className="text-muted-foreground">{formatStage(stage)} - {formatGrade(grade)} - {category}</p>
        </div>

        {courses.length === 0 ? (
          <Card className="border-2 border-dashed max-w-md mx-auto">
            <CardContent className="p-8 text-center">
              <BookText className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-bold mb-2">لا توجد كورسات</h3>
              <p className="text-muted-foreground">لم يقم المعلم بنشر كورسات بعد</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {courses.map(course => {
              const isPurchased = purchasedGroups.has(course.id);
              return (
                <Card key={course.id} className="overflow-hidden hover:shadow-xl transition-all duration-300 flex flex-col">
                  {/* Course Image */}
                  <div className="h-40 bg-gradient-to-br from-primary/20 to-accent flex items-center justify-center">
                    {course.image_url ? (
                      <img src={course.image_url} alt={course.title} className="w-full h-full object-cover" />
                    ) : (
                      <BookText className="h-12 w-12 text-primary/50" />
                    )}
                  </div>
                  <CardContent className="p-4 flex-1 flex flex-col">
                    {course.month_label && (
                      <Badge variant="secondary" className="mb-2 w-fit">{course.month_label}</Badge>
                    )}
                    <h3 className="text-lg font-bold mb-1">{course.title}</h3>
                    {course.description && (
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{course.description}</p>
                    )}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                      <Play className="h-4 w-4" />
                      <span>{course.content_count} درس</span>
                    </div>
                    <div className="mt-auto space-y-2">
                      <div className="text-center">
                        <span className="text-2xl font-bold text-primary">{course.price}</span>
                        <span className="text-sm text-muted-foreground mr-1">جنيه</span>
                      </div>
                      {isPurchased ? (
                        <Button className="w-full gap-2" onClick={() => viewCourseContent(course)}>
                          <Play className="h-4 w-4" />
                          دخول الكورس
                        </Button>
                      ) : (
                        <div className="space-y-2">
                          <Button
                            className="w-full bg-green-600 hover:bg-green-700 gap-2"
                            onClick={() => { setSelectedCourse(course); setShowSubscribeConfirm(true); }}
                          >
                            اشترك الآن
                          </Button>
                          <Button variant="outline" className="w-full gap-2" onClick={() => viewCourseContent(course)}>
                            <BookText className="h-4 w-4" />
                            عرض المحتوى
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* Change Teacher Warning */}
      <AlertDialog open={showChangeWarning} onOpenChange={setShowChangeWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تحذير!</AlertDialogTitle>
            <AlertDialogDescription>
              في حالة تغيير المعلم سوف تفقد اشتراكك الحالي في الكورسات. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={confirmChangeTeacher} className="bg-destructive hover:bg-destructive/90">
              تغيير المعلم
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Subscribe Confirm Dialog */}
      <Dialog open={showSubscribeConfirm} onOpenChange={setShowSubscribeConfirm}>
        <DialogContent>
          <DialogHeader><DialogTitle>تأكيد الاشتراك</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p>هل تريد الاشتراك في <strong>{selectedCourse?.title}</strong>؟</p>
            <div className="p-4 rounded-lg bg-accent/30">
              <p>السعر: <strong>{selectedCourse?.price} جنيه</strong></p>
              <p>رصيدك: <strong>{walletBalance} جنيه</strong></p>
              <p className="text-sm text-muted-foreground mt-1">سيتم خصم المبلغ من رصيدك</p>
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
              className="bg-green-600 hover:bg-green-700"
            >
              {subscribing ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
              تأكيد الاشتراك
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StudentSubjectView;

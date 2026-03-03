import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import NotificationsDropdown from "@/components/student/NotificationsDropdown";
import { toast } from "@/hooks/use-toast";
import {
  BookOpen,
  ChevronLeft,
  GraduationCap,
  User,
  Settings,
  LogOut,
  Clock,
  Video,
  Loader2,
  MessageSquare,
  Info,
  Bot,
  BookMarked,
  Beaker,
  Languages,
  BookText,
  Globe,
  FileText,
  Atom,
  Palette,
  Wallet,
} from "lucide-react";

interface ProfileData {
  full_name: string;
  student_code: string | null;
  stage: string | null;
  grade: string | null;
  section: string | null;
}

interface UsageStats {
  totalMinutes: number;
  lessonsWatched: number;
}

// أقسام المواد حسب المرحلة والشعبة - تصميم 2026
const getCategoryButtons = (stage: string, section: string | null) => {
  if (stage === "preparatory") {
    return [
      { id: "arabic", name: "المواد العربية", icon: BookText, gradient: "from-emerald-500 via-emerald-600 to-teal-700", shadow: "shadow-emerald-500/30" },
      { id: "religious", name: "المواد الشرعية", icon: BookMarked, gradient: "from-amber-500 via-amber-600 to-orange-700", shadow: "shadow-amber-500/30" },
      { id: "science", name: "العلوم", icon: Beaker, gradient: "from-blue-500 via-blue-600 to-indigo-700", shadow: "shadow-blue-500/30" },
      { id: "social", name: "الدراسات", icon: Globe, gradient: "from-purple-500 via-purple-600 to-violet-700", shadow: "shadow-purple-500/30" },
      { id: "english", name: "الإنجليزية", icon: Languages, gradient: "from-rose-500 via-rose-600 to-pink-700", shadow: "shadow-rose-500/30" },
    ];
  }
  
  if (stage === "secondary" && section === "scientific") {
    return [
      { id: "arabic", name: "المواد العربية", icon: BookText, gradient: "from-emerald-500 via-emerald-600 to-teal-700", shadow: "shadow-emerald-500/30" },
      { id: "religious", name: "المواد الشرعية", icon: BookMarked, gradient: "from-amber-500 via-amber-600 to-orange-700", shadow: "shadow-amber-500/30" },
      { id: "scientific", name: "المواد العلمية", icon: Atom, gradient: "from-cyan-500 via-cyan-600 to-blue-700", shadow: "shadow-cyan-500/30" },
      { id: "english", name: "الإنجليزية", icon: Languages, gradient: "from-rose-500 via-rose-600 to-pink-700", shadow: "shadow-rose-500/30" },
    ];
  }
  
  if (stage === "secondary" && section === "literary") {
    return [
      { id: "arabic", name: "المواد العربية", icon: BookText, gradient: "from-emerald-500 via-emerald-600 to-teal-700", shadow: "shadow-emerald-500/30" },
      { id: "religious", name: "المواد الشرعية", icon: BookMarked, gradient: "from-amber-500 via-amber-600 to-orange-700", shadow: "shadow-amber-500/30" },
      { id: "literary", name: "المواد الأدبية", icon: Palette, gradient: "from-indigo-500 via-indigo-600 to-purple-700", shadow: "shadow-indigo-500/30" },
      { id: "english", name: "الإنجليزية", icon: Languages, gradient: "from-rose-500 via-rose-600 to-pink-700", shadow: "shadow-rose-500/30" },
      { id: "french", name: "الفرنسية", icon: Globe, gradient: "from-sky-500 via-sky-600 to-blue-700", shadow: "shadow-sky-500/30" },
    ];
  }
  
  // Default
  return [
    { id: "arabic", name: "المواد العربية", icon: BookText, gradient: "from-emerald-500 via-emerald-600 to-teal-700", shadow: "shadow-emerald-500/30" },
    { id: "religious", name: "المواد الشرعية", icon: BookMarked, gradient: "from-amber-500 via-amber-600 to-orange-700", shadow: "shadow-amber-500/30" },
  ];
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats>({ totalMinutes: 0, lessonsWatched: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Onboarding state
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      try {
        // Fetch profile data
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("full_name, student_code, stage, grade, section")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          console.error("Error fetching profile:", profileError);
        } else if (profile) {
          setProfileData(profile);
          
          // Check if user needs onboarding (no stage/grade saved)
          if (!profile.stage || !profile.grade) {
            setNeedsOnboarding(true);
          } else {
            setNeedsOnboarding(false);
          }
        }

        // Fetch usage stats
        const { data: usageLogs, error: usageError } = await supabase
          .from("usage_logs")
          .select("duration_minutes, action")
          .eq("user_id", user.id);

        if (usageError) {
          console.error("Error fetching usage:", usageError);
        } else if (usageLogs) {
          const totalMinutes = usageLogs.reduce((sum, log) => sum + (log.duration_minutes || 0), 0);
          const lessonsWatched = usageLogs.filter(log => log.action === "watch_video").length;
          setUsageStats({ totalMinutes, lessonsWatched });
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const stages = [
    { id: "preparatory", name: "المرحلة الإعدادية", icon: "📚", description: "الصفوف الأول والثاني والثالث الإعدادي" },
    { id: "secondary", name: "المرحلة الثانوية", icon: "🎓", description: "الصفوف الأول والثاني والثالث الثانوي" },
  ];

  const grades = [
    { id: "first", name: "الصف الأول", icon: "1️⃣" },
    { id: "second", name: "الصف الثاني", icon: "2️⃣" },
    { id: "third", name: "الصف الثالث", icon: "3️⃣" },
  ];

  const sections = [
    { id: "scientific", name: "القسم العلمي", icon: "🔬", description: "الرياضيات والفيزياء والكيمياء" },
    { id: "literary", name: "القسم الأدبي", icon: "📖", description: "التاريخ والجغرافيا والفلسفة" },
  ];

  const handleStageSelect = (stageId: string) => {
    setSelectedStage(stageId);
    setSelectedGrade(null);
    setSelectedSection(null);
  };

  const handleGradeSelect = async (gradeId: string) => {
    setSelectedGrade(gradeId);
    
    // For preparatory stage, save immediately
    if (selectedStage === "preparatory") {
      await saveOnboarding(selectedStage, gradeId, null);
    } else {
      setSelectedSection(null);
    }
  };

  const handleSectionSelect = async (sectionId: string) => {
    setSelectedSection(sectionId);
    if (!selectedStage || !selectedGrade) return;
    await saveOnboarding(selectedStage, selectedGrade, sectionId);
  };

  const saveOnboarding = async (stage: string, grade: string, section: string | null) => {
    if (!user) return;
    
    setIsSaving(true);
    try {
      // Save to profile
      const { error } = await supabase
        .from("profiles")
        .update({
          stage,
          grade,
          section: section || null,
        })
        .eq("id", user.id);

      if (error) {
        console.error("Error saving profile:", error);
        toast({
          title: "خطأ",
          description: "حدث خطأ أثناء حفظ البيانات",
          variant: "destructive",
        });
        return;
      }

      // Update local state
      setProfileData(prev => prev ? { ...prev, stage, grade, section } : null);
      setNeedsOnboarding(false);

      toast({
        title: "تم الحفظ",
        description: "تم حفظ بياناتك بنجاح",
      });
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    if (selectedSection) {
      setSelectedSection(null);
    } else if (selectedGrade) {
      setSelectedGrade(null);
    } else if (selectedStage) {
      setSelectedStage(null);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const handleCategoryClick = (categoryId: string) => {
    if (!profileData?.stage || !profileData?.grade) return;
    navigate(`/subjects?stage=${profileData.stage}&grade=${profileData.grade}${profileData.section ? `&section=${profileData.section}` : ""}&category=${categoryId}`);
  };

  const formatTime = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return { hours, minutes };
  };

  const time = formatTime(usageStats.totalMinutes);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // Get category buttons for current user
  const categoryButtons = profileData?.stage 
    ? getCategoryButtons(profileData.stage, profileData.section) 
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20 overflow-x-hidden">
      {/* الهيدر */}
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-14 lg:h-16 items-center justify-between px-3 lg:px-4 max-w-full">
          <Link to="/" className="flex items-center gap-2 lg:gap-3 group flex-shrink-0">
            <div className="flex h-8 w-8 lg:h-10 lg:w-10 items-center justify-center rounded-xl gradient-azhari shadow-lg shadow-primary/20 group-hover:shadow-primary/40 transition-shadow">
              <BookOpen className="h-4 w-4 lg:h-5 lg:w-5 text-primary-foreground" />
            </div>
            <span className="text-base lg:text-xl font-bold text-gradient-azhari hidden sm:inline">أزهاريون</span>
          </Link>

          <div className="flex items-center gap-1 lg:gap-2">
            {/* الإشعارات */}
            <NotificationsDropdown />

            {/* عن المنصة */}
            <Button variant="ghost" size="icon" asChild className="hover:bg-accent h-8 w-8 lg:h-10 lg:w-10">
              <Link to="/about-platform">
                <Info className="h-4 w-4 lg:h-5 lg:w-5" />
              </Link>
            </Button>

            {/* الدعم الفني */}
            <Button variant="ghost" size="icon" asChild className="hover:bg-accent h-8 w-8 lg:h-10 lg:w-10">
              <Link to="/support">
                <MessageSquare className="h-4 w-4 lg:h-5 lg:w-5" />
              </Link>
            </Button>

            {/* الإعدادات */}
            <Button variant="ghost" size="icon" className="hover:bg-accent h-8 w-8 lg:h-10 lg:w-10 hidden sm:inline-flex">
              <Settings className="h-4 w-4 lg:h-5 lg:w-5" />
            </Button>

            {/* محفظتي */}
            <Button
              variant="ghost"
              size="icon"
              className="hover:bg-accent h-8 w-8 lg:h-10 lg:w-10"
              onClick={() => navigate("/wallet")}
            >
              <Wallet className="h-4 w-4 lg:h-5 lg:w-5" />
            </Button>

            <div className="hidden sm:flex items-center gap-2 px-3 lg:px-4 py-1.5 lg:py-2 rounded-xl bg-gradient-to-r from-accent to-accent/50 border border-border/50">
              <User className="h-4 w-4 lg:h-5 lg:w-5 text-primary" />
              <span className="text-xs lg:text-sm font-medium truncate max-w-[100px] lg:max-w-[150px]">{profileData?.full_name || user?.email}</span>
            </div>

            <Button variant="ghost" size="icon" onClick={handleSignOut} className="hover:bg-destructive/10 hover:text-destructive h-8 w-8 lg:h-10 lg:w-10">
              <LogOut className="h-4 w-4 lg:h-5 lg:w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container px-3 lg:px-4 py-4 lg:py-8 max-w-full overflow-x-hidden">
        {/* شريط الحالة */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 lg:gap-4 mb-6 lg:mb-10">
          <Card className="border-0 bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground shadow-xl shadow-primary/20 overflow-hidden relative">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0tNCA2aC0ydi00aDJ2NHptMC02aC0ydi00aDJ2NHoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30" />
            <CardContent className="p-3 lg:p-5 flex items-center gap-3 lg:gap-4 relative">
              <div className="p-2 lg:p-3 rounded-xl bg-white/20 backdrop-blur flex-shrink-0">
                <User className="h-5 w-5 lg:h-6 lg:w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs lg:text-sm text-primary-foreground/80">كود الطالب</p>
                <p className="text-lg lg:text-2xl font-bold tracking-wider truncate">{profileData?.student_code || "---"}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-amber-500 via-amber-500 to-orange-500 text-white shadow-xl shadow-amber-500/20 overflow-hidden relative">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0tNCA2aC0ydi00aDJ2NHptMC02aC0ydi00aDJ2NHoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30" />
            <CardContent className="p-3 lg:p-5 flex items-center gap-3 lg:gap-4 relative">
              <div className="p-2 lg:p-3 rounded-xl bg-white/20 backdrop-blur flex-shrink-0">
                <Clock className="h-5 w-5 lg:h-6 lg:w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs lg:text-sm text-white/80">وقت التعلم</p>
                <p className="text-lg lg:text-2xl font-bold truncate">
                  {time.hours > 0 && `${time.hours} س `}{time.minutes} د
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 text-white shadow-xl shadow-violet-500/20 overflow-hidden relative sm:col-span-2 md:col-span-1">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0tNCA2aC0ydi00aDJ2NHptMC02aC0ydi00aDJ2NHoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30" />
            <CardContent className="p-3 lg:p-5 flex items-center gap-3 lg:gap-4 relative">
              <div className="p-2 lg:p-3 rounded-xl bg-white/20 backdrop-blur flex-shrink-0">
                <Video className="h-5 w-5 lg:h-6 lg:w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs lg:text-sm text-white/80">الدروس المشاهدة</p>
                <p className="text-lg lg:text-2xl font-bold">{usageStats.lessonsWatched} درس</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* عرض أقسام المواد مباشرة - بدون زر تغيير المرحلة */}
        {!needsOnboarding && profileData?.stage && profileData?.grade && (
          <div className="animate-fade-in">
            <div className="mb-4 lg:mb-8">
              <h2 className="text-xl lg:text-3xl font-bold text-foreground mb-1 lg:mb-2 flex items-center gap-2 lg:gap-3">
                <div className="p-1.5 lg:p-2 rounded-lg lg:rounded-xl bg-primary/10">
                  <BookOpen className="h-5 w-5 lg:h-8 lg:w-8 text-primary" />
                </div>
                <span className="truncate">أقسام المواد</span>
              </h2>
              <p className="text-muted-foreground text-sm lg:text-lg">اختر القسم للوصول إلى المواد الدراسية</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 lg:gap-6">
              {categoryButtons.map((category) => {
                const IconComponent = category.icon;
                return (
                  <Card
                    key={category.id}
                    className={`cursor-pointer border-0 bg-gradient-to-br ${category.gradient} text-white shadow-xl ${category.shadow} hover:shadow-2xl transition-all duration-500 hover:scale-105 hover:-translate-y-2 group overflow-hidden relative`}
                    onClick={() => handleCategoryClick(category.id)}
                  >
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
                    <CardContent className="p-4 lg:p-8 text-center relative">
                      <div className="w-12 h-12 lg:w-20 lg:h-20 mx-auto mb-2 lg:mb-5 rounded-xl lg:rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg">
                        <IconComponent className="h-6 w-6 lg:h-10 lg:w-10" />
                      </div>
                      <h3 className="text-sm lg:text-xl font-bold tracking-wide truncate">{category.name}</h3>
                    </CardContent>
                  </Card>
                );
              })}

              {/* كارد المساعد الذكي */}
              <Card
                className="cursor-pointer border-0 bg-gradient-to-br from-fuchsia-500 via-purple-500 to-violet-600 text-white shadow-xl shadow-fuchsia-500/30 hover:shadow-2xl transition-all duration-500 hover:scale-105 hover:-translate-y-2 group overflow-hidden relative"
                onClick={() => navigate("/ai-chat")}
              >
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
                <CardContent className="p-4 lg:p-8 text-center relative">
                  <div className="w-12 h-12 lg:w-20 lg:h-20 mx-auto mb-2 lg:mb-5 rounded-xl lg:rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg">
                    <Bot className="h-6 w-6 lg:h-10 lg:w-10" />
                  </div>
                  <h3 className="text-sm lg:text-xl font-bold tracking-wide truncate">المساعد الذكي</h3>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Onboarding - اختيار المرحلة والصف للمرة الأولى فقط */}
        {needsOnboarding && (
          <div className="max-w-4xl mx-auto px-2">
            {/* Progress bar */}
            <div className="mb-6 lg:mb-10">
              <div className="flex items-center justify-center gap-2 lg:gap-4 mb-4 lg:mb-6">
                <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-xl lg:rounded-2xl flex items-center justify-center text-sm lg:text-lg font-bold transition-all duration-300 ${!selectedStage ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/30 scale-110' : 'bg-primary/20 text-primary'}`}>
                  ١
                </div>
                <div className={`w-12 lg:w-20 h-1 lg:h-1.5 rounded-full transition-all duration-500 ${selectedStage ? 'bg-gradient-to-r from-primary to-primary/50' : 'bg-muted'}`} />
                <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-xl lg:rounded-2xl flex items-center justify-center text-sm lg:text-lg font-bold transition-all duration-300 ${selectedStage && !selectedGrade ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/30 scale-110' : selectedGrade ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  ٢
                </div>
                {selectedStage === "secondary" && (
                  <>
                    <div className={`w-12 lg:w-20 h-1 lg:h-1.5 rounded-full transition-all duration-500 ${selectedGrade ? 'bg-gradient-to-r from-primary to-primary/50' : 'bg-muted'}`} />
                    <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-xl lg:rounded-2xl flex items-center justify-center text-sm lg:text-lg font-bold transition-all duration-300 ${selectedGrade && !selectedSection ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/30 scale-110' : selectedSection ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      ٣
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center justify-center gap-6 lg:gap-12 text-xs lg:text-sm">
                <span className={`transition-colors ${!selectedStage ? 'text-primary font-bold' : 'text-muted-foreground'}`}>المرحلة</span>
                <span className={`transition-colors ${selectedStage && !selectedGrade ? 'text-primary font-bold' : 'text-muted-foreground'}`}>الصف</span>
                {selectedStage === "secondary" && (
                  <span className={`transition-colors ${selectedGrade && !selectedSection ? 'text-primary font-bold' : 'text-muted-foreground'}`}>الشعبة</span>
                )}
              </div>
            </div>

            {/* زر الرجوع */}
            {(selectedStage || selectedGrade || selectedSection) && (
              <Button variant="ghost" className="mb-4 lg:mb-6 hover:bg-accent text-sm" onClick={handleBack} disabled={isSaving}>
                <ChevronLeft className="h-4 w-4 lg:h-5 lg:w-5 rotate-180 ml-1" />
                رجوع
              </Button>
            )}

            {/* اختيار المرحلة */}
            {!selectedStage && (
              <div className="animate-fade-in">
                <div className="text-center mb-6 lg:mb-10">
                  <div className="inline-flex items-center justify-center w-14 h-14 lg:w-20 lg:h-20 rounded-2xl lg:rounded-3xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground mb-4 lg:mb-6 shadow-xl shadow-primary/30">
                    <GraduationCap className="h-7 w-7 lg:h-10 lg:w-10" />
                  </div>
                  <h2 className="text-xl lg:text-3xl font-bold text-foreground mb-2 lg:mb-3">اختر مرحلتك الدراسية</h2>
                  <p className="text-muted-foreground text-sm lg:text-lg">هذا الاختيار سيحدد المواد التي ستظهر لك</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-8">
                  {stages.map((stage) => (
                    <Card
                      key={stage.id}
                      className="cursor-pointer border-2 border-transparent hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/10 transition-all duration-300 group bg-card/50 backdrop-blur overflow-hidden"
                      onClick={() => handleStageSelect(stage.id)}
                    >
                      <CardContent className="p-6 lg:p-10 text-center relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="text-5xl lg:text-7xl mb-4 lg:mb-6 group-hover:scale-110 transition-transform duration-300">{stage.icon}</div>
                        <h3 className="text-lg lg:text-2xl font-bold text-foreground mb-1 lg:mb-2">{stage.name}</h3>
                        <p className="text-muted-foreground text-xs lg:text-base">{stage.description}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* اختيار الصف */}
            {selectedStage && !selectedGrade && (
              <div className="animate-fade-in">
                <div className="text-center mb-6 lg:mb-10">
                  <div className="inline-flex items-center justify-center w-14 h-14 lg:w-20 lg:h-20 rounded-2xl lg:rounded-3xl bg-gradient-to-br from-amber-500 to-orange-500 text-white mb-4 lg:mb-6 shadow-xl shadow-amber-500/30">
                    <BookOpen className="h-7 w-7 lg:h-10 lg:w-10" />
                  </div>
                  <h2 className="text-xl lg:text-3xl font-bold text-foreground mb-2 lg:mb-3">اختر صفك الدراسي</h2>
                  <p className="text-muted-foreground text-sm lg:text-lg">
                    {selectedStage === "preparatory" ? "المرحلة الإعدادية" : "المرحلة الثانوية"}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 lg:gap-6">
                  {grades.map((grade) => (
                    <Card
                      key={grade.id}
                      className="cursor-pointer border-2 border-transparent hover:border-amber-500/50 hover:shadow-2xl hover:shadow-amber-500/10 transition-all duration-300 group bg-card/50 backdrop-blur overflow-hidden"
                      onClick={() => handleGradeSelect(grade.id)}
                    >
                      <CardContent className="p-4 lg:p-8 text-center relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/0 to-amber-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="text-4xl lg:text-6xl mb-2 lg:mb-4 group-hover:scale-110 transition-transform duration-300">{grade.icon}</div>
                        <h3 className="text-sm lg:text-xl font-bold text-foreground truncate">{grade.name}</h3>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {isSaving && (
                  <div className="mt-6 lg:mt-8 text-center">
                    <Loader2 className="h-6 w-6 lg:h-8 lg:w-8 animate-spin text-primary mx-auto" />
                    <p className="text-muted-foreground mt-2 text-sm">جاري الحفظ...</p>
                  </div>
                )}
              </div>
            )}

            {/* اختيار الشعبة - للمرحلة الثانوية فقط */}
            {selectedStage === "secondary" && selectedGrade && !selectedSection && (
              <div className="animate-fade-in">
                <div className="text-center mb-6 lg:mb-10">
                  <div className="inline-flex items-center justify-center w-14 h-14 lg:w-20 lg:h-20 rounded-2xl lg:rounded-3xl bg-gradient-to-br from-violet-500 to-purple-600 text-white mb-4 lg:mb-6 shadow-xl shadow-violet-500/30">
                    <Beaker className="h-7 w-7 lg:h-10 lg:w-10" />
                  </div>
                  <h2 className="text-xl lg:text-3xl font-bold text-foreground mb-2 lg:mb-3">اختر شعبتك</h2>
                  <p className="text-muted-foreground text-sm lg:text-lg">القسم العلمي أو الأدبي</p>
                </div>

                <div className="grid grid-cols-2 gap-4 lg:gap-8">
                  {sections.map((section) => (
                    <Card
                      key={section.id}
                      className="cursor-pointer border-2 border-transparent hover:border-violet-500/50 hover:shadow-2xl hover:shadow-violet-500/10 transition-all duration-300 group bg-card/50 backdrop-blur overflow-hidden"
                      onClick={() => handleSectionSelect(section.id)}
                    >
                      <CardContent className="p-6 lg:p-10 text-center relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/0 to-violet-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="text-5xl lg:text-7xl mb-4 lg:mb-6 group-hover:scale-110 transition-transform duration-300">{section.icon}</div>
                        <h3 className="text-lg lg:text-2xl font-bold text-foreground mb-1 lg:mb-2">{section.name}</h3>
                        <p className="text-muted-foreground text-xs lg:text-base">{section.description}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {isSaving && (
                  <div className="mt-6 lg:mt-8 text-center">
                    <Loader2 className="h-6 w-6 lg:h-8 lg:w-8 animate-spin text-primary mx-auto" />
                    <p className="text-muted-foreground mt-2 text-sm">جاري الحفظ...</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;



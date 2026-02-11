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
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      try {
        const { data: profile } = await supabase.from("profiles").select("full_name, student_code, stage, grade, section").eq("id", user.id).maybeSingle();
        if (profile) {
          setProfileData(profile);
          if (!profile.stage || !profile.grade) setNeedsOnboarding(true);
        }
        const { data: usageLogs } = await supabase.from("usage_logs").select("duration_minutes, action").eq("user_id", user.id);
        if (usageLogs) {
          const totalMinutes = usageLogs.reduce((sum, log) => sum + (log.duration_minutes || 0), 0);
          const lessonsWatched = usageLogs.filter(log => log.action === "watch_video").length;
          setUsageStats({ totalMinutes, lessonsWatched });
        }
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [user]);

  const saveOnboarding = async (stage: string, grade: string, section: string | null) => {
    setIsSaving(true);
    const { error } = await supabase.from("profiles").update({ stage, grade, section: section || null }).eq("id", user!.id);
    if (!error) {
      setProfileData(prev => prev ? { ...prev, stage, grade, section } : null);
      setNeedsOnboarding(false);
    }
    setIsSaving(false);
  };

  const handleCategoryClick = (categoryId: string) => {
    if (!profileData?.stage || !profileData?.grade) return;
    navigate(`/subjects?stage=${profileData.stage}&grade=${profileData.grade}${profileData.section ? `&section=${profileData.section}` : ""}&category=${categoryId}`);
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;

  const categoryButtons = profileData?.stage ? getCategoryButtons(profileData.stage, profileData.section) : [];
  const time = { hours: Math.floor(usageStats.totalMinutes / 60), minutes: usageStats.totalMinutes % 60 };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20 overflow-x-hidden" dir="rtl">
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-14 lg:h-16 items-center justify-between px-3 lg:px-4 max-w-full">
          <Link to="/" className="flex items-center gap-2 lg:gap-3 group flex-shrink-0">
            <div className="flex h-8 w-8 lg:h-10 lg:w-10 items-center justify-center rounded-xl gradient-azhari shadow-lg shadow-primary/20">
              <BookOpen className="h-4 w-4 lg:h-5 lg:w-5 text-primary-foreground" />
            </div>
            <span className="text-base lg:text-xl font-bold text-gradient-azhari hidden sm:inline">أزهاريون</span>
          </Link>

          <div className="flex items-center gap-1 lg:gap-2">
            <NotificationsDropdown />
            <Button variant="ghost" size="icon" asChild className="h-8 w-8 lg:h-10 lg:w-10"><Link to="/about-platform"><Info className="h-4 w-4 lg:h-5 lg:w-5" /></Link></Button>
            <Button variant="ghost" size="icon" asChild className="h-8 w-8 lg:h-10 lg:w-10"><Link to="/support"><MessageSquare className="h-4 w-4 lg:h-5 lg:w-5" /></Link></Button>
            
            {/* التعديل لتفعيل زر الإعدادات بالمسار الجديد */}
            <Button variant="ghost" size="icon" onClick={() => navigate("/profile-settings")} className="h-8 w-8 lg:h-10 lg:w-10 hidden sm:inline-flex">
              <Settings className="h-4 w-4 lg:h-5 lg:w-5" />
            </Button>

            <div className="hidden sm:flex items-center gap-2 px-3 lg:px-4 py-1.5 lg:py-2 rounded-xl bg-gradient-to-r from-accent to-accent/50 border border-border/50 cursor-pointer" onClick={() => navigate("/profile-settings")}>
              <User className="h-4 w-4 lg:h-5 lg:w-5 text-primary" />
              <span className="text-xs lg:text-sm font-medium truncate max-w-[150px]">{profileData?.full_name || user?.email}</span>
            </div>

            <Button variant="ghost" size="icon" onClick={() => signOut()} className="hover:text-destructive h-8 w-8 lg:h-10 lg:w-10"><LogOut className="h-4 w-4 lg:h-5 lg:w-5" /></Button>
          </div>
        </div>
      </header>

      <main className="container px-3 lg:px-4 py-4 lg:py-8 max-w-full">
        {/* استعادة الألوان الأصلية تماماً */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 lg:gap-4 mb-6 lg:mb-10">
          <Card className="border-0 bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground shadow-xl shadow-primary/20 overflow-hidden relative">
            <CardContent className="p-3 lg:p-5 flex items-center gap-3 lg:gap-4 relative">
              <div className="p-2 lg:p-3 rounded-xl bg-white/20 backdrop-blur"><User className="h-5 w-5 lg:h-6 lg:w-6" /></div>
              <div className="min-w-0">
                <p className="text-xs lg:text-sm text-primary-foreground/80">كود الطالب</p>
                <p className="text-lg lg:text-2xl font-bold tracking-wider truncate">{profileData?.student_code || "---"}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 bg-gradient-to-br from-amber-500 via-amber-500 to-orange-500 text-white shadow-xl shadow-amber-500/20 overflow-hidden relative">
            <CardContent className="p-3 lg:p-5 flex items-center gap-3 lg:gap-4 relative">
              <div className="p-2 lg:p-3 rounded-xl bg-white/20 backdrop-blur"><Clock className="h-5 w-5 lg:h-6 lg:w-6" /></div>
              <div className="min-w-0">
                <p className="text-xs lg:text-sm text-white/80">وقت التعلم</p>
                <p className="text-lg lg:text-2xl font-bold">{time.hours} س {time.minutes} د</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 text-white shadow-xl shadow-violet-500/20 overflow-hidden relative sm:col-span-2 md:col-span-1">
            <CardContent className="p-3 lg:p-5 flex items-center gap-3 lg:gap-4 relative">
              <div className="p-2 lg:p-3 rounded-xl bg-white/20 backdrop-blur"><Video className="h-5 w-5 lg:h-6 lg:w-6" /></div>
              <div className="min-w-0">
                <p className="text-xs lg:text-sm text-white/80">الدروس المشاهدة</p>
                <p className="text-lg lg:text-2xl font-bold">{usageStats.lessonsWatched} درس</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {!needsOnboarding && profileData?.stage && (
          <div className="animate-fade-in">
            <div className="mb-4 lg:mb-8">
              <h2 className="text-xl lg:text-3xl font-bold text-foreground mb-1 flex items-center gap-2">
                <div className="p-1.5 lg:p-2 rounded-lg bg-primary/10"><BookOpen className="h-5 w-5 lg:h-8 lg:w-8 text-primary" /></div>
                <span>أقسام المواد</span>
              </h2>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 lg:gap-6">
              {categoryButtons.map((category) => (
                <Card
                  key={category.id}
                  className={`cursor-pointer border-0 bg-gradient-to-br ${category.gradient} text-white shadow-xl ${category.shadow} hover:scale-105 transition-all duration-300 group overflow-hidden relative`}
                  onClick={() => handleCategoryClick(category.id)}
                >
                   <CardContent className="p-4 lg:p-8 text-center relative">
                      <div className="w-12 h-12 lg:w-20 lg:h-20 mx-auto mb-2 lg:mb-5 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shadow-lg">
                        <category.icon className="h-6 w-6 lg:h-10 lg:w-10" />
                      </div>
                      <h3 className="text-sm lg:text-xl font-bold truncate">{category.name}</h3>
                    </CardContent>
                </Card>
              ))}
              <Card className="cursor-pointer border-0 bg-gradient-to-br from-fuchsia-500 via-purple-500 to-violet-600 text-white shadow-xl shadow-fuchsia-500/30 hover:scale-105 transition-all duration-300 group overflow-hidden relative" onClick={() => navigate("/ai-chat")}>
                <CardContent className="p-4 lg:p-8 text-center relative">
                  <div className="w-12 h-12 lg:w-20 lg:h-20 mx-auto mb-2 lg:mb-5 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shadow-lg"><Bot className="h-6 w-6 lg:h-10 lg:w-10" /></div>
                  <h3 className="text-sm lg:text-xl font-bold truncate">المساعد الذكي</h3>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* استعادة Onboarding الأصلي كما هو في ملفك */}
        {needsOnboarding && (
           <div className="max-w-4xl mx-auto py-10 text-center animate-fade-in">
              <h2 className="text-2xl lg:text-4xl font-bold mb-4">أهلاً بك في أزهاريون</h2>
              {!selectedStage ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Button variant="outline" className="h-40 text-xl" onClick={() => setSelectedStage('preparatory')}>المرحلة الإعدادية</Button>
                  <Button variant="outline" className="h-40 text-xl" onClick={() => setSelectedStage('secondary')}>المرحلة الثانوية</Button>
                </div>
              ) : !selectedGrade ? (
                <div className="grid grid-cols-3 gap-4">
                  {['first', 'second', 'third'].map(g => (
                    <Button key={g} className="h-20" onClick={() => { if(selectedStage==='preparatory') saveOnboarding(selectedStage, g, null); else setSelectedGrade(g); }}>الصف {g==='first'?'الأول':g==='second'?'الثاني':'الثالث'}</Button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-6">
                  <Button className="h-32 text-xl" onClick={()=>saveOnboarding(selectedStage, selectedGrade, 'scientific')}>علمي</Button>
                  <Button className="h-32 text-xl" onClick={()=>saveOnboarding(selectedStage, selectedGrade, 'literary')}>أدبي</Button>
                </div>
              )}
           </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;



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

// أقسام المواد حسب المرحلة والشعبة - تصميم أزهاريون 2026
const getCategoryButtons = (stage: string, section: string | null) => {
  if (stage === "preparatory") {
    return [
      { id: "arabic", name: "المواد العربية", icon: BookText, gradient: "from-emerald-500 via-emerald-600 to-teal-700", shadow: "shadow-emerald-500/30", desc: "نحو، صرف، مطالع" },
      { id: "religious", name: "المواد الشرعية", icon: BookMarked, gradient: "from-amber-500 via-amber-600 to-orange-700", shadow: "shadow-amber-500/30", desc: "فقه، تفسير، حديث" },
      { id: "science", name: "العلوم", icon: Beaker, gradient: "from-blue-500 via-blue-600 to-indigo-700", shadow: "shadow-blue-500/30", desc: "منهج العلوم المتكامل" },
      { id: "social", name: "الدراسات", icon: Globe, gradient: "from-purple-500 via-purple-600 to-violet-700", shadow: "shadow-purple-500/30", desc: "تاريخ وجغرافيا" },
      { id: "english", name: "الإنجليزية", icon: Languages, gradient: "from-rose-500 via-rose-600 to-pink-700", shadow: "shadow-rose-500/30", desc: "اللغة الأجنبية الأولى" },
    ];
  }
  
  if (stage === "secondary") {
    const base = [
      { id: "arabic", name: "المواد العربية", icon: BookText, gradient: "from-emerald-500 via-emerald-600 to-teal-700", shadow: "shadow-emerald-500/30", desc: "نحو، صرف، بلاغة، أدب" },
      { id: "religious", name: "المواد الشرعية", icon: BookMarked, gradient: "from-amber-500 via-amber-600 to-orange-700", shadow: "shadow-amber-500/30", desc: "فقه، توحيد، تفسير، حديث" },
      { id: "english", name: "الإنجليزية", icon: Languages, gradient: "from-rose-500 via-rose-600 to-pink-700", shadow: "shadow-rose-500/30", desc: "اللغة الأجنبية الأولى" },
    ];

    if (section === "scientific") {
      base.push({ id: "scientific", name: "المواد العلمية", icon: Atom, gradient: "from-cyan-500 via-cyan-600 to-blue-700", shadow: "shadow-cyan-500/30", desc: "فيزياء، كيمياء، أحياء، رياضة" });
    } else if (section === "literary") {
      base.push({ id: "literary", name: "المواد الأدبية", icon: Palette, gradient: "from-indigo-500 via-indigo-600 to-purple-700", shadow: "shadow-indigo-500/30", desc: "تاريخ، جغرافيا، منطق" });
      base.push({ id: "french", name: "الفرنسية", icon: Globe, gradient: "from-sky-500 via-sky-600 to-blue-700", shadow: "shadow-sky-500/30", desc: "اللغة الأجنبية الثانية" });
    }
    return base;
  }
  
  return [];
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
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("full_name, student_code, stage, grade, section")
          .eq("id", user.id)
          .maybeSingle();

        if (profile) {
          setProfileData(profile);
          if (!profile.stage || !profile.grade) {
            setNeedsOnboarding(true);
          }
        }

        const { data: usageLogs } = await supabase
          .from("usage_logs")
          .select("duration_minutes, action")
          .eq("user_id", user.id);

        if (usageLogs) {
          const totalMinutes = usageLogs.reduce((sum, log) => sum + (log.duration_minutes || 0), 0);
          const lessonsWatched = usageLogs.filter(log => log.action === "watch_video").length;
          setUsageStats({ totalMinutes, lessonsWatched });
        }
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const saveOnboarding = async (stage: string, grade: string, section: string | null) => {
    if (!user) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ stage, grade, section: section || null })
        .eq("id", user.id);

      if (error) throw error;
      setProfileData(prev => prev ? { ...prev, stage, grade, section } : null);
      setNeedsOnboarding(false);
      toast({ title: "تم الحفظ", description: "تم تحديث بياناتك الدراسية بنجاح" });
    } catch (error) {
      toast({ title: "خطأ", description: "حدث خطأ أثناء حفظ البيانات", variant: "destructive" });
    } finally {
      setIsSaving(false);
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

  const categoryButtons = profileData?.stage ? getCategoryButtons(profileData.stage, profileData.section) : [];

  return (
    <div className="min-h-screen bg-muted/20 overflow-x-hidden" dir="rtl">
      {/* هيدر المنصة */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between px-4 max-w-full">
          <Link to="/dashboard" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20 group-hover:scale-110 transition-transform">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-primary hidden sm:inline">أزهاريون</span>
          </Link>

          <div className="flex items-center gap-2">
            <NotificationsDropdown />
            
            <Button variant="ghost" size="icon" asChild className="hover:bg-accent">
              <Link to="/about-platform"><Info className="h-5 w-5" /></Link>
            </Button>

            <Button variant="ghost" size="icon" asChild className="hover:bg-accent">
              <Link to="/support"><MessageSquare className="h-5 w-5" /></Link>
            </Button>

            {/* تم الإصلاح: الزر يوجه الآن لصفحة الإعدادات الجديدة */}
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate("/profile-settings")}
              className="hover:bg-accent text-primary"
              title="إعدادات الحساب"
            >
              <Settings className="h-5 w-5" />
            </Button>

            <Button variant="ghost" size="icon" onClick={handleSignOut} className="hover:bg-destructive/10 text-destructive">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container px-4 py-8 space-y-8">
        {/* شريط الإحصائيات وبطاقة الترحيب */}
        {!needsOnboarding && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-emerald-700 text-white border-none shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10"><User size={100} /></div>
              <CardContent className="p-6 relative z-10 flex flex-col justify-center h-full">
                <p className="text-emerald-100 text-sm mb-1">مرحباً بك مجدداً</p>
                <h2 className="text-2xl font-bold mb-3">{profileData?.full_name}</h2>
                <div className="flex gap-2">
                  <span className="bg-white/20 px-2 py-0.5 rounded text-xs">كود: {profileData?.student_code || "---"}</span>
                  <span className="bg-white/20 px-2 py-0.5 rounded text-xs">{profileData?.grade === 'first' ? 'الأول' : profileData?.grade === 'second' ? 'الثاني' : 'الثالث'} {profileData?.stage === 'preparatory' ? 'إعدادي' : 'ثانوي'}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-amber-500 text-white border-none shadow-xl">
              <CardContent className="p-6 flex items-center gap-4 h-full">
                <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center"><Clock className="h-6 w-6" /></div>
                <div>
                  <p className="text-amber-100 text-xs">إجمالي وقت التعلم</p>
                  <p className="text-2xl font-black">{time.hours} س {time.minutes} د</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-blue-600 text-white border-none shadow-xl">
              <CardContent className="p-6 flex items-center gap-4 h-full">
                <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center"><Video className="h-6 w-6" /></div>
                <div>
                  <p className="text-blue-100 text-xs">الدروس المنجزة</p>
                  <p className="text-2xl font-black">{usageStats.lessonsWatched} درس</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* شبكة الأكشن السريعة */}
        {!needsOnboarding && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="hover:border-primary transition-all cursor-pointer group" onClick={() => navigate("/ai-chat")}>
              <CardContent className="p-4 flex flex-col items-center gap-2">
                <div className="p-3 rounded-2xl bg-violet-100 text-violet-600 group-hover:scale-110 transition-transform"><Bot className="h-6 w-6" /></div>
                <span className="text-sm font-bold">المساعد الذكي</span>
              </CardContent>
            </Card>
            <Card className="hover:border-primary transition-all cursor-pointer group" onClick={() => navigate("/profile-settings")}>
              <CardContent className="p-4 flex flex-col items-center gap-2">
                <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-600 group-hover:scale-110 transition-transform"><User className="h-6 w-6" /></div>
                <span className="text-sm font-bold">الملف الشخصي</span>
              </CardContent>
            </Card>
            <Card className="hover:border-primary transition-all cursor-pointer group" onClick={() => navigate("/support")}>
              <CardContent className="p-4 flex flex-col items-center gap-2">
                <div className="p-3 rounded-2xl bg-blue-100 text-blue-600 group-hover:scale-110 transition-transform"><MessageSquare className="h-6 w-6" /></div>
                <span className="text-sm font-bold">الدعم الفني</span>
              </CardContent>
            </Card>
            <Card className="hover:border-primary transition-all cursor-pointer group" onClick={() => navigate("/about-platform")}>
              <CardContent className="p-4 flex flex-col items-center gap-2">
                <div className="p-3 rounded-2xl bg-amber-100 text-amber-600 group-hover:scale-110 transition-transform"><Info className="h-6 w-6" /></div>
                <span className="text-sm font-bold">عن أزهاريون</span>
              </CardContent>
            </Card>
          </div>
        )}

        {/* عرض المواد الدراسية */}
        {!needsOnboarding && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold flex items-center gap-2 text-primary">
              <BookOpen className="h-6 w-6" /> أقسام المواد الدراسية
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {categoryButtons.map((cat) => (
                <Card 
                  key={cat.id} 
                  className={`border-none bg-gradient-to-br ${cat.gradient} text-white shadow-lg cursor-pointer hover:scale-105 transition-all duration-300 group overflow-hidden`}
                  onClick={() => handleCategoryClick(cat.id)}
                >
                  <CardContent className="p-6 text-center relative">
                    <div className="absolute -top-4 -right-4 w-16 h-16 bg-white/10 rounded-full blur-xl group-hover:scale-150 transition-transform" />
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shadow-inner">
                      <cat.icon className="h-8 w-8" />
                    </div>
                    <h4 className="font-bold text-lg">{cat.name}</h4>
                    <p className="text-white/60 text-[10px] mt-1 line-clamp-1">{cat.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* نظام الترحيب لأول مرة (Onboarding) */}
        {needsOnboarding && (
          <div className="max-w-2xl mx-auto py-12 animate-in fade-in slide-in-from-bottom-4">
             <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary/10 text-primary mb-6"><GraduationCap size={40} /></div>
                <h2 className="text-3xl font-bold mb-2">أهلاً بك في أزهاريون!</h2>
                <p className="text-muted-foreground">أكمل بياناتك الدراسية لفتح المحتوى التعليمي المناسب لك</p>
             </div>

             <div className="space-y-6">
                {!selectedStage ? (
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Button variant="outline" className="h-32 flex-col gap-3 text-lg" onClick={() => setSelectedStage('preparatory')}>
                         <span className="text-4xl">📚</span> المرحلة الإعدادية
                      </Button>
                      <Button variant="outline" className="h-32 flex-col gap-3 text-lg" onClick={() => setSelectedStage('secondary')}>
                         <span className="text-4xl">🎓</span> المرحلة الثانوية
                      </Button>
                   </div>
                ) : !selectedGrade ? (
                   <div className="space-y-4">
                      <p className="text-center font-bold">اختر الصف الدراسي</p>
                      <div className="grid grid-cols-3 gap-3">
                         {['first', 'second', 'third'].map((g) => (
                            <Button key={g} variant="secondary" onClick={() => {
                               if (selectedStage === 'preparatory') saveOnboarding(selectedStage, g, null);
                               else setSelectedGrade(g);
                            }}>
                               الصف {g === 'first' ? 'الأول' : g === 'second' ? 'الثاني' : 'الثالث'}
                            </Button>
                         ))}
                      </div>
                      <Button variant="link" className="w-full" onClick={() => setSelectedStage(null)}>رجوع</Button>
                   </div>
                ) : (
                   <div className="space-y-4">
                      <p className="text-center font-bold">اختر الشعبة</p>
                      <div className="grid grid-cols-2 gap-4">
                         <Button className="h-20 text-lg" onClick={() => saveOnboarding(selectedStage, selectedGrade, 'scientific')}>علمي</Button>
                         <Button className="h-20 text-lg" onClick={() => saveOnboarding(selectedStage, selectedGrade, 'literary')}>أدبي</Button>
                      </div>
                      <Button variant="link" className="w-full" onClick={() => setSelectedGrade(null)}>رجوع</Button>
                   </div>
                )}
             </div>
          </div>
        )}
      </main>

      <footer className="py-8 text-center opacity-30 text-xs">
        <p>منصة أزهاريون التعليمية © 2026 - جميع الحقوق محفوظة</p>
      </footer>
    </div>
  );
};

export default Dashboard;


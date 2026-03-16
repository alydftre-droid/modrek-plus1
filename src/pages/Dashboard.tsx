import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import StudentLayout from "@/components/student/StudentLayout";
import {
  GraduationCap, User, Clock, Loader2,
  BookText, BookMarked, Beaker, Globe, Languages, Atom, Palette,
  Wallet, Bell, Sparkles, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface ProfileData {
  full_name: string;
  student_code: string | null;
  stage: string | null;
  grade: string | null;
  section: string | null;
  avatar_url: string | null;
}

interface UsageStats {
  totalMinutes: number;
}

interface CategoryButton {
  id: string;
  name: string;
  icon: any;
  gradient: string;
  shadow: string;
  emoji: string;
  /** true = has sub-subjects, navigate to intermediate page */
  hasSubjects?: boolean;
}

const getCategoryButtons = (stage: string, section: string | null): CategoryButton[] => {
  if (stage === "preparatory") {
    return [
      { id: "arabic", name: "العربية", icon: BookText, gradient: "from-emerald-500 to-teal-600", shadow: "shadow-emerald-200", emoji: "📖" },
      { id: "religious", name: "الشرعية", icon: BookMarked, gradient: "from-amber-500 to-orange-600", shadow: "shadow-amber-200", emoji: "🕌" },
      { id: "science", name: "العلوم", icon: Beaker, gradient: "from-blue-500 to-indigo-600", shadow: "shadow-blue-200", emoji: "🔬", hasSubjects: true },
      { id: "social", name: "الدراسات", icon: Globe, gradient: "from-purple-500 to-violet-600", shadow: "shadow-purple-200", emoji: "🌍" },
      { id: "english", name: "English", icon: Languages, gradient: "from-rose-500 to-pink-600", shadow: "shadow-rose-200", emoji: "🇬🇧" },
    ];
  }
  if (stage === "secondary" && section === "scientific") {
    return [
      { id: "arabic", name: "العربية", icon: BookText, gradient: "from-emerald-500 to-teal-600", shadow: "shadow-emerald-200", emoji: "📖" },
      { id: "religious", name: "الشرعية", icon: BookMarked, gradient: "from-amber-500 to-orange-600", shadow: "shadow-amber-200", emoji: "🕌" },
      { id: "scientific", name: "العلمية", icon: Atom, gradient: "from-cyan-500 to-blue-600", shadow: "shadow-cyan-200", emoji: "⚛️", hasSubjects: true },
      { id: "english", name: "English", icon: Languages, gradient: "from-rose-500 to-pink-600", shadow: "shadow-rose-200", emoji: "🇬🇧" },
    ];
  }
  if (stage === "secondary" && section === "literary") {
    return [
      { id: "arabic", name: "العربية", icon: BookText, gradient: "from-emerald-500 to-teal-600", shadow: "shadow-emerald-200", emoji: "📖" },
      { id: "religious", name: "الشرعية", icon: BookMarked, gradient: "from-amber-500 to-orange-600", shadow: "shadow-amber-200", emoji: "🕌" },
      { id: "literary", name: "الأدبية", icon: Palette, gradient: "from-indigo-500 to-purple-600", shadow: "shadow-indigo-200", emoji: "🎨", hasSubjects: true },
      { id: "english", name: "English", icon: Languages, gradient: "from-rose-500 to-pink-600", shadow: "shadow-rose-200", emoji: "🇬🇧" },
      { id: "french", name: "Français", icon: Globe, gradient: "from-sky-500 to-blue-600", shadow: "shadow-sky-200", emoji: "🇫🇷" },
    ];
  }
  return [
    { id: "arabic", name: "العربية", icon: BookText, gradient: "from-emerald-500 to-teal-600", shadow: "shadow-emerald-200", emoji: "📖" },
    { id: "religious", name: "الشرعية", icon: BookMarked, gradient: "from-amber-500 to-orange-600", shadow: "shadow-amber-200", emoji: "🕌" },
  ];
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats>({ totalMinutes: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      try {
        const { data: profile } = await supabase.from("profiles").select("full_name, student_code, stage, grade, section, avatar_url").eq("id", user.id).maybeSingle();
        if (profile) { setProfileData(profile); setNeedsOnboarding(!profile.stage || !profile.grade); }
        const { data: usageLogs } = await supabase.from("usage_logs").select("duration_minutes").eq("user_id", user.id);
        if (usageLogs) {
          const totalMinutes = usageLogs.reduce((sum, log) => sum + (log.duration_minutes || 0), 0);
          setUsageStats({ totalMinutes });
        }
        const { data: wallet } = await supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle();
        if (wallet) setWalletBalance(wallet.balance);
        const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true })
          .or(`user_id.eq.${user.id},user_id.is.null`).eq("is_read", false);
        setUnreadCount(count || 0);
      } catch (error) { console.error(error); } finally { setIsLoading(false); }
    };
    fetchData();
  }, [user]);

  const stages = [
    { id: "preparatory", name: "الإعدادية", icon: "📚", description: "الصفوف الإعدادية" },
    { id: "secondary", name: "الثانوية", icon: "🎓", description: "الصفوف الثانوية" },
  ];
  const grades = [
    { id: "first", name: "الأول", icon: "1️⃣" },
    { id: "second", name: "الثاني", icon: "2️⃣" },
    { id: "third", name: "الثالث", icon: "3️⃣" },
  ];
  const sections = [
    { id: "scientific", name: "علمي", icon: "🔬", description: "رياضيات وفيزياء" },
    { id: "literary", name: "أدبي", icon: "📖", description: "تاريخ وجغرافيا" },
  ];

  const handleStageSelect = (stageId: string) => { setSelectedStage(stageId); setSelectedGrade(null); setSelectedSection(null); };
  const handleGradeSelect = async (gradeId: string) => {
    setSelectedGrade(gradeId);
    if (selectedStage === "preparatory") await saveOnboarding(selectedStage, gradeId, null);
    else setSelectedSection(null);
  };
  const handleSectionSelect = async (sectionId: string) => {
    setSelectedSection(sectionId);
    if (selectedStage && selectedGrade) await saveOnboarding(selectedStage, selectedGrade, sectionId);
  };

  const saveOnboarding = async (stage: string, grade: string, section: string | null) => {
    if (!user) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from("profiles").update({ stage, grade, section: section || null }).eq("id", user.id);
      if (error) { toast({ title: "خطأ", description: "حدث خطأ أثناء حفظ البيانات", variant: "destructive" }); return; }
      setProfileData(prev => prev ? { ...prev, stage, grade, section } : null);
      setNeedsOnboarding(false);
      toast({ title: "تم الحفظ", description: "تم حفظ بياناتك بنجاح" });
    } catch (error) { console.error(error); } finally { setIsSaving(false); }
  };

  const handleBack = () => {
    if (selectedSection) setSelectedSection(null);
    else if (selectedGrade) setSelectedGrade(null);
    else if (selectedStage) setSelectedStage(null);
  };

  const handleCategoryClick = (cat: CategoryButton) => {
    if (!profileData?.stage || !profileData?.grade) return;
    const base = `stage=${profileData.stage}&grade=${profileData.grade}${profileData.section ? `&section=${profileData.section}` : ""}`;
    
    if (cat.hasSubjects) {
      // Navigate to intermediate page for scientific/literary/science categories
      navigate(`/category-subjects?${base}&category=${cat.id}`);
    } else {
      navigate(`/subjects?${base}&category=${cat.id}`);
    }
  };

  const formatTime = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}س ${minutes}د` : `${minutes}د`;
  };

  const categoryButtons = profileData?.stage ? getCategoryButtons(profileData.stage, profileData.section) : [];

  const headerActions = (
    <div className="flex items-center gap-1.5">
      <button onClick={() => navigate("/wallet")}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-l from-amber-500/15 to-yellow-500/15 border border-amber-200/50 hover:border-amber-300 transition-all">
        <Wallet className="h-3.5 w-3.5 text-amber-600" />
        <span className="text-[11px] font-bold text-amber-700">{walletBalance.toFixed(0)} ج</span>
      </button>
      <button onClick={() => navigate("/notifications")}
        className="relative p-2 rounded-full hover:bg-accent transition-colors">
        <Bell className="h-4 w-4 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
    </div>
  );

  if (isLoading) {
    return (
      <StudentLayout title="الرئيسية" headerActions={headerActions}>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout title="الرئيسية" headerActions={headerActions}>
      <div className="px-4 pt-3 pb-20 lg:pb-4 space-y-4">

        {/* Banner placeholder */}
        <div className="h-1" />

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 p-3.5 text-white shadow-lg shadow-blue-200/50">
              <div className="absolute top-0 left-0 w-16 h-16 bg-white/10 rounded-full -translate-x-4 -translate-y-4" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-sm">
                    <User className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-[10px] font-medium text-white/80">كود الطالب</span>
                </div>
                <p className="text-lg font-black tracking-wider">{profileData?.student_code || "---"}</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 p-3.5 text-white shadow-lg shadow-violet-200/50">
              <div className="absolute top-0 left-0 w-16 h-16 bg-white/10 rounded-full -translate-x-4 -translate-y-4" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-sm">
                    <Clock className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-[10px] font-medium text-white/80">وقت التعلم</span>
                </div>
                <p className="text-lg font-black">{formatTime(usageStats.totalMinutes)}</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Category Grid - 2 columns */}
        {!needsOnboarding && profileData?.stage && profileData?.grade && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
              <h2 className="text-sm font-bold text-foreground">أقسام المواد</h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {categoryButtons.map((cat, i) => {
                const Icon = cat.icon;
                return (
                  <motion.button
                    key={cat.id}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.18 + i * 0.06, type: "spring", stiffness: 200 }}
                    onClick={() => handleCategoryClick(cat)}
                    className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${cat.gradient} p-5 flex flex-col items-center justify-center gap-1.5
                      ${cat.shadow} shadow-md hover:shadow-xl active:scale-[0.96] transition-all duration-300 min-h-[110px]`}
                  >
                    {/* Decorative shapes */}
                    <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -translate-y-6 translate-x-6" />
                    <div className="absolute bottom-0 left-0 w-10 h-10 bg-white/5 rounded-full translate-y-4 -translate-x-4" />
                    <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors duration-300" />
                    
                    {/* Centered large emoji - replaces old icon */}
                    <span className="text-4xl relative drop-shadow-md">{cat.emoji}</span>
                    
                    <span className="text-[13px] font-bold text-white drop-shadow-sm relative">{cat.name}</span>
                    {cat.hasSubjects && (
                      <span className="text-[9px] text-white/60 font-medium relative -mt-0.5">اضغط لاختيار المادة</span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Onboarding */}
        <AnimatePresence mode="wait">
          {needsOnboarding && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-lg mx-auto"
            >
              <div className="flex items-center justify-center gap-2 mb-5">
                {[
                  { num: "١", active: !selectedStage, done: !!selectedStage },
                  { num: "٢", active: !!selectedStage && !selectedGrade, done: !!selectedGrade },
                  ...(selectedStage === "secondary"
                    ? [{ num: "٣", active: !!selectedGrade && !selectedSection, done: !!selectedSection }]
                    : []),
                ].map((step, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    {idx > 0 && <div className={`w-8 h-0.5 rounded-full transition-all ${step.done || step.active ? 'bg-primary' : 'bg-muted'}`} />}
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold transition-all duration-300
                      ${step.active ? 'bg-primary text-primary-foreground shadow-lg scale-110' : step.done ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {step.num}
                    </div>
                  </div>
                ))}
              </div>

              {(selectedStage || selectedGrade || selectedSection) && (
                <Button variant="ghost" size="sm" className="mb-3 gap-1.5" onClick={handleBack} disabled={isSaving}>
                  <ChevronRight className="h-4 w-4" /> رجوع
                </Button>
              )}

              {!selectedStage && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="text-center mb-5">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground mb-3 shadow-lg shadow-primary/30">
                      <GraduationCap className="h-7 w-7" />
                    </div>
                    <h2 className="text-base font-bold text-foreground">اختر مرحلتك الدراسية</h2>
                    <p className="text-muted-foreground text-xs mt-1">حدد المرحلة لعرض المواد المناسبة</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {stages.map((stage) => (
                      <motion.button
                        key={stage.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handleStageSelect(stage.id)}
                        className="bg-card border-2 border-border hover:border-primary/40 rounded-2xl p-4 text-center transition-all hover:shadow-lg"
                      >
                        <div className="text-3xl mb-2">{stage.icon}</div>
                        <h3 className="text-sm font-bold text-foreground">{stage.name}</h3>
                        <p className="text-muted-foreground text-[10px] mt-0.5">{stage.description}</p>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              {selectedStage && !selectedGrade && (
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                  <div className="text-center mb-4">
                    <h2 className="text-base font-bold text-foreground">اختر الصف</h2>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5">
                    {grades.map((grade) => (
                      <motion.button
                        key={grade.id}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => handleGradeSelect(grade.id)}
                        className="bg-card border-2 border-border hover:border-primary/40 rounded-2xl p-3 text-center transition-all hover:shadow-lg"
                      >
                        <div className="text-2xl mb-1">{grade.icon}</div>
                        <h3 className="text-xs font-bold text-foreground">{grade.name}</h3>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              {selectedStage === "secondary" && selectedGrade && !selectedSection && (
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                  <div className="text-center mb-4">
                    <h2 className="text-base font-bold text-foreground">اختر القسم</h2>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {sections.map((sec) => (
                      <motion.button
                        key={sec.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handleSectionSelect(sec.id)}
                        className="bg-card border-2 border-border hover:border-primary/40 rounded-2xl p-4 text-center transition-all hover:shadow-lg"
                      >
                        <div className="text-3xl mb-2">{sec.icon}</div>
                        <h3 className="text-sm font-bold text-foreground">{sec.name}</h3>
                        <p className="text-muted-foreground text-[10px] mt-0.5">{sec.description}</p>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              {isSaving && (
                <div className="flex items-center justify-center py-6 gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">جاري الحفظ...</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </StudentLayout>
  );
};

export default Dashboard;

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import StudentLayout from "@/components/student/StudentLayout";
import AdsCarousel from "@/components/student/AdsCarousel";
import { useStudentAds } from "@/hooks/useStudentAds";
import {
  BACCALAUREATE_SECTION,
  isBaccalaureateScope,
  isLiteraryTrack,
  isMathSpecialty,
  isScienceSpecialty,
  isScientificTrack,
  normalizeSectionForSubjects,
} from "@/lib/educationSection";
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
  education_type: string | null;
}

interface UsageStats {
  totalMinutes: number;
}

interface DashboardTickerSettings {
  enabled: boolean;
  title: string;
  items: string[];
}

interface CategoryButton {
  id: string;
  name: string;
  icon: any;
  toneClass: string;
  emoji: string;
  subtitle?: string;
  hasSubjects?: boolean;
}

const getCategoryButtons = (stage: string, grade: string | null, section: string | null, educationType: string | null): CategoryButton[] => {
  const isAzhar = educationType === "أزهر";
  const isScientific = isScientificTrack(section);
  const isLiterary = isLiteraryTrack(section);
  
  if (stage === "preparatory") {
    const cats: CategoryButton[] = [
      { id: "arabic", name: "العربية", icon: BookText, toneClass: "dashboard-category-arabic", emoji: "📖" },
    ];
    if (isAzhar) {
      cats.push({ id: "religious", name: "الشرعية", icon: BookMarked, toneClass: "dashboard-category-religious", emoji: "🕌" });
    }
    cats.push(
      { id: "science", name: "العلوم", icon: Beaker, toneClass: "dashboard-category-science", emoji: "🔬" },
      { id: "math", name: "الرياضيات", icon: Atom, toneClass: "dashboard-category-science", emoji: "📐" },
      { id: "english", name: "English", icon: Languages, toneClass: "dashboard-category-english", emoji: "🇬🇧" },
        { id: "social", name: "الدراسات", icon: Globe, toneClass: "dashboard-category-social", emoji: "🌍" },
    );
    return cats;
  }
  
  if (stage === "secondary") {
    // General first secondary: no sections → flat list (integrated science + standalone math)
    if (!isAzhar && grade === "first") {
      return [
        { id: "arabic", name: "العربية", icon: BookText, toneClass: "dashboard-category-arabic", emoji: "📖" },
        { id: "science", name: "العلوم المتكاملة", icon: Atom, toneClass: "dashboard-category-science", emoji: "⚛️" },
        { id: "math", name: "الرياضيات", icon: Palette, toneClass: "dashboard-category-science", emoji: "📐" },
        { id: "english", name: "English", icon: Languages, toneClass: "dashboard-category-english", emoji: "🇬🇧" },
      ];
    }
    if (isAzhar) {
      // Azhar literary → no scientific category, show التاريخ والجغرافيا + الرياضيات.
      if (isLiterary) {
        return [
          { id: "arabic", name: "العربية", icon: BookText, toneClass: "dashboard-category-arabic", emoji: "📖" },
          { id: "religious", name: "الشرعية", icon: BookMarked, toneClass: "dashboard-category-religious", emoji: "🕌" },
          { id: "history_geo", name: "التاريخ والجغرافيا", icon: Globe, toneClass: "dashboard-category-social", emoji: "🗺️", subtitle: "اضغط لاختيار المادة", hasSubjects: true },
          { id: "math", name: "الرياضيات", icon: Palette, toneClass: "dashboard-category-science", emoji: "📐" },
          { id: "english", name: "English", icon: Languages, toneClass: "dashboard-category-english", emoji: "🇬🇧" },
        ];
      }
      // Azhar scientific (or section unset) → keep العلمية group.
      return [
        { id: "arabic", name: "العربية", icon: BookText, toneClass: "dashboard-category-arabic", emoji: "📖" },
        { id: "religious", name: "الشرعية", icon: BookMarked, toneClass: "dashboard-category-religious", emoji: "🕌" },
        { id: "scientific", name: "العلمية", icon: Atom, toneClass: "dashboard-category-science", emoji: "⚛️", subtitle: "اضغط لاختيار المادة", hasSubjects: true },
        { id: "english", name: "English", icon: Languages, toneClass: "dashboard-category-english", emoji: "🇬🇧" },
      ];
    }
    // عام students - section-based (second & third secondary)
    if (isScientific) {
      return [
        { id: "arabic", name: "العربية", icon: BookText, toneClass: "dashboard-category-arabic", emoji: "📖" },
        { id: "scientific", name: "العلمية", icon: Atom, toneClass: "dashboard-category-science", emoji: "⚛️", subtitle: "اضغط لاختيار المادة", hasSubjects: true },
        { id: "english", name: "English", icon: Languages, toneClass: "dashboard-category-english", emoji: "🇬🇧" },
      ];
    }
    if (isLiterary) {
      return [
        { id: "arabic", name: "العربية", icon: BookText, toneClass: "dashboard-category-arabic", emoji: "📖" },
        { id: "history_geo", name: "التاريخ والجغرافيا", icon: Globe, toneClass: "dashboard-category-social", emoji: "🗺️", subtitle: "اضغط لاختيار المادة", hasSubjects: true },
        { id: "math", name: "الرياضيات", icon: Palette, toneClass: "dashboard-category-science", emoji: "📐" },
        { id: "english", name: "English", icon: Languages, toneClass: "dashboard-category-english", emoji: "🇬🇧" },
      ];
    }
  }
  
  return [
    { id: "arabic", name: "العربية", icon: BookText, toneClass: "dashboard-category-arabic", emoji: "📖" },
    { id: "religious", name: "الشرعية", icon: BookMarked, toneClass: "dashboard-category-religious", emoji: "🕌" },
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
  const [selectedSpecialty, setSelectedSpecialty] = useState<string | null>(null);
  const [tickerSettings, setTickerSettings] = useState<DashboardTickerSettings>({ enabled: false, title: "", items: [] });

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      try {
        const { data: profile } = await supabase.from("profiles").select("full_name, student_code, stage, grade, section, avatar_url, education_type").eq("id", user.id).maybeSingle();
        if (profile) {
          // Redirect if education type not selected yet
          if (!(profile as any).education_type) {
            navigate("/select-education-type", { replace: true });
            return;
          }
          setProfileData(profile);
          const isAzharSecondary = profile.stage === "secondary" && profile.education_type === "أزهر";
          const isGeneralSecondary = profile.stage === "secondary" && profile.education_type === "عام";
          // نظام البكالوريا: الصف الثاني الثانوي (عام) بدون شعبة — يُسجّل تلقائيًا كعلمي.
          const isBaccalaureate = isBaccalaureateScope({
            stage: profile.stage,
            grade: profile.grade,
            educationType: profile.education_type,
          });
          if (isBaccalaureate && profile.section !== BACCALAUREATE_SECTION) {
            await supabase.from("profiles").update({ section: BACCALAUREATE_SECTION }).eq("id", user.id);
            profile.section = BACCALAUREATE_SECTION;
            setProfileData({ ...profile });
          }
          // Azhar secondary needs section (علمي/أدبي) for all grades.
          const needsAzharSection = isAzharSecondary && !profile.section;
          // General secondary: 1st grade needs nothing extra (no sections). 2nd grade = بكالوريا (auto).
          // 3rd grade scientific needs specialty (علمي علوم / علمي رياضة).
          const needsGeneralSection = isGeneralSecondary && profile.grade !== "first" && !isBaccalaureate && !profile.section;
          const needsGeneralSpecialty = isGeneralSecondary && profile.grade === "third"
            && isScientificTrack(profile.section) && !isScienceSpecialty(profile.section) && !isMathSpecialty(profile.section);
          setNeedsOnboarding(!profile.stage || !profile.grade || needsAzharSection || needsGeneralSection || needsGeneralSpecialty);
        }
        // Use video_progress for accurate watch time, fallback to usage_logs
        const [{ data: vpData }, { data: usageLogs }] = await Promise.all([
          supabase.from("video_progress").select("progress_seconds").eq("user_id", user.id),
          supabase.from("usage_logs").select("duration_minutes").eq("user_id", user.id),
        ]);
        const vpMinutes = vpData ? Math.round(vpData.reduce((sum, v) => sum + (v.progress_seconds || 0), 0) / 60) : 0;
        const logMinutes = usageLogs ? usageLogs.reduce((sum, log) => sum + (log.duration_minutes || 0), 0) : 0;
        setUsageStats({ totalMinutes: Math.max(vpMinutes, logMinutes) });
        const { data: wallet } = await supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle();
        if (wallet) setWalletBalance(wallet.balance);
        const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true })
          .or(`user_id.eq.${user.id},user_id.is.null`).eq("is_read", false);
        setUnreadCount(count || 0);

        const { data: tickerData } = await supabase
          .from("platform_settings")
          .select("key, value")
          .in("key", ["student_dashboard_ticker_enabled", "student_dashboard_ticker_text", "student_dashboard_ticker_items"]);

        if (tickerData) {
          const settingMap = Object.fromEntries(tickerData.map((item) => [item.key, item.value || ""]));
          let items: string[] = [];

          try {
            const parsed = JSON.parse(settingMap.student_dashboard_ticker_items || "[]");
            if (Array.isArray(parsed)) items = parsed.map((item) => String(item).trim()).filter(Boolean);
          } catch {
            items = [];
          }

          setTickerSettings({
            enabled: settingMap.student_dashboard_ticker_enabled === "true",
            title: (settingMap.student_dashboard_ticker_text || "").trim(),
            items,
          });
        }
      } catch (error) { console.error(error); } finally { setIsLoading(false); }
    };
    fetchData();
  }, [user, navigate]);

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
    { id: "scientific", name: "علمي", icon: "🔬" },
    { id: "literary", name: "أدبي", icon: "📖" },
  ];
  const specialtyOptions = [
    { id: "علمي علوم", name: "علمي علوم", icon: "🧪" },
    { id: "علمي رياضة", name: "علمي رياضة", icon: "📐" },
  ];

  const handleStageSelect = (stageId: string) => {
    setSelectedStage(stageId);
    setSelectedGrade(null);
    setSelectedSection(null);
    setSelectedSpecialty(null);
  };
  const handleGradeSelect = async (gradeId: string) => {
    setSelectedGrade(gradeId);
    setSelectedSection(null);
    setSelectedSpecialty(null);
    // Preparatory students never need section.
    if (selectedStage === "preparatory") {
      await saveOnboarding(selectedStage!, gradeId, null);
      return;
    }
    // General first secondary: no sections at all — save directly.
    if (selectedStage === "secondary" && gradeId === "first" && profileData?.education_type === "عام") {
      await saveOnboarding(selectedStage, gradeId, null);
      return;
    }
    // نظام البكالوريا: الصف الثاني الثانوي (عام) — تسجيل تلقائي على المسار العلمي.
    if (isBaccalaureateScope({ stage: selectedStage, grade: gradeId, educationType: profileData?.education_type })) {
      await saveOnboarding(selectedStage!, gradeId, BACCALAUREATE_SECTION);
    }
  };
  const handleSectionSelect = async (sectionId: string) => {
    setSelectedSection(sectionId);

    if (!selectedStage || !selectedGrade) return;

    // Only عام + علمي + الصف الثالث الثانوي needs the specialty step (علوم vs رياضة).
    if (
      sectionId === "scientific"
      && profileData?.education_type === "عام"
      && selectedGrade === "third"
    ) {
      setSelectedSpecialty(null);
      return;
    }

    // Otherwise (Azhar any grade, عام + أدبي, عام scientific 2nd grade) → save directly.
    const sectionLabel = sectionId === "scientific" ? "علمي" : "أدبي";
    await saveOnboarding(selectedStage, selectedGrade, sectionLabel);
  };
  const handleSpecialtySelect = async (specialtyId: string) => {
    setSelectedSpecialty(specialtyId);

    if (selectedStage && selectedGrade) {
      await saveOnboarding(selectedStage, selectedGrade, specialtyId);
    }
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
    if (selectedSpecialty) setSelectedSpecialty(null);
    else if (selectedSection) {
      setSelectedSection(null);
      setSelectedSpecialty(null);
    }
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

  const categoryButtons = profileData?.stage ? getCategoryButtons(profileData.stage, profileData.grade, profileData.section, profileData.education_type) : [];
  const tickerEntries = useMemo(() => {
    if (!tickerSettings.enabled) return [];
    return [tickerSettings.title, ...tickerSettings.items].map((item) => item.trim()).filter(Boolean);
  }, [tickerSettings]);
  // Section step: Azhar secondary (all grades) + general secondary 2nd/3rd grade. NOT general 1st secondary.
  const isSecondaryOnboarding = selectedStage === "secondary";
  const isGeneralSecondaryOnboarding = isSecondaryOnboarding && profileData?.education_type === "عام";
  const isAzharSecondaryOnboarding = isSecondaryOnboarding && profileData?.education_type === "أزهر";
  const isBaccalaureateOnboarding = isBaccalaureateScope({
    stage: selectedStage,
    grade: selectedGrade,
    educationType: profileData?.education_type,
  });
  const showSectionStep = isSecondaryOnboarding
    && !isBaccalaureateOnboarding
    && !(isGeneralSecondaryOnboarding && selectedGrade === "first");
  // Specialty step: ONLY general 3rd secondary scientific.
  const showSpecialtyStep = isGeneralSecondaryOnboarding && selectedGrade === "third" && selectedSection === "scientific";

  const headerActions = (
    <div className="flex items-center gap-1.5">
      <button onClick={() => navigate("/wallet")}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all"
        style={{ backgroundColor: "rgba(22,163,74,0.10)", border: "1px solid rgba(22,163,74,0.35)" }}>
        <Wallet className="h-3.5 w-3.5" style={{ color: "#16A34A" }} />
        <span className="text-[11px] font-bold" style={{ color: "#16A34A" }}>{walletBalance.toFixed(0)} ج</span>
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

        {/* Ads carousel OR stats cards */}
        <DashboardTopArea
          profileData={profileData}
          usageStats={usageStats}
          formatTime={formatTime}
          navigate={navigate}
        />



        {!needsOnboarding && profileData?.stage && profileData?.grade && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/8">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <h2 className="text-2xl font-black text-foreground">أقسام المواد</h2>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-[14px]">
              {/* Modrek AI card — same size/style as category cards */}
              <motion.button
                initial={{ opacity: 0, scale: 0.88 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.16, type: "spring", stiffness: 210, damping: 18 }}
                onClick={() => navigate("/ai")}
                className="dashboard-category-ai dashboard-category-ai-glow shadow-dashboard-soft group relative h-[130px] overflow-hidden rounded-[20px] p-4 text-white transition-all duration-300 hover:-translate-y-1 active:scale-[0.97]"
              >
                <div className="absolute left-0 top-0 h-24 w-24 rounded-full bg-white/10 -translate-x-8 -translate-y-7" />
                <div className="absolute bottom-0 right-0 h-20 w-20 rounded-full bg-white/10 translate-x-6 translate-y-6" />
                <span className="absolute top-2 left-2 text-[9px] font-black px-2 py-0.5 rounded-full bg-white text-primary shadow-sm">
                  جديد
                </span>
                <div className="relative flex h-full flex-col items-center justify-center gap-1 text-center">
                  <img
                    src={new URL("@/assets/modrek-ai-mascot.png", import.meta.url).toString()}
                    alt=""
                    className="h-[54px] w-[54px] object-contain drop-shadow-md"
                    loading="lazy"
                  />
                  <span className="text-base font-bold drop-shadow-sm">Modrek AI</span>
                  <span className="text-[11px] text-white/85">المساعد الذكي</span>
                </div>
              </motion.button>

              {categoryButtons.map((cat, i) => (
                <motion.button
                  key={cat.id}
                  initial={{ opacity: 0, scale: 0.88 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.22 + i * 0.06, type: "spring", stiffness: 210, damping: 18 }}
                  onClick={() => handleCategoryClick(cat)}
                  className={`${cat.toneClass} shadow-dashboard-soft group relative h-[130px] overflow-hidden rounded-[20px] p-4 text-white transition-all duration-300 hover:-translate-y-1 active:scale-[0.97]`}
                >
                  <div className="absolute left-0 top-0 h-24 w-24 rounded-full bg-white/10 -translate-x-8 -translate-y-7" />
                  <div className="absolute bottom-0 right-0 h-20 w-20 rounded-full bg-white/10 translate-x-6 translate-y-6" />
                  <div className="relative flex h-full flex-col items-center justify-center gap-2 text-center">
                    {cat.id === "english" ? (
                      <span className="text-[44px] leading-none drop-shadow-sm">🇬🇧</span>
                    ) : cat.id === "scientific" ? (
                      <span className="text-[44px] leading-none drop-shadow-sm">⚛️</span>
                    ) : (
                      <span className="text-[44px] leading-none drop-shadow-sm">{cat.emoji}</span>
                    )}
                    <span className="text-base font-semibold drop-shadow-sm">{cat.name}</span>
                    {cat.subtitle && <span className="text-xs text-white/75">{cat.subtitle}</span>}
                  </div>
                </motion.button>
              ))}
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
                  ...(showSectionStep
                    ? [{ num: "٣", active: !!selectedGrade && !selectedSection, done: !!selectedSection }]
                    : []),
                  ...(showSpecialtyStep
                    ? [{ num: "٤", active: !!selectedSection && !selectedSpecialty, done: !!selectedSpecialty }]
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

              {showSectionStep && selectedGrade && !selectedSection && (
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
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              {showSpecialtyStep && !selectedSpecialty && (
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                  <div className="text-center mb-4">
                    <h2 className="text-base font-bold text-foreground">اختر الشعبة</h2>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {specialtyOptions.map((specialty) => (
                      <motion.button
                        key={specialty.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handleSpecialtySelect(specialty.id)}
                        className="bg-card border-2 border-border hover:border-primary/40 rounded-2xl p-4 text-center transition-all hover:shadow-lg"
                      >
                        <div className="text-3xl mb-2">{specialty.icon}</div>
                        <h3 className="text-sm font-bold text-foreground">{specialty.name}</h3>
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

// ===================== Top area: Ads carousel OR stats cards =====================
function DashboardTopArea({ profileData, usageStats, formatTime, navigate }: any) {
  const { ads, settings } = useStudentAds(profileData);
  const showBundlesInSlider = settings.bundles_button_placement === "ad_slider";
  const showBundlesBanner = settings.bundles_button_placement === "homepage_banner";
  const hasAds = ads.length > 0 || showBundlesInSlider;

  return (
    <div className="space-y-3">
      {hasAds ? (
        <AdsCarousel
          ads={ads}
          showBundlesSlide={showBundlesInSlider}
          onBundlesClick={() => navigate("/student/bundles")}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <div className="dashboard-stat-code shadow-dashboard-soft relative h-[110px] overflow-hidden rounded-[20px] p-4 text-white">
              <div className="absolute left-0 top-0 h-20 w-20 rounded-full bg-white/10 -translate-x-6 -translate-y-5" />
              <div className="absolute bottom-0 right-0 h-16 w-16 rounded-full bg-white/10 translate-x-5 translate-y-5" />
              <div className="relative flex h-full flex-col justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/18 backdrop-blur-sm">
                    <User className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium text-white/85">كود الطالب</span>
                </div>
                <p className="text-[2rem] font-black tracking-wider leading-none">{profileData?.student_code || "---"}</p>
              </div>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="dashboard-stat-study shadow-dashboard-soft relative h-[110px] overflow-hidden rounded-[20px] p-4 text-white">
              <div className="absolute left-0 top-0 h-20 w-20 rounded-full bg-white/10 -translate-x-6 -translate-y-5" />
              <div className="absolute bottom-0 right-0 h-16 w-16 rounded-full bg-white/10 translate-x-5 translate-y-5" />
              <div className="relative flex h-full flex-col justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/18 backdrop-blur-sm">
                    <Clock className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium text-white/85">وقت التعلم</span>
                </div>
                <p className="text-[2rem] font-black leading-none">{formatTime(usageStats.totalMinutes)}</p>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {showBundlesBanner && (
        <button
          onClick={() => navigate("/student/bundles")}
          className="relative w-full overflow-hidden rounded-[20px] p-4 text-white shadow-dashboard-soft bg-gradient-to-l from-purple-600 via-fuchsia-500 to-pink-500 active:scale-[0.98] transition-transform"
        >
          <div className="absolute -left-6 -top-5 h-20 w-20 rounded-full bg-white/15" />
          <div className="absolute -right-4 -bottom-6 h-24 w-24 rounded-full bg-white/10" />
          <div className="relative flex items-center justify-between">
            <div className="text-right">
              <p className="text-xs font-medium text-white/85">عروض خاصة</p>
              <p className="text-base font-black">الباقات المخفضة 🎁</p>
              <p className="text-[11px] text-white/80 mt-0.5">اشترك في عدة مواد بسعر مخفّض</p>
            </div>
            <ChevronRight className="h-5 w-5 rotate-180" />
          </div>
        </button>
      )}
    </div>
  );
}
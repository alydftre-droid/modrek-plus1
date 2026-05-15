import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import {
  BookOpen, ChevronLeft, GraduationCap, User, Settings, LogOut, Upload,
  BookText, BookMarked, Beaker, Globe, Languages, Atom, Palette, Loader2,
} from "lucide-react";

type CategoryButton = {
  id: string;
  name: string;
  icon: typeof BookText;
  gradient: string;
  emoji: string;
  navigateToPicker?: boolean;
};

const CAT_ARABIC: CategoryButton = { id: "arabic", name: "المواد العربية", icon: BookText, gradient: "linear-gradient(135deg, hsl(160 84% 39%), hsl(173 80% 30%))", emoji: "📖" };
const CAT_RELIGIOUS: CategoryButton = { id: "religious", name: "المواد الشرعية", icon: BookMarked, gradient: "linear-gradient(135deg, hsl(38 92% 50%), hsl(24 95% 45%))", emoji: "🕌" };
const CAT_SCIENCE: CategoryButton = { id: "science", name: "العلوم", icon: Beaker, gradient: "linear-gradient(135deg, hsl(217 91% 55%), hsl(239 84% 47%))", emoji: "🔬", navigateToPicker: true };
const CAT_SOCIAL: CategoryButton = { id: "social", name: "الدراسات", icon: Globe, gradient: "linear-gradient(135deg, hsl(271 81% 56%), hsl(258 90% 50%))", emoji: "🌍", navigateToPicker: true };
const CAT_ENGLISH: CategoryButton = { id: "english", name: "الإنجليزية", icon: Languages, gradient: "linear-gradient(135deg, hsl(346 87% 55%), hsl(330 81% 50%))", emoji: "🇬🇧" };
const CAT_SCIENTIFIC: CategoryButton = { id: "scientific", name: "المواد العلمية", icon: Atom, gradient: "linear-gradient(135deg, hsl(189 94% 48%), hsl(217 91% 50%))", emoji: "⚛️", navigateToPicker: true };
const CAT_LITERARY: CategoryButton = { id: "literary", name: "المواد الأدبية", icon: Palette, gradient: "linear-gradient(135deg, hsl(239 84% 60%), hsl(271 81% 53%))", emoji: "🎨", navigateToPicker: true };
const CAT_FRENCH: CategoryButton = { id: "french", name: "الفرنسية", icon: Globe, gradient: "linear-gradient(135deg, hsl(199 89% 55%), hsl(217 91% 50%))", emoji: "🇫🇷" };

const getCategoryButtons = (stage: string): CategoryButton[] => {
  if (stage === "preparatory") {
    return [CAT_ARABIC, CAT_RELIGIOUS, CAT_SCIENCE, CAT_SOCIAL, CAT_ENGLISH];
  }
  if (stage === "secondary") {
    // Show all secondary categories - admin/teacher pick visibility on upload
    return [CAT_ARABIC, CAT_RELIGIOUS, CAT_SCIENTIFIC, CAT_LITERARY, CAT_ENGLISH, CAT_FRENCH];
  }
  return [];
};

const stageLabel = (s: string) => s === "preparatory" ? "المرحلة الإعدادية" : s === "secondary" ? "المرحلة الثانوية" : "";
const gradeLabel = (g: string) => g === "first" ? "الصف الأول" : g === "second" ? "الصف الثاني" : g === "third" ? "الصف الثالث" : "";

const AdminUploadBrowser = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [isLoading] = useState(false);

  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);

  const stages = [
    { id: "preparatory", name: "المرحلة الإعدادية", icon: "📚", description: "الصفوف الأول والثاني والثالث الإعدادي" },
    { id: "secondary", name: "المرحلة الثانوية", icon: "🎓", description: "الصفوف الأول والثاني والثالث الثانوي" },
  ];

  const grades = [
    { id: "first", name: "الصف الأول", numeral: "١", gradient: "linear-gradient(135deg, hsl(217 91% 55%), hsl(239 84% 47%))" },
    { id: "second", name: "الصف الثاني", numeral: "٢", gradient: "linear-gradient(135deg, hsl(160 84% 39%), hsl(173 80% 30%))" },
    { id: "third", name: "الصف الثالث", numeral: "٣", gradient: "linear-gradient(135deg, hsl(271 81% 56%), hsl(258 90% 50%))" },
  ];

  const handleCategoryClick = (cat: CategoryButton) => {
    if (!selectedStage || !selectedGrade) return;
    if (cat.navigateToPicker) {
      navigate(`/admin/upload/category-subjects?stage=${selectedStage}&grade=${selectedGrade}&category=${cat.id}`);
    } else {
      navigate(`/admin/upload/content?stage=${selectedStage}&grade=${selectedGrade}&category=${cat.id}`);
    }
  };

  const handleBack = () => {
    if (selectedGrade) setSelectedGrade(null);
    else if (selectedStage) setSelectedStage(null);
    else navigate("/admin");
  };

  const handleSignOut = async () => { await signOut(); navigate("/"); };

  const categoryButtons = selectedStage && selectedGrade ? getCategoryButtons(selectedStage) : [];
  const showCategories = selectedStage && selectedGrade;

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  let subtitle = "";
  if (selectedStage) subtitle += stageLabel(selectedStage);
  if (selectedGrade) subtitle += ` - ${gradeLabel(selectedGrade)}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-14 sm:h-16 items-center justify-between px-3 sm:px-4 gap-2">
          <Link to="/admin" className="flex items-center gap-2 sm:gap-3 group min-w-0">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl gradient-mudrik shadow-lg shadow-primary/20">
              <BookOpen className="h-4 w-4 sm:h-5 sm:w-5 text-primary-foreground" />
            </div>
            <span className="text-sm sm:text-xl font-bold text-gradient-mudrik truncate">مدرك Plus</span>
          </Link>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
              <Upload className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">وضع الرفع</span>
            </div>
            <Button variant="ghost" size="icon" className="h-9 w-9"><Settings className="h-5 w-5" /></Button>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent">
              <User className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">أدمن</span>
            </div>
            <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-destructive/10 hover:text-destructive" onClick={handleSignOut}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container px-3 sm:px-4 py-4 sm:py-8 max-w-5xl">
        <Button variant="ghost" size="sm" className="mb-3 sm:mb-6" onClick={handleBack}>
          <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />
          {!selectedStage ? "رجوع للوحة التحكم" : "رجوع"}
        </Button>

        <Card className="mb-5 sm:mb-8 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/20">
          <CardContent className="p-4 sm:p-6 flex items-center gap-3 sm:gap-4">
            <div className="p-3 sm:p-4 rounded-2xl bg-primary/10 shrink-0">
              <Upload className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base sm:text-lg text-foreground">وضع رفع المحتوى</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {!selectedStage && "اختر المرحلة الدراسية للبدء"}
                {selectedStage && !selectedGrade && "اختر الصف الدراسي"}
                {showCategories && "اختر قسم المواد لإدارة المحتوى"}
              </p>
              {subtitle && <p className="text-xs sm:text-sm text-primary mt-1 font-medium">{subtitle}</p>}
            </div>
          </CardContent>
        </Card>

        {/* المرحلة */}
        {!selectedStage && (
          <div className="animate-fade-in">
            <h2 className="text-xl sm:text-3xl font-bold mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-xl bg-primary/10">
                <GraduationCap className="h-5 w-5 sm:h-8 sm:w-8 text-primary" />
              </div>
              اختر المرحلة الدراسية
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {stages.map((stage) => (
                <Card key={stage.id} className="cursor-pointer border-2 border-transparent hover:border-primary/30 hover:shadow-2xl transition-all duration-300 group hover:-translate-y-1" onClick={() => { setSelectedStage(stage.id); setSelectedGrade(null); }}>
                  <CardContent className="p-6 sm:p-10 text-center">
                    <div className="text-5xl sm:text-7xl mb-4 sm:mb-6 transform group-hover:scale-110 transition-transform">{stage.icon}</div>
                    <h3 className="text-xl sm:text-2xl font-bold mb-2 group-hover:text-primary transition-colors">{stage.name}</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">{stage.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* الصف */}
        {selectedStage && !selectedGrade && (
          <div className="animate-fade-in">
            <h2 className="text-xl sm:text-3xl font-bold mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-xl bg-primary/10">
                <BookOpen className="h-5 w-5 sm:h-8 sm:w-8 text-primary" />
              </div>
              اختر الصف الدراسي
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-5">
              {grades.map((grade, i) => (
                <motion.button
                  key={grade.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07, type: "spring", stiffness: 200 }}
                  onClick={() => setSelectedGrade(grade.id)}
                  style={{ background: grade.gradient }}
                  className="relative overflow-hidden rounded-2xl p-5 sm:p-7 flex flex-col items-center gap-3 shadow-lg hover:shadow-2xl active:scale-[0.96] transition-all duration-300 min-h-[150px] sm:min-h-[180px] justify-center"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-8 translate-x-8" />
                  <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-full translate-y-6 -translate-x-6" />
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/25 backdrop-blur-sm flex items-center justify-center relative shadow-lg">
                    <span className="text-2xl sm:text-3xl font-bold text-white">{grade.numeral}</span>
                  </div>
                  <span className="text-base sm:text-lg font-bold text-white drop-shadow-sm relative">{grade.name}</span>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* أقسام المواد - بنفس شكل الطلاب */}
        {showCategories && (
          <div className="animate-fade-in">
            <div className="text-center mb-5">
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">أقسام المواد</h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">اختر القسم لإدارة المواد والمحتوى</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {categoryButtons.map((category, i) => {
                const Icon = category.icon;
                return (
                  <motion.button
                    key={category.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06, type: "spring", stiffness: 200 }}
                    onClick={() => handleCategoryClick(category)}
                    style={{ background: category.gradient }}
                    className="group relative overflow-hidden rounded-2xl p-4 flex flex-col items-center gap-2.5 shadow-lg hover:shadow-xl active:scale-[0.96] transition-all duration-300 min-h-[140px] justify-center"
                  >
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-6 translate-x-6" />
                    <div className="absolute bottom-0 left-0 w-12 h-12 bg-white/5 rounded-full translate-y-4 -translate-x-4" />
                    <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm relative">
                      <Icon className="h-6 w-6 text-white" strokeWidth={2.4} />
                    </div>
                    <span className="text-sm sm:text-base font-bold text-white drop-shadow-sm relative">{category.name}</span>
                    <span className="text-lg absolute top-2 left-2 opacity-30">{category.emoji}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminUploadBrowser;

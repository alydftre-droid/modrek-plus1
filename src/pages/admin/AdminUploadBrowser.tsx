import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import {
  BookOpen,
  ChevronLeft,
  GraduationCap,
  User,
  Settings,
  LogOut,
  Upload,
  BookText,
  BookMarked,
  Beaker,
  Globe,
  Languages,
  Atom,
  Palette,
  Loader2,
} from "lucide-react";

// أقسام المواد حسب المرحلة والشعبة
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

  if (stage === "secondary" && section === "both") {
    return [
      { id: "arabic", name: "المواد العربية", icon: BookText, gradient: "from-emerald-500 via-emerald-600 to-teal-700", shadow: "shadow-emerald-500/30" },
      { id: "religious", name: "المواد الشرعية", icon: BookMarked, gradient: "from-amber-500 via-amber-600 to-orange-700", shadow: "shadow-amber-500/30" },
      { id: "scientific", name: "المواد العلمية", icon: Atom, gradient: "from-cyan-500 via-cyan-600 to-blue-700", shadow: "shadow-cyan-500/30" },
      { id: "literary", name: "المواد الأدبية", icon: Palette, gradient: "from-indigo-500 via-indigo-600 to-purple-700", shadow: "shadow-indigo-500/30" },
      { id: "english", name: "الإنجليزية", icon: Languages, gradient: "from-rose-500 via-rose-600 to-pink-700", shadow: "shadow-rose-500/30" },
      { id: "french", name: "الفرنسية", icon: Globe, gradient: "from-sky-500 via-sky-600 to-blue-700", shadow: "shadow-sky-500/30" },
    ];
  }
  
  return [];
};

function stageLabel(stage: string) {
  if (stage === "preparatory") return "المرحلة الإعدادية";
  if (stage === "secondary") return "المرحلة الثانوية";
  return "";
}

function gradeLabel(grade: string) {
  if (grade === "first") return "الصف الأول";
  if (grade === "second") return "الصف الثاني";
  if (grade === "third") return "الصف الثالث";
  return "";
}

function sectionLabel(section: string) {
  if (section === "scientific") return "علمي";
  if (section === "literary") return "أدبي";
  if (section === "both") return "القسمين معًا";
  return "";
}

const AdminUploadBrowser = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [isLoading] = useState(false);
  
  // Selection state - fresh every time
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

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
    { id: "both", name: "الرفع في القسمين معًا", icon: "📚", description: "رفع المحتوى للقسمين العلمي والأدبي" },
  ];

  const handleStageSelect = (stageId: string) => {
    setSelectedStage(stageId);
    setSelectedGrade(null);
    setSelectedSection(null);
  };

  const handleGradeSelect = (gradeId: string) => {
    setSelectedGrade(gradeId);
    setSelectedSection(null);
  };

  const handleSectionSelect = (sectionId: string) => {
    setSelectedSection(sectionId);
  };

  const handleCategoryClick = (categoryId: string) => {
    if (!selectedStage || !selectedGrade) return;
    const sectionParam = selectedSection ? `&section=${selectedSection}` : "";
    navigate(`/admin/upload/content?stage=${selectedStage}&grade=${selectedGrade}${sectionParam}&category=${categoryId}`);
  };

  const handleBack = () => {
    if (selectedSection) {
      setSelectedSection(null);
    } else if (selectedGrade) {
      setSelectedGrade(null);
    } else if (selectedStage) {
      setSelectedStage(null);
    } else {
      navigate("/admin");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  // Get category buttons for current selection
  const categoryButtons = selectedStage && selectedGrade
    ? getCategoryButtons(selectedStage, selectedSection)
    : [];

  // Should show categories?
  const showCategories = selectedStage && selectedGrade && (selectedStage === "preparatory" || selectedSection);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // Build subtitle
  let subtitle = "";
  if (selectedStage) subtitle += stageLabel(selectedStage);
  if (selectedGrade) subtitle += ` - ${gradeLabel(selectedGrade)}`;
  if (selectedSection) subtitle += ` - ${sectionLabel(selectedSection)}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      {/* الهيدر */}
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between px-4">
          <Link to="/admin" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-azhari shadow-lg shadow-primary/20 group-hover:shadow-primary/40 transition-shadow">
              <BookOpen className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-gradient-azhari">مدرك Plus - رفع المحتوى</span>
          </Link>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
              <Upload className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">وضع الرفع</span>
            </div>

            <Button variant="ghost" size="icon" className="hover:bg-accent">
              <Settings className="h-5 w-5" />
            </Button>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent">
              <User className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">أدمن</span>
            </div>

            <Button variant="ghost" size="icon" onClick={handleSignOut} className="hover:bg-destructive/10 hover:text-destructive">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container px-4 py-8">
        {/* زر الرجوع */}
        <Button variant="ghost" className="mb-6 hover:bg-accent" onClick={handleBack}>
          <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />
          {!selectedStage ? "رجوع للوحة التحكم" : "رجوع"}
        </Button>

        {/* بانر التعليمات */}
        <Card className="mb-8 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/20">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-4 rounded-2xl bg-primary/10">
              <Upload className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-foreground">وضع رفع المحتوى</h3>
              <p className="text-muted-foreground">
                {!selectedStage && "اختر المرحلة الدراسية للبدء"}
                {selectedStage && !selectedGrade && "اختر الصف الدراسي"}
                {selectedStage === "secondary" && selectedGrade && !selectedSection && "اختر الشعبة"}
                {showCategories && "اختر قسم المواد لإدارة المحتوى"}
              </p>
              {subtitle && <p className="text-sm text-primary mt-1 font-medium">{subtitle}</p>}
            </div>
          </CardContent>
        </Card>

        {/* اختيار المرحلة */}
        {!selectedStage && (
          <div className="animate-fade-in">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-foreground mb-2 flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10">
                  <GraduationCap className="h-8 w-8 text-primary" />
                </div>
                اختر المرحلة الدراسية
              </h2>
              <p className="text-muted-foreground text-lg">جميع المراحل متاحة - بدون أي قيود</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl">
              {stages.map((stage) => (
                <Card
                  key={stage.id}
                  className="cursor-pointer border-2 border-transparent hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10 transition-all duration-300 group bg-card/50 backdrop-blur overflow-hidden hover:-translate-y-2"
                  onClick={() => handleStageSelect(stage.id)}
                >
                  <CardContent className="p-10 text-center relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="text-7xl mb-6 transform group-hover:scale-110 transition-transform">{stage.icon}</div>
                    <h3 className="text-2xl font-bold text-foreground mb-3 group-hover:text-primary transition-colors">{stage.name}</h3>
                    <p className="text-muted-foreground">{stage.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* اختيار الصف */}
        {selectedStage && !selectedGrade && (
          <div className="animate-fade-in">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-foreground mb-2 flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10">
                  <BookOpen className="h-8 w-8 text-primary" />
                </div>
                اختر الصف الدراسي
              </h2>
              <p className="text-muted-foreground text-lg">{stageLabel(selectedStage)}</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 max-w-4xl">
              {grades.map((grade) => (
                <Card
                  key={grade.id}
                  className="cursor-pointer border-2 border-transparent hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10 transition-all duration-300 group bg-card/50 backdrop-blur overflow-hidden hover:-translate-y-2"
                  onClick={() => handleGradeSelect(grade.id)}
                >
                  <CardContent className="p-8 text-center relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="mx-auto w-20 h-20 rounded-2xl gradient-azhari flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg">
                      <span className="text-3xl font-bold text-primary-foreground">
                        {grade.id === "first" ? "١" : grade.id === "second" ? "٢" : "٣"}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">{grade.name}</h3>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* اختيار الشعبة (للثانوية فقط) */}
        {selectedStage === "secondary" && selectedGrade && !selectedSection && (
          <div className="animate-fade-in">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-foreground mb-2 flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10">
                  <GraduationCap className="h-8 w-8 text-primary" />
                </div>
                اختر الشعبة
              </h2>
              <p className="text-muted-foreground text-lg">{stageLabel(selectedStage)} - {gradeLabel(selectedGrade)}</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 max-w-5xl">
              {sections.map((section) => (
                <Card
                  key={section.id}
                  className="cursor-pointer border-2 border-transparent hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10 transition-all duration-300 group bg-card/50 backdrop-blur overflow-hidden hover:-translate-y-2"
                  onClick={() => handleSectionSelect(section.id)}
                >
                  <CardContent className="p-10 text-center relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="text-6xl mb-6 transform group-hover:scale-110 transition-transform">{section.icon}</div>
                    <h3 className="text-2xl font-bold text-foreground mb-3 group-hover:text-primary transition-colors">{section.name}</h3>
                    <p className="text-muted-foreground">{section.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* عرض أقسام المواد */}
        {showCategories && (
          <div className="animate-fade-in">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-foreground mb-2 flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10">
                  <BookOpen className="h-8 w-8 text-primary" />
                </div>
                أقسام المواد
              </h2>
              <p className="text-muted-foreground text-lg">اختر القسم لإدارة المواد والمحتوى</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
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
                    <CardContent className="p-8 text-center relative">
                      <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg">
                        <IconComponent className="h-10 w-10" />
                      </div>
                      <h3 className="text-xl font-bold tracking-wide">{category.name}</h3>
                    </CardContent>
                  </Card>
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

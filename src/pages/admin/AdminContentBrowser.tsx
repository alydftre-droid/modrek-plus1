import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen,
  ChevronLeft,
  GraduationCap,
  User,
  Settings,
  LogOut,
  BookMarked,
  Loader2,
  Upload,
  ArrowRight,
} from "lucide-react";

const AdminContentBrowser = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  const stages = [
    { id: "preparatory", name: "المرحلة الإعدادية", icon: "📚" },
    { id: "secondary", name: "المرحلة الثانوية", icon: "🎓" },
  ];

  const grades = [
    { id: "first", name: "الصف الأول" },
    { id: "second", name: "الصف الثاني" },
    { id: "third", name: "الصف الثالث" },
  ];

  const sections = [
    { id: "scientific", name: "علمي", icon: "🔬" },
    { id: "literary", name: "أدبي", icon: "📖" },
  ];

  const handleStageSelect = (stageId: string) => {
    setSelectedStage(stageId);
    setSelectedGrade(null);
    setSelectedSection(null);
  };

  const handleGradeSelect = (gradeId: string) => {
    setSelectedGrade(gradeId);
    if (selectedStage === "preparatory") {
      navigate(`/admin/content-browser/subjects?stage=${selectedStage}&grade=${gradeId}`);
    } else {
      setSelectedSection(null);
    }
  };

  const handleSectionSelect = (sectionId: string) => {
    setSelectedSection(sectionId);
    navigate(`/admin/content-browser/subjects?stage=${selectedStage}&grade=${selectedGrade}&section=${sectionId}`);
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* الهيدر */}
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between px-4">
          <Link to="/admin" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-mudrik shadow-mudrik">
              <BookOpen className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-gradient-mudrik">مدرك Plus - لوحة الرفع</span>
          </Link>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
              <Upload className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">وضع الرفع</span>
            </div>

            <Button variant="ghost" size="icon">
              <Settings className="h-5 w-5" />
            </Button>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent">
              <User className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">أدمن</span>
            </div>

            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container px-4 py-8">
        {/* زر الرجوع */}
        <Button variant="ghost" className="mb-4" onClick={handleBack}>
          <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />
          {selectedStage ? "رجوع" : "رجوع للوحة التحكم"}
        </Button>

        {/* بانر التعليمات */}
        <Card className="mb-6 bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-primary/10">
              <Upload className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">وضع رفع المحتوى</h3>
              <p className="text-sm text-muted-foreground">
                اختر المرحلة والصف والمادة لرفع المحتوى (فيديوهات، كتب، ملخصات)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* اختيار المرحلة */}
        {!selectedStage && (
          <div className="animate-fade-in">
            <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
              <GraduationCap className="h-7 w-7 text-primary" />
              اختر المرحلة الدراسية
            </h2>

            <div className="grid md:grid-cols-2 gap-6">
              {stages.map((stage) => (
                <Card
                  key={stage.id}
                  className="cursor-pointer hover:border-primary hover:shadow-lg transition-all group"
                  onClick={() => handleStageSelect(stage.id)}
                >
                  <CardContent className="p-8 text-center">
                    <div className="text-5xl mb-4">{stage.icon}</div>
                    <h3 className="text-xl font-bold text-foreground mb-2">{stage.name}</h3>
                    <Button variant="outline" className="group-hover:bg-primary group-hover:text-primary-foreground">
                      اختيار <ChevronLeft className="h-4 w-4 mr-1" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* اختيار الصف */}
        {selectedStage && !selectedGrade && (
          <div className="animate-slide-right">
            <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
              <BookMarked className="h-7 w-7 text-primary" />
              اختر الصف الدراسي
            </h2>

            <div className="grid md:grid-cols-3 gap-6">
              {grades.map((grade) => (
                <Card
                  key={grade.id}
                  className="cursor-pointer hover:border-primary hover:shadow-lg transition-all group"
                  onClick={() => handleGradeSelect(grade.id)}
                >
                  <CardContent className="p-6 text-center">
                    <div className="mx-auto w-16 h-16 rounded-full gradient-mudrik flex items-center justify-center mb-4">
                      <span className="text-2xl font-bold text-primary-foreground">
                        {grade.id === "first" ? "١" : grade.id === "second" ? "٢" : "٣"}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-foreground">{grade.name}</h3>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* اختيار الشعبة (للثانوية فقط) */}
        {selectedStage === "secondary" && selectedGrade && !selectedSection && (
          <div className="animate-slide-right">
            <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
              <GraduationCap className="h-7 w-7 text-primary" />
              اختر الشعبة
            </h2>

            <div className="grid md:grid-cols-2 gap-6 max-w-2xl">
              {sections.map((section) => (
                <Card
                  key={section.id}
                  className="cursor-pointer hover:border-primary hover:shadow-lg transition-all group"
                  onClick={() => handleSectionSelect(section.id)}
                >
                  <CardContent className="p-8 text-center">
                    <div className="text-4xl mb-4">{section.icon}</div>
                    <h3 className="text-xl font-bold text-foreground">{section.name}</h3>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminContentBrowser;

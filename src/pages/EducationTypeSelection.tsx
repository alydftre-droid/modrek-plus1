import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { GraduationCap, BookOpen, Loader2, FlaskConical, Calculator, ChevronRight } from "lucide-react";
import mudrikLogo from "@/assets/mudrik-logo.png";

type Step = "education" | "section" | "specialty";

const EducationTypeSelection = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selected, setSelected] = useState<"أزهر" | "عام" | "">("");
  const [sectionType, setSectionType] = useState<"علمي" | "أدبي" | "">("");
  const [specialty, setSpecialty] = useState<"علمي علوم" | "علمي رياضة" | "">("");
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<Step>("education");

  // Check if user is secondary to show section selection
  const [profile, setProfile] = useState<any>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  useState(() => {
    if (user) {
      supabase
        .from("profiles")
        .select("stage, grade")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          setProfile(data);
          setProfileLoaded(true);
        });
    }
  });

  const isSecondary = profile?.stage === "secondary" || profile?.grade?.includes("ثانوي");

  // عام + ثانوي needs section (أدبي/علمي) then specialty if علمي
  const needsSectionStep = selected === "عام" && isSecondary;

  const handleContinue = async () => {
    if (!selected || !user) return;

    // Step through the flow for عام secondary students
    if (needsSectionStep && step === "education") {
      setStep("section");
      return;
    }

    if (needsSectionStep && step === "section") {
      if (!sectionType) {
        toast.error("اختر القسم الدراسي");
        return;
      }
      if (sectionType === "علمي") {
        setStep("specialty");
        return;
      }
      // أدبي - save directly with section = أدبي
    }

    if (needsSectionStep && step === "specialty") {
      if (!specialty) {
        toast.error("اختر الشعبة الدراسية");
        return;
      }
    }

    setSaving(true);
    try {
      const updateData: any = { education_type: selected };

      if (needsSectionStep) {
        if (sectionType === "أدبي") {
          updateData.section = "أدبي";
        } else if (sectionType === "علمي" && specialty) {
          updateData.section = specialty;
        }
      }

      const { error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", user.id);
      if (error) throw error;
      toast.success("تم حفظ اختيارك بنجاح");
      navigate("/dashboard", { replace: true });
    } catch {
      toast.error("حدث خطأ، حاول مرة أخرى");
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (step === "specialty") {
      setStep("section");
      setSpecialty("");
    } else if (step === "section") {
      setStep("education");
      setSectionType("");
      setSpecialty("");
    }
  };

  const educationOptions = [
    {
      value: "أزهر" as const,
      icon: BookOpen,
      title: "تعليم أزهري",
      description: "المناهج الأزهرية للمراحل الإعدادية والثانوية",
      gradient: "from-primary to-emerald-700",
    },
    {
      value: "عام" as const,
      icon: GraduationCap,
      title: "تعليم عام",
      description: "مناهج التربية والتعليم للمراحل الإعدادية والثانوية",
      gradient: "from-blue-600 to-blue-800",
    },
  ];

  const canProceed = () => {
    if (!selected) return false;
    if (step === "section" && !sectionType) return false;
    if (step === "specialty" && !specialty) return false;
    return true;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 pattern-islamic p-4">
      <div className="w-full max-w-lg">
        <div className="flex flex-col items-center gap-3 mb-8">
          <img src={mudrikLogo} alt="مدرك Plus" className="h-16 w-16 rounded-xl shadow-mudrik" />
          <h1 className="text-2xl font-bold text-gradient-mudrik">مدرك Plus</h1>
          <p className="text-muted-foreground text-center">
            {step === "education" && "اختر نوع التعليم الخاص بك"}
            {step === "section" && "اختر القسم الدراسي"}
            {step === "specialty" && "اختر الشعبة الدراسية"}
          </p>
        </div>

        {/* Back button for sub-steps */}
        {step !== "education" && (
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
            رجوع
          </button>
        )}

        {/* Step 1: Education Type */}
        {step === "education" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {educationOptions.map((opt) => (
              <Card
                key={opt.value}
                className={`cursor-pointer transition-all duration-300 hover:shadow-lg ${
                  selected === opt.value
                    ? "ring-2 ring-primary border-primary shadow-lg scale-[1.02]"
                    : "hover:border-primary/50"
                }`}
                onClick={() => {
                  setSelected(opt.value);
                  setSectionType("");
                  setSpecialty("");
                }}
              >
                <CardContent className="p-6 text-center">
                  <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br ${opt.gradient}`}>
                    <opt.icon className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">{opt.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{opt.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Step 2: Section selection (أدبي / علمي) for عام secondary */}
        {step === "section" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <Card
              className={`cursor-pointer transition-all duration-300 hover:shadow-lg ${
                sectionType === "علمي"
                  ? "ring-2 ring-primary border-primary shadow-lg scale-[1.02]"
                  : "hover:border-primary/50"
              }`}
              onClick={() => {
                setSectionType("علمي");
                setSpecialty("");
              }}
            >
              <CardContent className="p-6 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-teal-700">
                  <FlaskConical className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">علمي</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">رياضيات وفيزياء</p>
              </CardContent>
            </Card>
            <Card
              className={`cursor-pointer transition-all duration-300 hover:shadow-lg ${
                sectionType === "أدبي"
                  ? "ring-2 ring-primary border-primary shadow-lg scale-[1.02]"
                  : "hover:border-primary/50"
              }`}
              onClick={() => setSectionType("أدبي")}
            >
              <CardContent className="p-6 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-amber-700">
                  <BookOpen className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">أدبي</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">تاريخ وجغرافيا</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 3: Specialty selection (علمي علوم / علمي رياضة) */}
        {step === "specialty" && (
          <div className="space-y-4 mb-6">
            <Card
              className={`cursor-pointer transition-all duration-300 hover:shadow-lg ${
                specialty === "علمي علوم"
                  ? "ring-2 ring-primary border-primary shadow-lg scale-[1.02]"
                  : "hover:border-primary/50"
              }`}
              onClick={() => setSpecialty("علمي علوم")}
            >
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-green-700 shrink-0">
                    <FlaskConical className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">علمي علوم</h3>
                    <p className="text-sm text-muted-foreground">العربية، الإنجليزية، الفيزياء، الكيمياء، الأحياء</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card
              className={`cursor-pointer transition-all duration-300 hover:shadow-lg ${
                specialty === "علمي رياضة"
                  ? "ring-2 ring-primary border-primary shadow-lg scale-[1.02]"
                  : "hover:border-primary/50"
              }`}
              onClick={() => setSpecialty("علمي رياضة")}
            >
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 shrink-0">
                    <Calculator className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">علمي رياضة</h3>
                    <p className="text-sm text-muted-foreground">العربية، الإنجليزية، الفيزياء، الكيمياء، الرياضيات</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Button
          onClick={handleContinue}
          disabled={!canProceed() || saving}
          className="w-full"
          size="lg"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin ml-2" /> : null}
          {step === "education" && !needsSectionStep ? "متابعة" : step === "education" ? "التالي" : "متابعة"}
        </Button>
      </div>
    </div>
  );
};

export default EducationTypeSelection;

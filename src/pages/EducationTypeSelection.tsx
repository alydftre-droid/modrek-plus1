import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { GraduationCap, BookOpen, Loader2, FlaskConical, Calculator, ChevronRight, CheckCircle2 } from "lucide-react";
import { BACCALAUREATE_SECTION, isBaccalaureateScope } from "@/lib/educationSection";
import mudrikLogo from "@/assets/mudrik-logo.png";

type Step = "education" | "section" | "specialty";

type EducationProfile = {
  stage?: string | null;
  grade?: string | null;
  education_type?: string | null;
  section?: string | null;
};

const EducationTypeSelection = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selected, setSelected] = useState<"أزهر" | "عام" | "">("");
  const [sectionType, setSectionType] = useState<"علمي" | "أدبي" | "">("");
  const [specialty, setSpecialty] = useState<"علمي علوم" | "علمي رياضة" | "">("");
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<Step>("education");
  const [profile, setProfile] = useState<EducationProfile | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("stage, grade, education_type, section")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setProfile(data);

        if (!data) return;

        const isSecondary = data.stage === "secondary" || data.grade?.includes("ثانوي");
        const hasCompletedSelection = Boolean(
          data.education_type && data.stage && data.grade && (!isSecondary || data.section)
        );

        if (hasCompletedSelection) {
          navigate("/dashboard", { replace: true });
        }
      });
  }, [navigate, user]);

  const isSecondary = profile?.stage === "secondary" || profile?.grade?.includes("ثانوي");
  // Second secondary (عام) = نظام البكالوريا: no section choice at all.
  const isBaccalaureate = isBaccalaureateScope({
    stage: profile?.stage,
    grade: profile?.grade,
    educationType: selected || profile?.education_type,
  });
  // Both عام and أزهر secondary students need section step (except البكالوريا)
  const needsSectionStep = (selected === "عام" || selected === "أزهر") && isSecondary && !isBaccalaureate;
  // Only عام + علمي needs specialty sub-step
  const needsSpecialtyStep = selected === "عام" && isSecondary && !isBaccalaureate;

  const handleContinue = async () => {
    if (!selected || !user) return;

    if (needsSectionStep && step === "education") { setStep("section"); return; }
    if (needsSectionStep && step === "section") {
      if (!sectionType) { toast.error("اختر القسم الدراسي"); return; }
      // Only عام + علمي goes to specialty step
      if (needsSpecialtyStep && sectionType === "علمي") { setStep("specialty"); return; }
    }
    if (needsSpecialtyStep && step === "specialty") {
      if (!specialty) { toast.error("اختر الشعبة الدراسية"); return; }
    }

    setSaving(true);
    try {
      const updateData: Partial<EducationProfile> & { education_type: string } = { education_type: selected };
      if (isBaccalaureate && selected === "عام") {
        updateData.section = BACCALAUREATE_SECTION;
      } else if (needsSectionStep) {
        if (sectionType === "أدبي") updateData.section = "أدبي";
        else if (sectionType === "علمي" && needsSpecialtyStep && specialty) updateData.section = specialty;
        else if (sectionType === "علمي") updateData.section = "علمي";
      }
      const { error } = await supabase.from("profiles").update(updateData).eq("id", user.id);
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
    if (step === "specialty") { setStep("section"); setSpecialty(""); }
    else if (step === "section") { setStep("education"); setSectionType(""); setSpecialty(""); }
  };

  const canProceed = () => {
    if (!selected) return false;
    if (step === "section" && !sectionType) return false;
    if (step === "specialty" && !specialty) return false;
    return true;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 pattern-islamic p-5">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-8">
          <img src={mudrikLogo} alt="مدرك Plus" className="h-16 w-16 rounded-xl shadow-mudrik" />
          <h1 className="text-2xl font-bold text-gradient-mudrik">مدرك Plus</h1>
          <p className="text-muted-foreground text-center text-sm">
            {step === "education" && "اختر نوع التعليم الخاص بك"}
            {step === "section" && "اختر القسم الدراسي"}
            {step === "specialty" && "اختر الشعبة الدراسية"}
          </p>
        </div>

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
          <div className="grid grid-cols-1 gap-4 mb-6">
            <button
              onClick={() => { setSelected("أزهر"); setSectionType(""); setSpecialty(""); }}
              className={`relative overflow-hidden rounded-2xl p-5 text-right transition-all duration-300 ${
                selected === "أزهر"
                  ? "ring-3 ring-emerald-400 shadow-xl scale-[1.02]"
                  : "shadow-md hover:shadow-lg"
              }`}
              style={{ background: "linear-gradient(135deg, hsl(158 64% 32%) 0%, hsl(158 70% 22%) 100%)" }}
            >
              <div className="absolute -top-4 -left-4 w-24 h-24 rounded-full bg-white/10" />
              <div className="absolute -bottom-3 -right-3 w-16 h-16 rounded-full bg-white/[0.08]" />
              <div className="relative z-10 flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm shrink-0">
                  <BookOpen className="h-7 w-7 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white mb-0.5">تعليم أزهري</h3>
                  <p className="text-white/75 text-xs leading-5">المناهج الأزهرية للمراحل الإعدادية والثانوية</p>
                </div>
                {selected === "أزهر" && <CheckCircle2 className="h-6 w-6 text-white shrink-0" />}
              </div>
            </button>

            <button
              onClick={() => { setSelected("عام"); setSectionType(""); setSpecialty(""); }}
              className={`relative overflow-hidden rounded-2xl p-5 text-right transition-all duration-300 ${
                selected === "عام"
                  ? "ring-3 ring-blue-400 shadow-xl scale-[1.02]"
                  : "shadow-md hover:shadow-lg"
              }`}
              style={{ background: "linear-gradient(135deg, hsl(217 85% 50%) 0%, hsl(230 80% 42%) 100%)" }}
            >
              <div className="absolute -top-4 -left-4 w-24 h-24 rounded-full bg-white/10" />
              <div className="absolute -bottom-3 -right-3 w-16 h-16 rounded-full bg-white/[0.08]" />
              <div className="relative z-10 flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm shrink-0">
                  <GraduationCap className="h-7 w-7 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white mb-0.5">تعليم عام</h3>
                  <p className="text-white/75 text-xs leading-5">مناهج التربية والتعليم للمراحل الإعدادية والثانوية</p>
                </div>
                {selected === "عام" && <CheckCircle2 className="h-6 w-6 text-white shrink-0" />}
              </div>
            </button>
          </div>
        )}

        {/* Step 2: Section (أدبي / علمي) - for both عام and أزهر secondary */}
        {step === "section" && (
          <div className="grid grid-cols-1 gap-4 mb-6">
            <button
              onClick={() => { setSectionType("علمي"); setSpecialty(""); }}
              className={`relative overflow-hidden rounded-2xl p-5 text-right transition-all duration-300 ${
                sectionType === "علمي"
                  ? "ring-3 ring-teal-400 shadow-xl scale-[1.02]"
                  : "shadow-md hover:shadow-lg"
              }`}
              style={{ background: "linear-gradient(135deg, hsl(175 65% 38%) 0%, hsl(180 60% 28%) 100%)" }}
            >
              <div className="absolute -top-4 -left-4 w-24 h-24 rounded-full bg-white/10" />
              <div className="relative z-10 flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm shrink-0">
                  <FlaskConical className="h-7 w-7 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white">علمي</h3>
                  <p className="text-white/75 text-xs">القسم العلمي</p>
                </div>
                {sectionType === "علمي" && <CheckCircle2 className="h-6 w-6 text-white shrink-0" />}
              </div>
            </button>

            <button
              onClick={() => setSectionType("أدبي")}
              className={`relative overflow-hidden rounded-2xl p-5 text-right transition-all duration-300 ${
                sectionType === "أدبي"
                  ? "ring-3 ring-amber-400 shadow-xl scale-[1.02]"
                  : "shadow-md hover:shadow-lg"
              }`}
              style={{ background: "linear-gradient(135deg, hsl(35 85% 48%) 0%, hsl(25 80% 40%) 100%)" }}
            >
              <div className="absolute -top-4 -left-4 w-24 h-24 rounded-full bg-white/10" />
              <div className="relative z-10 flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm shrink-0">
                  <BookOpen className="h-7 w-7 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white">أدبي</h3>
                  <p className="text-white/75 text-xs">القسم الأدبي</p>
                </div>
                {sectionType === "أدبي" && <CheckCircle2 className="h-6 w-6 text-white shrink-0" />}
              </div>
            </button>
          </div>
        )}

        {/* Step 3: Specialty (only for عام + علمي) */}
        {step === "specialty" && (
          <div className="space-y-4 mb-6">
            <button
              onClick={() => setSpecialty("علمي علوم")}
              className={`w-full relative overflow-hidden rounded-2xl p-5 text-right transition-all duration-300 ${
                specialty === "علمي علوم"
                  ? "ring-3 ring-green-400 shadow-xl scale-[1.02]"
                  : "shadow-md hover:shadow-lg"
              }`}
              style={{ background: "linear-gradient(135deg, hsl(155 65% 38%) 0%, hsl(160 60% 28%) 100%)" }}
            >
              <div className="absolute -top-4 -left-4 w-24 h-24 rounded-full bg-white/10" />
              <div className="relative z-10 flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm shrink-0">
                  <FlaskConical className="h-7 w-7 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white">علمي علوم</h3>
                  <p className="text-white/70 text-xs leading-5">العربية، الإنجليزية، الفيزياء، الكيمياء، الأحياء</p>
                </div>
                {specialty === "علمي علوم" && <CheckCircle2 className="h-6 w-6 text-white shrink-0" />}
              </div>
            </button>

            <button
              onClick={() => setSpecialty("علمي رياضة")}
              className={`w-full relative overflow-hidden rounded-2xl p-5 text-right transition-all duration-300 ${
                specialty === "علمي رياضة"
                  ? "ring-3 ring-indigo-400 shadow-xl scale-[1.02]"
                  : "shadow-md hover:shadow-lg"
              }`}
              style={{ background: "linear-gradient(135deg, hsl(245 65% 52%) 0%, hsl(250 60% 42%) 100%)" }}
            >
              <div className="absolute -top-4 -left-4 w-24 h-24 rounded-full bg-white/10" />
              <div className="relative z-10 flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm shrink-0">
                  <Calculator className="h-7 w-7 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white">علمي رياضة</h3>
                  <p className="text-white/70 text-xs leading-5">العربية، الإنجليزية، الفيزياء، الكيمياء، الرياضيات</p>
                </div>
                {specialty === "علمي رياضة" && <CheckCircle2 className="h-6 w-6 text-white shrink-0" />}
              </div>
            </button>
          </div>
        )}

        <Button
          onClick={handleContinue}
          disabled={!canProceed() || saving}
          className="w-full py-6 text-base font-bold rounded-2xl"
          size="lg"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin ml-2" /> : null}
          {step === "education" && needsSectionStep ? "التالي" : step === "section" && needsSpecialtyStep && sectionType === "علمي" ? "التالي" : "متابعة"}
        </Button>
      </div>
    </div>
  );
};

export default EducationTypeSelection;

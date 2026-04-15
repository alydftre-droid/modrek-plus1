import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { GraduationCap, BookOpen, Loader2 } from "lucide-react";
import mudrikLogo from "@/assets/mudrik-logo.png";

const EducationTypeSelection = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selected, setSelected] = useState<"أزهر" | "عام" | "">("");
  const [section, setSection] = useState<"علمي علوم" | "علمي رياضة" | "">("");
  const [saving, setSaving] = useState(false);

  // Check if user is secondary to show section selection
  // We'll fetch the profile to check stage/grade
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
  const needsSection = selected === "عام" && isSecondary;

  const handleContinue = async () => {
    if (!selected || !user) return;
    if (needsSection && !section) {
      toast.error("اختر الشعبة الدراسية");
      return;
    }

    setSaving(true);
    try {
      const updateData: any = { education_type: selected };
      if (needsSection) {
        updateData.section = section;
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

  const options = [
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 pattern-islamic p-4">
      <div className="w-full max-w-lg">
        <div className="flex flex-col items-center gap-3 mb-8">
          <img src={mudrikLogo} alt="مدرك Plus" className="h-16 w-16 rounded-xl shadow-mudrik" />
          <h1 className="text-2xl font-bold text-gradient-mudrik">مدرك Plus</h1>
          <p className="text-muted-foreground text-center">اختر نوع التعليم الخاص بك</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {options.map((opt) => (
            <Card
              key={opt.value}
              className={`cursor-pointer transition-all duration-300 hover:shadow-lg ${
                selected === opt.value
                  ? "ring-2 ring-primary border-primary shadow-lg scale-[1.02]"
                  : "hover:border-primary/50"
              }`}
              onClick={() => {
                setSelected(opt.value);
                setSection("");
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

        {/* Section selection for عام secondary students */}
        {needsSection && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <Label className="mb-3 block font-semibold">اختر الشعبة الدراسية</Label>
              <RadioGroup
                value={section}
                onValueChange={(v) => setSection(v as any)}
                className="space-y-3"
                dir="rtl"
              >
                <label className={`flex items-center gap-3 border rounded-lg p-3 cursor-pointer ${section === "علمي علوم" ? "border-primary bg-primary/10" : ""}`}>
                  <RadioGroupItem value="علمي علوم" id="sec-science" />
                  <div>
                    <Label htmlFor="sec-science" className="cursor-pointer font-medium">علمي علوم</Label>
                    <p className="text-xs text-muted-foreground">العربية، الإنجليزية، الفيزياء، الكيمياء، الأحياء</p>
                  </div>
                </label>
                <label className={`flex items-center gap-3 border rounded-lg p-3 cursor-pointer ${section === "علمي رياضة" ? "border-primary bg-primary/10" : ""}`}>
                  <RadioGroupItem value="علمي رياضة" id="sec-math" />
                  <div>
                    <Label htmlFor="sec-math" className="cursor-pointer font-medium">علمي رياضة</Label>
                    <p className="text-xs text-muted-foreground">العربية، الإنجليزية، الفيزياء، الكيمياء، الرياضيات</p>
                  </div>
                </label>
              </RadioGroup>
            </CardContent>
          </Card>
        )}

        <Button
          onClick={handleContinue}
          disabled={!selected || saving || (needsSection && !section)}
          className="w-full"
          size="lg"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin ml-2" /> : null}
          متابعة
        </Button>
      </div>
    </div>
  );
};

export default EducationTypeSelection;

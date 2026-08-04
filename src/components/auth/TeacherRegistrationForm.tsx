import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building, IdCard, Phone, BookOpen } from "lucide-react";

const PREPARATORY_GRADES = [
  "الصف الأول الإعدادي",
  "الصف الثاني الإعدادي",
  "الصف الثالث الإعدادي",
];

const SECONDARY_GRADES = [
  "الصف الأول الثانوي",
  "الصف الثاني الثانوي",
  "الصف الثالث الثانوي",
];

const PREPARATORY_SUBJECTS = [
  "المواد العربية",
  "المواد الشرعية",
  "رياضيات",
  "لغة إنجليزية",
  "العلوم",
  "الدراسات",
  "العلوم المتكاملة",
];

const SECONDARY_SUBJECTS = [
  "المواد العربية",
  "المواد الشرعية",
  "أحياء",
  "فيزياء",
  "كيمياء",
  "جيولوجيا",
  "تاريخ",
  "جغرافيا",
  "فلسفة",
  "علم نفس",
  "رياضيات",
  "لغة إنجليزية",
  "لغة فرنسية",
  "العلوم المتكاملة",
];

export interface TeacherFormData {
  school: string;
  employeeId: string;
  phone: string;
  stages: ("preparatory" | "secondary")[];
  grades: string[];
  subject: string; // primary subject — kept for backward compatibility (= subjects[0])
  subjects: string[]; // all subjects the teacher teaches (multi-select)
  educationType: "عام" | "أزهر" | "";
  teachesIntegratedScience?: boolean;
}

interface Props {
  formData: TeacherFormData;
  onChange: (data: Partial<TeacherFormData>) => void;
  errors: Record<string, string>;
  /** Hide school / employee id / phone fields (used by the developer scope editor) */
  hidePersonalFields?: boolean;
}

const SCIENCE_SUBJECTS_FOR_INTEGRATED = ["أحياء", "فيزياء", "كيمياء"];
const FIRST_SECONDARY_GRADE = "الصف الأول الثانوي";

const TeacherRegistrationForm = ({ formData, onChange, errors, hidePersonalFields = false }: Props) => {
  // Combine grades from all selected stages
  const availableGrades: string[] = [];
  if (formData.stages.includes("preparatory")) {
    availableGrades.push(...PREPARATORY_GRADES);
  }
  if (formData.stages.includes("secondary")) {
    availableGrades.push(...SECONDARY_GRADES);
  }

  // Combine subjects - use union of subjects from selected stages
  const subjectsSet = new Set<string>();
  if (formData.stages.includes("preparatory")) {
    PREPARATORY_SUBJECTS.forEach((s) => subjectsSet.add(s));
  }
  if (formData.stages.includes("secondary")) {
    SECONDARY_SUBJECTS.forEach((s) => subjectsSet.add(s));
  }
  const subjects = Array.from(subjectsSet);

  const toggleStage = (stage: "preparatory" | "secondary") => {
    const newStages = formData.stages.includes(stage)
      ? formData.stages.filter((s) => s !== stage)
      : [...formData.stages, stage];
    // Reset grades and subjects when stages change
    onChange({
      stages: newStages,
      grades: [],
      subject: "",
      subjects: [],
      educationType: "",
    });
  };

  const toggleGrade = (grade: string) => {
    onChange({
      grades: formData.grades.includes(grade)
        ? formData.grades.filter((g) => g !== grade)
        : [...formData.grades, grade],
    });
  };

  const selectedSubjects = formData.subjects ?? (formData.subject ? [formData.subject] : []);

  const toggleSubject = (s: string) => {
    const isSelected = selectedSubjects.includes(s);
    const next = isSelected
      ? selectedSubjects.filter((x) => x !== s)
      : [...selectedSubjects, s];
    const stillHasArabic = next.includes("المواد العربية");
    const stillHasSharia = next.includes("المواد الشرعية");
    onChange({
      subjects: next,
      subject: next[0] || "",
      educationType: stillHasSharia && !stillHasArabic
        ? "أزهر"
        : stillHasArabic
          ? (formData.educationType || "")
          : "",
      teachesIntegratedScience:
        next.some((x) => SCIENCE_SUBJECTS_FOR_INTEGRATED.includes(x))
          ? formData.teachesIntegratedScience
          : false,
    });
  };

  // المواد العربية need education type selection
  const needsEducationType = selectedSubjects.includes("المواد العربية");
  // المواد الشرعية is automatically أزهر
  const isSharia = selectedSubjects.includes("المواد الشرعية");
  // السماح لمعلمي المواد العلمية بإضافة العلوم المتكاملة مع مادتهم الأصلية
  const canOfferIntegratedScience =
    selectedSubjects.some((s) => SCIENCE_SUBJECTS_FOR_INTEGRATED.includes(s)) &&
    formData.grades.includes(FIRST_SECONDARY_GRADE);

  return (
    <div className="space-y-5">
      {/* جهة العمل */}
      {!hidePersonalFields && (
      <div>
        <Label>جهة العمل / المدرسة</Label>
        <div className="relative">
          <Building className="absolute right-3 top-3 h-5 w-5 text-muted-foreground" />
          <Input
            className="pr-10"
            value={formData.school}
            onChange={(e) => onChange({ school: e.target.value })}
          />
        </div>
        {errors.school && <p className="text-sm text-red-500">{errors.school}</p>}
      </div>
      )}

      {/* الرقم الوظيفي */}
      {!hidePersonalFields && (
      <div>
        <Label>الرقم الوظيفي</Label>
        <div className="relative">
          <IdCard className="absolute right-3 top-3 h-5 w-5 text-muted-foreground" />
          <Input
            className="pr-10"
            value={formData.employeeId}
            onChange={(e) => onChange({ employeeId: e.target.value })}
          />
        </div>
        {errors.employeeId && <p className="text-sm text-red-500">{errors.employeeId}</p>}
      </div>
      )}

      {/* رقم الهاتف */}
      {!hidePersonalFields && (
      <div>
        <Label>رقم الهاتف</Label>
        <div className="relative">
          <Phone className="absolute right-3 top-3 h-5 w-5 text-muted-foreground" />
          <Input
            className="pr-10"
            value={formData.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
          />
        </div>
        {errors.phone && <p className="text-sm text-red-500">{errors.phone}</p>}
      </div>
      )}

      {/* المرحلة - Checkboxes for multiple selection */}
      <div>
        <Label className="mb-3 block">المرحلة التعليمية (يمكنك اختيار أكثر من مرحلة)</Label>
        <div className="flex gap-4" dir="rtl">
          <label
            className={`flex items-center gap-2 border rounded-lg px-4 py-2 cursor-pointer ${
              formData.stages.includes("preparatory")
                ? "border-primary bg-primary/10"
                : ""
            }`}
          >
            <Checkbox
              checked={formData.stages.includes("preparatory")}
              onCheckedChange={() => toggleStage("preparatory")}
            />
            إعدادي
          </label>
          <label
            className={`flex items-center gap-2 border rounded-lg px-4 py-2 cursor-pointer ${
              formData.stages.includes("secondary")
                ? "border-primary bg-primary/10"
                : ""
            }`}
          >
            <Checkbox
              checked={formData.stages.includes("secondary")}
              onCheckedChange={() => toggleStage("secondary")}
            />
            ثانوي
          </label>
        </div>
        {errors.stages && <p className="text-sm text-red-500 mt-1">{errors.stages}</p>}
      </div>

      {/* الصفوف */}
      {formData.stages.length > 0 && (
        <div>
          <Label>الصفوف التي تدرّسها</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {availableGrades.map((g) => (
              <label
                key={g}
                className={`flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer ${
                  formData.grades.includes(g)
                    ? "border-primary bg-primary/10"
                    : ""
                }`}
              >
                <Checkbox
                  checked={formData.grades.includes(g)}
                  onCheckedChange={() => toggleGrade(g)}
                />
                {g}
              </label>
            ))}
          </div>
          {errors.grades && <p className="text-sm text-red-500">{errors.grades}</p>}
        </div>
      )}

      {/* المواد (يمكن اختيار أكثر من مادة) */}
      {formData.grades.length > 0 && (
        <div>
          <Label className="mb-2 block">المواد التي تدرّسها (يمكنك اختيار أكثر من مادة)</Label>
          <div className="flex flex-wrap gap-2">
            {subjects.map((s) => {
              const active = selectedSubjects.includes(s);
              return (
                <label
                  key={s}
                  className={`flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer text-sm ${
                    active ? "border-primary bg-primary/10" : ""
                  }`}
                >
                  <Checkbox checked={active} onCheckedChange={() => toggleSubject(s)} />
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  {s}
                </label>
              );
            })}
          </div>
          {selectedSubjects.length > 1 && (
            <p className="text-xs text-muted-foreground mt-2">
              ✅ تم اختيار {selectedSubjects.length} مواد — ستتم إضافة تعييناتك لكل مادة بعد الموافقة.
            </p>
          )}
          {errors.subject && <p className="text-sm text-red-500 mt-1">{errors.subject}</p>}
        </div>
      )}

      {/* نوع التعليم - يظهر فقط عند اختيار المواد العربية */}
      {needsEducationType && (
        <div>
          <Label className="mb-3 block">
            أنت مدرّس مواد عربية لـ:
          </Label>
          <RadioGroup
            value={formData.educationType}
            onValueChange={(value) =>
              onChange({ educationType: value as "عام" | "أزهر" })
            }
            className="flex gap-6"
            dir="rtl"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="عام" id="edu-general" />
              <Label htmlFor="edu-general" className="cursor-pointer font-normal">
                تعليم عام
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="أزهر" id="edu-azhar" />
              <Label htmlFor="edu-azhar" className="cursor-pointer font-normal">
                تعليم أزهري
              </Label>
            </div>
          </RadioGroup>
          {errors.educationType && (
            <p className="text-sm text-red-500 mt-1">{errors.educationType}</p>
          )}
        </div>
      )}

      {/* إشعار المواد الشرعية */}
      {isSharia && (
        <div className="p-3 bg-primary/10 rounded-lg text-sm text-primary">
          ℹ️ المواد الشرعية مخصصة لطلاب التعليم الأزهري فقط
        </div>
      )}

      {/* تفعيل تدريس "العلوم المتكاملة" للصف الأول الثانوي */}
      {canOfferIntegratedScience && (
        <div className="p-4 border-2 border-primary/30 bg-primary/5 rounded-lg space-y-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={!!formData.teachesIntegratedScience}
              onCheckedChange={(checked) =>
                onChange({ teachesIntegratedScience: !!checked })
              }
              className="mt-0.5"
            />
            <div className="space-y-1">
              <div className="font-semibold text-sm">
                إضافة مادة "العلوم المتكاملة" مع مادتك الأساسية
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                يمكنك اختيار مادتك الأساسية بشكل طبيعي، وإذا كنت من معلمي الأحياء أو الفيزياء أو الكيمياء
                وتدرّس الصف الأول الثانوي، يمكنك أيضًا تفعيل "العلوم المتكاملة" لتظهر لك كمادة إضافية مستقلة.
              </p>
            </div>
          </label>
        </div>
      )}
    </div>
  );
};

export default TeacherRegistrationForm;

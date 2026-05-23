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
  "علوم",
  "دراسات",
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
];

export interface TeacherFormData {
  school: string;
  employeeId: string;
  phone: string;
  stages: ("preparatory" | "secondary")[];
  grades: string[];
  subject: string;
  educationType: "عام" | "أزهر" | "";
  teachesIntegratedScience?: boolean;
}

interface Props {
  formData: TeacherFormData;
  onChange: (data: Partial<TeacherFormData>) => void;
  errors: Record<string, string>;
}

const SCIENCE_SUBJECTS_FOR_INTEGRATED = ["أحياء", "فيزياء", "كيمياء"];
const FIRST_SECONDARY_GRADE = "الصف الأول الثانوي";

const TeacherRegistrationForm = ({ formData, onChange, errors }: Props) => {
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
    // Reset grades and subject when stages change
    onChange({
      stages: newStages,
      grades: [],
      subject: "",
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

  // المواد العربية need education type selection
  const needsEducationType = formData.subject === "المواد العربية";
  // المواد الشرعية is automatically أزهر
  const isSharia = formData.subject === "المواد الشرعية";
  // العلوم المتكاملة: متاحة فقط لمعلمي العلوم (فيزياء/كيمياء/أحياء) الذين يدرّسون الصف الأول الثانوي
  const canOfferIntegratedScience =
    SCIENCE_SUBJECTS_FOR_INTEGRATED.includes(formData.subject) &&
    formData.grades.includes(FIRST_SECONDARY_GRADE);

  return (
    <div className="space-y-5">
      {/* جهة العمل */}
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

      {/* الرقم الوظيفي */}
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

      {/* رقم الهاتف */}
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

      {/* المادة */}
      {formData.grades.length > 0 && (
        <div>
          <Label>المادة التي تدرّسها</Label>
          <div className="relative">
            <BookOpen className="absolute right-3 top-3 h-5 w-5 text-muted-foreground" />
            <Select
              value={formData.subject}
              onValueChange={(value) =>
                onChange({
                  subject: value,
                  educationType: value === "المواد الشرعية" ? "أزهر" : "",
                })
              }
            >
              <SelectTrigger className="pr-10">
                <SelectValue placeholder="اختر المادة" />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {errors.subject && <p className="text-sm text-red-500">{errors.subject}</p>}
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
                تفعيل تدريس "العلوم المتكاملة" للصف الأول الثانوي
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                في الصف الأول الثانوي تم دمج (الفيزياء + الكيمياء + الأحياء) في مادة واحدة هي
                "العلوم المتكاملة". فعّل هذا الخيار إذا كنت ستدرّسها لطلاب الأول الثانوي.
                إذا لم تُفعّله، لن تظهر لك مادة الصف الأول الثانوي إطلاقًا، وستظهر فقط مادتك
                الأصلية للصفين الثاني والثالث الثانوي.
              </p>
            </div>
          </label>
        </div>
      )}
    </div>
  );
};

export default TeacherRegistrationForm;

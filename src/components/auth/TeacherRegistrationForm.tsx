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

/* ===================== */
/* البيانات الثابتة */
/* ===================== */

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

// المواد الموجودة فعلياً في المنصة - إعدادي
const PREPARATORY_SUBJECTS = [
  "المواد العربية",
  "المواد الشرعية",
  "رياضيات",
  "لغة إنجليزية",
];

// المواد الموجودة فعلياً في المنصة - ثانوي
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

/* ===================== */
/* Types */
/* ===================== */

export interface TeacherFormData {
  school: string;
  employeeId: string;
  phone: string;
  stage: "preparatory" | "secondary" | "";
  grades: string[];
  subject: string;
}

interface Props {
  formData: TeacherFormData;
  onChange: (data: Partial<TeacherFormData>) => void;
  errors: Record<string, string>;
}

/* ===================== */
/* Component */
/* ===================== */

const TeacherRegistrationForm = ({ formData, onChange, errors }: Props) => {
  const grades =
    formData.stage === "preparatory"
      ? PREPARATORY_GRADES
      : formData.stage === "secondary"
      ? SECONDARY_GRADES
      : [];

  const subjects =
    formData.stage === "preparatory"
      ? PREPARATORY_SUBJECTS
      : formData.stage === "secondary"
      ? SECONDARY_SUBJECTS
      : [];

  const toggleGrade = (grade: string) => {
    onChange({
      grades: formData.grades.includes(grade)
        ? formData.grades.filter((g) => g !== grade)
        : [...formData.grades, grade],
    });
  };

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

      {/* المرحلة - Radio buttons اختيار واحد فقط */}
      <div>
        <Label className="mb-3 block">المرحلة التعليمية</Label>
        <RadioGroup
          value={formData.stage}
          onValueChange={(value) =>
            onChange({
              stage: value as "preparatory" | "secondary",
              grades: [],
              subject: "",
            })
          }
          className="flex gap-6"
          dir="rtl"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="preparatory" id="stage-prep" />
            <Label htmlFor="stage-prep" className="cursor-pointer font-normal">
              إعدادي
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="secondary" id="stage-sec" />
            <Label htmlFor="stage-sec" className="cursor-pointer font-normal">
              ثانوي
            </Label>
          </div>
        </RadioGroup>
        {errors.stage && <p className="text-sm text-red-500 mt-1">{errors.stage}</p>}
      </div>

      {/* الصفوف */}
      {formData.stage && (
        <div>
          <Label>الصفوف التي تدرّسها</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {grades.map((g) => (
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
              onValueChange={(value) => onChange({ subject: value })}
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

    </div>
  );
};

export default TeacherRegistrationForm;
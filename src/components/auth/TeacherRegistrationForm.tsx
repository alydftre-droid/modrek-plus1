import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

export interface TeacherFormData {
  school: string;
  employeeId: string;
  phone: string;
  stage: string;
  grades: string[];
  subject: string;
}

interface Props {
  formData: TeacherFormData;
  onChange: (data: Partial<TeacherFormData>) => void;
  errors: Record<string, string>;
}

const stages = [
  { value: "preparatory", label: "المرحلة الإعدادية" },
  { value: "secondary", label: "المرحلة الثانوية" },
];

const grades = [
  { value: "first", label: "الصف الأول" },
  { value: "second", label: "الصف الثاني" },
  { value: "third", label: "الصف الثالث" },
];

const subjects = [
  { value: "arabic", label: "المواد العربية" },
  { value: "religious", label: "المواد الشرعية" },
  { value: "science", label: "العلوم" },
  { value: "social", label: "الدراسات" },
  { value: "english", label: "الإنجليزية" },
  { value: "scientific", label: "المواد العلمية" },
  { value: "literary", label: "المواد الأدبية" },
  { value: "french", label: "الفرنسية" },
];

const TeacherRegistrationForm = ({ formData, onChange, errors }: Props) => {
  const toggleGrade = (grade: string) => {
    const current = formData.grades;
    if (current.includes(grade)) {
      onChange({ grades: current.filter((g) => g !== grade) });
    } else {
      onChange({ grades: [...current, grade] });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>جهة العمل *</Label>
        <Input
          value={formData.school}
          onChange={(e) => onChange({ school: e.target.value })}
          placeholder="اسم المدرسة أو المعهد"
        />
        {errors.school && <p className="text-sm text-destructive mt-1">{errors.school}</p>}
      </div>

      <div>
        <Label>الرقم الوظيفي *</Label>
        <Input
          value={formData.employeeId}
          onChange={(e) => onChange({ employeeId: e.target.value })}
          placeholder="الرقم الوظيفي"
        />
        {errors.employeeId && <p className="text-sm text-destructive mt-1">{errors.employeeId}</p>}
      </div>

      <div>
        <Label>رقم الهاتف *</Label>
        <Input
          value={formData.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          placeholder="01XXXXXXXXX"
          dir="ltr"
        />
        {errors.phone && <p className="text-sm text-destructive mt-1">{errors.phone}</p>}
      </div>

      <div>
        <Label>المرحلة الدراسية *</Label>
        <Select value={formData.stage} onValueChange={(v) => onChange({ stage: v })}>
          <SelectTrigger>
            <SelectValue placeholder="اختر المرحلة" />
          </SelectTrigger>
          <SelectContent>
            {stages.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.stage && <p className="text-sm text-destructive mt-1">{errors.stage}</p>}
      </div>

      <div>
        <Label>الصفوف الدراسية *</Label>
        <div className="flex flex-wrap gap-3 mt-2">
          {grades.map((g) => (
            <label key={g.value} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={formData.grades.includes(g.value)}
                onCheckedChange={() => toggleGrade(g.value)}
              />
              <span className="text-sm">{g.label}</span>
            </label>
          ))}
        </div>
        {errors.grades && <p className="text-sm text-destructive mt-1">{errors.grades}</p>}
      </div>

      <div>
        <Label>المادة / التخصص *</Label>
        <Select value={formData.subject} onValueChange={(v) => onChange({ subject: v })}>
          <SelectTrigger>
            <SelectValue placeholder="اختر المادة" />
          </SelectTrigger>
          <SelectContent>
            {subjects.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.subject && <p className="text-sm text-destructive mt-1">{errors.subject}</p>}
      </div>
    </div>
  );
};

export default TeacherRegistrationForm;


import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, User as UserIcon, GraduationCap, Briefcase } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import mudrikLogo from "@/assets/mudrik-logo.png";

const PREP_GRADES = ["الصف الأول الإعدادي", "الصف الثاني الإعدادي", "الصف الثالث الإعدادي"];
const SEC_GRADES = ["الصف الأول الثانوي", "الصف الثاني الثانوي", "الصف الثالث الثانوي"];
const PREP_SUBJECTS = ["المواد العربية", "المواد الشرعية", "رياضيات", "لغة إنجليزية"];
const SEC_SUBJECTS = ["المواد العربية", "المواد الشرعية", "أحياء", "فيزياء", "كيمياء", "جيولوجيا", "تاريخ", "جغرافيا", "فلسفة", "علم نفس", "رياضيات", "لغة إنجليزية", "لغة فرنسية"];

type Role = "student" | "teacher";

export default function CompleteProfile() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();

  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState<Role | "">("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [educationType, setEducationType] = useState<"عام" | "أزهر" | "">("");
  // Student
  const [stage, setStage] = useState<"preparatory" | "secondary" | "">("");
  const [grade, setGrade] = useState("");
  // Teacher
  const [school, setSchool] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [teacherStages, setTeacherStages] = useState<("preparatory" | "secondary")[]>([]);
  const [teacherGrades, setTeacherGrades] = useState<string[]>([]);
  const [teacherSubject, setTeacherSubject] = useState("");
  const [teacherEduType, setTeacherEduType] = useState<"عام" | "أزهر" | "">("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    (async () => {
      // Pre-fill name from auth metadata
      const meta = user.user_metadata || {};
      setFullName(meta.full_name || meta.name || "");
      // Check if profile already complete → skip
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, education_type, stage, grade")
        .eq("id", user.id)
        .maybeSingle();
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (roleRow?.role === "admin") {
        navigate("/admin", { replace: true });
        return;
      }
      if (roleRow?.role === "student" && profile?.education_type && profile?.grade) {
        navigate("/dashboard", { replace: true });
        return;
      }
      if (roleRow?.role === "teacher") {
        const { data: req } = await supabase
          .from("teacher_requests")
          .select("status")
          .eq("user_id", user.id)
          .maybeSingle();
        navigate(req?.status === "approved" ? "/teacher" : "/pending-approval", { replace: true });
        return;
      }
      setChecking(false);
    })();
  }, [user, authLoading, navigate]);

  const availableGrades: string[] = [];
  if (teacherStages.includes("preparatory")) availableGrades.push(...PREP_GRADES);
  if (teacherStages.includes("secondary")) availableGrades.push(...SEC_GRADES);
  const subjectsSet = new Set<string>();
  if (teacherStages.includes("preparatory")) PREP_SUBJECTS.forEach((s) => subjectsSet.add(s));
  if (teacherStages.includes("secondary")) SEC_SUBJECTS.forEach((s) => subjectsSet.add(s));
  const availableSubjects = Array.from(subjectsSet);

  const toggle = <T,>(arr: T[], val: T) =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!role) { toast({ title: "اختر نوع الحساب", variant: "destructive" }); return; }
    if (!fullName.trim() || fullName.trim().length < 3) {
      toast({ title: "أدخل الاسم الكامل", variant: "destructive" }); return;
    }

    setSaving(true);
    try {
      // 1) Update profile
      const profileUpdate: any = {
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        role,
      };
      if (role === "student") {
        if (!educationType) { toast({ title: "اختر النظام التعليمي", variant: "destructive" }); setSaving(false); return; }
        if (!stage || !grade) { toast({ title: "اختر المرحلة والصف", variant: "destructive" }); setSaving(false); return; }
        profileUpdate.education_type = educationType;
        profileUpdate.stage = stage;
        profileUpdate.grade = grade;
      }
      const { error: profErr } = await supabase
        .from("profiles")
        .update(profileUpdate)
        .eq("id", user.id);
      if (profErr) throw profErr;

      // 2) Assign role in user_roles (insert ignore conflict)
      await supabase.from("user_roles").upsert(
        { user_id: user.id, role: role as any },
        { onConflict: "user_id,role", ignoreDuplicates: true } as any,
      );

      // 3) Teacher → create teacher_request
      if (role === "teacher") {
        if (!school.trim() || !employeeId.trim()) {
          toast({ title: "أدخل بيانات العمل", variant: "destructive" }); setSaving(false); return;
        }
        if (teacherStages.length === 0 || teacherGrades.length === 0 || !teacherSubject) {
          toast({ title: "أكمل بيانات التدريس", variant: "destructive" }); setSaving(false); return;
        }
        const eduType = teacherSubject === "المواد الشرعية" ? "أزهر" :
          teacherSubject === "المواد العربية" ? (teacherEduType || null) : null;
        await supabase.from("teacher_requests").insert({
          user_id: user.id,
          full_name: fullName.trim(),
          email: user.email!,
          phone: phone.trim() || null,
          school_name: school.trim(),
          employee_id: employeeId.trim(),
          status: "pending",
          assigned_stages: teacherStages,
          assigned_grades: teacherGrades,
          assigned_category: teacherSubject,
          education_type: eduType,
        } as any);
      }

      toast({ title: "تم حفظ بياناتك ✓" });
      if (role === "student") navigate("/dashboard", { replace: true });
      else navigate("/pending-approval", { replace: true });
    } catch (err: any) {
      toast({ title: "خطأ في الحفظ", description: err.message || "حاول مرة أخرى", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-4 py-8">
      <div className="w-full max-w-lg mx-auto">
        <div className="flex items-center justify-center gap-3 mb-6">
          <img src={mudrikLogo} alt="مدرك Plus" className="h-12 w-12 rounded-xl" />
          <span className="text-2xl font-bold text-gradient-mudrik">مدرك Plus</span>
        </div>
        <Card>
          <CardHeader className="text-center">
            <CardTitle>أكمل بياناتك</CardTitle>
            <CardDescription>نحتاج بعض المعلومات لإنشاء تجربتك التعليمية</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label>الاسم الكامل</Label>
                <div className="relative">
                  <UserIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="pr-10" required />
                </div>
              </div>

              <div className="space-y-2">
                <Label>رقم الهاتف (اختياري)</Label>
                <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className="text-left" />
              </div>

              <div className="space-y-2">
                <Label>نوع الحساب</Label>
                <RadioGroup value={role} onValueChange={(v) => setRole(v as Role)} className="grid grid-cols-2 gap-3" dir="rtl">
                  <label className={`flex items-center gap-2 border rounded-lg px-4 py-3 cursor-pointer ${role === "student" ? "border-primary bg-primary/10" : "border-border"}`}>
                    <RadioGroupItem value="student" id="r-st" />
                    <GraduationCap className="h-5 w-5" />
                    <span>طالب</span>
                  </label>
                  <label className={`flex items-center gap-2 border rounded-lg px-4 py-3 cursor-pointer ${role === "teacher" ? "border-primary bg-primary/10" : "border-border"}`}>
                    <RadioGroupItem value="teacher" id="r-te" />
                    <Briefcase className="h-5 w-5" />
                    <span>معلم</span>
                  </label>
                </RadioGroup>
              </div>

              {role === "student" && (
                <>
                  <div className="space-y-2">
                    <Label>النظام التعليمي</Label>
                    <RadioGroup value={educationType} onValueChange={(v) => setEducationType(v as any)} className="flex gap-4" dir="rtl">
                      <label className={`flex items-center gap-2 border rounded-lg px-4 py-2 cursor-pointer ${educationType === "عام" ? "border-primary bg-primary/10" : "border-border"}`}>
                        <RadioGroupItem value="عام" id="e-gen" /> تعليم عام
                      </label>
                      <label className={`flex items-center gap-2 border rounded-lg px-4 py-2 cursor-pointer ${educationType === "أزهر" ? "border-primary bg-primary/10" : "border-border"}`}>
                        <RadioGroupItem value="أزهر" id="e-azh" /> تعليم أزهري
                      </label>
                    </RadioGroup>
                  </div>
                  <div className="space-y-2">
                    <Label>المرحلة</Label>
                    <Select value={stage} onValueChange={(v) => { setStage(v as any); setGrade(""); }}>
                      <SelectTrigger><SelectValue placeholder="اختر المرحلة" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="preparatory">إعدادي</SelectItem>
                        <SelectItem value="secondary">ثانوي</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {stage && (
                    <div className="space-y-2">
                      <Label>الصف</Label>
                      <Select value={grade} onValueChange={setGrade}>
                        <SelectTrigger><SelectValue placeholder="اختر الصف" /></SelectTrigger>
                        <SelectContent>
                          {(stage === "preparatory" ? PREP_GRADES : SEC_GRADES).map((g) => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}

              {role === "teacher" && (
                <>
                  <div className="space-y-2">
                    <Label>جهة العمل / المدرسة</Label>
                    <Input value={school} onChange={(e) => setSchool(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>الرقم الوظيفي</Label>
                    <Input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>المراحل التي تدرّسها</Label>
                    <div className="flex gap-3" dir="rtl">
                      {(["preparatory", "secondary"] as const).map((s) => (
                        <label key={s} className={`flex items-center gap-2 border rounded-lg px-4 py-2 cursor-pointer ${teacherStages.includes(s) ? "border-primary bg-primary/10" : "border-border"}`}>
                          <Checkbox checked={teacherStages.includes(s)} onCheckedChange={() => {
                            setTeacherStages((p) => toggle(p, s));
                            setTeacherGrades([]); setTeacherSubject("");
                          }} />
                          {s === "preparatory" ? "إعدادي" : "ثانوي"}
                        </label>
                      ))}
                    </div>
                  </div>
                  {teacherStages.length > 0 && (
                    <div className="space-y-2">
                      <Label>الصفوف</Label>
                      <div className="flex flex-wrap gap-2">
                        {availableGrades.map((g) => (
                          <label key={g} className={`flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer text-sm ${teacherGrades.includes(g) ? "border-primary bg-primary/10" : "border-border"}`}>
                            <Checkbox checked={teacherGrades.includes(g)} onCheckedChange={() => setTeacherGrades((p) => toggle(p, g))} />
                            {g}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {teacherGrades.length > 0 && (
                    <div className="space-y-2">
                      <Label>المادة</Label>
                      <Select value={teacherSubject} onValueChange={(v) => {
                        setTeacherSubject(v);
                        setTeacherEduType(v === "المواد الشرعية" ? "أزهر" : "");
                      }}>
                        <SelectTrigger><SelectValue placeholder="اختر المادة" /></SelectTrigger>
                        <SelectContent>
                          {availableSubjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {teacherSubject === "المواد العربية" && (
                    <div className="space-y-2">
                      <Label>تدرّس مواد عربية لـ:</Label>
                      <RadioGroup value={teacherEduType} onValueChange={(v) => setTeacherEduType(v as any)} className="flex gap-4" dir="rtl">
                        <label className={`flex items-center gap-2 border rounded-lg px-4 py-2 cursor-pointer ${teacherEduType === "عام" ? "border-primary bg-primary/10" : "border-border"}`}>
                          <RadioGroupItem value="عام" id="t-gen" /> تعليم عام
                        </label>
                        <label className={`flex items-center gap-2 border rounded-lg px-4 py-2 cursor-pointer ${teacherEduType === "أزهر" ? "border-primary bg-primary/10" : "border-border"}`}>
                          <RadioGroupItem value="أزهر" id="t-azh" /> تعليم أزهري
                        </label>
                      </RadioGroup>
                    </div>
                  )}
                </>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={saving}>
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "حفظ والمتابعة"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

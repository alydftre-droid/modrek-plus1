import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import TeacherRegistrationForm, { TeacherFormData } from "@/components/auth/TeacherRegistrationForm";

interface Props {
  teacherId: string;
  teacherName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

const EMPTY: TeacherFormData = {
  school: "",
  employeeId: "",
  phone: "",
  stages: [],
  grades: [],
  subject: "",
  subjects: [],
  educationType: "",
  teachesIntegratedScience: false,
};

export function TeacherScopeDialog({ teacherId, teacherName, open, onOpenChange, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<TeacherFormData>(EMPTY);
  const [snapshot, setSnapshot] = useState<TeacherFormData>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const invoke = useCallback(
    async (payload: Record<string, unknown>) => {
      const body = { teacher_id: teacherId, ...payload };

      // While a developer is impersonating a teacher, the active session belongs to the
      // teacher (not an admin) — so we must call the service with the developer's own token.
      if (isDeveloperTeacherMode()) {
        const devToken = await getFreshOriginalDeveloperAccessToken();
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-teacher-scope`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${devToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
          },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || data?.error) throw new Error(data?.error || "فشل الاتصال بالخدمة");
        return data as Record<string, any>;
      }

      const { data, error } = await supabase.functions.invoke("admin-teacher-scope", { body });
      if (error) throw new Error(error.message || "فشل الاتصال بالخدمة");
      if (data?.error) throw new Error(data.error);
      return data as Record<string, any>;
    },
    [teacherId],
  );


  useEffect(() => {
    if (!open || !teacherId) return;
    let cancelled = false;
    setLoading(true);
    setErrors({});
    invoke({ action: "load" })
      .then((data) => {
        if (cancelled) return;
        const scope = data.scope || {};
        const next: TeacherFormData = {
          school: scope.school || "",
          employeeId: scope.employee_id || "",
          phone: scope.phone || "",
          stages: (scope.stages || []).filter((s: string) => s === "preparatory" || s === "secondary"),
          grades: scope.grades || [],
          subject: (scope.categories || [])[0] || "",
          subjects: scope.categories || [],
          educationType: scope.education_type === "أزهر" || scope.education_type === "عام" ? scope.education_type : "",
          teachesIntegratedScience: !!scope.teaches_integrated_science,
        };
        setFormData(next);
        setSnapshot(next);
      })
      .catch((e: Error) => {
        if (!cancelled) toast.error(e.message || "فشل تحميل مواد وصفوف المعلم");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, teacherId, invoke]);

  const handleChange = (patch: Partial<TeacherFormData>) => {
    setFormData((prev) => ({ ...prev, ...patch }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (formData.stages.length === 0) e.stages = "اختر مرحلة واحدة على الأقل";
    if (formData.grades.length === 0) e.grades = "اختر صف واحد على الأقل";
    const chosen = formData.subjects?.length ? formData.subjects : formData.subject ? [formData.subject] : [];
    if (chosen.length === 0) e.subject = "اختر مادة واحدة على الأقل";
    if (chosen.includes("المواد العربية") && !formData.educationType) {
      e.educationType = "حدد نوع التعليم للمواد العربية";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const chosen = formData.subjects?.length ? formData.subjects : [formData.subject];
    const resolvedEducationType =
      chosen.length === 1 && chosen[0] === "المواد الشرعية" ? "أزهر" : formData.educationType || null;

    try {
      const result = await invoke({
        action: "save",
        stages: formData.stages,
        grades: formData.grades,
        categories: chosen,
        education_type: resolvedEducationType,
        teaches_integrated_science: !!formData.teachesIntegratedScience,
      });

      const blocked = Array.isArray(result.blocked) ? result.blocked : [];
      toast.success("تم تحديث مواد وصفوف المعلم بنجاح", {
        description: `تمت إضافة ${result.created_assignments || 0} تعيين · حذف ${result.removed_assignments || 0}`,
      });
      if (blocked.length) {
        toast.warning("لم يتم حذف بعض الصفوف لوجود محتوى مرتبط بها", {
          description: blocked.map((b: any) => `${b.grade} - ${b.category}`).join(" · "),
        });
      }
      setSnapshot(formData);
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      // Undo local changes so the screen matches the server state again
      setFormData(snapshot);
      toast.error((e as Error).message || "فشل حفظ المواد والصفوف", {
        description: "تم التراجع عن التغييرات، حاول مرة أخرى",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-right">
          <DialogTitle>إدارة المواد والصفوف</DialogTitle>
          <DialogDescription>
            {teacherName ? `${teacherName} — ` : ""}نفس نظام اختيار المرحلة والصفوف والمواد المستخدم في تسجيل المعلمين
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <TeacherRegistrationForm
              formData={formData}
              onChange={handleChange}
              errors={errors}
              hidePersonalFields
            />
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1 gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                حفظ التغييرات
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                إلغاء
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default TeacherScopeDialog;

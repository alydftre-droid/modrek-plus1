import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, User, Mail, Phone, KeyRound, FileText } from "lucide-react";

interface Props {
  teacherId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUpdated?: () => void;
}

interface Form {
  full_name: string;
  email: string;
  phone: string;
  new_password: string;
  bio: string;
  years_experience: string;
}

const EMPTY: Form = { full_name: "", email: "", phone: "", new_password: "", bio: "", years_experience: "" };

export function TeacherEditProfileDialog({ teacherId, open, onOpenChange, onUpdated }: Props) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [initial, setInitial] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !teacherId) return;
    (async () => {
      setLoading(true);
      const [{ data: p }, { data: tp }] = await Promise.all([
        supabase.from("profiles").select("full_name, email, phone").eq("id", teacherId).maybeSingle(),
        supabase.from("teacher_profiles").select("bio, experience_years").eq("teacher_id", teacherId).maybeSingle(),
      ]);
      const next: Form = {
        full_name: (p as any)?.full_name ?? "",
        email: (p as any)?.email ?? "",
        phone: (p as any)?.phone ?? "",
        new_password: "",
        bio: (tp as any)?.bio ?? "",
        years_experience: (tp as any)?.experience_years != null ? String((tp as any).experience_years) : "",
      };
      setForm(next);
      setInitial(next);
      setLoading(false);
    })();
  }, [open, teacherId]);

  const setField = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1) Profile (name/phone) via edge fn
      if (form.full_name !== initial.full_name || form.phone !== initial.phone) {
        const { data, error } = await supabase.functions.invoke("admin-manage-teacher", {
          body: { action: "update_profile", teacher_id: teacherId, full_name: form.full_name, phone: form.phone },
        });
        if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      }
      // 2) Email
      if (form.email && form.email !== initial.email) {
        const { data, error } = await supabase.functions.invoke("admin-manage-teacher", {
          body: { action: "update_email", teacher_id: teacherId, new_email: form.email },
        });
        if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      }
      // 3) Password
      if (form.new_password) {
        const { data, error } = await supabase.functions.invoke("admin-manage-teacher", {
          body: { action: "update_password", teacher_id: teacherId, new_password: form.new_password },
        });
        if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      }
      // 4) Bio / experience (direct table update — admins allowed by RLS on teacher_profiles)
      if (form.bio !== initial.bio || form.years_experience !== initial.years_experience) {
        const yrs = form.years_experience ? Number(form.years_experience) : null;
        const { error } = await supabase
          .from("teacher_profiles")
          .upsert(
            { teacher_id: teacherId, bio: form.bio || null, experience_years: yrs },
            { onConflict: "teacher_id" }
          );
        if (error) throw error;
      }

      toast.success("تم حفظ تعديلات المعلم");
      onUpdated?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "تعذّر حفظ التعديلات");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <User className="h-5 w-5 text-primary" /> تعديل بيانات المعلم
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-4 py-2">
            <Field icon={<User className="h-4 w-4" />} label="الاسم الكامل">
              <Input value={form.full_name} onChange={(e) => setField("full_name", e.target.value)} />
            </Field>
            <Field icon={<Mail className="h-4 w-4" />} label="البريد الإلكتروني">
              <Input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} />
            </Field>
            <Field icon={<Phone className="h-4 w-4" />} label="رقم الهاتف">
              <Input value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
            </Field>
            <Field icon={<KeyRound className="h-4 w-4" />} label="كلمة سر جديدة (اختياري)">
              <Input type="password" value={form.new_password} onChange={(e) => setField("new_password", e.target.value)} placeholder="اتركها فارغة لعدم التغيير" />
            </Field>
            <Field icon={<FileText className="h-4 w-4" />} label="سنوات الخبرة">
              <Input type="number" min={0} value={form.years_experience} onChange={(e) => setField("years_experience", e.target.value)} />
            </Field>
            <Field icon={<FileText className="h-4 w-4" />} label="السيرة الذاتية">
              <Textarea rows={4} value={form.bio} onChange={(e) => setField("bio", e.target.value)} />
            </Field>
          </div>
        )}

        <DialogFooter className="gap-2">
          <button type="button" onClick={() => onOpenChange(false)} className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-700 hover:bg-slate-50">
            إلغاء
          </button>
          <button type="button" onClick={handleSave} disabled={saving || loading} className="tm-submit-btn px-6 inline-flex items-center justify-center gap-2 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ التعديلات
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
        <span className="text-primary">{icon}</span> {label}
      </Label>
      {children}
    </div>
  );
}

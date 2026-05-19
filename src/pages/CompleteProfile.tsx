import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, User as UserIcon, Phone, GraduationCap, Briefcase } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import mudrikLogo from "@/assets/mudrik-logo.png";

/**
 * Simplified Google-signup completion page.
 * Asks only for: account type (student/teacher) + full name + optional phone.
 * No stage/grade/education-type selection here — student picks those after
 * activation from /select-education-type, teacher completes registration
 * via /teacher-register (pending approval flow).
 */
type AccountType = "student" | "teacher";

export default function CompleteProfile() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();

  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>("student");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    (async () => {
      const meta = user.user_metadata || {};
      setFullName(meta.full_name || meta.name || "");
      setPhone(meta.phone || "");

      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (roleRow?.role === "admin") {
        navigate("/admin", { replace: true });
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

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, education_type")
        .eq("id", user.id)
        .maybeSingle();

      if (roleRow?.role === "student" && profile?.education_type) {
        navigate("/dashboard", { replace: true });
        return;
      }

      if (roleRow?.role === "student") {
        // Already a student but no education_type → go pick it
        navigate("/select-education-type", { replace: true });
        return;
      }

      setChecking(false);
    })();
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!fullName.trim() || fullName.trim().length < 3) {
      toast({ title: "أدخل الاسم الكامل (3 أحرف على الأقل)", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      // Single secure RPC handles profile + role + wallet (RLS-safe).
      const { error: rpcErr } = await (supabase as any).rpc("complete_user_profile", {
        _full_name: fullName.trim(),
        _phone: phone.trim() || null,
        _role: accountType,
      });
      if (rpcErr) throw rpcErr;

      if (accountType === "teacher") {
        toast({
          title: "تم حفظ بياناتك ✓",
          description: "أكمل بيانات التسجيل كمعلم",
        });
        navigate("/teacher-register", { replace: true });
        return;
      }

      toast({
        title: "تم تفعيل حسابك ✓",
        description: "اختر النظام التعليمي والمرحلة",
      });
      navigate("/select-education-type", { replace: true });
    } catch (err: any) {
      console.error("[CompleteProfile] save error", err);
      toast({
        title: "خطأ في حفظ البيانات",
        description: err.message || "حاول مرة أخرى",
        variant: "destructive",
      });
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
    <div className="min-h-screen bg-muted/30 p-4 py-8 flex items-center justify-center">
      <div className="w-full max-w-md mx-auto">
        <div className="flex items-center justify-center gap-3 mb-6">
          <img src={mudrikLogo} alt="مدرك Plus" className="h-12 w-12 rounded-xl" />
          <span className="text-2xl font-bold text-gradient-mudrik">مدرك Plus</span>
        </div>
        <Card>
          <CardHeader className="text-center">
            <CardTitle>أكمل بياناتك</CardTitle>
            <CardDescription>
              تأكيد الاسم واختيار نوع الحساب فقط
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label>الاسم الكامل</Label>
                <div className="relative">
                  <UserIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pr-10"
                    required
                    placeholder="اكتب اسمك بالكامل"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>رقم الهاتف (اختياري)</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    dir="ltr"
                    className="text-left pl-10"
                    placeholder="01xxxxxxxxx"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>نوع الحساب</Label>
                <RadioGroup
                  value={accountType}
                  onValueChange={(v) => setAccountType(v as AccountType)}
                  className="grid grid-cols-2 gap-3"
                >
                  <label
                    htmlFor="acc-student"
                    className={`flex items-center justify-center gap-2 rounded-lg border p-3 cursor-pointer transition ${
                      accountType === "student" ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <RadioGroupItem value="student" id="acc-student" />
                    <GraduationCap className="h-4 w-4" />
                    <span>طالب</span>
                  </label>
                  <label
                    htmlFor="acc-teacher"
                    className={`flex items-center justify-center gap-2 rounded-lg border p-3 cursor-pointer transition ${
                      accountType === "teacher" ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <RadioGroupItem value="teacher" id="acc-teacher" />
                    <Briefcase className="h-4 w-4" />
                    <span>معلم</span>
                  </label>
                </RadioGroup>
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin ml-2" />
                    جاري الحفظ...
                  </>
                ) : (
                  "تفعيل الحساب"
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                {accountType === "student"
                  ? "ستختار النظام التعليمي والمرحلة والصف بعد التفعيل"
                  : "ستكمل بيانات التسجيل كمعلم في الخطوة التالية"}
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

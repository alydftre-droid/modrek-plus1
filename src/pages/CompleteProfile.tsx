import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, User as UserIcon, Phone } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import mudrikLogo from "@/assets/mudrik-logo.png";

/**
 * Simplified Google-signup completion page.
 * Google sign-ups land here with only an email + name from Google.
 * We just confirm Full Name + optional Phone, mark the user as a "student",
 * then route to /select-education-type which handles
 * (عام/أزهر) → (إعدادي/ثانوي) → (الصف) → (الشعبة) — same as the email flow.
 */
export default function CompleteProfile() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();

  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
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

      // Already a student with education_type set → go straight to education flow / dashboard
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, education_type")
        .eq("id", user.id)
        .maybeSingle();

      if (roleRow?.role === "student" && profile?.education_type) {
        navigate("/dashboard", { replace: true });
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
      // 1) Update profile with name + phone, mark as student
      const { error: profErr } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          role: "student",
        })
        .eq("id", user.id);
      if (profErr) throw profErr;

      // 2) Ensure user_roles entry exists as student
      await supabase.from("user_roles").upsert(
        { user_id: user.id, role: "student" as any },
        { onConflict: "user_id,role", ignoreDuplicates: true } as any,
      );

      toast({ title: "تم حفظ بياناتك ✓", description: "جاري نقلك لاختيار نظامك التعليمي..." });
      // Route to the same flow as email signup
      navigate("/select-education-type", { replace: true });
    } catch (err: any) {
      toast({
        title: "خطأ في الحفظ",
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
              نحتاج اسمك ورقم هاتفك فقط لإتمام التسجيل
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

              <Button type="submit" className="w-full" size="lg" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin ml-2" />
                    جاري الحفظ...
                  </>
                ) : (
                  "متابعة"
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                ستختار النظام التعليمي (عام/أزهر) والمرحلة والصف في الخطوة التالية
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

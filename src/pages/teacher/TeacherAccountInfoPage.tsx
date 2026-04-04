import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, User, Mail, Phone, Hash } from "lucide-react";

export default function TeacherAccountInfoPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setProfile(data); });
  }, [user?.id]);

  const infoFields = profile ? [
    { label: "الاسم الكامل", value: profile.full_name, icon: User, color: "bg-blue-500/10 text-blue-600" },
    { label: "البريد الإلكتروني", value: profile.email, icon: Mail, color: "bg-violet-500/10 text-violet-600" },
    { label: "رقم الهاتف", value: profile.phone || "غير مسجل", icon: Phone, color: "bg-emerald-500/10 text-emerald-600" },
    { label: "كود المعلم", value: profile.teacher_code || "—", icon: Hash, color: "bg-amber-500/10 text-amber-600" },
  ] : [];

  return (
    <TeacherSidebarLayout title="معلومات الحساب" teacherName={profile?.full_name} teacherAvatar={profile?.avatar_url}>
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        {/* Back button */}
        <button onClick={() => navigate("/teacher/settings")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowRight className="h-4 w-4" />
          الرجوع للإعدادات
        </button>

        {/* Header */}
        <div className="text-center py-4">
          <div className="h-20 w-20 mx-auto rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-3 shadow-xl overflow-hidden ring-4 ring-blue-100">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <User className="h-8 w-8 text-white" />
            )}
          </div>
          <h2 className="text-lg font-bold text-foreground">{profile?.full_name || "..."}</h2>
          <p className="text-xs text-muted-foreground mt-1">معلومات حسابك المسجلة في المنصة</p>
        </div>

        {/* Info Cards */}
        <div className="space-y-3">
          {infoFields.map((field, i) => (
            <Card key={i} className="border border-border overflow-hidden">
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`h-11 w-11 rounded-xl ${field.color} flex items-center justify-center shrink-0`}>
                  <field.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">{field.label}</p>
                  <p className="text-sm font-semibold text-foreground truncate mt-0.5" dir="auto">{field.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </TeacherSidebarLayout>
  );
}

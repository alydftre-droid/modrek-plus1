import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { User, Shield, MessageCircle, ChevronLeft, Settings, ArrowRight } from "lucide-react";

const settingsItems = [
  {
    id: "account-info",
    label: "معلومات الحساب",
    description: "الاسم، رقم الهاتف، الصورة الشخصية",
    icon: User,
    color: "text-blue-600 bg-blue-50 dark:bg-blue-500/10",
    path: "/teacher/settings/account",
  },
  {
    id: "password",
    label: "كلمة المرور والأمان",
    description: "تغيير كلمة المرور، تغيير البريد الإلكتروني",
    icon: Shield,
    color: "text-violet-600 bg-violet-50 dark:bg-violet-500/10",
    path: "/teacher/settings/security",
  },
  {
    id: "support",
    label: "التواصل مع الدعم",
    description: "معلومات التواصل مع إدارة المنصة",
    icon: MessageCircle,
    color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10",
    path: "/teacher/settings/support",
  },
];

export default function TeacherSettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [teacherName, setTeacherName] = useState("");
  const [teacherAvatar, setTeacherAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) { setTeacherName(data.full_name); setTeacherAvatar(data.avatar_url); }
      });
  }, [user?.id]);

  return (
    <TeacherSidebarLayout title="الإعدادات" teacherName={teacherName} teacherAvatar={teacherAvatar}>
      <div className="p-4 md:p-8 max-w-lg mx-auto space-y-5">
        {/* Back button */}
        <button
          onClick={() => navigate("/teacher")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowRight className="h-4 w-4" />
          الرجوع للصفحة الرئيسية
        </button>

        {/* Header */}
        <div className="text-center py-2">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/10 flex items-center justify-center mb-3 shadow-sm">
            <Settings className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground">الإعدادات</h2>
          <p className="text-xs text-muted-foreground mt-1">إدارة حسابك وبيانات الأمان</p>
        </div>

        {/* Settings cards */}
        <div className="space-y-3">
          {settingsItems.map((item) => (
            <Card
              key={item.id}
              className="cursor-pointer hover:shadow-lg transition-all duration-300 border border-border/60 hover:border-primary/30 group bg-card/80 backdrop-blur-sm"
              onClick={() => navigate(item.path)}
            >
              <CardContent className="p-4 flex items-center gap-3.5">
                <div className={`h-12 w-12 rounded-2xl ${item.color} flex items-center justify-center shrink-0 shadow-sm`}>
                  <item.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-foreground">{item.label}</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{item.description}</p>
                </div>
                <ChevronLeft className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:-translate-x-0.5 transition-all shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center pt-8 pb-4">
          <p className="text-[11px] text-muted-foreground/70">منصة أزهاريون التعليمية — إصدار 2026</p>
        </div>
      </div>
    </TeacherSidebarLayout>
  );
}

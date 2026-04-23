import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { User, Shield, MessageCircle, ChevronLeft, Settings } from "lucide-react";

const settingsItems = [
  {
    id: "account-info",
    label: "معلومات الحساب",
    description: "الاسم، رقم الهاتف، الصورة الشخصية",
    icon: User,
    themeClass: "teacher-settings-card--emerald",
    path: "/teacher/settings/account",
  },
  {
    id: "password",
    label: "كلمة المرور والأمان",
    description: "تغيير كلمة المرور، تغيير البريد الإلكتروني",
    icon: Shield,
    themeClass: "teacher-settings-card--sky",
    path: "/teacher/settings/security",
  },
  {
    id: "support",
    label: "التواصل مع الدعم",
    description: "معلومات التواصل مع إدارة المنصة",
    icon: MessageCircle,
    themeClass: "teacher-settings-card--amber",
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
      <div className="p-5 md:p-8 max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="text-center pt-4 pb-2">
          <div className="teacher-settings-hero-icon mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl">
            <Settings className="teacher-settings-hero-icon__glyph h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-foreground">الإعدادات</h2>
          <p className="text-xs text-muted-foreground mt-1">إدارة حسابك وبيانات الأمان</p>
        </div>

        {/* Settings cards */}
        <div className="space-y-2.5">
          {settingsItems.map((item) => (
            <Card
              key={item.id}
              className={`teacher-settings-card ${item.themeClass} group cursor-pointer border transition-all duration-200`}
              onClick={() => navigate(item.path)}
            >
              <CardContent className="p-3.5 flex items-center gap-3">
                <div className="teacher-settings-card__icon flex h-11 w-11 items-center justify-center rounded-xl shrink-0">
                  <item.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-foreground">{item.label}</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{item.description}</p>
                </div>
                <ChevronLeft className="teacher-settings-card__chevron h-4 w-4 shrink-0 transition-all" />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center pt-6 pb-4">
          <p className="text-[10px] text-muted-foreground/60">منصة مدرك Plus التعليمية — إصدار 2026</p>
        </div>
      </div>
    </TeacherSidebarLayout>
  );
}

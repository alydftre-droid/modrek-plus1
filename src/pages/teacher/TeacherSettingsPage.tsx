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
      <div className="p-4 md:p-8 max-w-lg mx-auto space-y-4">
        <div className="text-center py-4">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-2">
            <Settings className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-foreground">الإعدادات</h2>
          <p className="text-xs text-muted-foreground mt-1">إدارة حسابك وبيانات الأمان</p>
        </div>

        <div className="space-y-2.5">
          {settingsItems.map((item) => (
            <Card
              key={item.id}
              className="cursor-pointer hover:shadow-md transition-all duration-200 border border-border hover:border-primary/20 group"
              onClick={() => navigate(item.path)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`h-11 w-11 rounded-xl ${item.color} flex items-center justify-center shrink-0`}>
                  <item.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-foreground">{item.label}</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{item.description}</p>
                </div>
                <ChevronLeft className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center pt-6 pb-4">
          <p className="text-[11px] text-muted-foreground">منصة أزهاريون التعليمية — إصدار 2026</p>
        </div>
      </div>
    </TeacherSidebarLayout>
  );
}

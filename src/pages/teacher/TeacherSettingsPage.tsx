import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { User, Shield, MessageCircle, ChevronLeft } from "lucide-react";

const settingsItems = [
  {
    id: "account-info",
    label: "معلومات الحساب",
    description: "الاسم، رقم الهاتف، البريد الإلكتروني",
    icon: User,
    color: "from-blue-500 to-blue-600",
    path: "/teacher/settings/account",
  },
  {
    id: "password",
    label: "كلمة المرور وبيانات الحساب",
    description: "تغيير كلمة السر، نسيت كلمة السر، تغيير البريد",
    icon: Shield,
    color: "from-violet-500 to-purple-600",
    path: "/teacher/settings/security",
  },
  {
    id: "support",
    label: "التواصل مع الدعم",
    description: "معلومات التواصل مع إدارة المنصة",
    icon: MessageCircle,
    color: "from-emerald-500 to-green-600",
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
        if (data) {
          setTeacherName(data.full_name);
          setTeacherAvatar(data.avatar_url);
        }
      });
  }, [user?.id]);

  return (
    <TeacherSidebarLayout title="الإعدادات" teacherName={teacherName} teacherAvatar={teacherAvatar}>
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="text-center py-6">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-[hsl(158,64%,28%)] to-[hsl(158,55%,22%)] flex items-center justify-center mb-3 shadow-lg">
            <Settings className="h-7 w-7 text-white" />
          </div>
          <h2 className="text-xl font-bold text-foreground">الإعدادات</h2>
          <p className="text-sm text-muted-foreground mt-1">إدارة حسابك وبيانات الأمان</p>
        </div>

        {/* Settings Items */}
        <div className="space-y-3">
          {settingsItems.map((item) => (
            <Card
              key={item.id}
              className="cursor-pointer hover:shadow-lg transition-all duration-200 border border-border hover:border-primary/30 overflow-hidden group"
              onClick={() => navigate(item.path)}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center shrink-0 shadow-md`}>
                  <item.icon className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-foreground">{item.label}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                </div>
                <ChevronLeft className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* App Info */}
        <div className="text-center pt-8 pb-4">
          <p className="text-xs text-muted-foreground">منصة أزهاريون التعليمية — إصدار 2026</p>
        </div>
      </div>
    </TeacherSidebarLayout>
  );
}

// Need to import Settings icon
import { Settings } from "lucide-react";

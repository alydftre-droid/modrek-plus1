import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, MessageCircle, Phone, Mail, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TeacherSupportSettingsPage() {
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
    <TeacherSidebarLayout title="التواصل مع الدعم" teacherName={teacherName} teacherAvatar={teacherAvatar}>
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        <button onClick={() => navigate("/teacher/settings")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowRight className="h-4 w-4" />
          الرجوع للإعدادات
        </button>

        <div className="text-center py-4">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center mb-2 shadow-lg">
            <MessageCircle className="h-6 w-6 text-white" />
          </div>
          <h2 className="text-lg font-bold">التواصل مع الدعم</h2>
          <p className="text-sm text-muted-foreground mt-1">تواصل مع إدارة المنصة للحصول على المساعدة</p>
        </div>

        <div className="space-y-3">
          <Card className="border border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <MessageCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">واتساب</h3>
                  <p className="text-xs text-muted-foreground">تواصل فوري مع فريق الدعم</p>
                </div>
              </div>
              <Button
                onClick={() => window.open("https://wa.me/201223909712?text=مرحباً، أنا معلم على منصة أزهاريون وأحتاج مساعدة", "_blank")}
                className="w-full bg-gradient-to-r from-emerald-500 to-green-600 text-white border-0 gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                فتح واتساب
              </Button>
            </CardContent>
          </Card>

          <Card className="border border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                <Phone className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">رقم الهاتف</p>
                <p className="text-sm font-semibold text-foreground" dir="ltr">+20 122 390 9712</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
                <Mail className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">البريد الإلكتروني</p>
                <p className="text-sm font-semibold text-foreground" dir="ltr">support@azharyon.com</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </TeacherSidebarLayout>
  );
}

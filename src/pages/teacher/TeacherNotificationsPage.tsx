import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, Loader2 } from "lucide-react";

interface Notification {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  notification_type: string | null;
}

export default function TeacherNotificationsPage() {
  const { user } = useAuth();
  const [teacherName, setTeacherName] = useState("");
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user?.id]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const [profileRes, notifRes] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    ]);

    if (profileRes.data) setTeacherName(profileRes.data.full_name);
    setNotifications((notifRes.data || []) as Notification[]);

    // Mark all as read
    if (notifRes.data?.some(n => !n.is_read)) {
      await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <TeacherSidebarLayout title="الإشعارات" teacherName={teacherName}>
        <div className="flex items-center justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
      </TeacherSidebarLayout>
    );
  }

  return (
    <TeacherSidebarLayout title="الإشعارات" teacherName={teacherName}>
      <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-3">
        {notifications.length === 0 ? (
          <div className="text-center py-16">
            <Bell className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">لا توجد إشعارات</p>
          </div>
        ) : (
          notifications.map(n => (
            <Card key={n.id} className={!n.is_read ? "border-primary/30 bg-primary/5" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center mt-0.5 shrink-0">
                    <Bell className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-bold text-sm">{n.title}</p>
                      {!n.is_read && <Badge className="bg-primary text-primary-foreground text-[10px] h-4">جديد</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{n.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(n.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </TeacherSidebarLayout>
  );
}

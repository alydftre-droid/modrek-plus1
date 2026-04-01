import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Badge } from "@/components/ui/badge";
import { Bell, Loader2, CheckCircle, Info, AlertTriangle, Wallet } from "lucide-react";
import { motion } from "framer-motion";

interface Notification {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  notification_type: string | null;
}

const typeIcon = (type: string | null) => {
  if (type === "withdrawal") return <Wallet className="h-4 w-4 text-white" />;
  if (type === "warning") return <AlertTriangle className="h-4 w-4 text-white" />;
  if (type === "success") return <CheckCircle className="h-4 w-4 text-white" />;
  return <Info className="h-4 w-4 text-white" />;
};

const typeIconBg = (type: string | null) => {
  if (type === "withdrawal") return "teacher-stat-icon--green";
  if (type === "warning") return "teacher-stat-icon--orange";
  if (type === "success") return "teacher-stat-icon--green";
  return "teacher-stat-icon--blue";
};

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
            <div className="teacher-stat-icon teacher-stat-icon--blue h-16 w-16 mx-auto mb-4 rounded-2xl">
              <Bell className="h-8 w-8 text-white" />
            </div>
            <p className="text-lg font-bold mb-1">لا توجد إشعارات</p>
            <p className="text-muted-foreground text-sm">ستظهر هنا الإشعارات الجديدة عند وصولها</p>
          </div>
        ) : (
          notifications.map((n, i) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className={`teacher-notif-item ${!n.is_read ? "teacher-notif-item--unread" : ""}`}
            >
              <div className="flex items-start gap-3">
                <div className={`teacher-stat-icon ${typeIconBg(n.notification_type)} h-9 w-9 rounded-xl shrink-0 mt-0.5`}>
                  {typeIcon(n.notification_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-sm">{n.title}</p>
                    {!n.is_read && (
                      <Badge className="bg-gradient-to-r from-blue-500 to-blue-600 text-white text-[10px] h-4 border-0">جديد</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {new Date(n.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </TeacherSidebarLayout>
  );
}

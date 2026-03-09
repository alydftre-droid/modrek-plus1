import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/student/StudentLayout";
import {
  Bell, Check, BookOpen, Loader2, Video, FileText,
  Trash2, CheckCheck, Clock, Sparkles,
} from "lucide-react";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  is_read: boolean | null;
  created_at: string | null;
  notification_type: string | null;
  link: string | null;
};

const NotificationsPage = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await supabase.from("notifications").select("id, title, message, is_read, created_at, notification_type, link").or(`user_id.eq.${user.id},user_id.is.null`).order("created_at", { ascending: false }).limit(100);
      setNotifications((data || []) as NotificationItem[]);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`notifs-page-${user.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => fetchNotifications()).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchNotifications]);

  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true } as any).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true } as any).or(`user_id.eq.${user.id},user_id.is.null`).eq("is_read", false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const deleteNotification = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "الآن";
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `منذ ${days} يوم`;
    return new Date(dateStr).toLocaleDateString("ar-EG");
  };

  const getIcon = (type: string | null) => {
    switch (type) {
      case "video": return <Video className="h-5 w-5 text-blue-500" />;
      case "exam": return <FileText className="h-5 w-5 text-amber-500" />;
      case "pdf": return <BookOpen className="h-5 w-5 text-emerald-500" />;
      case "summary": return <Sparkles className="h-5 w-5 text-purple-500" />;
      default: return <Bell className="h-5 w-5 text-primary" />;
    }
  };

  const getTypeColor = (type: string | null) => {
    switch (type) {
      case "video": return "bg-blue-500/10 border-blue-200";
      case "exam": return "bg-amber-500/10 border-amber-200";
      case "pdf": return "bg-emerald-500/10 border-emerald-200";
      case "summary": return "bg-purple-500/10 border-purple-200";
      default: return "bg-primary/10 border-primary/20";
    }
  };

  const filtered = filter === "unread" ? notifications.filter(n => !n.is_read) : notifications;
  const unreadCount = notifications.filter(n => !n.is_read).length;

  const headerActions = unreadCount > 0 ? (
    <Button variant="outline" size="sm" onClick={markAllRead} className="gap-1.5 text-xs">
      <CheckCheck className="h-3.5 w-3.5" />
      تحديد الكل كمقروء
    </Button>
  ) : undefined;

  return (
    <StudentLayout title="الإشعارات" headerActions={headerActions}>
      <div className="p-3 lg:p-6 max-w-2xl mx-auto">
        {/* Filter */}
        <div className="flex gap-2 mb-6">
          <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")} className="gap-1.5">
            <Bell className="h-4 w-4" />الكل ({notifications.length})
          </Button>
          <Button variant={filter === "unread" ? "default" : "outline"} size="sm" onClick={() => setFilter("unread")} className="gap-1.5">
            <Clock className="h-4 w-4" />غير مقروء ({unreadCount})
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Bell className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">لا توجد إشعارات</h3>
            <p className="text-muted-foreground">ستظهر هنا الإشعارات الجديدة</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((n) => (
              <div
                key={n.id}
                className={`relative p-4 rounded-xl border transition-all duration-200 hover:shadow-md ${
                  !n.is_read ? getTypeColor(n.notification_type) : "bg-card border-border"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-xl shrink-0 ${!n.is_read ? "bg-white/60" : "bg-muted"}`}>
                    {getIcon(n.notification_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className={`font-bold text-sm ${!n.is_read ? "text-foreground" : "text-muted-foreground"}`}>{n.title}</h3>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">{formatTime(n.created_at)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{n.message}</p>
                    <div className="flex items-center gap-2 mt-2.5">
                      {n.link && (
                        <Button variant="outline" size="sm" asChild className="h-7 text-xs rounded-lg">
                          <Link to={n.link}>فتح</Link>
                        </Button>
                      )}
                      {!n.is_read && (
                        <Button variant="ghost" size="sm" onClick={() => markAsRead(n.id)} className="h-7 text-xs gap-1 rounded-lg">
                          <Check className="h-3 w-3" />تم القراءة
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => deleteNotification(n.id)} className="h-7 text-xs gap-1 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10 mr-auto">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {!n.is_read && <span className="absolute top-4 left-4 h-2.5 w-2.5 rounded-full bg-primary" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </StudentLayout>
  );
};

export default NotificationsPage;

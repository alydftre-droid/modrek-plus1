import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Bell, Check, BookOpen, Loader2, Video, FileText,
  ChevronLeft, Trash2, CheckCheck, Clock, Sparkles,
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
      const { data } = await supabase
        .from("notifications")
        .select("id, title, message, is_read, created_at, notification_type, link")
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .order("created_at", { ascending: false })
        .limit(100);

      setNotifications((data || []) as NotificationItem[]);
    } catch (e) {
      console.error("Error fetching notifications:", e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifs-page-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => fetchNotifications())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchNotifications]);

  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true } as any).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ is_read: true } as any)
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .eq("is_read", false);
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
      case "video": return "bg-blue-500/10 border-blue-200 dark:border-blue-800";
      case "exam": return "bg-amber-500/10 border-amber-200 dark:border-amber-800";
      case "pdf": return "bg-emerald-500/10 border-emerald-200 dark:border-emerald-800";
      case "summary": return "bg-purple-500/10 border-purple-200 dark:border-purple-800";
      default: return "bg-primary/10 border-primary/20";
    }
  };

  const filtered = filter === "unread"
    ? notifications.filter(n => !n.is_read)
    : notifications;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/10" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/dashboard"><ChevronLeft className="h-5 w-5 rotate-180" /></Link>
            </Button>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-primary/10">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <h1 className="text-xl font-bold text-foreground">الإشعارات</h1>
              {unreadCount > 0 && (
                <Badge className="bg-destructive text-destructive-foreground font-bold">
                  {unreadCount} جديد
                </Badge>
              )}
            </div>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead} className="gap-1.5">
              <CheckCheck className="h-4 w-4" />
              تحديد الكل كمقروء
            </Button>
          )}
        </div>
      </header>

      <main className="container px-4 py-6 max-w-2xl mx-auto">
        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
            className="gap-1.5"
          >
            <Bell className="h-4 w-4" />
            الكل ({notifications.length})
          </Button>
          <Button
            variant={filter === "unread" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("unread")}
            className="gap-1.5"
          >
            <Clock className="h-4 w-4" />
            غير مقروء ({unreadCount})
          </Button>
        </div>

        {/* Notifications List */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="w-20 h-20 mx-auto rounded-full bg-muted flex items-center justify-center mb-4">
              <Bell className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">
              {filter === "unread" ? "لا توجد إشعارات جديدة" : "لا توجد إشعارات"}
            </h3>
            <p className="text-muted-foreground">
              ستصلك إشعارات عند إضافة محتوى جديد من معلمك
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((n) => (
              <Card
                key={n.id}
                className={`overflow-hidden transition-all hover:shadow-lg cursor-pointer group ${
                  !n.is_read ? "ring-2 ring-primary/20 shadow-md" : "opacity-80 hover:opacity-100"
                }`}
                onClick={() => !n.is_read && markAsRead(n.id)}
              >
                <div className={`h-1 ${!n.is_read ? "bg-gradient-to-l from-primary via-primary/60 to-secondary" : "bg-muted"}`} />
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className={`p-3 rounded-2xl shrink-0 border ${getTypeColor(n.notification_type)}`}>
                      {getIcon(n.notification_type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className={`text-sm font-bold ${!n.is_read ? "text-foreground" : "text-muted-foreground"}`}>
                            {n.title}
                          </h3>
                          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                            {n.message}
                          </p>
                        </div>
                        {!n.is_read && (
                          <div className="h-3 w-3 rounded-full bg-primary shrink-0 mt-1 animate-pulse" />
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatTime(n.created_at)}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!n.is_read && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
                              onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}>
                              <Check className="h-3 w-3" /> قراءة
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive gap-1"
                            onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}>
                            <Trash2 className="h-3 w-3" /> حذف
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default NotificationsPage;

import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/student/StudentLayout";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, BookOpen, Loader2, Video, FileText,
  Sparkles, Clock, Megaphone, CheckCircle2,
  Wallet, AlertTriangle, ExternalLink,
} from "lucide-react";

type NotificationItem = {
  id: string;
  user_id: string | null;
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
  const observerRef = useRef<IntersectionObserver | null>(null);
  const markedIds = useRef<Set<string>>(new Set());

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from("notifications")
        .select("id, user_id, title, message, is_read, created_at, notification_type, link")
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .order("created_at", { ascending: false })
        .limit(100);
      setNotifications((data || []) as NotificationItem[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Real-time new notifications
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifs-page-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as NotificationItem;
          setNotifications((prev) => (prev.some((item) => item.id === row.id) ? prev : [row, ...prev]));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as NotificationItem;
          setNotifications((prev) => prev.map((item) => (item.id === row.id ? row : item)));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const oldRow = payload.old as Pick<NotificationItem, "id">;
          setNotifications((prev) => prev.filter((item) => item.id !== oldRow.id));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchNotifications]);

  // Auto-mark as read when notification becomes visible
  const markAsRead = useCallback(async (id: string) => {
    if (markedIds.current.has(id)) return;
    markedIds.current.add(id);
    await supabase.from("notifications").update({ is_read: true } as any).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }, []);

  // IntersectionObserver to auto-mark unread notifications
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute("data-notif-id");
            const isRead = entry.target.getAttribute("data-is-read");
            if (id && isRead === "false") {
              markAsRead(id);
            }
          }
        });
      },
      { threshold: 0.5 }
    );
    return () => { observerRef.current?.disconnect(); };
  }, [markAsRead]);

  const observeRef = useCallback((node: HTMLDivElement | null) => {
    if (node && observerRef.current) {
      observerRef.current.observe(node);
    }
  }, []);

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "الآن";
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "أمس";
    if (days < 7) return `منذ ${days} أيام`;
    if (days < 30) return `منذ ${Math.floor(days / 7)} أسبوع`;
    return new Date(dateStr).toLocaleDateString("ar-EG");
  };

  const getDateGroup = (dateStr: string | null): string => {
    if (!dateStr) return "أخرى";
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "اليوم";
    if (days === 1) return "أمس";
    if (days < 7) return "هذا الأسبوع";
    if (days < 30) return "هذا الشهر";
    return "أقدم";
  };

  const getIcon = (type: string | null) => {
    switch (type) {
      case "video": return <Video className="h-4.5 w-4.5" />;
      case "exam": return <FileText className="h-4.5 w-4.5" />;
      case "pdf": case "book": return <BookOpen className="h-4.5 w-4.5" />;
      case "summary": return <Sparkles className="h-4.5 w-4.5" />;
      case "withdrawal": case "wallet": return <Wallet className="h-4.5 w-4.5" />;
      case "warning": return <AlertTriangle className="h-4.5 w-4.5" />;
      case "success": return <CheckCircle2 className="h-4.5 w-4.5" />;
      case "announcement": return <Megaphone className="h-4.5 w-4.5" />;
      default: return <Bell className="h-4.5 w-4.5" />;
    }
  };

  const getIconStyles = (type: string | null) => {
    switch (type) {
      case "video": return "bg-blue-500/15 text-blue-600";
      case "exam": return "bg-amber-500/15 text-amber-600";
      case "pdf": case "book": return "bg-emerald-500/15 text-emerald-600";
      case "summary": return "bg-purple-500/15 text-purple-600";
      case "withdrawal": case "wallet": return "bg-green-500/15 text-green-600";
      case "warning": return "bg-red-500/15 text-red-600";
      case "success": return "bg-teal-500/15 text-teal-600";
      case "announcement": return "bg-pink-500/15 text-pink-600";
      default: return "bg-primary/10 text-primary";
    }
  };

  const getTypeLabel = (type: string | null) => {
    switch (type) {
      case "video": return "فيديو جديد";
      case "exam": return "امتحان";
      case "pdf": case "book": return "ملف جديد";
      case "summary": return "ملخص";
      case "withdrawal": case "wallet": return "محفظة";
      case "warning": return "تنبيه";
      case "success": return "إنجاز";
      case "announcement": return "إعلان";
      default: return "إشعار";
    }
  };

  // Group notifications by date
  const grouped = notifications.reduce((acc, n) => {
    const group = getDateGroup(n.created_at);
    if (!acc[group]) acc[group] = [];
    acc[group].push(n);
    return acc;
  }, {} as Record<string, NotificationItem[]>);

  const groupOrder = ["اليوم", "أمس", "هذا الأسبوع", "هذا الشهر", "أقدم"];
  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <StudentLayout title="الإشعارات">
      <div className="p-3 lg:p-6 max-w-2xl mx-auto">
        {/* Header stats */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">كل الإشعارات</h2>
              <p className="text-xs text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} إشعار جديد` : "لا توجد إشعارات جديدة"}
              </p>
            </div>
          </div>
          {unreadCount > 0 && (
            <Badge className="bg-primary/10 text-primary border-0 rounded-full px-3 py-1 text-xs font-bold">
              {unreadCount} جديد
            </Badge>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">جاري تحميل الإشعارات...</p>
          </div>
        ) : notifications.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <div className="w-20 h-20 mx-auto mb-5 rounded-3xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
              <Bell className="h-10 w-10 text-primary/60" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">لا توجد إشعارات</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              ستظهر هنا الإشعارات الجديدة عندما يتم إضافة محتوى أو امتحانات جديدة
            </p>
          </motion.div>
        ) : (
          <div className="space-y-6">
            {groupOrder.map(groupName => {
              const items = grouped[groupName];
              if (!items?.length) return null;
              return (
                <div key={groupName}>
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{groupName}</span>
                    <div className="flex-1 h-px bg-border/60" />
                  </div>
                  <div className="space-y-2">
                    <AnimatePresence>
                      {items.map((n, i) => (
                        <motion.div
                          ref={observeRef}
                          data-notif-id={n.id}
                          data-is-read={String(!!n.is_read)}
                          key={n.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.03 }}
                          className={`relative rounded-2xl border p-3.5 transition-all duration-300 ${
                            !n.is_read
                              ? "bg-primary/[0.04] border-primary/15 shadow-sm"
                              : "bg-card border-border/50 hover:border-border"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Icon */}
                            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${getIconStyles(n.notification_type)}`}>
                              {getIcon(n.notification_type)}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-0.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className={`text-sm font-bold leading-tight ${!n.is_read ? "text-foreground" : "text-foreground/80"}`}>
                                    {n.title}
                                  </h3>
                                  {!n.is_read && (
                                    <span className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" />
                                  )}
                                </div>
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">
                                  {formatTime(n.created_at)}
                                </span>
                              </div>

                              <p
                                dir="auto"
                                className={`text-xs text-muted-foreground leading-relaxed mb-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
                                  expandedIds.has(n.id) ? "" : "line-clamp-2"
                                }`}
                              >
                                {n.message}
                              </p>

                              {(n.message || "").length > 90 && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpanded(n.id)}
                                  className="mb-2 text-[11px] font-bold text-primary hover:underline"
                                >
                                  {expandedIds.has(n.id) ? "عرض أقل" : "عرض المزيد"}
                                </button>
                              )}


                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="rounded-full text-[10px] h-5 px-2 border-border/60 text-muted-foreground">
                                  {getTypeLabel(n.notification_type)}
                                </Badge>
                                {n.link && (
                                  <Button variant="ghost" size="sm" asChild className="h-5 text-[10px] gap-1 px-2 rounded-full text-primary hover:bg-primary/10">
                                    <Link to={n.link}>
                                      فتح <ExternalLink className="h-2.5 w-2.5" />
                                    </Link>
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </StudentLayout>
  );
};

export default NotificationsPage;

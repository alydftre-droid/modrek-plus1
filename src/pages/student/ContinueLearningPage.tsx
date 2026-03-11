import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/student/StudentLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Play, Video, Clock, ChevronLeft } from "lucide-react";
import { motion } from "framer-motion";

interface WatchedContent {
  id: string;
  content_id: string;
  title: string;
  subject_name: string;
  file_url: string;
  duration?: string;
  watched_at: string;
}

export default function ContinueLearningPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState<WatchedContent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        // Get last 10 unique watched videos
        const { data: logs } = await supabase
          .from("usage_logs")
          .select("content_id, created_at")
          .eq("user_id", user.id)
          .eq("action", "watch_video")
          .order("created_at", { ascending: false })
          .limit(30);

        if (!logs?.length) { setLoading(false); return; }

        // Deduplicate by content_id, keep most recent
        const seen = new Set<string>();
        const uniqueLogs = logs.filter(l => {
          if (!l.content_id || seen.has(l.content_id)) return false;
          seen.add(l.content_id);
          return true;
        }).slice(0, 10);

        const contentIds = uniqueLogs.map(l => l.content_id!);
        const { data: contents } = await supabase
          .from("content")
          .select("id, title, file_url, duration, subject_id")
          .in("id", contentIds);

        if (contents) {
          const subjectIds = [...new Set(contents.map(c => c.subject_id).filter(Boolean))];
          const { data: subjects } = subjectIds.length > 0
            ? await supabase.from("subjects").select("id, name").in("id", subjectIds)
            : { data: [] };
          const subjectMap = Object.fromEntries((subjects || []).map(s => [s.id, s.name]));

          const result: WatchedContent[] = uniqueLogs.map(log => {
            const c = contents.find(ct => ct.id === log.content_id);
            return {
              id: log.content_id!,
              content_id: log.content_id!,
              title: c?.title || "",
              subject_name: subjectMap[c?.subject_id || ""] || "",
              file_url: c?.file_url || "",
              duration: c?.duration || undefined,
              watched_at: log.created_at || "",
            };
          }).filter(r => r.title);

          setItems(result);
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [user]);

  const formatDate = (d: string) => {
    try {
      const date = new Date(d);
      const now = new Date();
      const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
      if (diff < 60) return `منذ ${diff} دقيقة`;
      if (diff < 1440) return `منذ ${Math.floor(diff / 60)} ساعة`;
      return `منذ ${Math.floor(diff / 1440)} يوم`;
    } catch { return ""; }
  };

  return (
    <StudentLayout title="أكمل التعلم">
      <div className="p-4 lg:p-6 max-w-4xl mx-auto" dir="rtl">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-muted flex items-center justify-center">
              <Video className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">لم تشاهد أي دروس بعد</h3>
            <p className="text-muted-foreground text-sm">ابدأ بمشاهدة دروسك من صفحة المواد</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm mb-4">آخر {items.length} دروس شاهدتها</p>

            {/* First item = highlighted */}
            {items.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card
                  className="cursor-pointer border-0 overflow-hidden group hover:shadow-xl transition-all duration-300"
                  onClick={() => window.open(items[0].file_url, "_blank")}
                  style={{ background: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)" }}
                >
                  <CardContent className="p-5 flex items-center gap-4 relative">
                    <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                      <Play className="h-7 w-7 text-cyan-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold text-base truncate">{items[0].title}</p>
                      <p className="text-white/60 text-xs mt-0.5">{items[0].subject_name}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        {items[0].duration && (
                          <span className="text-cyan-300/80 text-[11px] flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {items[0].duration}
                          </span>
                        )}
                        <span className="text-white/40 text-[11px]">{formatDate(items[0].watched_at)}</span>
                      </div>
                    </div>
                    <ChevronLeft className="h-5 w-5 text-white/40 flex-shrink-0" />
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Remaining items */}
            {items.slice(1).map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: (i + 1) * 0.05 }}
              >
                <Card
                  className="cursor-pointer border border-border/50 overflow-hidden group hover:shadow-lg hover:border-primary/30 transition-all duration-300"
                  onClick={() => window.open(item.file_url, "_blank")}
                >
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Play className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">{item.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-muted-foreground text-xs truncate">{item.subject_name}</span>
                        <span className="text-muted-foreground/50 text-[10px]">{formatDate(item.watched_at)}</span>
                      </div>
                    </div>
                    <ChevronLeft className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </StudentLayout>
  );
}


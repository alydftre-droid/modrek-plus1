import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, ArrowRight, BarChart3, BookOpen, Clock, Database, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface LogRow {
  id: string;
  created_at: string;
  intent: string | null;
  role: string | null;
  cache_hit: boolean;
  fallback_external: boolean;
  duration_ms: number | null;
  top_confidence: number | null;
  results_count: number;
  tier_used: string | null;
  query_text: string;
}

interface SourceCount { source_type: string | null; count: number }

function fmt(n: number) { return new Intl.NumberFormat("ar-EG").format(n); }
function pct(n: number) { return `${(n * 100).toFixed(1)}%`; }

export default function ModrekAnalyticsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [sources, setSources] = useState<SourceCount[]>([]);
  const [totalSources, setTotalSources] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [pendingJobs, setPendingJobs] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
        const [logRes, srcRes, chunkRes, jobRes] = await Promise.all([
          supabase.from("modrek_search_logs")
            .select("id,created_at,intent,role,cache_hit,fallback_external,duration_ms,top_confidence,results_count,tier_used,query_text")
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(500),
          supabase.from("modrek_sources").select("source_type", { count: "exact", head: false }).limit(2000),
          supabase.from("content_chunks").select("id", { count: "exact", head: true }),
          supabase.from("processing_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "running", "retrying"] as any),
        ]);

        setLogs((logRes.data ?? []) as LogRow[]);
        setTotalChunks(chunkRes.count ?? 0);
        setPendingJobs(jobRes.count ?? 0);
        setTotalSources(srcRes.count ?? (srcRes.data?.length ?? 0));

        const bucket = new Map<string, number>();
        (srcRes.data ?? []).forEach((s: any) => {
          const key = String(s.source_type ?? "غير محدد");
          bucket.set(key, (bucket.get(key) ?? 0) + 1);
        });
        setSources(Array.from(bucket, ([source_type, count]) => ({ source_type, count })).sort((a, b) => b.count - a.count));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = useMemo(() => {
    const total = logs.length;
    if (!total) return { total: 0, avgMs: 0, successRate: 0, cacheRate: 0, externalRate: 0, avgConfidence: 0 };
    const durations = logs.filter((l) => l.duration_ms != null).map((l) => l.duration_ms as number);
    const avgMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const success = logs.filter((l) => (l.results_count ?? 0) > 0 && !l.fallback_external).length;
    const cache = logs.filter((l) => l.cache_hit).length;
    const external = logs.filter((l) => l.fallback_external).length;
    const conf = logs.filter((l) => l.top_confidence != null).map((l) => l.top_confidence as number);
    const avgConfidence = conf.length ? conf.reduce((a, b) => a + b, 0) / conf.length : 0;
    return {
      total,
      avgMs: Math.round(avgMs),
      successRate: success / total,
      cacheRate: cache / total,
      externalRate: external / total,
      avgConfidence,
    };
  }, [logs]);

  const intents = useMemo(() => {
    const bucket = new Map<string, number>();
    logs.forEach((l) => bucket.set(l.intent || "auto", (bucket.get(l.intent || "auto") ?? 0) + 1));
    return Array.from(bucket, ([intent, count]) => ({ intent, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [logs]);

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-violet-50/60 to-white p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-950">لوحة تحليلات Modrek AI</h1>
              <p className="text-sm text-slate-500">إحصائيات آخر 7 أيام لمحرك الاسترجاع والتفكير</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate("/admin/modrek-library")}>
            <ArrowRight className="ml-1 h-4 w-4" /> مكتبة Modrek
          </Button>
        </div>

        {loading ? (
          <Card className="p-10 text-center text-slate-500">جاري تحميل البيانات…</Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard icon={<Activity />} label="عدد الطلبات" value={fmt(stats.total)} tone="violet" />
              <StatCard icon={<Clock />} label="متوسط الاستجابة" value={`${fmt(stats.avgMs)} ms`} tone="sky" />
              <StatCard icon={<TrendingUp />} label="معدل النجاح" value={pct(stats.successRate)} tone="emerald" />
              <StatCard icon={<Database />} label="نسبة الكاش" value={pct(stats.cacheRate)} tone="amber" />
              <StatCard icon={<ShieldAlert />} label="اللجوء للخارجي" value={pct(stats.externalRate)} tone="rose" />
              <StatCard icon={<BarChart3 />} label="متوسط الثقة" value={pct(stats.avgConfidence)} tone="fuchsia" />
              <StatCard icon={<BookOpen />} label="مصادر المكتبة" value={fmt(totalSources)} tone="indigo" />
              <StatCard icon={<Database />} label="مقاطع مفهرسة" value={fmt(totalChunks)} tone="teal" />
            </div>

            {pendingJobs > 0 && (
              <Card className="mt-4 border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                يوجد {fmt(pendingJobs)} مهمة معالجة قيد التنفيذ في خط المعالجة.
              </Card>
            )}

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <Card className="p-4">
                <h3 className="mb-3 text-sm font-bold text-slate-800">توزيع النوايا (Intents)</h3>
                {intents.length === 0 ? <p className="text-xs text-slate-400">لا توجد بيانات</p> : (
                  <ul className="space-y-2">
                    {intents.map((i) => (
                      <li key={i.intent} className="flex items-center gap-2">
                        <div className="w-28 truncate text-xs font-semibold text-slate-700">{i.intent}</div>
                        <div className="h-2 flex-1 rounded-full bg-slate-100">
                          <div className="h-2 rounded-full bg-gradient-to-l from-violet-500 to-fuchsia-500" style={{ width: `${(i.count / intents[0].count) * 100}%` }} />
                        </div>
                        <div className="w-12 text-left text-xs font-bold text-violet-600">{fmt(i.count)}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="p-4">
                <h3 className="mb-3 text-sm font-bold text-slate-800">أنواع المصادر في المكتبة</h3>
                {sources.length === 0 ? <p className="text-xs text-slate-400">لم يتم رفع مصادر بعد</p> : (
                  <ul className="space-y-2">
                    {sources.slice(0, 8).map((s) => (
                      <li key={s.source_type ?? "unk"} className="flex items-center justify-between rounded-xl bg-violet-50/60 px-3 py-2 text-xs">
                        <span className="font-semibold text-slate-800">{s.source_type ?? "غير محدد"}</span>
                        <Badge variant="secondary" className="bg-violet-100 text-violet-700">{fmt(s.count)}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <Card className="mt-4 p-4">
              <h3 className="mb-3 text-sm font-bold text-slate-800">آخر الطلبات</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="pb-2 pl-2">الوقت</th>
                      <th className="pb-2 pl-2">النية</th>
                      <th className="pb-2 pl-2">الاستعلام</th>
                      <th className="pb-2 pl-2">النتائج</th>
                      <th className="pb-2 pl-2">الثقة</th>
                      <th className="pb-2 pl-2">المدة</th>
                      <th className="pb-2">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.slice(0, 25).map((l) => (
                      <tr key={l.id} className="border-t border-slate-100">
                        <td className="py-2 pl-2 text-slate-500">{new Date(l.created_at).toLocaleString("ar-EG", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "numeric" })}</td>
                        <td className="py-2 pl-2 font-semibold text-slate-800">{l.intent || "-"}</td>
                        <td className="max-w-[220px] truncate py-2 pl-2 text-slate-600">{l.query_text}</td>
                        <td className="py-2 pl-2 text-slate-700">{l.results_count}</td>
                        <td className="py-2 pl-2 text-slate-700">{l.top_confidence != null ? pct(l.top_confidence) : "-"}</td>
                        <td className="py-2 pl-2 text-slate-500">{l.duration_ms ?? "-"} ms</td>
                        <td className="py-2">
                          {l.fallback_external ? (
                            <Badge className="bg-rose-100 text-rose-700">خارجي</Badge>
                          ) : l.cache_hit ? (
                            <Badge className="bg-amber-100 text-amber-700">كاش</Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-700">مكتبة</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                    {logs.length === 0 && (
                      <tr><td colSpan={7} className="py-6 text-center text-slate-400">لا توجد طلبات مسجلة بعد</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  const tones: Record<string, string> = {
    violet: "from-violet-500 to-fuchsia-500",
    sky: "from-sky-500 to-cyan-500",
    emerald: "from-emerald-500 to-teal-500",
    amber: "from-amber-500 to-orange-500",
    rose: "from-rose-500 to-pink-500",
    fuchsia: "from-fuchsia-500 to-purple-500",
    indigo: "from-indigo-500 to-blue-500",
    teal: "from-teal-500 to-emerald-500",
  };
  return (
    <Card className="relative overflow-hidden p-3">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-l ${tones[tone] || tones.violet}`} />
      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br ${tones[tone] || tones.violet} text-white`}>
          {icon}
        </div>
        <div>
          <div className="text-[10px] text-slate-500">{label}</div>
          <div className="text-lg font-extrabold text-slate-900">{value}</div>
        </div>
      </div>
    </Card>
  );
}

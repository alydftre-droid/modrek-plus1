import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity, ArrowRight, BarChart3, BookOpen, Clock, Database,
  ShieldAlert, Sparkles, TrendingUp, Inbox,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  ModrekShell, ModrekCard, ModrekButton, ModrekHero, ModrekEyebrow,
  ModrekStat, ModrekSection, ModrekPill, ModrekEmpty,
} from "@/features/modrek/premium";

interface LogRow {
  id: string;
  created_at: string;
  intent: string | null;
  role: string | null;
  surface: string | null;
  cache_hit: boolean;
  fallback_external: boolean;
  duration_ms: number | null;
  top_confidence: number | null;
  results_count: number;
  tier_used: string | null;
  query_text: string;
  filters: any;
  trace: any;
}
interface SourceCount { source_type: string | null; count: number }

const fmt = (n: number) => new Intl.NumberFormat("ar-EG").format(n);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default function ModrekAnalyticsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [sources, setSources] = useState<SourceCount[]>([]);
  const [totalSources, setTotalSources] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [embeddedChunks, setEmbeddedChunks] = useState(0);
  const [pendingJobs, setPendingJobs] = useState(0);
  const [traceRow, setTraceRow] = useState<LogRow | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
        // NOTE: metrics read the LIVE library tables (library_books / library_book_chunks).
        // The old knowledge_sources/content_chunks tables are unused and made the
        // dashboard report 0% retrieval even when the library had content.
        const [logRes, bookRes, chunkRes, embRes, jobRes] = await Promise.all([
          supabase.from("modrek_search_logs")
            .select("id,created_at,intent,role,surface,cache_hit,fallback_external,duration_ms,top_confidence,results_count,tier_used,query_text,filters,trace")
            .gte("created_at", since).order("created_at", { ascending: false }).limit(500),
          supabase.from("library_books").select("id,subject_name_ar,status", { count: "exact", head: false }).limit(2000),
          supabase.from("library_book_chunks").select("id", { count: "exact", head: true }),
          supabase.from("library_book_chunks").select("id", { count: "exact", head: true }).not("embedding", "is", null),
          supabase.from("library_processing_jobs").select("id", { count: "exact", head: true }).in("status", ["pending", "running", "retrying"] as any),
        ]);
        setLogs((logRes.data ?? []) as LogRow[]);
        setTotalChunks(chunkRes.count ?? 0);
        setEmbeddedChunks(embRes.count ?? 0);
        setPendingJobs(jobRes.count ?? 0);
        setTotalSources(bookRes.count ?? (bookRes.data?.length ?? 0));
        const bucket = new Map<string, number>();
        ((bookRes.data ?? []) as any[]).forEach((b) => {
          const key = String(b.subject_name_ar || "غير محدد");
          bucket.set(key, (bucket.get(key) ?? 0) + 1);
        });
        setSources(Array.from(bucket, ([source_type, count]) => ({ source_type, count })).sort((a, b) => b.count - a.count));
      } finally { setLoading(false); }
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
      total, avgMs: Math.round(avgMs),
      successRate: success / total, cacheRate: cache / total, externalRate: external / total, avgConfidence,
    };
  }, [logs]);

  const intents = useMemo(() => {
    const bucket = new Map<string, number>();
    logs.forEach((l) => bucket.set(l.intent || "auto", (bucket.get(l.intent || "auto") ?? 0) + 1));
    return Array.from(bucket, ([intent, count]) => ({ intent, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [logs]);


  return (
    <ModrekShell>
      <ModrekHero
        icon={Sparkles}
        eyebrow={<ModrekEyebrow icon={BarChart3}>Modrek AI · Analytics</ModrekEyebrow>}
        title="لوحة تحليلات Modrek AI"
        subtitle="إحصائيات آخر 7 أيام لمحرك الاسترجاع والتفكير"
        actions={
          <ModrekButton variant="secondary" icon={ArrowRight} onClick={() => navigate("/admin/modrek-library")}>
            مكتبة Modrek
          </ModrekButton>
        }
      />

      {loading ? (
        <ModrekCard padding="lg" className="text-center text-[#94A3B8]">جاري تحميل البيانات…</ModrekCard>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <ModrekStat icon={Activity} label="عدد الطلبات" value={fmt(stats.total)} accent="blue" />
            <ModrekStat icon={Clock} label="متوسط الاستجابة" value={`${fmt(stats.avgMs)} ms`} accent="cyan" />
            <ModrekStat icon={TrendingUp} label="الاسترجاع من المكتبة" value={pct(stats.successRate)} accent="emerald" />
            <ModrekStat icon={ShieldAlert} label="اللجوء للخارجي" value={pct(stats.externalRate)} accent="rose" />
            <ModrekStat icon={Database} label="نسبة الكاش" value={pct(stats.cacheRate)} accent="amber" />
            <ModrekStat icon={BarChart3} label="متوسط الثقة" value={pct(stats.avgConfidence)} accent="purple" />
            <ModrekStat icon={BookOpen} label="كتب المكتبة" value={fmt(totalSources)} accent="blue" />
            <ModrekStat
              icon={Database}
              label="مقاطع مفهرسة (بمتجهات)"
              value={`${fmt(embeddedChunks)} / ${fmt(totalChunks)}`}
              accent="emerald"
            />
          </div>


          {pendingJobs > 0 && (
            <ModrekCard padding="none" className="p-4 border-[#FEF3C7] bg-[#FFFBEB]">
              <div className="text-[13px] text-[#B45309] font-bold">
                يوجد <b className="tabular-nums">{fmt(pendingJobs)}</b> مهمة معالجة قيد التنفيذ في خط المعالجة.
              </div>
            </ModrekCard>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ModrekSection title="توزيع النوايا (Intents)" icon={Sparkles}>
              <ModrekCard>
                {intents.length === 0 ? (
                  <div className="text-[12px] text-[#94A3B8] text-center py-6">لا توجد بيانات</div>
                ) : (
                  <ul className="space-y-3">
                    {intents.map((i) => (
                      <li key={i.intent} className="flex items-center gap-3">
                        <div className="w-28 truncate text-[12px] font-bold text-[#334155]">{i.intent}</div>
                        <div className="h-2 flex-1 rounded-full bg-[#F1F5F9] overflow-hidden">
                          <div
                            className="h-2 rounded-full bg-gradient-to-l from-[#3B82F6] to-[#8B5CF6]"
                            style={{ width: `${(i.count / intents[0].count) * 100}%` }}
                          />
                        </div>
                        <div className="w-12 text-left text-[12px] font-extrabold text-[#2563EB] tabular-nums">{fmt(i.count)}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </ModrekCard>
            </ModrekSection>

            <ModrekSection title="أنواع المصادر في المكتبة" icon={BookOpen}>
              <ModrekCard>
                {sources.length === 0 ? (
                  <div className="text-[12px] text-[#94A3B8] text-center py-6">لم يتم رفع مصادر بعد</div>
                ) : (
                  <ul className="space-y-2">
                    {sources.slice(0, 8).map((s) => (
                      <li key={s.source_type ?? "unk"} className="flex items-center justify-between rounded-[12px] bg-[#F8FAFC] border border-[#E5E7EB] px-3.5 py-2.5">
                        <span className="font-bold text-[13px] text-[#0F172A]">{s.source_type ?? "غير محدد"}</span>
                        <ModrekPill tone="blue">{fmt(s.count)}</ModrekPill>
                      </li>
                    ))}
                  </ul>
                )}
              </ModrekCard>
            </ModrekSection>
          </div>

          <ModrekSection title="آخر الطلبات" icon={Activity}>
            <ModrekCard padding="none" className="overflow-hidden">
              {logs.length === 0 ? (
                <ModrekEmpty icon={Inbox} title="لا توجد طلبات مسجلة بعد" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-[12px]">
                    <thead className="bg-[#F8FAFC] text-[#64748B]">
                      <tr>
                        <th className="p-3 font-bold">الوقت</th>
                        <th className="p-3 font-bold">النية</th>
                        <th className="p-3 font-bold">الاستعلام</th>
                        <th className="p-3 font-bold">النتائج</th>
                        <th className="p-3 font-bold">الثقة</th>
                        <th className="p-3 font-bold">المدة</th>
                        <th className="p-3 font-bold">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {logs.slice(0, 25).map((l) => (
                        <tr key={l.id} className="hover:bg-[#F8FAFC] transition-colors">
                          <td className="p-3 text-[#94A3B8] tabular-nums">{new Date(l.created_at).toLocaleString("ar-EG", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "numeric" })}</td>
                          <td className="p-3 font-bold text-[#0F172A]">{l.intent || "-"}</td>
                          <td className="p-3 max-w-[220px] truncate text-[#475569]">{l.query_text}</td>
                          <td className="p-3 text-[#334155] tabular-nums">{l.results_count}</td>
                          <td className="p-3 text-[#334155]">{l.top_confidence != null ? pct(l.top_confidence) : "-"}</td>
                          <td className="p-3 text-[#94A3B8] tabular-nums">{l.duration_ms ?? "-"} ms</td>
                          <td className="p-3">
                            {l.fallback_external ? <ModrekPill tone="rose">خارجي</ModrekPill>
                              : l.cache_hit ? <ModrekPill tone="amber">كاش</ModrekPill>
                              : <ModrekPill tone="emerald">مكتبة</ModrekPill>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ModrekCard>
          </ModrekSection>
        </>
      )}
    </ModrekShell>
  );
}

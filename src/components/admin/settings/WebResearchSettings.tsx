import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Globe, Loader2, RefreshCw, Save } from "lucide-react";

const SETTINGS_KEY = "web_research_config";

type WebResearchConfig = {
  enabled: boolean;
  min_library_coverage: number;
  web_only_below: number;
  max_results: number;
  cache_ttl_minutes: number;
  restrict_to_trusted: boolean;
  trusted_domains: string[];
  blocked_domains: string[];
  engine: "auto" | "tavily" | "serper" | "model";
  model: string | null;
  surfaces: Record<string, boolean>;
};

const DEFAULTS: WebResearchConfig = {
  enabled: true,
  min_library_coverage: 0.6,
  web_only_below: 0.15,
  max_results: 5,
  cache_ttl_minutes: 720,
  restrict_to_trusted: false,
  trusted_domains: ["moe.gov.eg", "azhar.eg", "khanacademy.org", "britannica.com", "dorar.net", "quran.com", "wikipedia.org"],
  blocked_domains: ["facebook.com", "tiktok.com", "x.com", "twitter.com", "pinterest.com"],
  engine: "auto",
  model: null,
  surfaces: {
    "ai-chat": true,
    "modrek-ai-study": true,
    "modrek-retrieve": true,
    "modrek-ai-exams": true,
    "library-chat": true,
    "library-explain": true,
    "teacher-assistant": true,
  },
};

const SURFACE_LABELS: Record<string, string> = {
  "ai-chat": "المساعد الذكي (شرح الدروس)",
  "modrek-ai-study": "مساعد المذاكرة Modrek AI",
  "modrek-retrieve": "محرك الاسترجاع (API)",
  "modrek-ai-exams": "مولّد الامتحانات",
  "library-chat": "محادثة كتب المكتبة",
  "library-explain": "شرح صفحات/صور المكتبة",
  "teacher-assistant": "مساعد المعلم",
};

const DECISION_LABELS: Record<string, string> = {
  library_only: "المكتبة وحدها",
  hybrid: "مكتبة + بحث خارجي",
  web_only: "بحث خارجي أساسي",
  no_source: "لا مصدر",
};

type DecisionLog = {
  id: string;
  created_at: string;
  surface: string | null;
  query_text: string;
  results_count: number;
  top_confidence: number | null;
  cache_hit: boolean;
  filters: Record<string, unknown> | null;
};

export default function WebResearchSettings() {
  const [config, setConfig] = useState<WebResearchConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<DecisionLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const loadConfig = async () => {
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();
    if (error) {
      toast({ title: "تعذر تحميل الإعدادات", description: error.message, variant: "destructive" });
    } else if (data?.value) {
      try {
        setConfig({ ...DEFAULTS, ...JSON.parse(String(data.value)) });
      } catch {
        setConfig(DEFAULTS);
      }
    }
    setLoading(false);
  };

  const loadLogs = async () => {
    setLoadingLogs(true);
    const { data } = await supabase
      .from("modrek_search_logs")
      .select("id, created_at, surface, query_text, results_count, top_confidence, cache_hit, filters")
      .like("surface", "%web-research")
      .order("created_at", { ascending: false })
      .limit(15);
    setLogs((data || []) as DecisionLog[]);
    setLoadingLogs(false);
  };

  useEffect(() => {
    loadConfig();
    loadLogs();
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("platform_settings")
      .upsert({ key: SETTINGS_KEY, value: JSON.stringify(config) }, { onConflict: "key" });
    setSaving(false);
    if (error) toast({ title: "فشل الحفظ", description: error.message, variant: "destructive" });
    else toast({ title: "تم الحفظ", description: "تم تحديث إعدادات البحث الخارجي الذكي" });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="h-4 w-4" />
          البحث الخارجي الذكي (Hybrid RAG + Web Research)
        </CardTitle>
        <CardDescription>
          النظام يقرر تلقائيًا: يعتمد على مكتبة Modrek أولًا، ولا يلجأ للبحث الخارجي إلا عند نقص تغطية المكتبة.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label className="text-sm font-medium">تفعيل البحث الخارجي</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">عند الإيقاف، يجيب المساعد من المكتبة والمنهج فقط.</p>
          </div>
          <Switch checked={config.enabled} onCheckedChange={(v) => setConfig({ ...config, enabled: v })} />
        </div>

        <div className="space-y-3 rounded-lg border p-3">
          <div>
            <Label className="text-xs">
              حد كفاية المكتبة — أقل تغطية تُعتبر كافية: <span className="font-mono">{config.min_library_coverage.toFixed(2)}</span>
            </Label>
            <Slider
              className="mt-2"
              min={0}
              max={1}
              step={0.05}
              value={[config.min_library_coverage]}
              onValueChange={([v]) => setConfig({ ...config, min_library_coverage: v })}
            />
          </div>
          <div>
            <Label className="text-xs">
              حد الاعتماد على الويب أساسًا — تحت هذه القيمة: <span className="font-mono">{config.web_only_below.toFixed(2)}</span>
            </Label>
            <Slider
              className="mt-2"
              min={0}
              max={0.6}
              step={0.05}
              value={[config.web_only_below]}
              onValueChange={([v]) => setConfig({ ...config, web_only_below: v })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">عدد النتائج الخارجية</Label>
            <Input
              type="number"
              min={1}
              max={10}
              className="mt-1 h-9"
              value={config.max_results}
              onChange={(e) => setConfig({ ...config, max_results: Number(e.target.value) || 1 })}
            />
          </div>
          <div>
            <Label className="text-xs">مدة التخزين المؤقت (دقيقة)</Label>
            <Input
              type="number"
              min={1}
              max={10080}
              className="mt-1 h-9"
              value={config.cache_ttl_minutes}
              onChange={(e) => setConfig({ ...config, cache_ttl_minutes: Number(e.target.value) || 1 })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">محرك البحث</Label>
            <Select value={config.engine} onValueChange={(v) => setConfig({ ...config, engine: v as WebResearchConfig["engine"] })}>
              <SelectTrigger className="mt-1 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">تلقائي (الأفضل المتاح)</SelectItem>
                <SelectItem value="tavily">Tavily</SelectItem>
                <SelectItem value="serper">Serper (Google)</SelectItem>
                <SelectItem value="model">عبر موديل الذكاء (بحث مدمج)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">موديل البحث (اختياري)</Label>
            <Input
              className="mt-1 h-9 font-mono text-xs"
              placeholder="google/gemini-2.5-flash"
              value={config.model || ""}
              onChange={(e) => setConfig({ ...config, model: e.target.value.trim() || null })}
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label className="text-sm font-medium">تقييد النتائج على النطاقات الموثوقة</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">يقبل فقط المصادر المدرجة في قائمة النطاقات الموثوقة.</p>
          </div>
          <Switch
            checked={config.restrict_to_trusted}
            onCheckedChange={(v) => setConfig({ ...config, restrict_to_trusted: v })}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label className="text-xs">نطاقات موثوقة (نطاق في كل سطر)</Label>
            <Textarea
              className="mt-1 h-28 font-mono text-xs"
              value={config.trusted_domains.join("\n")}
              onChange={(e) => setConfig({ ...config, trusted_domains: e.target.value.split("\n").map((d) => d.trim()).filter(Boolean) })}
            />
          </div>
          <div>
            <Label className="text-xs">نطاقات محظورة (نطاق في كل سطر)</Label>
            <Textarea
              className="mt-1 h-28 font-mono text-xs"
              value={config.blocked_domains.join("\n")}
              onChange={(e) => setConfig({ ...config, blocked_domains: e.target.value.split("\n").map((d) => d.trim()).filter(Boolean) })}
            />
          </div>
        </div>

        <div className="rounded-lg border p-3">
          <Label className="text-xs">الواجهات المسموح لها بالبحث الخارجي</Label>
          <div className="mt-2 space-y-2">
            {Object.keys(SURFACE_LABELS).map((surface) => (
              <div key={surface} className="flex items-center justify-between gap-2">
                <span className="text-sm">{SURFACE_LABELS[surface]}</span>
                <Switch
                  checked={config.surfaces[surface] !== false}
                  onCheckedChange={(v) => setConfig({ ...config, surfaces: { ...config.surfaces, [surface]: v } })}
                />
              </div>
            ))}
          </div>
        </div>

        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
          حفظ الإعدادات
        </Button>

        <div className="rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs">أحدث قرارات المحرك</Label>
            <Button size="sm" variant="ghost" onClick={loadLogs} disabled={loadingLogs} className="h-7">
              {loadingLogs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          </div>
          {logs.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">لا توجد قرارات مسجّلة بعد.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {logs.map((log) => {
                const decision = String((log.filters as any)?.decision || "");
                const engine = String((log.filters as any)?.engine || "—");
                return (
                  <div key={log.id} className="rounded-md bg-muted/40 p-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">{DECISION_LABELS[decision] || decision || "—"}</Badge>
                      <Badge variant="secondary" className="font-mono">{engine}</Badge>
                      <span className="text-muted-foreground">
                        تغطية {log.top_confidence != null ? Number(log.top_confidence).toFixed(2) : "—"} • نتائج {log.results_count}
                        {log.cache_hit ? " • من الكاش" : ""}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-foreground/80">{log.query_text}</p>
                    <p className="mt-0.5 text-muted-foreground">{new Date(log.created_at).toLocaleString("ar-EG")}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

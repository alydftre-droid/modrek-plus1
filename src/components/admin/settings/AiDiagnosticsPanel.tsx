import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  Activity, CheckCircle2, ChevronDown, FileWarning, Loader2, PlayCircle, RefreshCw, XCircle, Zap,
} from "lucide-react";

type ProviderRow = {
  provider: string;
  label: string;
  base_url: string;
  api_key_env: string;
  is_active: boolean;
  has_key: boolean;
};

type TestResult = {
  service: string;
  label: string;
  ok: boolean;
  status: number;
  provider: string;
  endpoint: string;
  duration_ms: number;
  detail: string;
  error: string | null;
};

const SERVICES: Array<{ key: string; label: string; hint: string }> = [
  { key: "models", label: "قائمة الموديلات", hint: "GET /models" },
  { key: "chat", label: "المحادثة (Chat)", hint: "POST /chat/completions" },
  { key: "streaming", label: "البث المباشر (Streaming)", hint: "SSE stream=true" },
  { key: "vision", label: "تحليل الصور (Vision)", hint: "image_url في الرسالة" },
  { key: "ocr", label: "استخراج النصوص (OCR)", hint: "قراءة نص من صورة" },
  { key: "embeddings", label: "التمثيل الرقمي (Embeddings)", hint: "POST /embeddings" },
  { key: "tts", label: "تحويل النص لصوت (TTS)", hint: "POST /audio/speech" },
  { key: "stt", label: "تحويل الصوت لنص (STT)", hint: "POST /audio/transcriptions" },
  { key: "file_api", label: "رفع ملفات الكتب (File API)", hint: "GET /files ← فحص دعم المزود" },
];

type FileApiStatus = {
  provider: string;
  label: string;
  endpoint: string;
  provider_supported: boolean;
  probe_status: number;
  route: "provider" | "gemini_direct";
  independent_of_active_provider: boolean;
  key_env: string;
  key_present: boolean;
  reason: string;
  reason_ar: string;
  note_ar: string;
};

const DEFAULT_MODELS: Record<string, string> = {
  chat: "google/gemini-2.5-flash",
  vision: "google/gemini-2.5-flash",
  ocr: "google/gemini-2.5-flash",
  embeddings: "openai/text-embedding-3-small",
  tts: "google/gemini-3.1-flash-tts-preview",
  stt: "openai/whisper-1",
};

export default function AiDiagnosticsPanel() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [models, setModels] = useState<Record<string, string>>(DEFAULT_MODELS);
  const [results, setResults] = useState<Record<string, Record<string, TestResult>>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fileApi, setFileApi] = useState<FileApiStatus | null>(null);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("ai-provider-admin", { body: { action: "list" } });
      if (error) throw new Error(error.message);
      const rows = ((data as any)?.providers || []) as ProviderRow[];
      setProviders(rows);
      setSelected((prev) => prev || rows.find((r) => r.is_active)?.provider || rows[0]?.provider || "");
    } catch (e) {
      toast({ title: "تعذر تحميل المزودات", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const providerResults = results[selected] ?? {};
  const currentProvider = useMemo(() => providers.find((p) => p.provider === selected), [providers, selected]);

  const run = async (services: string[]) => {
    if (!selected) return;
    setRunning(services.length === 1 ? services[0] : "all");
    try {
      const { data, error } = await supabase.functions.invoke("ai-diagnostics", {
        body: { provider: selected, services, models },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error(String((data as any).error));
      const list = ((data as any)?.results || []) as TestResult[];
      if ((data as any)?.file_api) setFileApi((data as any).file_api as FileApiStatus);
      setResults((prev) => ({
        ...prev,
        [selected]: { ...(prev[selected] ?? {}), ...Object.fromEntries(list.map((r) => [r.service, r])) },
      }));
      const failed = list.filter((r) => !r.ok).length;
      toast({
        title: failed ? `انتهى الاختبار مع ${failed} فشل` : "نجحت جميع الاختبارات",
        description: `المزود: ${(data as any)?.provider?.label ?? selected}`,
        variant: failed ? "destructive" : undefined,
      });
    } catch (e) {
      toast({ title: "فشل تنفيذ الاختبار", description: (e as Error).message, variant: "destructive" });
    } finally {
      setRunning(null);
    }
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
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          تشخيص خدمات الذكاء الاصطناعي (Diagnostics)
        </CardTitle>
        <p className="text-xs text-muted-foreground leading-relaxed">
          كل الاختبارات تمر عبر الطبقة الموحدة (AI Provider Layer) — لا يوجد أي استدعاء مباشر لأي مزود.
          يمكنك اختبار كل مزود بشكل مستقل حتى لو لم يكن هو المزود النشط.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {providers.map((p) => (
            <Button
              key={p.provider}
              size="sm"
              variant={selected === p.provider ? "default" : "outline"}
              onClick={() => setSelected(p.provider)}
              className="gap-1.5"
            >
              {p.is_active && <Zap className="h-3 w-3" />}
              {p.label}
              {!p.has_key && <Badge variant="destructive" className="text-[10px] px-1">بدون مفتاح</Badge>}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => void load()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            تحديث
          </Button>
        </div>

        {currentProvider && (
          <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>الحالة: {currentProvider.is_active ? "نشط" : "غير نشط"}</span>
              <span className="font-mono">{currentProvider.base_url}</span>
              <span className="font-mono">{currentProvider.api_key_env}</span>
              <span>{currentProvider.has_key ? "المفتاح موجود" : "المفتاح مفقود"}</span>
            </div>
          </div>
        )}

        <div
          className={`rounded-lg border p-3 text-xs space-y-1.5 ${
            fileApi && !fileApi.independent_of_active_provider
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "border-amber-500/40 bg-amber-500/5"
          }`}
        >
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <FileWarning className="h-4 w-4 text-amber-500" />
            مصدر مفاتيح الخدمات
          </p>
          <p className="leading-relaxed text-muted-foreground">
            جميع خدمات الذكاء الاصطناعي (محادثة، Streaming، Vision، OCR، Embeddings، TTS، STT) تعتمد على
            <strong className="mx-1">المزوّد النشط</strong>
            فقط عبر الطبقة الموحدة.
          </p>
          {fileApi ? (
            <>
              <p className="leading-relaxed">{fileApi.note_ar}</p>
              <p className="leading-relaxed text-muted-foreground">{fileApi.reason_ar}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge variant={fileApi.independent_of_active_provider ? "outline" : "secondary"} className="text-[10px]">
                  المسار: {fileApi.route === "provider" ? "المزوّد النشط" : "Gemini File API (مستقل)"}
                </Badge>
                <Badge variant="outline" className="text-[10px] font-mono" dir="ltr">{fileApi.key_env}</Badge>
                <Badge variant={fileApi.key_present ? "secondary" : "destructive"} className="text-[10px]">
                  {fileApi.key_present ? "المفتاح موجود" : "المفتاح مفقود"}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  دعم المزوّد لـ /files: {fileApi.provider_supported ? "متاح" : "غير متاح"} ({fileApi.probe_status})
                </Badge>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">
              شغّل اختبار «رفع ملفات الكتب (File API)» لمعرفة ما إذا كان المزوّد النشط يدعم File API أم أن الخدمة مستقلة على
              <span className="mx-1 font-mono" dir="ltr">GEMINI_API_KEY</span>.
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.keys(DEFAULT_MODELS).map((key) => (
            <div key={key}>
              <Label className="text-[11px] text-muted-foreground">موديل {key}</Label>
              <Input
                value={models[key] ?? ""}
                onChange={(e) => setModels((prev) => ({ ...prev, [key]: e.target.value }))}
                className="h-8 font-mono text-xs"
                dir="ltr"
              />
            </div>
          ))}
        </div>

        <Button
          onClick={() => void run(SERVICES.map((s) => s.key))}
          disabled={!!running || !selected}
          className="gap-2"
        >
          {running === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
          اختبار جميع الخدمات
        </Button>

        <div className="space-y-2">
          {SERVICES.map((service) => {
            const result = providerResults[service.key];
            const isOpen = expanded === service.key;
            return (
              <div key={service.key} className="rounded-lg border overflow-hidden">
                <div className="flex items-center gap-2 p-3">
                  <div className="shrink-0">
                    {running === service.key ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : result ? (
                      result.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-destructive" />
                    ) : (
                      <span className="block h-2 w-2 rounded-full bg-muted-foreground/40" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{service.label}</p>
                    <p className="text-[11px] text-muted-foreground font-mono truncate" dir="ltr">{service.hint}</p>
                  </div>
                  {result && (
                    <Badge variant={result.ok ? "secondary" : "destructive"} className="text-[10px]">
                      {result.status} · {result.duration_ms}ms
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={!!running}
                    onClick={() => void run([service.key])}
                  >
                    اختبار
                  </Button>
                  {result && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setExpanded(isOpen ? null : service.key)}
                      aria-label="التفاصيل"
                    >
                      <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </Button>
                  )}
                </div>
                {result && isOpen && (
                  <div className="border-t bg-muted/30 p-3 space-y-2 text-xs">
                    <div className="font-mono break-all" dir="ltr">{result.endpoint}</div>
                    {result.detail && <div className="text-muted-foreground">{result.detail}</div>}
                    {result.error && (
                      <pre className="whitespace-pre-wrap break-all rounded bg-destructive/10 p-2 text-destructive" dir="ltr">
                        {result.error}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

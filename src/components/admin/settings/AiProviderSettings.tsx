import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  Loader2, Plus, X, Save, Plug, CheckCircle2, XCircle, KeyRound, RefreshCw, Zap,
} from "lucide-react";

type ProviderRow = {
  provider: string;
  label: string;
  base_url: string;
  api_key_env: string;
  is_active: boolean;
  has_key: boolean;
};

type ProviderFnSettings = {
  provider: string;
  function_name: string;
  models_to_try: string[];
  max_retries: number;
  fallback_delay_ms: number;
  enable_streaming: boolean;
};

const FUNCTION_LABELS: Record<string, string> = {
  "ai-chat": "المساعد الذكي / شرح الدروس",
  "support-assistant": "مساعد الدعم الفني",
  "teacher-assistant": "مساعد المعلم",
  "modrek-ai-exams": "إنشاء الامتحانات",
  "grade-essay": "تصحيح الامتحانات المقالية",
  "library-explain-tts": "تحويل النص إلى صوت (TTS)",
  vision: "تحليل الصور (Vision)",
  ocr: "استخراج النصوص (OCR)",
  embeddings: "البحث داخل الكتب (Embeddings)",
  stt: "تحويل الصوت إلى نص (STT)",
};

const SUGGESTED_MODELS = [
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "google/gemini-2.5-pro",
  "openai/gpt-4o-mini",
  "openai/text-embedding-3-small",
  "google/gemini-3.1-flash-tts-preview",
  "openai/gpt-4o-mini-transcribe",
];

async function callProviderAdmin(payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("ai-provider-admin", { body: payload });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error(String((data as any).error));
  return data as any;
}

export default function AiProviderSettings() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [selected, setSelected] = useState<string>("openrouter");
  const [baseUrls, setBaseUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [fnRows, setFnRows] = useState<ProviderFnSettings[]>([]);
  const [savingFn, setSavingFn] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await callProviderAdmin({ action: "list" });
      const rows = (res?.providers || []) as ProviderRow[];
      setProviders(rows);
      setBaseUrls(Object.fromEntries(rows.map((r) => [r.provider, r.base_url])));
      const active = rows.find((r) => r.is_active)?.provider;
      if (active) setSelected(active);
    } catch (e) {
      toast({ title: "تعذر تحميل المزودات", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("ai_provider_function_settings")
        .select("*")
        .order("function_name");
      setFnRows(((data || []) as ProviderFnSettings[]));
    })();
  }, []);

  const activeProvider = useMemo(() => providers.find((p) => p.is_active)?.provider ?? "openrouter", [providers]);

  const setActive = async (provider: string) => {
    setBusy(`active-${provider}`);
    try {
      await callProviderAdmin({ action: "set_active", provider });
      await load();
      toast({ title: "تم التبديل", description: `المزود النشط الآن: ${provider === "openrouter" ? "OpenRouter" : "AgentRouter"}` });
    } catch (e) {
      toast({ title: "فشل التبديل", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const saveProvider = async (provider: string) => {
    setBusy(`save-${provider}`);
    try {
      await callProviderAdmin({ action: "save", provider, base_url: baseUrls[provider] });
      await load();
      toast({ title: "تم حفظ الإعدادات", description: "تم تحديث Base URL" });
    } catch (e) {
      toast({ title: "فشل الحفظ", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const testProvider = async (provider: string) => {
    setBusy(`test-${provider}`);
    try {
      const res = await callProviderAdmin({ action: "test", provider, base_url: baseUrls[provider] });
      const ok = res?.ok === true;
      setTestResults((prev) => ({
        ...prev,
        [provider]: {
          ok,
          text: ok
            ? `متصل ✓ (${res.duration_ms}ms) — الرد: ${res.reply || "—"}`
            : res.key_missing
              ? `المفتاح غير مضبوط (${res.api_key_env})`
              : `فشل الاتصال (${res.status}): ${String(res.error || "").slice(0, 160)}`,
        },
      }));
      toast({
        title: ok ? "الاتصال ناجح" : "فشل الاتصال",
        description: ok ? "المزود يعمل بشكل صحيح" : "راجع المفتاح أو الـ Base URL",
        variant: ok ? undefined : "destructive",
      });
    } catch (e) {
      setTestResults((prev) => ({ ...prev, [provider]: { ok: false, text: (e as Error).message } }));
      toast({ title: "فشل الاختبار", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const updateFnRow = (provider: string, fn: string, patch: Partial<ProviderFnSettings>) => {
    setFnRows((prev) => prev.map((r) => (r.provider === provider && r.function_name === fn ? { ...r, ...patch } : r)));
  };

  const saveFnRow = async (row: ProviderFnSettings) => {
    const key = `${row.provider}:${row.function_name}`;
    setSavingFn(key);
    const { error } = await supabase
      .from("ai_provider_function_settings")
      .update({
        models_to_try: row.models_to_try,
        max_retries: row.max_retries,
        fallback_delay_ms: row.fallback_delay_ms,
        enable_streaming: row.enable_streaming,
      })
      .eq("provider", row.provider)
      .eq("function_name", row.function_name);
    setSavingFn(null);
    if (error) toast({ title: "فشل الحفظ", description: error.message, variant: "destructive" });
    else toast({ title: "تم الحفظ", description: FUNCTION_LABELS[row.function_name] || row.function_name });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const selectedRows = fnRows.filter((r) => r.provider === selected);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plug className="h-4 w-4" />
            مزود الذكاء الاصطناعي (AI Provider)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            مزود واحد فقط يمكن أن يكون نشطاً. المزود غير النشط يتوقف بالكامل ولا يُرسل إليه أي طلب.
          </p>
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs leading-relaxed">
            <p className="font-semibold">استثناء واحد فقط: رفع ملفات الكتب (Gemini File API)</p>
            <p className="text-muted-foreground mt-1">
              كل خدمات الذكاء الاصطناعي (محادثة، Streaming، Vision، OCR، Embeddings، TTS، STT) تعتمد على المزوّد النشط أعلاه.
              أما رفع ملفات الكتب الكبيرة/المصوّرة فيستخدم Gemini File API (رفع قابل للاستئناف بمراجع file_uri) وهو بروتوكول
              خاص بجوجل لا توفّره البوابات المتوافقة مع OpenAI، لذلك يعتمد وحده على المفتاح
              <span className="mx-1 font-mono" dir="ltr">GEMINI_API_KEY</span>.
              النظام يفحص المزوّد النشط تلقائياً في كل مرة، وإذا وفّر File API حقيقياً ينتقل إليه تلقائياً — وتظهر النتيجة في
              «تشخيص خدمات الذكاء الاصطناعي» ضمن اختبار «رفع ملفات الكتب (File API)».
            </p>
          </div>


          {providers.map((p) => {
            const isActive = p.is_active;
            const result = testResults[p.provider];
            return (
              <div
                key={p.provider}
                className={`rounded-xl border p-4 space-y-3 transition-colors ${isActive ? "border-primary bg-primary/5" : "bg-card"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() => !isActive && setActive(p.provider)}
                    disabled={busy === `active-${p.provider}` || isActive}
                    className="flex items-center gap-3 text-right flex-1"
                  >
                    <span
                      className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isActive ? "border-primary" : "border-muted-foreground/40"}`}
                    >
                      {isActive && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                    </span>
                    <span className="flex flex-col">
                      <span className="font-semibold text-sm">{p.label}</span>
                      <span className="text-[11px] text-muted-foreground font-mono">{p.base_url}</span>
                    </span>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    {busy === `active-${p.provider}` && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isActive ? (
                      <Badge className="gap-1"><Zap className="h-3 w-3" /> نشط</Badge>
                    ) : (
                      <Badge variant="outline">متوقف</Badge>
                    )}
                    <Badge variant={p.has_key ? "secondary" : "destructive"} className="gap-1">
                      <KeyRound className="h-3 w-3" />
                      {p.has_key ? "مفتاح مضبوط" : "لا يوجد مفتاح"}
                    </Badge>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <div>
                    <Label className="text-xs">Base URL</Label>
                    <Input
                      dir="ltr"
                      className="h-9 mt-1 font-mono text-xs"
                      value={baseUrls[p.provider] ?? ""}
                      onChange={(e) => setBaseUrls((prev) => ({ ...prev, [p.provider]: e.target.value }))}
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="sm:self-end h-9"
                    onClick={() => saveProvider(p.provider)}
                    disabled={busy === `save-${p.provider}`}
                  >
                    {busy === `save-${p.provider}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    <span className="ms-1">حفظ</span>
                  </Button>
                  <Button
                    variant="secondary"
                    className="sm:self-end h-9"
                    onClick={() => testProvider(p.provider)}
                    disabled={busy === `test-${p.provider}`}
                  >
                    {busy === `test-${p.provider}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    <span className="ms-1">اختبار الاتصال</span>
                  </Button>
                </div>

                <p className="text-[11px] text-muted-foreground font-mono">
                  API Key Secret: {p.api_key_env}
                </p>

                {result && (
                  <div className={`flex items-start gap-2 rounded-lg border p-2 text-xs ${result.ok ? "text-emerald-700 border-emerald-200 bg-emerald-50" : "text-destructive border-destructive/30 bg-destructive/5"}`}>
                    {result.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                    <span className="break-all">{result.text}</span>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">موديلات كل وظيفة — إعدادات مستقلة لكل مزود</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {providers.map((p) => (
              <Button
                key={p.provider}
                size="sm"
                variant={selected === p.provider ? "default" : "outline"}
                onClick={() => setSelected(p.provider)}
              >
                {p.label}
                {p.provider === activeProvider && <Badge variant="secondary" className="ms-2 text-[10px]">نشط</Badge>}
              </Button>
            ))}
          </div>

          {selected === "openrouter" ? (
            <p className="text-xs text-muted-foreground">
              إعدادات موديلات OpenRouter تبقى كما هي بالأسفل في قسم «إعدادات الوظائف» ولم يتم تغييرها.
            </p>
          ) : selectedRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">لا توجد إعدادات لهذا المزود بعد.</p>
          ) : (
            selectedRows.map((row) => (
              <div key={`${row.provider}:${row.function_name}`} className="rounded-xl border p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{FUNCTION_LABELS[row.function_name] || row.function_name}</span>
                  <Badge variant="outline" className="font-mono text-[10px]">{row.function_name}</Badge>
                </div>

                <div className="flex flex-wrap gap-2">
                  {row.models_to_try.map((m, idx) => (
                    <Badge key={`${m}-${idx}`} variant="secondary" className="gap-1.5 py-1.5 px-3">
                      <span className="font-mono text-xs">{m}</span>
                      <button
                        aria-label="حذف"
                        className="hover:text-destructive"
                        onClick={() => updateFnRow(row.provider, row.function_name, {
                          models_to_try: row.models_to_try.filter((_, i) => i !== idx),
                        })}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_MODELS.filter((m) => !row.models_to_try.includes(m)).map((m) => (
                    <Button
                      key={m}
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => updateFnRow(row.provider, row.function_name, {
                        models_to_try: [...row.models_to_try, m],
                      })}
                    >
                      <Plus className="h-3 w-3 me-1" />
                      {m}
                    </Button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">حد المحاولات</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      className="h-9 mt-1"
                      value={row.max_retries}
                      onChange={(e) => updateFnRow(row.provider, row.function_name, { max_retries: Number(e.target.value) || 1 })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">وقت الـ fallback (ms)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={10000}
                      step={100}
                      className="h-9 mt-1"
                      value={row.fallback_delay_ms}
                      onChange={(e) => updateFnRow(row.provider, row.function_name, { fallback_delay_ms: Number(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label className="text-sm font-medium">عرض تدريجي (Streaming)</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">إظهار الرد حرفاً بحرف للمستخدم</p>
                  </div>
                  <Switch
                    checked={row.enable_streaming}
                    onCheckedChange={(v) => updateFnRow(row.provider, row.function_name, { enable_streaming: v })}
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={() => saveFnRow(row)}
                  disabled={savingFn === `${row.provider}:${row.function_name}` || row.models_to_try.length === 0}
                >
                  {savingFn === `${row.provider}:${row.function_name}`
                    ? <Loader2 className="h-4 w-4 animate-spin me-2" />
                    : <Save className="h-4 w-4 me-2" />}
                  حفظ
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

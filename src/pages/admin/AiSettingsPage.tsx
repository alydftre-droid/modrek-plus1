import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, X, Save } from "lucide-react";
import AiProviderSettings from "@/components/admin/settings/AiProviderSettings";


type Settings = {
  function_name: string;
  models_to_try: string[];
  max_retries: number;
  fallback_delay_ms: number;
  enable_streaming: boolean;
};

const FUNCTION_LABELS: Record<string, string> = {
  "ai-chat": "المساعد الذكي للطلاب (شرح الدروس)",
  "support-assistant": "مساعد الدعم الفني",
  "teacher-assistant": "مساعد المعلم",
  "modrek-ai-exams": "مساعد إنشاء امتحانات الطلاب",
  "grade-essay": "تصحيح الامتحانات المقالية",
};

const SUGGESTED_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

export default function AiSettingsPage() {
  const [rows, setRows] = useState<Settings[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingFn, setSavingFn] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("ai_function_settings")
        .select("*")
        .order("function_name");
      if (error) {
        toast({ title: "خطأ", description: error.message, variant: "destructive" });
      } else {
        setRows((data || []) as Settings[]);
      }
      setLoading(false);
    })();
  }, []);

  const updateRow = (fn: string, patch: Partial<Settings>) => {
    setRows((prev) => prev.map((r) => (r.function_name === fn ? { ...r, ...patch } : r)));
  };

  const save = async (row: Settings) => {
    setSavingFn(row.function_name);
    const { error } = await supabase
      .from("ai_function_settings")
      .update({
        models_to_try: row.models_to_try,
        max_retries: row.max_retries,
        fallback_delay_ms: row.fallback_delay_ms,
        enable_streaming: row.enable_streaming,
      })
      .eq("function_name", row.function_name);
    setSavingFn(null);
    if (error) toast({ title: "فشل الحفظ", description: error.message, variant: "destructive" });
    else toast({ title: "تم الحفظ", description: `تم تحديث إعدادات ${FUNCTION_LABELS[row.function_name] || row.function_name}` });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AiProviderSettings />

      <p className="text-sm text-muted-foreground">
        إعدادات الوظائف الخاصة بـ OpenRouter: تحكّم في قائمة الموديلات لكل وظيفة، وحدود المحاولات، وتفعيل البث المباشر للردود (Streaming).
      </p>


      {rows.map((row) => (
        <Card key={row.function_name}>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between gap-2">
              <span>{FUNCTION_LABELS[row.function_name] || row.function_name}</span>
              <Badge variant="outline" className="font-mono text-xs">{row.function_name}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">قائمة الموديلات (بالترتيب — أول موديل يُجرَّب أولاً)</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {row.models_to_try.map((m, idx) => (
                  <Badge key={idx} variant="secondary" className="gap-1.5 py-1.5 px-3">
                    <span className="font-mono text-xs">{m}</span>
                    <button
                      onClick={() => updateRow(row.function_name, { models_to_try: row.models_to_try.filter((_, i) => i !== idx) })}
                      className="hover:text-destructive"
                      aria-label="حذف"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {SUGGESTED_MODELS.filter((m) => !row.models_to_try.includes(m)).map((m) => (
                  <Button
                    key={m}
                    size="sm"
                    variant="outline"
                    onClick={() => updateRow(row.function_name, { models_to_try: [...row.models_to_try, m] })}
                    className="h-7 text-xs"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {m}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor={`retries-${row.function_name}`} className="text-xs">حد المحاولات</Label>
                <Input
                  id={`retries-${row.function_name}`}
                  type="number"
                  min={1}
                  max={10}
                  value={row.max_retries}
                  onChange={(e) => updateRow(row.function_name, { max_retries: Number(e.target.value) || 1 })}
                  className="h-9 mt-1"
                />
              </div>
              <div>
                <Label htmlFor={`delay-${row.function_name}`} className="text-xs">وقت الـ fallback (ms)</Label>
                <Input
                  id={`delay-${row.function_name}`}
                  type="number"
                  min={0}
                  max={10000}
                  step={100}
                  value={row.fallback_delay_ms}
                  onChange={(e) => updateRow(row.function_name, { fallback_delay_ms: Number(e.target.value) || 0 })}
                  className="h-9 mt-1"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor={`stream-${row.function_name}`} className="text-sm font-medium">عرض تدريجي (Streaming)</Label>
                <p className="text-xs text-muted-foreground mt-0.5">إظهار الرد حرفاً بحرف للمستخدم</p>
              </div>
              <Switch
                id={`stream-${row.function_name}`}
                checked={row.enable_streaming}
                onCheckedChange={(v) => updateRow(row.function_name, { enable_streaming: v })}
              />
            </div>

            <Button
              onClick={() => save(row)}
              disabled={savingFn === row.function_name || row.models_to_try.length === 0}
              className="w-full"
            >
              {savingFn === row.function_name ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              حفظ
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

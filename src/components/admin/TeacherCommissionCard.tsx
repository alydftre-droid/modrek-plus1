import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Percent, Pencil, History, Loader2, CalendarClock, Save, Clock } from "lucide-react";

interface Props {
  teacherId: string;
}

interface HistoryRow {
  id: string;
  old_rate: number | null;
  new_rate: number;
  effective_date: string;
  scheduled: boolean;
  applied: boolean;
  applied_at: string | null;
  note: string | null;
  created_at: string;
}

export default function TeacherCommissionCard({ teacherId }: Props) {
  const [loading, setLoading] = useState(true);
  const [currentRate, setCurrentRate] = useState<number>(0.55);
  const [pendingRate, setPendingRate] = useState<number | null>(null);
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [hasOverride, setHasOverride] = useState(false);
  const [defaultRate, setDefaultRate] = useState<number>(0.55);

  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [newRate, setNewRate] = useState("55");
  const [effDate, setEffDate] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: profile }, { data: settings }] = await Promise.all([
      supabase.from("profiles").select("commission_rate, pending_commission_rate, pending_effective_date").eq("id", teacherId).maybeSingle(),
      supabase.from("platform_settings").select("value").eq("key", "teacher_commission_rate").maybeSingle(),
    ]);
    const def = parseFloat((settings as any)?.value || "0.55") || 0.55;
    setDefaultRate(def);
    const override = (profile as any)?.commission_rate;
    setHasOverride(override !== null && override !== undefined);
    const eff = override ?? def;
    setCurrentRate(eff);
    setPendingRate((profile as any)?.pending_commission_rate ?? null);
    setPendingDate((profile as any)?.pending_effective_date ?? null);
    setNewRate(String(Math.round(eff * 100)));
    setLoading(false);
  };

  useEffect(() => { if (teacherId) load(); }, [teacherId]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    const { data } = await supabase
      .from("teacher_commission_history" as any)
      .select("*")
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false })
      .limit(100);
    setHistory((data || []) as any);
    setHistoryLoading(false);
  };

  const openHistory = () => { setHistoryOpen(true); loadHistory(); };

  const handleSave = async () => {
    const pct = parseFloat(newRate);
    if (isNaN(pct) || pct < 0 || pct > 100) { toast.error("النسبة بين 0 و 100"); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("admin_set_teacher_commission" as any, {
        _teacher_id: teacherId,
        _new_rate: pct / 100,
        _effective_date: effDate || null,
        _note: note || null,
      });
      if (error) throw error;
      const r = data as any;
      if (!r?.success) throw new Error(r?.error || "فشل التحديث");
      if (r.scheduled) toast.success("تم جدولة النسبة الجديدة");
      else toast.success("تم تطبيق النسبة الجديدة فوراً");
      setEditOpen(false);
      setNote("");
      setEffDate("");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "خطأ");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Card><CardContent className="p-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></CardContent></Card>;

  return (
    <>
      <Card className="border-0 shadow-md bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
                <Percent className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-sm">نسبة عمولة المعلم</p>
                <p className="text-[11px] text-muted-foreground">
                  {hasOverride ? "نسبة مخصصة" : `الافتراضي (${Math.round(defaultRate * 100)}%)`}
                </p>
              </div>
            </div>
            <div className="text-left">
              <p className="text-3xl font-bold text-emerald-600">{Math.round(currentRate * 100)}<span className="text-base">%</span></p>
            </div>
          </div>

          {pendingRate !== null && pendingDate && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200">
              <Clock className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-xs">
                نسبة مجدولة: <b>{Math.round(pendingRate * 100)}%</b> تبدأ يوم{" "}
                <b>{new Date(pendingDate).toLocaleDateString("ar-EG")}</b>
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1">
              <Pencil className="h-3.5 w-3.5" /> تعديل النسبة
            </Button>
            <Button variant="outline" size="sm" onClick={openHistory} className="gap-1">
              <History className="h-3.5 w-3.5" /> سجل التعديلات
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Percent className="h-5 w-5 text-emerald-600" /> تعديل نسبة عمولة المعلم</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">النسبة الحالية</Label>
              <p className="text-2xl font-bold text-emerald-600">{Math.round(currentRate * 100)}%</p>
            </div>
            <div>
              <Label className="text-xs">النسبة الجديدة (%)</Label>
              <Input type="number" min={0} max={100} value={newRate} onChange={(e) => setNewRate(e.target.value)} className="text-lg font-bold text-center" />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><CalendarClock className="h-3 w-3" /> تاريخ التفعيل (اختياري)</Label>
              <Input type="date" value={effDate} onChange={(e) => setEffDate(e.target.value)} min={new Date().toISOString().split("T")[0]} />
              <p className="text-[11px] text-muted-foreground mt-1">
                {effDate ? "ستُطبق تلقائياً في اليوم المحدد" : "اتركه فارغاً للتطبيق فوراً"}
              </p>
            </div>
            <div>
              <Label className="text-xs">ملاحظة (اختياري)</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="سبب التعديل..." />
            </div>
            <p className="text-[11px] text-muted-foreground bg-blue-50 dark:bg-blue-950/20 p-2 rounded">
              💡 النسبة الجديدة ستُطبق تلقائياً على كل اشتراك جديد بعد التفعيل. الاشتراكات السابقة لا تتأثر.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><History className="h-5 w-5 text-blue-600" /> سجل تعديلات النسبة</DialogTitle></DialogHeader>
          {historyLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : history.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">لا توجد تعديلات بعد</p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <Card key={h.id} className="border">
                  <CardContent className="p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {h.old_rate !== null && (
                          <span className="text-xs text-muted-foreground line-through">{Math.round(h.old_rate * 100)}%</span>
                        )}
                        <span className="text-base font-bold text-emerald-600">{Math.round(h.new_rate * 100)}%</span>
                      </div>
                      {h.scheduled && !h.applied ? (
                        <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px]"><Clock className="h-3 w-3 mr-1" />مجدول</Badge>
                      ) : (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-300 text-[10px]">مطبّق</Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      تاريخ التفعيل: {new Date(h.effective_date).toLocaleDateString("ar-EG")}
                    </p>
                    {h.note && <p className="text-xs">📝 {h.note}</p>}
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(h.created_at).toLocaleString("ar-EG")}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

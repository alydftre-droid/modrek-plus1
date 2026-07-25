import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, CalendarRange, ArrowLeftRight, CheckCircle2 } from "lucide-react";

interface TermRow {
  id: string;
  stage: string;
  grade: string;
  current_term: string;
}

const stageLabels: Record<string, string> = {
  preparatory: "المرحلة الإعدادية",
  secondary: "المرحلة الثانوية",
};

const gradeLabels: Record<string, string> = {
  "1": "الصف الأول",
  "2": "الصف الثاني",
  "3": "الصف الثالث",
};

const termLabels: Record<string, string> = {
  term1: "الترم الأول",
  term2: "الترم الثاني",
};

const TermManagement = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [terms, setTerms] = useState<TermRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => { fetchTerms(); }, []);

  const fetchTerms = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("system_terms")
      .select("*")
      .order("stage")
      .order("grade");
    setTerms((data as TermRow[]) || []);
    setLoading(false);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === terms.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(terms.map(t => t.id)));
    }
  };

  const selectStage = (stage: string) => {
    const stageIds = terms.filter(t => t.stage === stage).map(t => t.id);
    const allSelected = stageIds.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      stageIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const switchTerm = async (targetTerm: "term1" | "term2") => {
    if (selected.size === 0) {
      toast.error("اختر صف أو مرحلة أولاً");
      return;
    }
    setSaving(true);
    try {
      const selectedTerms = terms.filter(t => selected.has(t.id));
      const { data: switchResult, error: switchError } = await supabase.rpc("admin_switch_system_terms" as any, {
        _term_ids: selectedTerms.map((t) => t.id),
        _target_term: targetTerm,
      });

      if (switchError) {
        console.error("Term switch failed", switchError);
        throw switchError;
      }

      const updatedCount = Number((switchResult as any)?.updated_count || 0);
      if (updatedCount === 0) {
        throw new Error("لم يتم تحديث أي صف");
      }

      // Send personalized notifications (best-effort, do not fail the whole switch)
      try {
        const termName = termLabels[targetTerm];
        const notifTitle = `🎉 مبروك! بداية ${termName}`;
        const notifMessage = `تهانينا 🌟 تم نقل حسابك إلى ${termName} بنجاح! المحتوى الجديد جاهز ومتاح الآن، نتمنى لك التوفيق والنجاح في رحلتك الدراسية الجديدة. ابدأ الآن واستمتع بالتعلم! 🚀📚`;

        const affectedFilters = selectedTerms.map(t => ({ stage: t.stage, grade: t.grade }));
        const stageMap: Record<string, string> = { preparatory: "اعدادي", secondary: "ثانوي" };
        const gradeMap: Record<string, string> = { "1": "الصف الأول", "2": "الصف الثاني", "3": "الصف الثالث" };

        const profileQueries = affectedFilters.map(f =>
          supabase.from("profiles").select("id").eq("stage", stageMap[f.stage] || f.stage).eq("grade", gradeMap[f.grade] || f.grade)
        );
        const teacherQueries = affectedFilters.map(f =>
          supabase.from("teacher_assignments").select("teacher_id").eq("stage", stageMap[f.stage] || f.stage).eq("grade", gradeMap[f.grade] || f.grade)
        );

        const [profileResults, teacherResults] = await Promise.all([
          Promise.all(profileQueries),
          Promise.all(teacherQueries),
        ]);

        const userIds = new Set<string>();
        profileResults.forEach(r => r.data?.forEach((p: any) => userIds.add(p.id)));
        teacherResults.forEach(r => r.data?.forEach((t: any) => userIds.add(t.teacher_id)));

        if (userIds.size > 0) {
          const notifications = Array.from(userIds).map(uid => ({
            title: notifTitle,
            message: notifMessage,
            user_id: uid,
            notification_type: "term_change",
          }));
          for (let i = 0; i < notifications.length; i += 100) {
            const { error: notifErr } = await supabase.from("notifications").insert(notifications.slice(i, i + 100));
            if (notifErr) console.warn("notification batch failed", notifErr);
          }
        }

        const { error: globalNotifErr } = await supabase.from("notifications").insert({
          title: notifTitle,
          message: notifMessage,
          user_id: null,
          notification_type: "term_change",
        });
        if (globalNotifErr) console.warn("global notification failed", globalNotifErr);
      } catch (notifyError) {
        console.warn("Failed to send term change notifications", notifyError);
      }

      toast.success(`تم التحويل إلى ${termLabels[targetTerm]} بنجاح`);
      setSelected(new Set());
      await fetchTerms();
    } catch (error: any) {
      console.error("Term switch error", error);
      const msg = error?.message || error?.error_description || "خطأ غير معروف";
      toast.error(`خطأ في تبديل الترم: ${msg}`);
      await fetchTerms();
    } finally {
      setSaving(false);
    }
  };


  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const stages = ["preparatory", "secondary"];

  return (
    <div className="space-y-6">
      {/* Quick actions */}
      <Card className="border-2 border-purple-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-purple-700">
            <ArrowLeftRight className="h-5 w-5" />
            تبديل الترم
          </CardTitle>
          <p className="text-sm text-muted-foreground">اختر الصفوف أو المراحل ثم اضغط على زر التحويل</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Select all */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Checkbox
              checked={selected.size === terms.length && terms.length > 0}
              onCheckedChange={selectAll}
            />
            <span className="font-semibold text-sm">تحديد الكل</span>
          </div>

          {stages.map(stage => {
            const stageTerms = terms.filter(t => t.stage === stage);
            const stageIds = stageTerms.map(t => t.id);
            const allStageSelected = stageIds.length > 0 && stageIds.every(id => selected.has(id));

            return (
              <div key={stage} className="space-y-2">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/30">
                  <Checkbox checked={allStageSelected} onCheckedChange={() => selectStage(stage)} />
                  <span className="font-bold text-sm">{stageLabels[stage]}</span>
                </div>
                <div className="grid gap-2 pr-6">
                  {stageTerms.map(t => (
                    <div
                      key={t.id}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${
                        selected.has(t.id) ? "bg-primary/5 border-primary/30" : "hover:bg-accent/20"
                      }`}
                      onClick={() => toggleSelect(t.id)}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} />
                        <span className="text-sm font-medium">{gradeLabels[t.grade]}</span>
                      </div>
                      <Badge variant={t.current_term === "term1" ? "default" : "secondary"} className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {termLabels[t.current_term]}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {selected.size > 0 && (
            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={() => switchTerm("term1")}
                disabled={saving}
                variant="outline"
                className="flex-1 gap-2"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarRange className="h-4 w-4" />}
                الترم الأول
              </Button>
              <Button
                onClick={() => switchTerm("term2")}
                disabled={saving}
                className="flex-1 gap-2 bg-purple-600 hover:bg-purple-700"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarRange className="h-4 w-4" />}
                الترم الثاني
              </Button>
            </div>
          )}

          {selected.size > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              تم تحديد {selected.size} صف - اختر الترم المطلوب التحويل إليه
            </p>
          )}
        </CardContent>
      </Card>

      {/* Current status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">الحالة الحالية</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {terms.map(t => (
              <div key={t.id} className="p-2 rounded-lg bg-muted/50 text-center">
                <p className="text-xs text-muted-foreground">{stageLabels[t.stage]} - {gradeLabels[t.grade]}</p>
                <Badge variant={t.current_term === "term1" ? "default" : "secondary"} className="mt-1 text-xs">
                  {termLabels[t.current_term]}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TermManagement;

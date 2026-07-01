import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Ban, ShieldCheck, Trash2, Loader2, ShieldAlert } from "lucide-react";

type ActionKey = "ban" | "unban" | "delete";

interface Props {
  teacherId: string;
}

export function TeacherSecurityTab({ teacherId }: Props) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<ActionKey | null>(null);
  const [confirmAction, setConfirmAction] = useState<ActionKey | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const { data: profile, refetch } = useQuery({
    queryKey: ["teacher-security-profile", teacherId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, is_banned")
        .eq("id", teacherId)
        .maybeSingle();
      return data as { id: string; full_name: string | null; is_banned: boolean | null } | null;
    },
    retry: false,
  });

  const isBanned = !!profile?.is_banned;

  const runAction = async (action: ActionKey) => {
    setBusy(action);
    try {
      const fnAction = action === "ban" ? "ban_teacher" : action === "unban" ? "unban_teacher" : "delete_teacher";
      const { data, error } = await supabase.functions.invoke("admin-manage-teacher", { body: { action: fnAction, teacher_id: teacherId } });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast.success(
        action === "delete" ? "تم حذف حساب المعلم نهائياً" :
        action === "ban" ? "تم حظر المعلم" :
        "تم رفع الحظر عن المعلم"
      );
      setConfirmAction(null);
      setConfirmText("");
      await refetch();
      qc.invalidateQueries({ queryKey: ["dev-teacher-overview-v3", teacherId] });
    } catch (e: any) {
      toast.error(e?.message || "فشلت العملية");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="tm-panel">
        <div className="tm-panel-content space-y-3">
          <h4 className="tm-section-title !mb-0">
            <ShieldAlert className="h-4 w-4" /> أدوات التحكم بحساب المعلم
          </h4>
          <p className="text-sm text-slate-600 leading-7">
            كل عملية حساسة تتطلب تأكيداً صريحاً. تعامل مع هذه الأدوات بحذر — بعض العمليات لا يمكن التراجع عنها.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {isBanned ? (
          <SecurityActionCard
            icon={<ShieldCheck className="h-5 w-5" />}
            title="رفع الحظر عن الحساب"
            description="سيتمكن المعلم من الدخول واستئناف نشاطه فوراً."
            tone="green"
            actionLabel="رفع الحظر"
            busy={busy === "unban"}
            onClick={() => runAction("unban")}
          />
        ) : (
          <SecurityActionCard
            icon={<Ban className="h-5 w-5" />}
            title="حظر حساب المعلم"
            description="يمنع تسجيل الدخول ورفع المحتوى واستقبال الاشتراكات."
            tone="amber"
            actionLabel="حظر المعلم"
            busy={busy === "ban"}
            onClick={() => setConfirmAction("ban")}
          />
        )}

        <SecurityActionCard
          icon={<Trash2 className="h-5 w-5" />}
          title="حذف الحساب نهائياً"
          description="عملية غير قابلة للتراجع. سيتم حذف بيانات المعلم من المنصة."
          tone="red"
          actionLabel="حذف نهائي"
          busy={busy === "delete"}
          onClick={() => setConfirmAction("delete")}
        />
      </div>

      {/* Ban confirm */}
      <Dialog open={confirmAction === "ban"} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700 font-bold">
              <AlertTriangle className="h-5 w-5" /> تأكيد حظر المعلم
            </DialogTitle>
            <DialogDescription className="text-slate-600 leading-7 pt-2">
              سيتم منع المعلم <span className="font-bold text-slate-900">{profile?.full_name || ""}</span> من الدخول إلى حسابه ومن رفع أي محتوى.
              يمكنك رفع الحظر لاحقاً من هذه الصفحة.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-700" onClick={() => setConfirmAction(null)}>إلغاء</button>
            <button
              onClick={() => runAction("ban")}
              disabled={busy === "ban"}
              className="px-6 py-2.5 rounded-xl font-black text-white bg-amber-600 hover:bg-amber-700 inline-flex items-center gap-2 disabled:opacity-60"
            >
              {busy === "ban" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} تأكيد الحظر
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm with typed DELETE */}
      <Dialog open={confirmAction === "delete"} onOpenChange={(o) => { if (!o) { setConfirmAction(null); setConfirmText(""); } }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700 font-bold">
              <AlertTriangle className="h-5 w-5" /> حذف الحساب نهائياً
            </DialogTitle>
            <DialogDescription className="text-slate-600 leading-7 pt-2">
              أنت على وشك حذف حساب المعلم <span className="font-bold text-slate-900">{profile?.full_name || ""}</span> نهائياً.
              لن يمكن التراجع عن هذه العملية.
              <br />
              اكتب <span className="font-black text-rose-700">DELETE</span> للتأكيد.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="اكتب DELETE للتأكيد"
            className="text-center font-bold tracking-widest"
          />
          <DialogFooter className="gap-2">
            <button className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-700" onClick={() => { setConfirmAction(null); setConfirmText(""); }}>
              إلغاء
            </button>
            <button
              onClick={() => runAction("delete")}
              disabled={busy === "delete" || confirmText !== "DELETE"}
              className="px-6 py-2.5 rounded-xl font-black text-white bg-rose-600 hover:bg-rose-700 inline-flex items-center gap-2 disabled:opacity-50"
            >
              {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} حذف نهائي
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SecurityActionCard({
  icon, title, description, tone, actionLabel, busy, onClick,
}: {
  icon: React.ReactNode; title: string; description: string;
  tone: "amber" | "red" | "green"; actionLabel: string; busy: boolean; onClick: () => void;
}) {
  const toneMap = {
    amber: { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-800", btn: "bg-amber-600 hover:bg-amber-700" },
    red: { border: "border-rose-200", bg: "bg-rose-50", text: "text-rose-800", btn: "bg-rose-600 hover:bg-rose-700" },
    green: { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-800", btn: "bg-emerald-600 hover:bg-emerald-700" },
  }[tone];
  return (
    <div className={`rounded-2xl border ${toneMap.border} ${toneMap.bg} p-4 flex flex-col gap-3`}>
      <div className={`flex items-center gap-2 font-black ${toneMap.text}`}>{icon} {title}</div>
      <p className="text-sm text-slate-600 leading-6 flex-1">{description}</p>
      <button
        onClick={onClick}
        disabled={busy}
        className={`w-full py-2.5 rounded-xl font-black text-white inline-flex items-center justify-center gap-2 disabled:opacity-60 ${toneMap.btn}`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {actionLabel}
      </button>
    </div>
  );
}

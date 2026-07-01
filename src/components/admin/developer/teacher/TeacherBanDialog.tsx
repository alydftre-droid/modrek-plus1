import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertTriangle, Ban, Loader2, ShieldCheck } from "lucide-react";

interface Props {
  teacherId: string;
  currentlyBanned: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
}

export function TeacherBanDialog({ teacherId, currentlyBanned, open, onOpenChange, onDone }: Props) {
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      const action = currentlyBanned ? "unban_teacher" : "ban_teacher";
      const { data, error } = await supabase.functions.invoke("admin-manage-teacher", { body: { action, teacher_id: teacherId } });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast.success(currentlyBanned ? "تم رفع الحظر عن المعلم" : "تم حظر المعلم");
      onDone?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "فشلت العملية");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 text-lg font-bold ${currentlyBanned ? "text-emerald-700" : "text-rose-700"}`}>
            {currentlyBanned ? <ShieldCheck className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            {currentlyBanned ? "رفع الحظر عن المعلم" : "حظر المعلم"}
          </DialogTitle>
          <DialogDescription className="text-slate-600 leading-7 pt-2">
            {currentlyBanned
              ? "سيتمكن المعلم من الدخول إلى حسابه واستئناف نشاطه على المنصة."
              : "سيتم منع المعلم من تسجيل الدخول ومن رفع أي محتوى واستقبال أي اشتراكات جديدة. يمكنك رفع الحظر لاحقاً."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <button type="button" onClick={() => onOpenChange(false)} className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-700 hover:bg-slate-50">
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className={`px-6 py-2.5 rounded-xl font-black text-white inline-flex items-center justify-center gap-2 disabled:opacity-60 shadow-md ${
              currentlyBanned ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
            }`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : currentlyBanned ? <ShieldCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
            {currentlyBanned ? "رفع الحظر" : "تأكيد الحظر"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

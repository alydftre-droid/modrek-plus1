import { useNavigate } from "react-router-dom";
import { CalendarClock, Sparkles, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatCairo, type StudentAiQuota } from "@/hooks/useStudentAiQuota";

/**
 * Friendly, professional daily-limit notice for free students.
 * The renewal moment always comes from the server quota (Africa/Cairo),
 * never from the student's device clock.
 */
export function AiQuotaLimitDialog({
  open,
  onOpenChange,
  quota,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  quota: StudentAiQuota | null;
}) {
  const navigate = useNavigate();
  const limit = quota?.limit ?? 10;
  const reset = formatCairo(quota?.resetAt);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md overflow-hidden rounded-3xl border-border p-0">
        <div className="relative bg-gradient-to-br from-primary/15 via-primary/5 to-transparent px-6 pb-5 pt-7 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-sm">
            <Zap className="h-8 w-8" />
          </div>
          <DialogTitle className="text-lg font-extrabold text-foreground">
            انتهى استخدامك اليومي المجاني
          </DialogTitle>
          <DialogDescription className="mt-2 text-[13.5px] leading-7 text-muted-foreground">
            لقد وصلت إلى الحد اليومي المجاني لاستخدام المساعد الذكي ({limit} استخدامات).
          </DialogDescription>
        </div>

        <div className="space-y-3 px-5 pb-5">
          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <p className="text-[13.5px] leading-7 text-foreground">
              يمكنك العودة لاستخدام المساعد مجانًا عند تجديد الحد اليومي، أو الاشتراك في مجموعة مع أحد
              المعلمين للحصول على استخدام غير محدود للمساعد الذكي لمدة 30 يومًا.
            </p>
          </div>

          {reset && (
            <div className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/[0.07] p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <CalendarClock className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-primary">موعد تجديد الاستخدام</p>
                <p className="mt-0.5 text-sm font-extrabold text-foreground">{reset.date}</p>
                <p className="text-sm font-bold text-foreground">{reset.time}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-2xl border border-border bg-background p-3">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            <p className="text-xs leading-6 text-muted-foreground">
              مع أي اشتراك مدفوع فعّال: <span className="font-bold text-foreground">AI Premium ✨ استخدام غير محدود</span> لمدة 30 يومًا.
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <Button
              className="h-11 w-full gap-2 rounded-xl text-sm font-bold"
              onClick={() => {
                onOpenChange(false);
                navigate("/student/subjects");
              }}
            >
              <Users className="h-4 w-4" />
              الاشتراك مع أحد المعلمين
            </Button>
            <Button variant="ghost" className="h-10 w-full rounded-xl text-sm" onClick={() => onOpenChange(false)}>
              حسنًا، سأنتظر التجديد
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AiQuotaLimitDialog;

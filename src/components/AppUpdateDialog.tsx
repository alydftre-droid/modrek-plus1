import { useAppVersionCheck } from "@/hooks/useAppVersionCheck";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Sparkles, AlertTriangle } from "lucide-react";
import { openUrlWithinAppContainer } from "@/lib/nativeNavigation";

export default function AppUpdateDialog() {
  const { info, open, dismiss } = useAppVersionCheck();

  if (!info || !open) return null;

  const handleUpdate = async () => {
    openUrlWithinAppContainer(info.store_url);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Block closing on force update
        if (!o && info.is_force) return;
        if (!o) dismiss();
      }}
    >
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
            {info.is_force ? (
              <AlertTriangle className="h-7 w-7 text-white" />
            ) : (
              <Sparkles className="h-7 w-7 text-white" />
            )}
          </div>
          <DialogTitle className="text-center text-lg font-bold mt-3">
            {info.is_force ? "تحديث إلزامي" : "يتوفر تحديث جديد"}
          </DialogTitle>
          <DialogDescription className="text-center text-sm">
            الإصدار الجديد <span className="font-bold text-foreground">{info.latest_version}</span> متاح الآن.
            {!info.is_force && (
              <>
                <br />
                إصدارك الحالي: {info.current_version}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {info.release_notes && (
          <div className="bg-muted/50 rounded-xl p-3 max-h-40 overflow-y-auto">
            <p className="text-xs font-bold text-muted-foreground mb-1">ما الجديد:</p>
            <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
              {info.release_notes}
            </p>
          </div>
        )}

        {info.is_force && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3">
            <p className="text-xs text-destructive font-medium text-center">
              هذا التحديث مطلوب للاستمرار في استخدام التطبيق.
            </p>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={handleUpdate}
            className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:opacity-90 text-white"
          >
            <Download className="h-4 w-4 ml-2" />
            تحديث الآن
          </Button>
          {!info.is_force && (
            <Button variant="ghost" onClick={dismiss} className="w-full text-xs">
              لاحقاً
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

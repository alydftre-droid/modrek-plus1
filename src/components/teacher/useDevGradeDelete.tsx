import { useRef, useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { isDeveloperTeacherMode, removeTeacherGradeAssignments } from "@/lib/devTeacherGrades";
import { getNormalizedTeacherAssignmentGradeKey, type TeacherAssignmentLike } from "@/lib/teacherAssignments";
import { gradeDisplayFromAny } from "@/lib/teacherSubjectUtils";
import { DSDialog } from "@/design-system/components/Dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type DevGradeTarget = {
  category: string;
  categoryLabel: string;
  stageLabel: string;
  grade: string;
  assignmentIds: string[];
};

/**
 * Developer-only helper: long-press (or the small trash button) on a grade card
 * removes the link between the teacher and that grade. Content stays intact.
 */
export function useDevGradeDelete(params: {
  assignments: TeacherAssignmentLike[];
  teacherId?: string | null;
  onDeleted?: (removedIds: string[]) => void;
}) {
  const { assignments, teacherId, onDeleted } = params;
  const devMode = isDeveloperTeacherMode();

  const [sheetTarget, setSheetTarget] = useState<DevGradeTarget | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<DevGradeTarget | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const timer = useRef<number | null>(null);
  const fired = useRef(false);

  const buildTarget = (input: { category: string; categoryLabel?: string; stageLabel?: string; grade: string }): DevGradeTarget => {
    const gradeKey = getNormalizedTeacherAssignmentGradeKey(input.grade);
    const ids = assignments
      .filter((a) => a.category === input.category && getNormalizedTeacherAssignmentGradeKey(a.grade) === gradeKey)
      .map((a) => a.id)
      .filter((id): id is string => !!id);
    return {
      category: input.category,
      categoryLabel: input.categoryLabel || input.category,
      stageLabel: input.stageLabel || "",
      grade: input.grade,
      assignmentIds: ids,
    };
  };

  const clear = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const openMenu = (input: Parameters<typeof buildTarget>[0]) => {
    fired.current = true;
    setSheetTarget(buildTarget(input));
  };

  /** Spread on the grade card element. Returns {} when not in developer mode. */
  const bindCard = (input: Parameters<typeof buildTarget>[0]) => {
    if (!devMode) return {} as Record<string, never>;
    return {
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        openMenu(input);
      },
      onPointerDown: () => {
        fired.current = false;
        clear();
        // Developer must hold for 3 full seconds before the delete option appears.
        timer.current = window.setTimeout(() => openMenu(input), 3000);
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
    };
  };

  /** Call inside the card's onClick to swallow the click that follows a long-press. */
  const shouldSwallowClick = () => {
    if (fired.current) {
      fired.current = false;
      return true;
    }
    return false;
  };

  /** Deprecated: delete is only reachable through the 3s long-press menu. */
  const renderDevDeleteButton = (_input?: Parameters<typeof buildTarget>[0]) => null;


  const handleDelete = async () => {
    if (!confirmTarget || !teacherId || confirmText.trim() !== "حذف") return;
    setDeleting(true);
    try {
      await removeTeacherGradeAssignments({ teacherId, assignmentIds: confirmTarget.assignmentIds });
      onDeleted?.(confirmTarget.assignmentIds);
      setConfirmTarget(null);
      setConfirmText("");
      toast.success("✅ تم حذف الصف من حساب المعلم بنجاح.");
    } catch (e: any) {
      toast.error(e?.message || "فشل حذف الصف من حساب المعلم");
    } finally {
      setDeleting(false);
    }
  };

  const dialogs = !devMode ? null : (
    <>
      <Sheet open={!!sheetTarget} onOpenChange={(open) => !open && setSheetTarget(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl" dir="rtl">
          <SheetHeader className="text-right">
            <SheetTitle>
              {sheetTarget ? `الصف ${gradeDisplayFromAny(sheetTarget.grade)} · ${sheetTarget.categoryLabel}` : ""}
            </SheetTitle>
          </SheetHeader>
          <div className="pt-4 pb-6">
            <button
              type="button"
              className="w-full flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive font-bold"
              onClick={() => {
                setConfirmTarget(sheetTarget);
                setConfirmText("");
                setSheetTarget(null);
              }}
            >
              <Trash2 className="h-5 w-5" />
              🗑️ حذف الصف من حساب المعلم
            </button>
            <p className="text-xs text-muted-foreground mt-3 leading-6">
              هذا الخيار متاح للمطور فقط. لن يتم حذف الفيديوهات أو الملفات أو الاختبارات، سيتم فقط إزالة ربط الصف بحساب المعلم.
            </p>
          </div>
        </SheetContent>
      </Sheet>

      <DSDialog
        open={!!confirmTarget}
        onClose={() => { if (!deleting) { setConfirmTarget(null); setConfirmText(""); } }}
        size="sm"
        title="تأكيد حذف الصف"
        footer={
          <>
            <Button variant="outline" onClick={() => { setConfirmTarget(null); setConfirmText(""); }} disabled={deleting}>
              إلغاء
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting || confirmText.trim() !== "حذف"}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "حذف"}
            </Button>
          </>
        }
      >
        <div dir="rtl" className="space-y-3 text-right">
          <p className="text-[13px] leading-6 text-[#475569]">
            أنت على وشك حذف هذا الصف من حساب المعلم بشكل نهائي. لن يظهر هذا الصف مرة أخرى داخل حساب هذا المعلم إلا إذا تمت إضافته مرة أخرى.
          </p>
          {confirmTarget && (
            <p className="text-[13px] font-bold text-[#0F172A]">
              الصف {gradeDisplayFromAny(confirmTarget.grade)} · {confirmTarget.categoryLabel}
              {confirmTarget.stageLabel ? ` · ${confirmTarget.stageLabel}` : ""}
            </p>
          )}
          <p className="text-[13px] text-[#475569]">
            للتأكيد اكتب الكلمة التالية: <span className="font-bold text-destructive">حذف</span>
          </p>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="حذف" dir="rtl" autoFocus />
        </div>
      </DSDialog>
    </>
  );

  return { devMode, bindCard, shouldSwallowClick, renderDevDeleteButton, dialogs };
}

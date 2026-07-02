import * as React from "react";
import { createPortal } from "react-dom";
import { X, AlertTriangle, CheckCircle2, XCircle, HelpCircle, type LucideIcon } from "lucide-react";
import { DSButton } from "./Button";

export type DSDialogKind = "delete" | "warning" | "approve" | "reject" | "confirmation";

const kindMap: Record<DSDialogKind, { icon: LucideIcon; iconColor: string; iconBg: string; confirmVariant: "primary" | "danger" | "success" }> = {
  delete:       { icon: XCircle,        iconColor: "#DC2626", iconBg: "#FEF2F2", confirmVariant: "danger"  },
  warning:      { icon: AlertTriangle,  iconColor: "#F59E0B", iconBg: "#FFFBEB", confirmVariant: "primary" },
  approve:      { icon: CheckCircle2,   iconColor: "#059669", iconBg: "#ECFDF5", confirmVariant: "success" },
  reject:       { icon: XCircle,        iconColor: "#DC2626", iconBg: "#FEF2F2", confirmVariant: "danger"  },
  confirmation: { icon: HelpCircle,     iconColor: "#7C3AED", iconBg: "#F5F3FF", confirmVariant: "primary" },
};

export interface DSDialogProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

export function DSDialog({ open, onClose, title, description, children, footer, size = "md" }: DSDialogProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  const width = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-md";

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[rgba(15,23,42,0.5)] ds-anim-fade"
      onClick={onClose}
      data-ds-scope
    >
      <div
        className={`w-full ${width} bg-white rounded-[14px] shadow-[0_10px_20px_rgba(15,23,42,0.10)] ds-anim-scale`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-[#E2E8F0]">
          <div className="min-w-0">
            {title && <h2 className="text-[18px] font-bold text-[#0F172A]">{title}</h2>}
            {description && <p className="text-[13px] text-[#475569] mt-1">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="h-8 w-8 rounded-full flex items-center justify-center text-[#475569] hover:bg-[#F1F5F9]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children && <div className="p-5">{children}</div>}
        {footer && <div className="p-5 pt-0 flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export interface DSConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  kind?: DSDialogKind;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
}

export function DSConfirmDialog({
  open, onClose, onConfirm, kind = "confirmation",
  title, description, confirmLabel = "تأكيد", cancelLabel = "إلغاء", loading,
}: DSConfirmDialogProps) {
  const c = kindMap[kind];
  const Icon = c.icon;
  return (
    <DSDialog
      open={open}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <DSButton variant="secondary" onClick={onClose} disabled={loading}>{cancelLabel}</DSButton>
          <DSButton variant={c.confirmVariant} onClick={onConfirm} loading={loading}>{confirmLabel}</DSButton>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div
          className="h-11 w-11 rounded-[10px] flex items-center justify-center shrink-0"
          style={{ background: c.iconBg, color: c.iconColor }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[16px] font-bold text-[#0F172A]">{title}</div>
          {description && <div className="text-[13px] text-[#475569] mt-1 leading-6">{description}</div>}
        </div>
      </div>
    </DSDialog>
  );
}

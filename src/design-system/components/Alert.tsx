import * as React from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, HelpCircle, type LucideIcon } from "lucide-react";

export type DSAlertTone = "success" | "error" | "info" | "warning" | "confirmation";

const config: Record<DSAlertTone, { bg: string; border: string; text: string; iconColor: string; icon: LucideIcon }> = {
  success:      { bg: "bg-[#ECFDF5]", border: "border-[#A7F3D0]", text: "text-[#065F46]", iconColor: "text-[#059669]", icon: CheckCircle2 },
  error:        { bg: "bg-[#FEF2F2]", border: "border-[#FECACA]", text: "text-[#7F1D1D]", iconColor: "text-[#DC2626]", icon: XCircle },
  info:         { bg: "bg-[#EFF6FF]", border: "border-[#BFDBFE]", text: "text-[#1E3A8A]", iconColor: "text-[#2563EB]", icon: Info },
  warning:      { bg: "bg-[#FFFBEB]", border: "border-[#FDE68A]", text: "text-[#78350F]", iconColor: "text-[#F59E0B]", icon: AlertTriangle },
  confirmation: { bg: "bg-[#F5F3FF]", border: "border-[#DDD6FE]", text: "text-[#4C1D95]", iconColor: "text-[#7C3AED]", icon: HelpCircle },
};

export interface DSAlertProps {
  tone?: DSAlertTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}
export function DSAlert({ tone = "info", title, children, actions, icon, className = "" }: DSAlertProps) {
  const c = config[tone];
  const Icon = icon || c.icon;
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 border rounded-[10px] p-4 ${c.bg} ${c.border} ${c.text} ${className}`}
    >
      <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${c.iconColor}`} />
      <div className="flex-1 min-w-0">
        {title && <div className="text-[14px] font-bold mb-1">{title}</div>}
        {children && <div className="text-[13px] leading-6 opacity-90">{children}</div>}
        {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

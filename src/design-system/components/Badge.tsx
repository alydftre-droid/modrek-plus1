import * as React from "react";

export type DSBadgeTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "purple"
  | "orange";

export type DSBadgeStatus =
  | "active"      // نشط
  | "inactive"    // غير نشط
  | "blocked"     // محظور
  | "new"         // جديد
  | "completed"   // مكتمل
  | "in_progress" // قيد التنفيذ
  | "expired";    // منتهي

const tones: Record<DSBadgeTone, string> = {
  neutral: "bg-[#F1F5F9] text-[#334155] border-[#E2E8F0]",
  info:    "bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]",
  success: "bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]",
  warning: "bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]",
  danger:  "bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]",
  purple:  "bg-[#F5F3FF] text-[#6D28D9] border-[#DDD6FE]",
  orange:  "bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]",
};

const statusMap: Record<DSBadgeStatus, { tone: DSBadgeTone; label: string }> = {
  active:      { tone: "success", label: "نشط" },
  inactive:    { tone: "neutral", label: "غير نشط" },
  blocked:     { tone: "danger",  label: "محظور" },
  new:         { tone: "info",    label: "جديد" },
  completed:   { tone: "success", label: "مكتمل" },
  in_progress: { tone: "warning", label: "قيد التنفيذ" },
  expired:     { tone: "neutral", label: "منتهي" },
};

export interface DSBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: DSBadgeTone;
  dot?: boolean;
}
export function DSBadge({ tone = "neutral", dot = false, className = "", children, ...p }: DSBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full border text-[12px] font-semibold ${tones[tone]} ${className}`}
      {...p}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function DSStatusBadge({ status, className = "" }: { status: DSBadgeStatus; className?: string }) {
  const { tone, label } = statusMap[status];
  return <DSBadge tone={tone} dot className={className}>{label}</DSBadge>;
}

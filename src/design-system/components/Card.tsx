import * as React from "react";
import type { LucideIcon } from "lucide-react";

type Size = "sm" | "md" | "lg";
type Tone = "default" | "info" | "warning" | "success" | "danger";

const sizePad: Record<Size, string> = {
  sm: "p-4 rounded-[10px]",
  md: "p-5 rounded-[14px]",
  lg: "p-6 rounded-[20px]",
};

const toneStyles: Record<Tone, string> = {
  default: "bg-white border-[#E2E8F0]",
  info: "bg-[#EFF6FF] border-[#BFDBFE]",
  warning: "bg-[#FFFBEB] border-[#FDE68A]",
  success: "bg-[#ECFDF5] border-[#A7F3D0]",
  danger: "bg-[#FEF2F2] border-[#FECACA]",
};

export interface DSCardProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: Size;
  tone?: Tone;
  interactive?: boolean;
}

export const DSCard = React.forwardRef<HTMLDivElement, DSCardProps>(
  ({ size = "md", tone = "default", interactive = false, className = "", ...props }, ref) => {
    const cls = [
      "border shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition-shadow duration-200",
      sizePad[size],
      toneStyles[tone],
      interactive ? "hover:shadow-[0_8px_16px_rgba(37,99,235,0.15)] cursor-pointer" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");
    return <div ref={ref} className={cls} {...props} />;
  },
);
DSCard.displayName = "DSCard";

export function DSCardHeader({ className = "", ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`mb-3 flex items-start justify-between gap-3 ${className}`} {...p} />;
}
export function DSCardTitle({ className = "", ...p }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={`text-[18px] font-bold text-[#0F172A] ${className}`} {...p} />;
}
export function DSCardDescription({ className = "", ...p }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`text-[13px] text-[#475569] mt-1 ${className}`} {...p} />;
}
export function DSCardContent({ className = "", ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={className} {...p} />;
}
export function DSCardFooter({ className = "", ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`mt-4 pt-4 border-t border-[#E2E8F0] flex items-center gap-2 ${className}`} {...p} />;
}

export interface DSStatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  hint?: string;
  accent?: "primary" | "success" | "warning" | "danger" | "purple" | "orange";
}

const accentColor: Record<NonNullable<DSStatCardProps["accent"]>, string> = {
  primary: "#2563EB",
  success: "#059669",
  warning: "#F59E0B",
  danger: "#DC2626",
  purple: "#7C3AED",
  orange: "#EA580C",
};

export function DSStatCard({ label, value, icon: Icon, hint, accent = "primary" }: DSStatCardProps) {
  const color = accentColor[accent];
  return (
    <DSCard size="md">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-[#475569] mb-1">{label}</div>
          <div className="text-[26px] font-extrabold text-[#0F172A] leading-none">{value}</div>
          {hint && <div className="text-[12px] text-[#94A3B8] mt-1">{hint}</div>}
        </div>
        {Icon && (
          <div
            className="h-11 w-11 rounded-[10px] flex items-center justify-center shrink-0"
            style={{ background: `${color}14`, color }}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </DSCard>
  );
}

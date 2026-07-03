/**
 * Modrek AI Library — Premium Cloud Design Kit
 * ------------------------------------------------
 * Unified primitives used across every Library page.
 * Palette:
 *   Primary #2563EB · Hover #1D4ED8 · Pressed #1E40AF
 *   Sky #38BDF8 · Purple #8B5CF6 · Cyan #06B6D4 · Emerald #10B981
 *   BG #F8FAFC · Card #FFFFFF · Section #F1F5F9 · Border #E5E7EB
 *   Text #0F172A · Muted #94A3B8
 * Radius: card 20px · button 14px · pill 999
 * Shadow: 0 8px 24px rgba(37,99,235,.08)
 */
import * as React from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ────────────────────────────── Tokens ────────────────────────────── */
export const modrekTokens = {
  color: {
    primary: "#2563EB",
    primaryHover: "#1D4ED8",
    primaryPressed: "#1E40AF",
    sky: "#38BDF8",
    cloud: "#60A5FA",
    lightCloud: "#DBEAFE",
    veryLight: "#EFF6FF",
    bg: "#F8FAFC",
    card: "#FFFFFF",
    section: "#F1F5F9",
    hover: "#E2E8F0",
    border: "#E5E7EB",
    text: "#0F172A",
    textSecondary: "#475569",
    muted: "#94A3B8",
    success: "#22C55E",
    warning: "#F59E0B",
    error: "#EF4444",
    purple: "#8B5CF6",
    cyan: "#06B6D4",
    emerald: "#10B981",
  },
  radius: { sm: 8, md: 12, lg: 14, xl: 20, pill: 9999 },
  shadow: {
    cloud: "0 8px 24px rgba(37,99,235,.08)",
    cloudLg: "0 12px 40px rgba(59,130,246,.10)",
    glow: "0 8px 24px rgba(37,99,235,.25)",
  },
};

/* ────────────────────────────── Shell ────────────────────────────── */
export function ModrekShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      dir="rtl"
      className={cn(
        "min-h-screen bg-[#F8FAFC] text-[#0F172A]",
        "[font-family:Cairo,system-ui,sans-serif]",
        className,
      )}
    >
      <div className="max-w-[1500px] mx-auto p-4 md:p-8 space-y-6 animate-in fade-in duration-300">
        {children}
      </div>
    </div>
  );
}

/* ────────────────────────────── Card ────────────────────────────── */
export function ModrekCard({
  children,
  className = "",
  interactive = false,
  padding = "md",
  as: As = "div",
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  as?: any;
}) {
  const pad = { none: "", sm: "p-4", md: "p-5 md:p-6", lg: "p-6 md:p-8" }[padding];
  return (
    <As
      className={cn(
        "bg-white border border-[#E5E7EB] rounded-[20px]",
        "shadow-[0_8px_24px_rgba(37,99,235,0.06)]",
        "transition-all duration-200",
        interactive &&
          "hover:shadow-[0_12px_40px_rgba(59,130,246,0.12)] hover:border-[#BFDBFE] hover:-translate-y-0.5 cursor-pointer",
        pad,
        className,
      )}
      {...rest}
    >
      {children}
    </As>
  );
}

/* ────────────────────────────── Buttons ────────────────────────────── */
type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "warning";
type BtnSize = "sm" | "md" | "lg";

export interface ModrekButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: BtnSize;
  icon?: LucideIcon;
  iconPosition?: "start" | "end";
  loading?: boolean;
  fullWidth?: boolean;
}

const btnBase =
  "relative inline-flex items-center justify-center gap-2 font-bold whitespace-nowrap select-none " +
  "transition-all duration-150 focus:outline-none focus-visible:ring-4 " +
  "active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none";

const btnSize: Record<BtnSize, string> = {
  sm: "h-9 px-3.5 text-[13px] rounded-[10px] [&_svg]:h-4 [&_svg]:w-4",
  md: "h-11 px-5 text-sm rounded-[12px] [&_svg]:h-4 [&_svg]:w-4",
  lg: "h-12 px-6 text-[15px] rounded-[14px] [&_svg]:h-5 [&_svg]:w-5",
};

const btnVariant: Record<BtnVariant, string> = {
  primary:
    "text-white bg-gradient-to-br from-[#3B82F6] to-[#2563EB] " +
    "hover:from-[#60A5FA] hover:to-[#3B82F6] " +
    "shadow-[0_8px_24px_rgba(37,99,235,0.25)] hover:shadow-[0_10px_28px_rgba(37,99,235,0.35)] " +
    "focus-visible:ring-[#2563EB]/25",
  secondary:
    "text-[#1D4ED8] bg-white border border-[#DBEAFE] " +
    "hover:bg-[#EFF6FF] hover:border-[#93C5FD] " +
    "shadow-[0_1px_2px_rgba(15,23,42,0.04)] " +
    "focus-visible:ring-[#93C5FD]/50",
  ghost:
    "text-[#334155] bg-transparent hover:bg-[#F1F5F9] " +
    "focus-visible:ring-[#CBD5E1]/60",
  danger:
    "text-white bg-gradient-to-br from-[#F87171] to-[#EF4444] " +
    "hover:from-[#FCA5A5] hover:to-[#F87171] " +
    "shadow-[0_8px_24px_rgba(239,68,68,0.25)] " +
    "focus-visible:ring-[#EF4444]/25",
  success:
    "text-white bg-gradient-to-br from-[#34D399] to-[#22C55E] " +
    "hover:from-[#6EE7B7] hover:to-[#34D399] " +
    "shadow-[0_8px_24px_rgba(34,197,94,0.25)] " +
    "focus-visible:ring-[#22C55E]/25",
  warning:
    "text-white bg-gradient-to-br from-[#FBBF24] to-[#F59E0B] " +
    "hover:from-[#FCD34D] hover:to-[#FBBF24] " +
    "shadow-[0_8px_24px_rgba(245,158,11,0.25)] " +
    "focus-visible:ring-[#F59E0B]/25",
};

export const ModrekButton = React.forwardRef<HTMLButtonElement, ModrekButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      icon: Icon,
      iconPosition = "start",
      loading,
      fullWidth,
      className = "",
      disabled,
      children,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={props.type ?? "button"}
      disabled={disabled || loading}
      className={cn(
        btnBase,
        btnSize[size],
        btnVariant[variant],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="animate-spin" />
      ) : Icon && iconPosition === "start" ? (
        <Icon />
      ) : null}
      {children}
      {!loading && Icon && iconPosition === "end" ? <Icon /> : null}
    </button>
  ),
);
ModrekButton.displayName = "ModrekButton";

export function ModrekIconButton({
  icon: Icon,
  size = "md",
  variant = "secondary",
  tone,
  className = "",
  ...props
}: Omit<ModrekButtonProps, "icon" | "children"> & {
  icon: LucideIcon;
  tone?: "blue" | "slate" | "purple" | "emerald" | "amber" | "red";
  "aria-label": string;
}) {
  const toneMap: Record<string, string> = {
    blue: "text-[#2563EB] bg-[#EFF6FF] hover:bg-[#DBEAFE] border-[#DBEAFE]",
    slate: "text-[#334155] bg-[#F1F5F9] hover:bg-[#E2E8F0] border-[#E2E8F0]",
    purple: "text-[#7C3AED] bg-[#F5F3FF] hover:bg-[#EDE9FE] border-[#EDE9FE]",
    emerald: "text-[#059669] bg-[#ECFDF5] hover:bg-[#D1FAE5] border-[#D1FAE5]",
    amber: "text-[#B45309] bg-[#FFFBEB] hover:bg-[#FEF3C7] border-[#FEF3C7]",
    red: "text-[#DC2626] bg-[#FEF2F2] hover:bg-[#FEE2E2] border-[#FEE2E2]",
  };
  const dim = size === "sm" ? "h-9 w-9" : size === "lg" ? "h-12 w-12" : "h-10 w-10";
  return (
    <button
      type="button"
      className={cn(
        btnBase,
        dim,
        "rounded-[12px] border transition-colors",
        tone ? toneMap[tone] : btnVariant[variant],
        className,
      )}
      {...props}
    >
      <Icon className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} />
    </button>
  );
}

/* ────────────────────────────── Hero Header ────────────────────────────── */
export function ModrekHero({
  icon: Icon,
  title,
  subtitle,
  eyebrow,
  actions,
  children,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[24px] bg-white border border-[#E5E7EB]",
        "shadow-[0_12px_40px_rgba(37,99,235,0.08)] p-5 md:p-7",
      )}
    >
      {/* soft cloud accents */}
      <div className="absolute -top-24 -left-24 h-64 w-64 rounded-full bg-[#DBEAFE] opacity-60 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 h-56 w-56 rounded-full bg-[#EDE9FE] opacity-60 blur-3xl pointer-events-none" />

      <div className="relative flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div
            className={cn(
              "shrink-0 h-14 w-14 md:h-16 md:w-16 rounded-[18px] flex items-center justify-center text-white",
              "bg-gradient-to-br from-[#3B82F6] to-[#2563EB]",
              "shadow-[0_10px_28px_rgba(37,99,235,0.35)]",
            )}
          >
            <Icon className="h-7 w-7 md:h-8 md:w-8" />
          </div>
          <div className="min-w-0">
            {eyebrow && <div className="mb-1.5">{eyebrow}</div>}
            <h1 className="text-2xl md:text-[28px] font-extrabold text-[#0F172A] leading-tight tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="text-[13px] md:text-sm text-[#475569] mt-1 leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
      {children && <div className="relative mt-6">{children}</div>}
    </div>
  );
}

export function ModrekEyebrow({
  icon: Icon,
  children,
}: {
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full",
        "bg-[#EFF6FF] text-[#1D4ED8] text-[11px] font-bold border border-[#DBEAFE]",
      )}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}

/* ────────────────────────────── Stat Card ────────────────────────────── */
export function ModrekStat({
  label,
  value,
  icon: Icon,
  accent = "blue",
  hint,
  spin,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  accent?: "blue" | "purple" | "emerald" | "amber" | "cyan" | "rose" | "slate";
  hint?: React.ReactNode;
  spin?: boolean;
}) {
  const accents: Record<string, { bg: string; fg: string; ring: string }> = {
    blue: { bg: "bg-[#EFF6FF]", fg: "text-[#2563EB]", ring: "ring-[#DBEAFE]" },
    purple: { bg: "bg-[#F5F3FF]", fg: "text-[#7C3AED]", ring: "ring-[#EDE9FE]" },
    emerald: { bg: "bg-[#ECFDF5]", fg: "text-[#059669]", ring: "ring-[#D1FAE5]" },
    amber: { bg: "bg-[#FFFBEB]", fg: "text-[#D97706]", ring: "ring-[#FEF3C7]" },
    cyan: { bg: "bg-[#ECFEFF]", fg: "text-[#0891B2]", ring: "ring-[#CFFAFE]" },
    rose: { bg: "bg-[#FFF1F2]", fg: "text-[#E11D48]", ring: "ring-[#FFE4E6]" },
    slate: { bg: "bg-[#F1F5F9]", fg: "text-[#334155]", ring: "ring-[#E2E8F0]" },
  };
  const a = accents[accent];
  return (
    <ModrekCard padding="none" className="p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-[#475569]">{label}</div>
          <div className="mt-1.5 text-[26px] md:text-[28px] font-extrabold text-[#0F172A] leading-none tabular-nums">
            {value}
          </div>
          {hint && <div className="mt-1 text-[11px] text-[#94A3B8]">{hint}</div>}
        </div>
        <div
          className={cn(
            "shrink-0 h-12 w-12 rounded-[14px] flex items-center justify-center ring-1",
            a.bg,
            a.fg,
            a.ring,
          )}
        >
          <Icon className={cn("h-5 w-5", spin && "animate-spin")} />
        </div>
      </div>
    </ModrekCard>
  );
}

/* ────────────────────────────── Section ────────────────────────────── */
export function ModrekSection({
  title,
  icon: Icon,
  subtitle,
  right,
  children,
  className = "",
}: {
  title: React.ReactNode;
  icon?: LucideIcon;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon && (
            <span className="h-9 w-9 rounded-[12px] bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center ring-1 ring-[#DBEAFE]">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-base md:text-lg font-extrabold text-[#0F172A] leading-tight">
              {title}
            </h2>
            {subtitle && <p className="text-[12px] text-[#94A3B8]">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/* ────────────────────────────── Pill / Badge ────────────────────────────── */
type Tone = "blue" | "purple" | "emerald" | "amber" | "red" | "rose" | "slate" | "cyan";
const toneStyle: Record<Tone, string> = {
  blue: "bg-[#EFF6FF] text-[#1D4ED8] ring-[#DBEAFE]",
  purple: "bg-[#F5F3FF] text-[#6D28D9] ring-[#EDE9FE]",
  emerald: "bg-[#ECFDF5] text-[#047857] ring-[#D1FAE5]",
  amber: "bg-[#FFFBEB] text-[#B45309] ring-[#FEF3C7]",
  red: "bg-[#FEF2F2] text-[#B91C1C] ring-[#FEE2E2]",
  rose: "bg-[#FFF1F2] text-[#BE123C] ring-[#FFE4E6]",
  slate: "bg-[#F1F5F9] text-[#334155] ring-[#E2E8F0]",
  cyan: "bg-[#ECFEFF] text-[#0E7490] ring-[#CFFAFE]",
};
export function ModrekPill({
  children,
  tone = "blue",
  icon: Icon,
  className = "",
  size = "md",
}: {
  children: React.ReactNode;
  tone?: Tone;
  icon?: LucideIcon;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-bold ring-1",
        size === "sm" ? "text-[10px] h-5 px-2" : "text-[11px] h-6 px-2.5",
        toneStyle[tone],
        className,
      )}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}

/* ────────────────────────────── Select / Input ────────────────────────────── */
export function ModrekSelect({
  label,
  value,
  onChange,
  options,
  disabled,
  placeholder,
  icon: Icon,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name_ar: string }[];
  disabled?: boolean;
  placeholder?: string;
  icon?: LucideIcon;
}) {
  return (
    <label className={cn("block", disabled && "opacity-50 pointer-events-none")}>
      {label && (
        <div className="text-[12px] font-bold text-[#334155] mb-1.5 flex items-center gap-1.5">
          {Icon && <Icon className="h-3.5 w-3.5 text-[#2563EB]" />}
          {label}
        </div>
      )}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={cn(
            "w-full h-11 rounded-[12px] bg-white border border-[#E5E7EB]",
            "pr-3 pl-9 text-[13px] font-semibold text-[#0F172A] appearance-none",
            "transition-all duration-150",
            "hover:border-[#93C5FD]",
            "focus:outline-none focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10",
            "disabled:bg-[#F8FAFC] disabled:cursor-not-allowed",
          )}
        >
          <option value="">{placeholder ?? "الكل"}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name_ar}
            </option>
          ))}
        </select>
        <ChevronIcon />
      </div>
    </label>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.19l3.71-3.96a.75.75 0 111.08 1.04l-4.25 4.53a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function ModrekSearchInput({
  value,
  onChange,
  placeholder = "بحث...",
  icon: Icon,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      {Icon && (
        <Icon className="h-4 w-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
      )}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full h-11 rounded-[12px] bg-white border border-[#E5E7EB]",
          Icon ? "pr-10 pl-3" : "px-3",
          "text-[13px] font-semibold text-[#0F172A] placeholder:text-[#94A3B8] placeholder:font-normal",
          "transition-all duration-150",
          "hover:border-[#93C5FD]",
          "focus:outline-none focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10",
        )}
      />
    </div>
  );
}

/* ────────────────────────────── Status Pill ────────────────────────────── */
export function ModrekStatus({ status }: { status: string }) {
  const map: Record<string, { l: string; tone: Tone; dot: string }> = {
    draft: { l: "مسودة", tone: "slate", dot: "bg-[#94A3B8]" },
    processing: { l: "قيد المعالجة", tone: "amber", dot: "bg-[#F59E0B] animate-pulse" },
    ready: { l: "جاهز", tone: "emerald", dot: "bg-[#22C55E]" },
    archived: { l: "مؤرشف", tone: "slate", dot: "bg-[#94A3B8]" },
    failed: { l: "فشل", tone: "red", dot: "bg-[#EF4444]" },
  };
  const m = map[status] ?? map.draft;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-bold ring-1",
        toneStyle[m.tone],
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.l}
    </span>
  );
}

/* ────────────────────────────── Empty State ────────────────────────────── */
export function ModrekEmpty({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <ModrekCard padding="lg" className="text-center">
      <div className="relative mx-auto w-24 h-24 mb-4">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#DBEAFE] to-[#EFF6FF] blur-xl opacity-70" />
        <div className="relative h-24 w-24 rounded-[24px] bg-gradient-to-br from-[#EFF6FF] to-[#F5F3FF] border border-[#DBEAFE] flex items-center justify-center mx-auto">
          <Icon className="h-10 w-10 text-[#2563EB]" strokeWidth={1.75} />
        </div>
      </div>
      <h3 className="text-lg font-extrabold text-[#0F172A]">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-[#94A3B8] max-w-md mx-auto leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </ModrekCard>
  );
}

/* ────────────────────────────── Section Divider ────────────────────────────── */
export function ModrekDivider({ label }: { label?: string }) {
  if (!label)
    return <div className="h-px bg-[#E5E7EB] my-4" />;
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="h-px bg-[#E5E7EB] flex-1" />
      <span className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider">
        {label}
      </span>
      <div className="h-px bg-[#E5E7EB] flex-1" />
    </div>
  );
}

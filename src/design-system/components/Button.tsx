import * as React from "react";
import { Loader2, type LucideIcon } from "lucide-react";

type Variant = "primary" | "secondary" | "danger" | "success" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

export interface DSButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: LucideIcon;
  iconPosition?: "start" | "end";
  fullWidth?: boolean;
}

const base =
  "inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap select-none transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

const variants: Record<Variant, string> = {
  primary:
    "bg-[#2563EB] text-white hover:bg-[#1D4ED8] focus-visible:ring-[#2563EB] shadow-[0_1px_2px_rgba(15,23,42,0.06)]",
  secondary:
    "bg-[#F1F5F9] text-[#0F172A] hover:bg-[#E2E8F0] focus-visible:ring-[#334155] border border-[#E2E8F0]",
  danger:
    "bg-[#DC2626] text-white hover:bg-[#B91C1C] focus-visible:ring-[#DC2626]",
  success:
    "bg-[#059669] text-white hover:bg-[#047857] focus-visible:ring-[#059669]",
  outline:
    "bg-white text-[#2563EB] border border-[#2563EB] hover:bg-[#EFF6FF] focus-visible:ring-[#2563EB]",
  ghost:
    "bg-transparent text-[#334155] hover:bg-[#F1F5F9] focus-visible:ring-[#334155]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-[13px] rounded-[8px] [&_svg]:h-4 [&_svg]:w-4",
  md: "h-11 px-4 text-[14px] rounded-[10px] [&_svg]:h-4 [&_svg]:w-4",
  lg: "h-13 px-6 text-[15px] rounded-[12px] [&_svg]:h-5 [&_svg]:w-5",
};

export const DSButton = React.forwardRef<HTMLButtonElement, DSButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      icon: Icon,
      iconPosition = "start",
      fullWidth = false,
      className = "",
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const cls = [base, variants[variant], sizes[size], fullWidth ? "w-full" : "", className]
      .filter(Boolean)
      .join(" ");
    return (
      <button
        ref={ref}
        type={props.type ?? "button"}
        disabled={disabled || loading}
        className={cls}
        {...props}
      >
        {loading ? <Loader2 className="animate-spin" /> : Icon && iconPosition === "start" ? <Icon /> : null}
        {children}
        {!loading && Icon && iconPosition === "end" ? <Icon /> : null}
      </button>
    );
  },
);
DSButton.displayName = "DSButton";

export interface DSIconButtonProps extends Omit<DSButtonProps, "icon" | "children"> {
  icon: LucideIcon;
  "aria-label": string;
}

export const DSIconButton = React.forwardRef<HTMLButtonElement, DSIconButtonProps>(
  ({ icon: Icon, size = "md", variant = "ghost", className = "", ...props }, ref) => {
    const dim = size === "sm" ? "h-9 w-9" : size === "lg" ? "h-13 w-13" : "h-11 w-11";
    return (
      <DSButton
        ref={ref}
        variant={variant}
        size={size}
        className={`${dim} p-0 ${className}`}
        {...props}
      >
        <Icon />
      </DSButton>
    );
  },
);
DSIconButton.displayName = "DSIconButton";

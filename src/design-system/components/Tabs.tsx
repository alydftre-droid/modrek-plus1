import * as React from "react";

type Variant = "primary" | "secondary" | "segment" | "pills";

export interface DSTabItem {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface DSTabsProps {
  items: DSTabItem[];
  value: string;
  onChange: (v: string) => void;
  variant?: Variant;
  fullWidth?: boolean;
  className?: string;
}

export function DSTabs({ items, value, onChange, variant = "primary", fullWidth, className = "" }: DSTabsProps) {
  if (variant === "segment") {
    return (
      <div className={`inline-flex p-1 bg-[#F1F5F9] rounded-[10px] ${fullWidth ? "w-full" : ""} ${className}`}>
        {items.map((it) => {
          const active = it.value === value;
          return (
            <button
              key={it.value}
              type="button"
              disabled={it.disabled}
              onClick={() => onChange(it.value)}
              className={`inline-flex items-center justify-center gap-2 h-9 px-4 text-[13px] font-semibold rounded-[8px] transition-colors ${
                active ? "bg-white text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.06)]" : "text-[#475569] hover:text-[#0F172A]"
              } ${fullWidth ? "flex-1" : ""} disabled:opacity-50`}
            >
              {it.icon}{it.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === "pills") {
    return (
      <div className={`inline-flex flex-wrap gap-2 ${className}`}>
        {items.map((it) => {
          const active = it.value === value;
          return (
            <button
              key={it.value}
              type="button"
              disabled={it.disabled}
              onClick={() => onChange(it.value)}
              className={`inline-flex items-center gap-2 h-9 px-4 text-[13px] font-semibold rounded-full border transition-colors ${
                active
                  ? "bg-[#2563EB] text-white border-[#2563EB]"
                  : "bg-white text-[#334155] border-[#E2E8F0] hover:bg-[#F1F5F9]"
              } disabled:opacity-50`}
            >
              {it.icon}{it.label}
            </button>
          );
        })}
      </div>
    );
  }

  const isSecondary = variant === "secondary";
  return (
    <div className={`border-b border-[#E2E8F0] ${className}`}>
      <div className={`inline-flex gap-1 ${fullWidth ? "w-full" : ""}`}>
        {items.map((it) => {
          const active = it.value === value;
          const activeColor = isSecondary ? "#7C3AED" : "#2563EB";
          return (
            <button
              key={it.value}
              type="button"
              disabled={it.disabled}
              onClick={() => onChange(it.value)}
              className={`inline-flex items-center justify-center gap-2 h-11 px-4 text-[14px] font-semibold border-b-2 -mb-px transition-colors ${
                active ? "text-[#0F172A]" : "text-[#475569] border-transparent hover:text-[#0F172A]"
              } ${fullWidth ? "flex-1" : ""} disabled:opacity-50`}
              style={active ? { borderBottomColor: activeColor, color: activeColor } : {}}
            >
              {it.icon}{it.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

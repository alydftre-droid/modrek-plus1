import * as React from "react";

type Variant = "h1" | "h2" | "h3" | "title" | "subtitle" | "body" | "caption" | "label";

const styles: Record<Variant, string> = {
  h1:       "text-[32px] font-extrabold leading-tight text-[#0F172A]",
  h2:       "text-[26px] font-bold leading-tight text-[#0F172A]",
  h3:       "text-[22px] font-bold leading-snug text-[#0F172A]",
  title:    "text-[18px] font-bold text-[#0F172A]",
  subtitle: "text-[16px] font-semibold text-[#334155]",
  body:     "text-[14px] leading-6 text-[#0F172A]",
  caption:  "text-[12px] leading-5 text-[#475569]",
  label:    "text-[13px] font-semibold text-[#0F172A]",
};

const tagMap: Record<Variant, keyof React.JSX.IntrinsicElements> = {
  h1: "h1", h2: "h2", h3: "h3", title: "h4", subtitle: "h5",
  body: "p", caption: "span", label: "span",
};

export interface DSTextProps extends React.HTMLAttributes<HTMLElement> {
  variant?: Variant;
  as?: keyof React.JSX.IntrinsicElements;
}

export function DSText({ variant = "body", as, className = "", ...p }: DSTextProps) {
  const Tag = (as || tagMap[variant]) as React.ElementType;
  return <Tag className={`${styles[variant]} ${className}`} {...p} />;
}

/**
 * Modrek Plus — Official Design Tokens
 * المرجع الوحيد لأي صفحة جديدة. لا تعدّل الصفحات القديمة.
 */

export const dsColors = {
  primary: "#2563EB",
  primaryHover: "#1D4ED8",
  purple: "#7C3AED",
  emerald: "#059669",
  orange: "#EA580C",
  red: "#DC2626",
  gray: "#334155",

  background: "#F8FAFC",
  surface: "#FFFFFF",
  card: "#FFFFFF",
  border: "#E2E8F0",

  textPrimary: "#0F172A",
  textSecondary: "#475569",
  muted: "#94A3B8",
  disabled: "#CBD5E1",
  hover: "#F1F5F9",
  focus: "#2563EB",
  overlay: "rgba(15, 23, 42, 0.5)",

  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#2563EB",
} as const;

export const dsSpacing = {
  0: "0px",
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
} as const;

export const dsRadius = {
  sm: "6px",
  md: "10px",
  lg: "14px",
  xl: "20px",
  full: "9999px",
} as const;

export const dsShadow = {
  sm: "0 1px 2px rgba(15, 23, 42, 0.06)",
  md: "0 4px 8px rgba(15, 23, 42, 0.08)",
  lg: "0 10px 20px rgba(15, 23, 42, 0.10)",
  hover: "0 8px 16px rgba(37, 99, 235, 0.15)",
} as const;

export const dsTypography = {
  fontFamily: '"Cairo", system-ui, sans-serif',
  h1: { size: "32px", weight: 800, lineHeight: 1.2 },
  h2: { size: "26px", weight: 700, lineHeight: 1.25 },
  h3: { size: "22px", weight: 700, lineHeight: 1.3 },
  title: { size: "18px", weight: 700, lineHeight: 1.4 },
  subtitle: { size: "16px", weight: 600, lineHeight: 1.5 },
  body: { size: "14px", weight: 400, lineHeight: 1.6 },
  caption: { size: "12px", weight: 400, lineHeight: 1.5 },
  button: { size: "14px", weight: 600, lineHeight: 1 },
  label: { size: "13px", weight: 600, lineHeight: 1.4 },
} as const;

export const dsMotion = {
  fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)",
  base: "220ms cubic-bezier(0.4, 0, 0.2, 1)",
  slow: "320ms cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

export const dsChartPalette = [
  "#2563EB", // primary
  "#10B981", // success
  "#F59E0B", // warning
  "#7C3AED", // purple
  "#EA580C", // orange
  "#DC2626", // red
  "#0EA5E9", // info-alt
  "#334155", // gray
] as const;

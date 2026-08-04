export type DepositStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired"
  | "processed"
  | string;

export const STATUS_META: Record<
  string,
  { label: string; className: string; dot: string }
> = {
  pending: {
    label: "قيد المراجعة",
    className: "bg-amber-100 text-amber-800 border-amber-200",
    dot: "bg-amber-500",
  },
  approved: {
    label: "مقبولة",
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
    dot: "bg-emerald-500",
  },
  processed: {
    label: "تمت معالجتها",
    className: "bg-sky-100 text-sky-800 border-sky-200",
    dot: "bg-sky-500",
  },
  rejected: {
    label: "مرفوضة",
    className: "bg-rose-100 text-rose-800 border-rose-200",
    dot: "bg-rose-500",
  },
  cancelled: {
    label: "ملغاة",
    className: "bg-slate-100 text-slate-700 border-slate-200",
    dot: "bg-slate-400",
  },
  expired: {
    label: "منتهية",
    className: "bg-violet-100 text-violet-800 border-violet-200",
    dot: "bg-violet-500",
  },
};

export const statusMeta = (status: string) =>
  STATUS_META[status] ?? {
    label: status || "غير معروف",
    className: "bg-slate-100 text-slate-700 border-slate-200",
    dot: "bg-slate-400",
  };

export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "جميع الطلبات" },
  { value: "pending", label: "قيد المراجعة" },
  { value: "approved", label: "المقبولة" },
  { value: "processed", label: "تمت معالجتها" },
  { value: "rejected", label: "المرفوضة" },
  { value: "cancelled", label: "الملغاة" },
  { value: "expired", label: "المنتهية" },
];

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  vodafone_cash: "فودافون كاش",
  etisalat_cash: "اتصالات كاش",
  orange_cash: "أورنج كاش",
  we_pay: "WE Pay",
  instapay: "إنستا باي",
  bank_transfer: "تحويل بنكي",
  recharge_code: "كود شحن",
  admin_manual: "إضافة إدارية",
  support: "خدمة العملاء",
};

export const paymentMethodLabel = (m?: string | null) =>
  (m && (PAYMENT_METHOD_LABELS[m] ?? m)) || "غير محدد";

export const DEPOSIT_TYPE_LABELS: Record<string, string> = {
  manual: "إيداع يدوي",
  recharge_code: "كود شحن",
  admin: "إضافة إدارية",
  admin_adjustment: "تسوية إدارية",
};

export const depositTypeLabel = (t?: string | null) =>
  (t && (DEPOSIT_TYPE_LABELS[t] ?? t)) || "—";

export const fmtMoney = (v?: number | null) =>
  `${Number(v ?? 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;

export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" }) : "—";

export const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";

export const fmtDateTime = (iso?: string | null) =>
  iso ? `${fmtDate(iso)} — ${fmtTime(iso)}` : "—";

/** رقم عملية مقروء مشتق من معرّف الطلب (ثابت لكل طلب) */
export const operationNumber = (id: string) =>
  `DP-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

export const shortId = (id?: string | null) => (id ? id.slice(0, 8).toUpperCase() : "—");

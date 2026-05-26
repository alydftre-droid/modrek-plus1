import { cn } from "@/lib/utils";

export type PaymentMethodKey = "vodafone" | "orange" | "etisalat" | "instapay";

export interface PaymentMethodMeta {
  key: PaymentMethodKey;
  label: string;
  shortLabel: string;
  bg: string; // tailwind bg
  text: string;
  accent: string;
}

export const PAYMENT_METHODS: PaymentMethodMeta[] = [
  { key: "vodafone", label: "فودافون كاش", shortLabel: "Vodafone", bg: "bg-[#E60000]", text: "text-white", accent: "#E60000" },
  { key: "orange",   label: "أورنج كاش",   shortLabel: "Orange",   bg: "bg-[#FF7900]", text: "text-white", accent: "#FF7900" },
  { key: "etisalat", label: "اتصالات كاش", shortLabel: "Etisalat", bg: "bg-[#0D1F2D]", text: "text-[#B7DD3B]", accent: "#B7DD3B" },
  { key: "instapay", label: "انستا باي",   shortLabel: "InstaPay", bg: "bg-gradient-to-br from-[#7A0FCB] via-[#C4128A] to-[#FF0F6A]", text: "text-white", accent: "#C4128A" },
];

export const getMethodMeta = (key: string): PaymentMethodMeta =>
  PAYMENT_METHODS.find((m) => m.key === key) || PAYMENT_METHODS[0];

interface PaymentLogoProps {
  methodKey: PaymentMethodKey | string;
  size?: "sm" | "md" | "lg";
  className?: string;
  rounded?: "md" | "lg" | "xl" | "2xl" | "full";
}

const sizeMap = {
  sm: { box: "h-10 w-10", title: "text-[9px]", sub: "text-[7px]" },
  md: { box: "h-14 w-14", title: "text-[11px]", sub: "text-[8px]" },
  lg: { box: "h-20 w-20", title: "text-sm", sub: "text-[10px]" },
};

const PaymentLogo = ({ methodKey, size = "md", className, rounded = "xl" }: PaymentLogoProps) => {
  const m = getMethodMeta(methodKey);
  const s = sizeMap[size];
  const roundedClass = `rounded-${rounded}`;

  const Inner = () => {
    if (m.key === "vodafone") {
      return (
        <>
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white" aria-hidden>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c4.05 0 7.53-2.42 9.09-5.88-1.7.96-3.69 1.34-5.66.96-3.46-.67-6.06-3.69-6.06-7.31 0-2.07.86-3.94 2.23-5.27C10.36 4.6 8.42 5.94 7.4 7.78 8.74 5.06 11.39 3.2 14.5 3.04 13.69 2.36 12.88 2 12 2z"/>
          </svg>
          <span className={cn("font-extrabold leading-tight", s.title)}>Vodafone</span>
          <span className={cn("font-semibold opacity-90 leading-tight", s.sub)}>Cash</span>
        </>
      );
    }
    if (m.key === "orange") {
      return (
        <>
          <span className={cn("font-extrabold tracking-tight leading-none", size === "lg" ? "text-lg" : size === "md" ? "text-base" : "text-xs")}>orange</span>
          <span className={cn("font-bold opacity-95 leading-tight mt-0.5", s.sub)}>cash</span>
        </>
      );
    }
    if (m.key === "etisalat") {
      return (
        <>
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
            <circle cx="12" cy="12" r="9" fill="#B7DD3B"/>
            <path d="M7 12c0-2.8 2.2-5 5-5s5 2.2 5 5-2.2 5-5 5" stroke="#0D1F2D" strokeWidth="2" fill="none" strokeLinecap="round"/>
          </svg>
          <span className={cn("font-extrabold leading-tight", s.title)}>etisalat</span>
          <span className={cn("font-bold opacity-95 leading-tight text-white", s.sub)}>CASH</span>
        </>
      );
    }
    // instapay
    return (
      <>
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white" aria-hidden>
          <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>
        </svg>
        <span className={cn("font-extrabold leading-tight tracking-tight", s.title)}>InstaPay</span>
      </>
    );
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 shadow-sm overflow-hidden shrink-0",
        s.box,
        roundedClass,
        m.bg,
        m.text,
        className,
      )}
      aria-label={m.label}
    >
      <Inner />
    </div>
  );
};

export default PaymentLogo;

import { cn } from "@/lib/utils";
import vodafoneImg from "@/assets/payment-vodafone.jpg";
import orangeImg from "@/assets/payment-orange.png";
import etisalatImg from "@/assets/payment-etisalat.png";
import instapayImg from "@/assets/payment-instapay.webp";

export type PaymentMethodKey = "vodafone" | "orange" | "etisalat" | "instapay";

export interface PaymentMethodMeta {
  key: PaymentMethodKey;
  label: string;
  shortLabel: string;
  img: string;
  bg: string;            // tile background color
  textBelow?: string;    // optional text below the logo (e.g. vodafone -> "cash")
  textColor?: string;
  imgFit: "contain" | "cover";
  imgScale?: number;     // 0..1 - how much of tile the image occupies
}

export const PAYMENT_METHODS: PaymentMethodMeta[] = [
  {
    key: "vodafone",
    label: "فودافون كاش",
    shortLabel: "Vodafone Cash",
    img: vodafoneImg,
    bg: "#E60000",
    textBelow: "cash",
    textColor: "#FFFFFF",
    imgFit: "contain",
    imgScale: 0.78,
  },
  {
    key: "orange",
    label: "أورنج كاش",
    shortLabel: "Orange Cash",
    img: orangeImg,
    bg: "#000000",
    imgFit: "cover",
    imgScale: 1,
  },
  {
    key: "etisalat",
    label: "اتصالات كاش",
    shortLabel: "Etisalat Cash",
    img: etisalatImg,
    bg: "#E60000",
    imgFit: "cover",
    imgScale: 1,
  },
  {
    key: "instapay",
    label: "انستا باي",
    shortLabel: "InstaPay",
    img: instapayImg,
    bg: "#FFFFFF",
    imgFit: "contain",
    imgScale: 0.78,
  },
];

export const getMethodMeta = (key: string): PaymentMethodMeta =>
  PAYMENT_METHODS.find((m) => m.key === key) || PAYMENT_METHODS[0];

interface PaymentLogoProps {
  methodKey: PaymentMethodKey | string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  rounded?: "md" | "lg" | "xl" | "2xl" | "3xl" | "full";
}

const sizeMap = {
  sm: { box: "h-12 w-12", text: "text-[10px]" },
  md: { box: "h-16 w-16", text: "text-xs" },
  lg: { box: "h-20 w-20", text: "text-sm" },
  xl: { box: "h-28 w-28", text: "text-base" },
};

const PaymentLogo = ({ methodKey, size = "md", className, rounded = "2xl" }: PaymentLogoProps) => {
  const m = getMethodMeta(methodKey);
  const s = sizeMap[size];
  const roundedClass = `rounded-${rounded}`;
  const scale = m.imgScale ?? 1;

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden shrink-0 ring-1 ring-black/5",
        s.box,
        roundedClass,
        className,
      )}
      style={{ backgroundColor: m.bg }}
      aria-label={m.label}
    >
      {m.imgFit === "cover" ? (
        <img src={m.img} alt={m.label} className="w-full h-full object-cover" draggable={false} />
      ) : (
        <div className="flex flex-col items-center justify-center w-full h-full px-1">
          <img
            src={m.img}
            alt={m.label}
            className="object-contain"
            style={{ width: `${scale * 100}%`, height: m.textBelow ? `${scale * 65}%` : `${scale * 100}%` }}
            draggable={false}
          />
          {m.textBelow && (
            <span
              className={cn("font-extrabold leading-none mt-0.5 tracking-tight", s.text)}
              style={{ color: m.textColor || "#fff", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}
            >
              {m.textBelow}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default PaymentLogo;

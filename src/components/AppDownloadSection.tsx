import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Smartphone, Bell, WifiOff, Gauge, Sparkles, Monitor } from "lucide-react";
import mudrikLogo from "@/assets/mudrik-logo.png";
import phoneMockup from "@/assets/app-phone-mockup.png";
import { logActivity } from "@/lib/activityLogger";

export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.modrek.plus";

function GooglePlayIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <path fill="#34A853" d="M69 21c-6 6-9 15-9 27v416c0 12 3 21 9 27l232-235z" />
      <path fill="#FBBC04" d="M378 176 301 236 69 21c5-5 13-7 22-3z" transform="translate(0 0)" />
      <path fill="#EA4335" d="M69 18c-9-5-18-4-24 3l232 215 77-60-89-51z" />
      <path fill="#4285F4" d="m301 236 76 44c17 10 17 32 0 42l-76 44-71-65z" />
      <path fill="#34A853" d="M69 494c6 7 15 8 24 3l208-119-71-65z" />
    </svg>
  );
}

function PlayStoreButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.a
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 320, damping: 20 }}
      className="inline-flex items-center gap-3 rounded-2xl bg-foreground px-6 py-3.5 text-primary-foreground shadow-lg shadow-foreground/20"
      dir="ltr"
      aria-label="تحميل تطبيق مدرك بلس من Google Play"
    >
      <GooglePlayIcon className="h-7 w-7" />
      <span className="flex flex-col items-start leading-tight">
        <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">GET IT ON</span>
        <span className="text-base font-extrabold">Google Play</span>
      </span>
    </motion.a>
  );
}

const features = [
  { icon: Gauge, text: "أداء أسرع وتجربة أكثر سلاسة" },
  { icon: Bell, text: "إشعارات فورية بالدروس والامتحانات" },
  { icon: WifiOff, text: "مشاهدة أفضل للفيديوهات والكتب" },
  { icon: Sparkles, text: "المساعد الذكي في متناول يدك" },
];

interface Props {
  variant?: "landing" | "student";
}

export default function AppDownloadSection({ variant = "landing" }: Props) {
  const [isAndroid, setIsAndroid] = useState(true);

  useEffect(() => {
    setIsAndroid(/android/i.test(navigator.userAgent));
  }, []);

  const source = useMemo(() => (variant === "student" ? "student_about_page" : "landing_page"), [variant]);

  const handleClick = () => {
    void logActivity({
      action_type: "app_download_click",
      action_label: "الضغط على تحميل تطبيق أندرويد",
      metadata: { source, platform: isAndroid ? "android" : "other" },
    }).catch(() => undefined);
  };

  if (variant === "student") {
    return (
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.5 }}
        className="px-4 pb-10"
      >
        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="h-1.5 bg-gradient-to-l from-primary to-accent" />
          <div className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-background">
                <img src={mudrikLogo} alt="تطبيق مدرك بلس" width={40} height={40} loading="lazy" className="h-10 w-10 object-contain" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-foreground">📲 تطبيق مدرك بلس للأندرويد</h2>
                <p className="text-xs text-muted-foreground">تجربة تعلم أسرع وأسهل من هاتفك</p>
              </div>
            </div>

            <ul className="mt-4 grid gap-2">
              {features.map((f) => (
                <li key={f.text} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                    <f.icon className="h-3.5 w-3.5 text-primary" />
                  </span>
                  {f.text}
                </li>
              ))}
            </ul>

            {!isAndroid && (
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-muted p-3 text-[11px] leading-relaxed text-muted-foreground">
                <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                للحصول على أفضل تجربة، قم بتحميل تطبيق Modrek Plus على هاتفك الأندرويد.
              </p>
            )}

            <div className="mt-4 flex justify-center">
              <PlayStoreButton onClick={handleClick} />
            </div>
          </div>
        </div>
      </motion.section>
    );
  }

  return (
    <section id="download-app" className="relative overflow-hidden py-16 sm:py-20">
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />
      <div className="container relative mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6 }}
          className="grid items-center gap-10 rounded-[32px] border border-border bg-card/80 p-6 shadow-xl backdrop-blur-sm sm:p-10 lg:grid-cols-2"
        >
          <div className="text-center lg:text-right">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-semibold text-primary">
              <Smartphone className="h-3.5 w-3.5" />
              متوفر الآن على Google Play
            </span>

            <div className="mt-5 flex items-center justify-center gap-3 lg:justify-start">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-background shadow-sm">
                <img src={mudrikLogo} alt="شعار تطبيق مدرك بلس" width={40} height={40} loading="lazy" className="h-10 w-10 object-contain" />
              </div>
              <h2 className="text-2xl font-extrabold text-foreground sm:text-3xl">
                📱 احصل على تطبيق <span className="text-primary">مدرك بلس</span>
              </h2>
            </div>

            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground lg:mx-0 sm:text-base">
              حمّل التطبيق الرسمي واستمتع بتجربة أسرع وأخف، مع إشعارات فورية بالدروس والامتحانات،
              ومشاهدة أوضح للفيديوهات والكتب، والمساعد الذكي في أي وقت.
            </p>

            <ul className="mx-auto mt-6 grid max-w-md gap-2.5 text-right sm:grid-cols-2 lg:mx-0">
              {features.map((f) => (
                <li key={f.text} className="flex items-center gap-2 rounded-xl border border-border bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                  <f.icon className="h-4 w-4 shrink-0 text-primary" />
                  {f.text}
                </li>
              ))}
            </ul>

            {!isAndroid && (
              <p className="mx-auto mt-5 max-w-md rounded-xl bg-muted p-3 text-xs leading-relaxed text-muted-foreground lg:mx-0">
                للحصول على أفضل تجربة، قم بتحميل تطبيق Modrek Plus على هاتفك الأندرويد.
              </p>
            )}

            <div className="mt-6 flex justify-center lg:justify-start">
              <PlayStoreButton onClick={handleClick} />
            </div>
          </div>

          <div className="relative flex items-center justify-center">
            <div aria-hidden className="absolute inset-0 bg-[radial-gradient(closest-side,hsl(var(--primary)/0.18),transparent_70%)]" />
            <motion.img
              src={phoneMockup}
              alt="واجهة تطبيق مدرك بلس على هاتف أندرويد"
              width={912}
              height={1104}
              loading="lazy"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="relative h-auto w-[70%] max-w-[280px] object-contain drop-shadow-[0_25px_45px_rgba(15,23,42,0.28)]"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

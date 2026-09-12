import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { motion } from "framer-motion";
import { Sparkles, Tag, Megaphone, GraduationCap, BookOpen, Info, Bell, ArrowLeft, Gift } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { recordAdView, type AdRecord } from "@/hooks/useStudentAds";
import { openUrlWithinAppContainer } from "@/lib/nativeNavigation";
import StoredImage from "@/components/common/StoredImage";

const TYPE_META: Record<string, { label: string; icon: any; from: string; to: string }> = {
  teachers: { label: "معلم مميز", icon: GraduationCap, from: "from-indigo-600", to: "to-violet-600" },
  subjects: { label: "مادة جديدة", icon: BookOpen, from: "from-emerald-600", to: "to-teal-600" },
  discounts: { label: "خصم خاص", icon: Tag, from: "from-rose-600", to: "to-fuchsia-600" },
  info: { label: "معلومة", icon: Info, from: "from-sky-600", to: "to-cyan-600" },
  updates: { label: "تحديث", icon: Bell, from: "from-amber-600", to: "to-orange-600" },
  general: { label: "إعلان", icon: Megaphone, from: "from-slate-700", to: "to-slate-900" },
};

interface Props {
  ads: AdRecord[];
  showBundlesSlide?: boolean;
  onBundlesClick?: () => void;
}

export default function AdsCarousel({ ads, showBundlesSlide, onBundlesClick }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const autoplay = useRef(Autoplay({ delay: 5000, stopOnInteraction: false, stopOnMouseEnter: true }));
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, direction: "rtl", align: "center", containScroll: "trimSnaps" },
    [autoplay.current]
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const seenRef = useRef<Set<string>>(new Set());

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onSelect]);

  // Record view for current slide
  useEffect(() => {
    const ad = ads[selectedIndex];
    if (!ad || !user) return;
    if (seenRef.current.has(ad.id)) return;
    seenRef.current.add(ad.id);
    recordAdView(ad.id, user.id, false);
  }, [selectedIndex, ads, user]);

  const handleClick = (ad: AdRecord) => {
    if (user) recordAdView(ad.id, user.id, true);
    if (ad.link_type === "external" && ad.external_url) {
      openUrlWithinAppContainer(ad.external_url);
      return;
    }
    if (ad.link_type === "internal" && ad.internal_route) {
      navigate(ad.internal_route);
      return;
    }
    navigate(`/ads/${ad.id}`);
  };

  const totalSlides = ads.length + (showBundlesSlide ? 1 : 0);
  if (totalSlides === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 }}
      className="relative"
      dir="rtl"
    >
      <div ref={emblaRef} className="overflow-hidden rounded-[22px]">
        <div className="flex">
          {ads.map((ad) => {
            const meta = TYPE_META[ad.ad_type] || TYPE_META.general;
            return (
              <div key={ad.id} className="relative shrink-0 grow-0 basis-full pl-2 first:pl-0">
                <button
                  type="button"
                  onClick={() => handleClick(ad)}
                  className="group relative block h-[200px] w-full overflow-hidden rounded-[20px] text-right shadow-[0_8px_30px_rgb(0,0,0,0.14)] ring-1 ring-white/10 active:scale-[0.99] transition-transform"
                >
                  {/* Background */}
                  {ad.cover_image_url ? (
                    <StoredImage
                      source={ad.cover_image_url}
                      alt={ad.title}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  ) : (
                    <div className={`absolute inset-0 bg-gradient-to-br ${meta.from} ${meta.to}`} />
                  )}

                  {/* Subtle bottom-only overlay so title stays readable without fogging the image */}
                  {ad.cover_image_url ? (
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
                  ) : (
                    <>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
                      <div className="absolute inset-0 bg-gradient-to-l from-black/30 via-transparent to-transparent" />
                    </>
                  )}

                  {/* Content */}
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <h3 className="text-white text-[17px] font-black leading-tight drop-shadow-lg line-clamp-2">
                      {ad.title}
                    </h3>
                    {ad.short_description && (
                      <p className="mt-1 text-white/85 text-[11.5px] leading-snug line-clamp-2 drop-shadow">
                        {ad.short_description}
                      </p>
                    )}
                    <div className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold text-slate-900 shadow-md group-hover:gap-1.5 transition-all">
                      عرض التفاصيل
                      <ArrowLeft className="h-3 w-3" />
                    </div>
                  </div>
                </button>
              </div>
            );
          })}

          {showBundlesSlide && (
            <div className="relative shrink-0 grow-0 basis-full pl-2 first:pl-0">
              <button
                type="button"
                onClick={onBundlesClick}
                className="group relative block h-[200px] w-full overflow-hidden rounded-[20px] text-right shadow-[0_8px_30px_rgb(0,0,0,0.14)] ring-1 ring-white/10 active:scale-[0.99] transition-transform bg-gradient-to-br from-fuchsia-600 via-purple-600 to-indigo-700"
              >
                <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
                <div className="absolute -right-6 -bottom-10 h-44 w-44 rounded-full bg-pink-400/30 blur-2xl" />
                <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-md px-3 py-1 text-[10px] font-bold text-white ring-1 ring-white/25 shadow-md">
                  <Gift className="h-3 w-3" />
                  باقات مخفضة
                </div>
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <h3 className="text-white text-[17px] font-black leading-tight drop-shadow-lg">
                    اشترك في عدة مواد بسعر مخفّض
                  </h3>
                  <p className="mt-1 text-white/85 text-[11.5px] leading-snug drop-shadow">
                    باقات حصرية لتوفير أكبر على المواد التي تختارها بنفسك
                  </p>
                  <div className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold text-slate-900 shadow-md">
                    استكشف الباقات
                    <ArrowLeft className="h-3 w-3" />
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Pagination dots */}
      {totalSlides > 1 && (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          {Array.from({ length: totalSlides }).map((_, i) => (
            <button
              key={i}
              onClick={() => emblaApi?.scrollTo(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === selectedIndex ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
              }`}
              aria-label={`الشريحة ${i + 1}`}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

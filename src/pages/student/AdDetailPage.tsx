import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/student/StudentLayout";
import { Button } from "@/components/ui/button";
import { ArrowRight, ExternalLink, Loader2, PlayCircle } from "lucide-react";
import type { AdRecord } from "@/hooks/useStudentAds";
import { openUrlWithinAppContainer } from "@/lib/nativeNavigation";
import StoredImage from "@/components/common/StoredImage";

export default function AdDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ad, setAd] = useState<AdRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.from("ads").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      setAd(data as AdRecord | null);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <StudentLayout title="تفاصيل الإعلان">
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </StudentLayout>
    );
  }

  if (!ad) {
    return (
      <StudentLayout title="تفاصيل الإعلان">
        <div className="p-8 text-center text-muted-foreground">الإعلان غير متاح أو تم إيقافه.</div>
      </StudentLayout>
    );
  }

  const handleCta = () => {
    if (ad.link_type === "external" && ad.external_url) {
      openUrlWithinAppContainer(ad.external_url);
    } else if (ad.link_type === "internal" && ad.internal_route) {
      navigate(ad.internal_route);
    }
  };

  return (
    <StudentLayout title="تفاصيل الإعلان">
      <div className="pb-24" dir="rtl">
        {/* Hero */}
        <div className="relative h-[260px] overflow-hidden">
          {ad.cover_image_url ? (
            <StoredImage source={ad.cover_image_url} alt={ad.title} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-700 via-purple-700 to-fuchsia-700" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
          <button
            onClick={() => navigate(-1)}
            className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 backdrop-blur shadow-lg"
            aria-label="رجوع"
          >
            <ArrowRight className="h-4 w-4 text-slate-900" />
          </button>
          <div className="absolute inset-x-0 bottom-0 p-5">
            <h1 className="text-white text-2xl font-black leading-tight drop-shadow-lg">{ad.title}</h1>
            {ad.short_description && (
              <p className="mt-2 text-white/90 text-sm leading-relaxed drop-shadow line-clamp-3">
                {ad.short_description}
              </p>
            )}
          </div>
        </div>

        <div className="px-4 pt-5 space-y-5">
          {ad.full_content && (
            <div className="rounded-2xl bg-card border border-border/60 p-4 shadow-sm">
              <p className="text-foreground text-[15px] leading-relaxed whitespace-pre-wrap">
                {ad.full_content}
              </p>
            </div>
          )}

          {ad.video_url && (
            <div className="rounded-2xl overflow-hidden border border-border/60 shadow-sm bg-black aspect-video relative">
              <video src={ad.video_url} controls className="h-full w-full" />
            </div>
          )}

          {ad.additional_images && ad.additional_images.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-foreground mb-2">صور إضافية</h2>
              <div className="grid grid-cols-2 gap-2">
                {ad.additional_images.map((src) => (
                  <button
                    key={src}
                    onClick={() => setLightbox(src)}
                    className="aspect-square overflow-hidden rounded-xl border border-border/60"
                  >
                    <StoredImage source={src} alt="" loading="lazy" className="h-full w-full object-cover hover:scale-105 transition-transform" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {ad.link_type !== "none" && (
            <Button onClick={handleCta} size="lg" className="w-full gap-2 text-base font-bold">
              {ad.link_type === "external" ? <ExternalLink className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
              {ad.link_type === "external" ? "فتح الرابط" : "الانتقال للصفحة"}
            </Button>
          )}
        </div>

        {lightbox && (
          <div
            onClick={() => setLightbox(null)}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          >
            <StoredImage source={lightbox} alt="" className="max-h-full max-w-full object-contain rounded-lg" />
          </div>
        )}
      </div>
    </StudentLayout>
  );
}

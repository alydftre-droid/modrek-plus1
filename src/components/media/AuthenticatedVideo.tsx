import { useEffect, useRef, useState, type VideoHTMLAttributes } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveBunnyStorageMediaUrl } from "@/lib/bunnyStorage";

type VideoDiagnostic = {
  stage: string;
  code: string;
  details: string;
  status?: number;
  contentType?: string;
  contentRange?: string;
  mediaCode?: number;
};

type Props = VideoHTMLAttributes<HTMLVideoElement> & {
  source: string;
};

const mediaCodeText: Record<number, string> = {
  1: "تم إيقاف تحميل الفيديو من المتصفح",
  2: "فشل اتصال الشبكة أثناء قراءة الفيديو",
  3: "ملف الفيديو تالف أو ترميزه غير قابل للفك",
  4: "تنسيق الفيديو أو رابط التشغيل غير مدعوم",
};

export default function AuthenticatedVideo({ source, className, autoPlay, ...props }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [diagnostic, setDiagnostic] = useState<VideoDiagnostic | null>(null);

  useEffect(() => {
    let active = true;
    setSrc("");
    setDiagnostic(null);
    resolveBunnyStorageMediaUrl(source)
      .then((url) => { if (active) setSrc(url); })
      .catch((error) => {
        if (!active) return;
        setDiagnostic({
          stage: "تجهيز رابط التشغيل",
          code: error instanceof Error ? error.message : "MEDIA_URL_RESOLVE_FAILED",
          details: "تعذر الحصول على جلسة حساب صالحة قبل تشغيل الفيديو",
        });
      });
    return () => { active = false; };
  }, [source, attempt]);

  const inspectFailure = async () => {
    const mediaCode = videoRef.current?.error?.code || 0;
    const base: VideoDiagnostic = {
      stage: "فك ترميز الفيديو",
      code: `MEDIA_ERR_${mediaCode || "UNKNOWN"}`,
      details: mediaCodeText[mediaCode] || "لم يتمكن المتصفح من قراءة بيانات الفيديو",
      mediaCode,
    };
    if (!src) { setDiagnostic(base); return; }

    try {
      const response = await fetch(src, { headers: { Range: "bytes=0-1023" }, cache: "no-store" });
      const body = response.ok ? "" : (await response.text().catch(() => "")).slice(0, 300);
      setDiagnostic({
        ...base,
        stage: response.ok ? base.stage : "طلب ملف الفيديو",
        code: response.ok ? base.code : `VIDEO_HTTP_${response.status}`,
        status: response.status,
        contentType: response.headers.get("content-type") || "غير موجود",
        contentRange: response.headers.get("content-range") || "غير موجود",
        details: response.ok
          ? `${base.details}. استجاب الملف لكن المتصفح رفض الترميز أو الحاوية.`
          : `رفضت خدمة الملفات الطلب: ${body || response.statusText || "بدون تفاصيل"}`,
      });
    } catch (error) {
      setDiagnostic({
        ...base,
        stage: "الاتصال بخدمة الفيديو",
        code: "VIDEO_NETWORK_FETCH_FAILED",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative min-h-40 overflow-hidden rounded-lg bg-muted">
        {!src && !diagnostic && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> جاري تجهيز الفيديو
          </div>
        )}
        {src && (
          <video
            ref={videoRef}
            key={src}
            src={src}
            controls
            playsInline
            preload="metadata"
            autoPlay={autoPlay}
            className={className}
            onLoadedMetadata={() => setDiagnostic(null)}
            onError={() => void inspectFailure()}
            {...props}
          />
        )}
      </div>
      {diagnostic && (
        <div dir="rtl" className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-foreground" role="alert">
          <p className="flex items-center gap-2 font-bold text-destructive"><AlertTriangle className="h-4 w-4" /> فشل تشغيل الفيديو</p>
          <div className="space-y-1 break-words">
            <p><b>المرحلة:</b> {diagnostic.stage}</p>
            <p><b>كود الخطأ:</b> <span dir="ltr">{diagnostic.code}</span></p>
            {diagnostic.status !== undefined && <p><b>حالة الخادم:</b> {diagnostic.status}</p>}
            {diagnostic.contentType && <p><b>نوع الملف:</b> <span dir="ltr">{diagnostic.contentType}</span></p>}
            {diagnostic.contentRange && <p><b>دعم أجزاء الفيديو:</b> <span dir="ltr">{diagnostic.contentRange}</span></p>}
            <p><b>التفاصيل:</b> {diagnostic.details}</p>
            <p><b>المكان:</b> مشغل الفيديو التعريفي ← خدمة ملفات Bunny</p>
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setAttempt((value) => value + 1)}>
            <RefreshCw className="h-3.5 w-3.5" /> إعادة المحاولة بجلسة جديدة
          </Button>
        </div>
      )}
    </div>
  );
}
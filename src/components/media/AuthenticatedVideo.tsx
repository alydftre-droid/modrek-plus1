import { useEffect, useRef, useState, type VideoHTMLAttributes } from "react";
import { AlertTriangle, Check, ClipboardCopy, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { extractBunnyStoragePath, isBunnyStorageFile, resolveBunnyStorageMediaUrl } from "@/lib/bunnyStorage";

type VideoDiagnostic = {
  stage: string;
  code: string;
  details: string;
  status?: number;
  contentType?: string;
  contentRange?: string;
  mediaCode?: number;
  reason?: string;
  path?: string;
  functionVersion?: string;
  traceId?: string;
  sourceKind?: string;
  resolvedHost?: string;
  responseLength?: string;
  acceptRanges?: string;
  etag?: string;
  readyState?: number;
  networkState?: number;
  duration?: number | null;
  dimensions?: string;
  browser?: string;
  checkedAt?: string;
  mimeSupport?: string;
  mediaErrorMessage?: string;
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

const redactUrl = (value: string) => {
  try {
    const url = new URL(value);
    for (const key of ["token", "apikey", "authorization"]) {
      if (url.searchParams.has(key)) url.searchParams.set(key, "[محجوب]");
    }
    return url.toString();
  } catch {
    return value.replace(/([?&](?:token|apikey|authorization)=)[^&]+/gi, "$1[محجوب]");
  }
};

const stateText = (value: number, kind: "ready" | "network") => {
  const ready = ["لا توجد بيانات", "بيانات أولية", "الإطار الحالي", "بيانات لاحقة", "جاهز للتشغيل"];
  const network = ["فارغ", "خامل", "جارٍ التحميل", "لا يوجد مصدر"];
  return (kind === "ready" ? ready : network)[value] || `غير معروف (${value})`;
};

export default function AuthenticatedVideo({ source, className, autoPlay, onError, onLoadedMetadata, ...props }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [diagnostic, setDiagnostic] = useState<VideoDiagnostic | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    setSrc("");
    setDiagnostic(null);
    resolveBunnyStorageMediaUrl(source)
      .then((url) => {
        if (!active) return;
        const separator = url.includes("?") ? "&" : "?";
        const traceId = typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setSrc(`${url}${separator}trace=${encodeURIComponent(traceId)}`);
      })
      .catch((error) => {
        if (!active) return;
        setDiagnostic({
          stage: "تجهيز رابط التشغيل",
          code: error instanceof Error ? error.message : "MEDIA_URL_RESOLVE_FAILED",
          details: error instanceof Error ? error.message : "تعذر تجهيز رابط تشغيل الفيديو",
          sourceKind: isBunnyStorageFile(source) ? "Bunny Storage" : "رابط خارجي/قديم",
          path: extractBunnyStoragePath(source) || redactUrl(source),
          checkedAt: new Date().toISOString(),
        });
      });
    return () => { active = false; };
  }, [source, attempt]);

  const inspectFailure = async () => {
    const video = videoRef.current;
    const mediaCode = video?.error?.code || 0;
    const shared: Partial<VideoDiagnostic> = {
      sourceKind: isBunnyStorageFile(source) ? "Bunny Storage" : "رابط خارجي/قديم",
      path: extractBunnyStoragePath(source) || redactUrl(source),
      resolvedHost: (() => { try { return new URL(src).host; } catch { return "رابط غير صالح"; } })(),
      readyState: video?.readyState,
      networkState: video?.networkState,
      duration: Number.isFinite(video?.duration) ? Number(video?.duration) : null,
      dimensions: `${video?.videoWidth || 0}×${video?.videoHeight || 0}`,
      mediaErrorMessage: video?.error?.message || undefined,
      browser: `${navigator.userAgent} | ${navigator.platform || "unknown"}`,
      checkedAt: new Date().toISOString(),
    };
    const base: VideoDiagnostic = {
      ...shared,
      stage: "فك ترميز الفيديو",
      code: `MEDIA_ERR_${mediaCode || "UNKNOWN"}`,
      details: mediaCodeText[mediaCode] || "لم يتمكن المتصفح من قراءة بيانات الفيديو",
      mediaCode,
    };
    if (!src) { setDiagnostic(base); return; }

    try {
      const response = await fetch(src, { headers: { Range: "bytes=0-1023" }, cache: "no-store" });
      const body = response.ok ? "" : (await response.text().catch(() => "")).slice(0, 500);
      let serverDiagnostic: Record<string, unknown> = {};
      if (body) {
        try { serverDiagnostic = JSON.parse(body) as Record<string, unknown>; } catch { /* plain upstream error */ }
      }
      setDiagnostic({
        ...base,
        stage: response.ok ? base.stage : "طلب ملف الفيديو",
        code: response.ok ? base.code : `VIDEO_HTTP_${response.status}`,
        status: response.status,
        contentType: response.headers.get("content-type") || "غير موجود",
        contentRange: response.headers.get("content-range") || "غير موجود",
        responseLength: response.headers.get("content-length") || "غير موجود",
        acceptRanges: response.headers.get("accept-ranges") || "غير موجود",
        etag: response.headers.get("etag") || "غير موجود",
        mimeSupport: video?.canPlayType(response.headers.get("content-type") || "") || "غير مدعوم/غير معروف",
        traceId: response.headers.get("x-modrek-trace-id")
          || (typeof serverDiagnostic.traceId === "string" ? serverDiagnostic.traceId : undefined),
        reason: typeof serverDiagnostic.reason === "string" ? serverDiagnostic.reason : undefined,
        path: typeof serverDiagnostic.path === "string" ? serverDiagnostic.path : undefined,
        functionVersion: response.headers.get("x-modrek-function-version")
          || (typeof serverDiagnostic.functionVersion === "string" ? serverDiagnostic.functionVersion : undefined),
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

  const copyReport = async () => {
    if (!diagnostic) return;
    const report = [
      "تقرير تشخيص فيديو السيرة الذاتية — مدرك Plus",
      `وقت الفحص: ${diagnostic.checkedAt || "غير موجود"}`,
      `المرحلة: ${diagnostic.stage}`,
      `الكود: ${diagnostic.code}`,
      `Trace ID: ${diagnostic.traceId || "غير موجود"}`,
      `سبب الخادم: ${diagnostic.reason || "غير موجود"}`,
      `HTTP: ${diagnostic.status ?? "غير موجود"}`,
      `المصدر: ${diagnostic.sourceKind || "غير معروف"}`,
      `المسار: ${diagnostic.path || "غير موجود"}`,
      `المضيف: ${diagnostic.resolvedHost || "غير موجود"}`,
      `نوع المحتوى: ${diagnostic.contentType || "غير موجود"}`,
      `Content-Length: ${diagnostic.responseLength || "غير موجود"}`,
      `Content-Range: ${diagnostic.contentRange || "غير موجود"}`,
      `Accept-Ranges: ${diagnostic.acceptRanges || "غير موجود"}`,
      `ETag: ${diagnostic.etag || "غير موجود"}`,
      `MediaError: ${diagnostic.mediaCode ?? "غير موجود"}`,
      `رسالة MediaError: ${diagnostic.mediaErrorMessage || "غير موجود"}`,
      `توافق MIME/Codec: ${diagnostic.mimeSupport || "غير معروف"}`,
      `readyState: ${diagnostic.readyState ?? "غير موجود"}`,
      `networkState: ${diagnostic.networkState ?? "غير موجود"}`,
      `المدة: ${diagnostic.duration ?? "غير معروفة"}`,
      `الأبعاد: ${diagnostic.dimensions || "غير موجود"}`,
      `إصدار الخدمة: ${diagnostic.functionVersion || "غير موجود"}`,
      `المتصفح: ${diagnostic.browser || "غير موجود"}`,
      `التفاصيل: ${diagnostic.details}`,
      `رابط الفحص الآمن: ${redactUrl(src)}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setDiagnostic((current) => current ? { ...current, details: `${current.details} — تعذر النسخ التلقائي؛ يرجى تصوير التقرير الظاهر.` } : current);
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
            {...props}
            onLoadedMetadata={(event) => {
              setDiagnostic(null);
              onLoadedMetadata?.(event);
            }}
            onError={(event) => {
              void inspectFailure();
              onError?.(event);
            }}
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
            {diagnostic.reason && <p><b>سبب الخادم:</b> <span dir="ltr">{diagnostic.reason}</span></p>}
            {diagnostic.path && <p><b>مسار الملف:</b> <span dir="ltr">{diagnostic.path}</span></p>}
            {diagnostic.functionVersion && <p><b>إصدار خدمة التشغيل:</b> <span dir="ltr">{diagnostic.functionVersion}</span></p>}
            <p><b>معرّف التتبع:</b> <span dir="ltr">{diagnostic.traceId || "غير موجود"}</span></p>
            <p><b>نوع المصدر:</b> {diagnostic.sourceKind || "غير معروف"}</p>
            {diagnostic.resolvedHost && <p><b>خادم التشغيل:</b> <span dir="ltr">{diagnostic.resolvedHost}</span></p>}
            {diagnostic.responseLength && <p><b>حجم الاستجابة:</b> <span dir="ltr">{diagnostic.responseLength}</span></p>}
            {diagnostic.acceptRanges && <p><b>Accept-Ranges:</b> <span dir="ltr">{diagnostic.acceptRanges}</span></p>}
            {diagnostic.readyState !== undefined && <p><b>حالة جاهزية الفيديو:</b> {stateText(diagnostic.readyState, "ready")} <span dir="ltr">({diagnostic.readyState})</span></p>}
            {diagnostic.networkState !== undefined && <p><b>حالة الشبكة:</b> {stateText(diagnostic.networkState, "network")} <span dir="ltr">({diagnostic.networkState})</span></p>}
            {diagnostic.dimensions && <p><b>أبعاد الفيديو:</b> <span dir="ltr">{diagnostic.dimensions}</span></p>}
            {diagnostic.mimeSupport && <p><b>توافق النوع والترميز:</b> <span dir="ltr">{diagnostic.mimeSupport}</span></p>}
            {diagnostic.mediaErrorMessage && <p><b>رسالة المتصفح:</b> <span dir="ltr">{diagnostic.mediaErrorMessage}</span></p>}
            <p><b>وقت الفحص:</b> <span dir="ltr">{diagnostic.checkedAt || "غير موجود"}</span></p>
            <p><b>التفاصيل:</b> {diagnostic.details}</p>
            <p><b>المكان:</b> مشغل الفيديو التعريفي ← خدمة ملفات Bunny</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setAttempt((value) => value + 1)}>
              <RefreshCw className="h-3.5 w-3.5" /> إعادة الفحص
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void copyReport()}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
              {copied ? "تم نسخ التقرير" : "نسخ تقرير التشخيص"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
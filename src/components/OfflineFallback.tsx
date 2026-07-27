import { WifiOff, RefreshCw, Home } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Professional offline fallback shown when a route or lazy chunk cannot be
 * loaded because the device is offline AND no cached version exists.
 * Never shown when the user is simply offline on an already-cached page.
 */
export default function OfflineFallback({
  onRetry,
  title = "لا يوجد اتصال بالإنترنت",
  message = "لم يتم تحميل هذه الصفحة من قبل، لذلك لا يمكن فتحها بدون إنترنت.",
}: {
  onRetry?: () => void;
  title?: string;
  message?: string;
}) {
  const navigate = useNavigate();
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (online && onRetry) {
      // Auto-retry once connection returns
      const t = setTimeout(() => onRetry(), 400);
      return () => clearTimeout(t);
    }
  }, [online, onRetry]);

  return (
    <div
      dir="rtl"
      className="min-h-[70vh] flex items-center justify-center px-6"
      style={{ fontFamily: "Cairo, system-ui, sans-serif" }}
    >
      <div className="max-w-sm w-full text-center">
        <div className="mx-auto w-20 h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-5">
          <WifiOff className="w-9 h-9 text-slate-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
          {title}
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
          {message}
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => (onRetry ? onRetry() : window.location.reload())}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-bold active:scale-95 transition"
          >
            <RefreshCw className="w-4 h-4" />
            إعادة المحاولة
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-bold active:scale-95 transition"
          >
            <Home className="w-4 h-4" />
            الرئيسية
          </button>
        </div>
        {online && (
          <p className="mt-4 text-xs text-emerald-600 font-bold">
            تم استعادة الاتصال... جاري إعادة التحميل
          </p>
        )}
      </div>
    </div>
  );
}

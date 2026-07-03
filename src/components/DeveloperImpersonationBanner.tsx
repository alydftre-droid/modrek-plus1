import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, LogOut } from "lucide-react";
import { endImpersonation, getImpersonationMeta, type ImpersonationMeta } from "@/lib/devImpersonation";
import { toast } from "sonner";

export default function DeveloperImpersonationBanner() {
  const [meta, setMeta] = useState<ImpersonationMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setMeta(getImpersonationMeta());
    const t = setInterval(() => setMeta(getImpersonationMeta()), 2000);
    return () => clearInterval(t);
  }, []);

  if (!meta) return null;

  const handleReturn = async () => {
    setBusy(true);
    try {
      await endImpersonation();
      toast.success("تم الرجوع إلى حساب المطور");
      navigate("/admin", { replace: true });
      // Reload to reset all cached queries from the student session
      setTimeout(() => window.location.reload(), 200);
    } catch (e: any) {
      toast.error(e?.message || "فشل الرجوع");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed top-0 right-0 left-0 z-[9999] bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs sm:text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="font-bold shrink-0">وضع الاختبار:</span>
          <span className="truncate">
            حساب تجريبي <span className="font-mono">{meta.test_account_code}</span> — {meta.full_name}
          </span>
        </div>
        <button
          onClick={handleReturn}
          disabled={busy}
          className="flex items-center gap-1 rounded-md bg-white/20 hover:bg-white/30 px-3 py-1 font-semibold transition disabled:opacity-60"
        >
          <LogOut className="h-3.5 w-3.5" />
          {busy ? "جاري الرجوع..." : "الرجوع إلى المطور"}
        </button>
      </div>
    </div>
  );
}

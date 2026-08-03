import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logStudentActivity } from "@/lib/activityLogger";
import { openUrlWithinAppContainer } from "@/lib/nativeNavigation";
import { buildWhatsappUrl, loadSupportSettings } from "@/lib/supportContactTemplate";
import { Loader2 } from "lucide-react";

// Editable from the admin panel via platform_settings key below (no code change needed).
const TEMPLATE_KEY = "support_deposit_message_template";

const DEFAULT_TEMPLATE = `السلام عليكم، أرغب في شحن رصيدي من خلال خدمة العملاء.

بيانات الحساب:
الاسم: {{StudentName}}
ID: {{StudentID}}

تم إرسال هذه الرسالة تلقائيًا من صفحة الإيداع داخل منصة Modrek Plus.`;

function WhatsappIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.66.15-.2.3-.78.96-.96 1.16-.17.2-.35.22-.65.07-.3-.15-1.13-.42-2.15-1.33-.79-.71-1.32-1.58-1.48-1.88-.15-.3-.02-.47.13-.62.13-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.66-1.6-.9-2.19-.24-.57-.48-.5-.66-.5h-.56c-.2 0-.5.07-.76.37-.27.3-1.02.99-1.02 2.42 0 1.43 1.04 2.81 1.19 3.01.15.2 2.05 3.28 5.03 4.47.7.3 1.25.48 1.68.61.71.23 1.35.2 1.86.12.57-.08 1.75-.71 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35z" />
      <path d="M12.04 2C6.6 2 2.18 6.42 2.18 11.86c0 1.74.46 3.44 1.32 4.94L2 22l5.35-1.4a9.83 9.83 0 004.69 1.2h.01c5.43 0 9.85-4.42 9.85-9.86C21.9 6.42 17.47 2 12.04 2zm0 17.94h-.01a8.2 8.2 0 01-4.17-1.14l-.3-.18-3.1.81.83-3.03-.19-.31a8.14 8.14 0 01-1.25-4.33c0-4.52 3.68-8.19 8.2-8.19 2.19 0 4.25.85 5.79 2.4a8.13 8.13 0 012.4 5.8c0 4.52-3.68 8.17-8.2 8.17z" />
    </svg>
  );
}

export default function DepositSupportCard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(true);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);

  useEffect(() => {
    supabase
      .from("platform_settings")
      .select("value")
      .eq("key", TEMPLATE_KEY)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data?.value?.trim()) setTemplate(data.value);
      });
  }, []);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const settings = await loadSupportSettings();
      const phone = settings.whatsappStudent?.trim();
      if (!phone) {
        setAvailable(false);
        toast.error("خدمة العملاء غير متاحة حاليًا");
        return;
      }

      let name = "";
      let code = "";
      if (user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, student_code")
          .eq("id", user.id)
          .maybeSingle();
        name = (profile as any)?.full_name || "";
        code = (profile as any)?.student_code || "";
      }

      const message = template
        .replace(/\{\{\s*StudentName\s*\}\}/g, name || "-")
        .replace(/\{\{\s*StudentID\s*\}\}/g, code || "-");

      logStudentActivity({
        action_type: "deposit_contact_support_clicked",
        action_label: "الشحن من خلال خدمة العملاء",
        page_path: "/deposit",
      });

      // Deep link — WhatsApp app if installed, otherwise WhatsApp Web (wa.me handles both).
      openUrlWithinAppContainer(buildWhatsappUrl(phone, message));
    } catch (e) {
      console.error("[deposit] support contact failed", e);
      toast.error("تعذر فتح واتساب، حاول مرة أخرى");
    } finally {
      setLoading(false);
    }
  };

  if (!available) return null;

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="group relative w-full flex items-center gap-4 p-4 rounded-2xl bg-card border-2 border-emerald-200 hover:border-emerald-500/70 hover:shadow-md transition-all active:scale-[0.98] overflow-hidden disabled:opacity-70"
    >
      <span className="pointer-events-none absolute inset-0 bg-emerald-500/0 group-active:bg-emerald-500/10 transition-colors duration-300" />
      <div className="h-14 w-14 rounded-2xl bg-[#25D366] flex items-center justify-center shrink-0 shadow-sm">
        {loading ? (
          <Loader2 className="h-7 w-7 animate-spin text-white" />
        ) : (
          <WhatsappIcon className="h-8 w-8 text-white" />
        )}
      </div>
      <div className="flex-1 text-right min-w-0">
        <div className="flex items-center gap-2 justify-start flex-row-reverse">
          <p className="font-extrabold text-base">الشحن من خلال خدمة العملاء</p>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
            الأسرع
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">تواصل مع الدعم لإتمام عملية الشحن بسرعة.</p>
      </div>
      <WhatsappIcon className="h-5 w-5 text-emerald-500 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MessageCircle, Bot, Facebook, ArrowLeft, ExternalLink, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  buildMessengerUrl,
  buildWhatsappUrl,
  loadSupportSettings,
  loadSupportUserContext,
  logSupportContact,
  renderSupportTemplate,
  type SupportSettings,
  type SupportUserContext,
} from "@/lib/supportContactTemplate";
import { openUrlWithinAppContainer } from "@/lib/nativeNavigation";
import { toast } from "sonner";

type Props = {
  audience: "student" | "teacher";
  assistantPath?: string;
  onBack?: () => void;
  showBack?: boolean;
};

type CardTone = "whatsapp" | "assistant" | "messenger";

const TONES: Record<CardTone, { grad: string; ring: string; icon: string; btn: string; title: string }> = {
  whatsapp: {
    grad: "from-emerald-100 via-emerald-50 to-green-100",
    ring: "border-emerald-300",
    icon: "bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-emerald-500/40",
    btn: "bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white shadow-emerald-500/30",
    title: "text-emerald-900",
  },
  assistant: {
    grad: "from-blue-100 via-indigo-50 to-blue-100",
    ring: "border-blue-300",
    icon: "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-blue-500/40",
    btn: "bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-blue-500/30",
    title: "text-blue-900",
  },
  messenger: {
    grad: "from-sky-100 via-cyan-50 to-sky-100",
    ring: "border-sky-300",
    icon: "bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sky-500/40",
    btn: "bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white shadow-sky-500/30",
    title: "text-sky-900",
  },
};

export default function SupportChannelsView({ audience, assistantPath = "/support/assistant", onBack, showBack = true }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<SupportSettings | null>(null);
  const [ctx, setCtx] = useState<SupportUserContext | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await loadSupportSettings();
        setSettings(s);
        if (user?.id) setCtx(await loadSupportUserContext(user.id));
      } catch (e) {
        console.error(e);
      }
    })();
  }, [user?.id]);

  const whatsappNumber = useMemo(
    () => (audience === "teacher" ? settings?.whatsappTeacher : settings?.whatsappStudent) || settings?.whatsappTeacher || "",
    [audience, settings],
  );
  const messengerLink = useMemo(
    () => (audience === "teacher" ? settings?.messengerTeacher : settings?.messengerStudent) || "",
    [audience, settings],
  );

  const handleWhatsapp = async () => {
    if (!settings || !whatsappNumber) { toast.error("رقم واتساب غير مُعدّ حالياً"); return; }
    setBusy("whatsapp");
    try {
      const message = ctx ? renderSupportTemplate(settings.messageTemplate, ctx) : "";
      openUrlWithinAppContainer(buildWhatsappUrl(whatsappNumber, message));
      if (user?.id && ctx) await logSupportContact(user.id, "whatsapp", ctx);
    } finally { setBusy(null); }
  };

  const handleAssistant = async () => {
    setBusy("assistant");
    try {
      if (user?.id && ctx) await logSupportContact(user.id, "assistant", ctx);
      navigate(assistantPath);
    } finally { setBusy(null); }
  };

  const handleMessenger = async () => {
    if (!settings || !messengerLink) { toast.error("رابط Messenger غير مُعدّ حالياً"); return; }
    setBusy("messenger");
    try {
      const message = ctx ? renderSupportTemplate(settings.messageTemplate, ctx) : "";
      openUrlWithinAppContainer(buildMessengerUrl(messengerLink, message));
      if (user?.id && ctx) await logSupportContact(user.id, "messenger", ctx);
    } finally { setBusy(null); }
  };

  const cards = [
    settings?.whatsappEnabled && whatsappNumber ? {
      key: "whatsapp" as const, tone: "whatsapp" as CardTone, icon: MessageCircle,
      title: "التواصل عبر واتساب", desc: "تواصل مباشر مع فريق الدعم الفني عبر واتساب.", cta: "فتح واتساب",
      onClick: handleWhatsapp,
    } : null,
    settings?.assistantEnabled ? {
      key: "assistant" as const, tone: "assistant" as CardTone, icon: Bot,
      title: "التواصل المباشر مع الدعم", desc: `تحدث مع ${settings?.assistantDisplayName || "المساعد الذكي"} — يجيبك فوراً ويحوّلك لموظف عند الحاجة.`, cta: "بدء المحادثة",
      onClick: handleAssistant,
    } : null,
    settings?.messengerEnabled && messengerLink ? {
      key: "messenger" as const, tone: "messenger" as CardTone, icon: Facebook,
      title: "التواصل عبر فيسبوك", desc: "تواصل مع فريق الدعم عبر Messenger.", cta: "فتح Messenger",
      onClick: handleMessenger,
    } : null,
  ].filter(Boolean) as Array<{ key: string; tone: CardTone; icon: any; title: string; desc: string; cta: string; onClick: () => void }>;

  return (
    <div dir="rtl" className="min-h-full bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-6">
        {showBack && (
          <button
            onClick={() => (onBack ? onBack() : navigate(-1))}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            رجوع
          </button>
        )}

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center pt-2">
          <div className="h-16 w-16 mx-auto rounded-3xl bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-600 flex items-center justify-center shadow-xl shadow-blue-500/20">
            <MessageCircle className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold mt-4 text-slate-900">التواصل مع الدعم</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            اختر الطريقة المناسبة للتواصل مع فريق الدعم الفني.
          </p>
        </motion.div>

        {!settings ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
        ) : cards.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-16">لا توجد وسائل تواصل مُفعّلة حالياً.</div>
        ) : (
          <div className="space-y-4">
            {cards.map((c, i) => {
              const tone = TONES[c.tone];
              const Icon = c.icon;
              return (
                <motion.div
                  key={c.key}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08, type: "spring", stiffness: 200, damping: 20 }}
                  whileHover={{ y: -3 }}
                  className={`relative overflow-hidden rounded-3xl border-2 ${tone.ring} bg-gradient-to-br ${tone.grad} p-5 shadow-xl shadow-slate-300/40`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`h-16 w-16 rounded-2xl ${tone.icon} flex items-center justify-center shadow-xl shrink-0`}>
                      <Icon className="h-8 w-8" strokeWidth={2.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-extrabold ${tone.title} text-lg`}>{c.title}</h3>
                      <p className="text-xs text-slate-700 mt-1 leading-relaxed">{c.desc}</p>
                    </div>
                  </div>
                  <button
                    onClick={c.onClick}
                    disabled={busy === c.key}
                    className={`mt-4 w-full h-12 rounded-2xl ${tone.btn} font-bold text-sm flex items-center justify-center gap-2 transition-transform active:scale-[0.98] disabled:opacity-70 shadow-lg`}
                  >
                    {busy === c.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                    {c.cta}
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

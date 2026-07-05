import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MessageCircle, Bot, Facebook, ArrowLeft, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  buildMessengerUrl,
  buildWhatsappUrl,
  loadSupportSettings,
  loadSupportUserContext,
  logSupportContact,
  renderSupportTemplate,
  SUPPORT_SETTINGS_KEYS,
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

const TONES: Record<CardTone, { card: string; icon: string; button: string; title: string; meta: string }> = {
  whatsapp: {
    card: "border-support-whatsapp-border bg-support-whatsapp-soft shadow-support-whatsapp/15",
    icon: "bg-support-whatsapp text-support-whatsapp-foreground shadow-support-whatsapp/35",
    button: "bg-support-whatsapp text-support-whatsapp-foreground shadow-support-whatsapp/25 hover:bg-support-whatsapp/90",
    title: "text-support-whatsapp-strong",
    meta: "bg-support-panel/80 text-support-whatsapp-strong border-support-whatsapp-border/70",
  },
  assistant: {
    card: "border-support-assistant-border bg-support-assistant-soft shadow-support-assistant/15",
    icon: "bg-support-assistant text-support-assistant-foreground shadow-support-assistant/35",
    button: "bg-support-assistant text-support-assistant-foreground shadow-support-assistant/25 hover:bg-support-assistant/90",
    title: "text-support-assistant-strong",
    meta: "bg-support-panel/80 text-support-assistant-strong border-support-assistant-border/70",
  },
  messenger: {
    card: "border-support-messenger-border bg-support-messenger-soft shadow-support-messenger/15",
    icon: "bg-support-messenger text-support-messenger-foreground shadow-support-messenger/35",
    button: "bg-support-messenger text-support-messenger-foreground shadow-support-messenger/25 hover:bg-support-messenger/90",
    title: "text-support-messenger-strong",
    meta: "bg-support-panel/80 text-support-messenger-strong border-support-messenger-border/70",
  },
};

const CONTACT_SETTING_KEYS = new Set<string>(SUPPORT_SETTINGS_KEYS);

const compactContact = (value: string) => value.replace(/^https?:\/\//, "").replace(/^www\./, "");

export default function SupportChannelsView({ audience, assistantPath = "/support/assistant", onBack, showBack = true }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<SupportSettings | null>(null);
  const [ctx, setCtx] = useState<SupportUserContext | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refreshSettings = useCallback(async () => {
    const s = await loadSupportSettings();
    setSettings(s);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await refreshSettings();
        if (user?.id) setCtx(await loadSupportUserContext(user.id));
      } catch (e) {
        console.error(e);
      }
    })();
  }, [refreshSettings, user?.id]);

  useEffect(() => {
    const channel = supabase
      .channel("support-settings-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "platform_settings" }, (payload) => {
        const key = String((payload.new as any)?.key || (payload.old as any)?.key || "");
        if (CONTACT_SETTING_KEYS.has(key)) void refreshSettings();
      })
      .subscribe();

    const onFocus = () => void refreshSettings();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [refreshSettings]);

  const whatsappNumber = useMemo(
    () => (audience === "teacher" ? settings?.whatsappTeacher : settings?.whatsappStudent) || settings?.whatsappTeacher || "",
    [audience, settings],
  );
  const messengerLink = useMemo(
    () => (audience === "teacher" ? settings?.messengerTeacher : settings?.messengerStudent)
      || settings?.messengerTeacher
      || settings?.messengerStudent
      || "",
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
      meta: compactContact(whatsappNumber),
      onClick: handleWhatsapp,
    } : null,
    settings?.assistantEnabled ? {
      key: "assistant" as const, tone: "assistant" as CardTone, icon: Bot,
      title: "التواصل المباشر مع الدعم", desc: `تحدث مع ${settings?.assistantDisplayName || "المساعد الذكي"} — يجيبك فوراً ويحوّلك لموظف عند الحاجة.`, cta: "بدء المحادثة",
      meta: settings?.assistantDisplayName || "المساعد الذكي",
      onClick: handleAssistant,
    } : null,
    settings?.messengerEnabled && messengerLink ? {
      key: "messenger" as const, tone: "messenger" as CardTone, icon: Facebook,
      title: "التواصل عبر فيسبوك", desc: "تواصل مع فريق الدعم الفني عبر صفحة فيسبوك.", cta: "فتح فيسبوك",
      meta: compactContact(messengerLink),
      onClick: handleMessenger,
    } : null,
  ].filter(Boolean) as Array<{ key: string; tone: CardTone; icon: any; title: string; desc: string; cta: string; meta: string; onClick: () => void }>;

  return (
    <div dir="rtl" className="min-h-full bg-support-page">
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
          <div className="h-16 w-16 mx-auto rounded-3xl bg-primary text-primary-foreground flex items-center justify-center shadow-xl shadow-primary/20">
            <MessageCircle className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-extrabold mt-4 text-support-panel-foreground">التواصل مع الدعم</h1>
          <p className="text-sm text-support-panel-muted mt-2 max-w-md mx-auto">
            اختر الطريقة المناسبة للتواصل مع فريق الدعم الفني.
          </p>
        </motion.div>

        {!settings ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
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
                  className={`relative overflow-hidden rounded-3xl border-2 ${tone.card} p-5 shadow-xl`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`h-16 w-16 rounded-2xl ${tone.icon} flex items-center justify-center shadow-xl shrink-0`}>
                      <Icon className="h-8 w-8" strokeWidth={2.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-extrabold ${tone.title} text-lg`}>{c.title}</h3>
                      <p className="text-xs text-support-panel-muted mt-1 leading-relaxed">{c.desc}</p>
                      {c.meta && (
                        <div className={`mt-3 inline-flex max-w-full items-center rounded-full border px-3 py-1 text-xs font-bold ltr:font-mono ${tone.meta}`} dir="ltr">
                          <span className="truncate">{c.meta}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={c.onClick}
                    disabled={busy === c.key}
                    className={`mt-4 w-full h-12 rounded-2xl ${tone.button} font-bold text-sm flex items-center justify-center gap-2 transition-transform active:scale-[0.98] disabled:opacity-70 shadow-lg`}
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

import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Headset, Trash2, Headphones, PhoneOff } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { useSupportTyping } from "@/hooks/useSupportTyping";
import { closeUserSupportConversation, createSupportClientId, fetchSupportMessagesForUser, hasActiveSupportSession } from "@/lib/supportChat";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant" | "support"; content: string; id?: string };

const STORAGE_KEY = "teacher_assistant_chat";

const quickSuggestions = [
  "كم عدد طلابي؟",
  "كم أرباحي هذا الشهر؟",
  "حالة طلبات السحب",
  "كيف أرفع محتوى؟",
  "تواصل مع الدعم",
];

// Trigger phrases that indicate the teacher wants human support
const SUPPORT_TRIGGERS = [
  "تواصل مع الدعم",
  "اتكلم مع المطور",
  "اتكلم مع الادارة",
  "اتكلم مع الإدارة",
  "كلم الدعم",
  "ابعت للدعم",
  "ابعت للمطور",
  "محتاج دعم",
  "مشكلة في",
  "بلغ المطور",
];

export default function TeacherAssistantBot() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [showEscalateConfirm, setShowEscalateConfirm] = useState(false);
  const [unreadReplies, setUnreadReplies] = useState(0);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const playSound = useNotificationSound();
  const { otherTyping: adminTyping, sendTyping } = useSupportTyping(user?.id, "user");

  // Load saved messages on mount
  useEffect(() => {
    if (!user) return;
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        setMessages(parsed);
        if (parsed.some((m: Msg) => m.role === "support")) setEscalated(true);
      }
    } catch {}
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const loadExistingSupportThread = async () => {
      try {
        const rows = await fetchSupportMessagesForUser(user.id);
        if (!rows.length) return;
        setEscalated(hasActiveSupportSession(rows));
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const next = [...prev];
          for (const row of rows) {
            const id = `support-${row.id}`;
            if (existingIds.has(id)) continue;
            next.push({ id, role: row.is_from_admin ? "support" : "user", content: row.message });
          }
          return next;
        });
      } catch (error) {
        console.error(error);
      }
    };
    void loadExistingSupportThread();
  }, [user]);

  // Save messages when they change
  useEffect(() => {
    if (!user || messages.length === 0) return;
    try {
      localStorage.setItem(`${STORAGE_KEY}_${user.id}`, JSON.stringify(messages.slice(-50)));
    } catch {}
  }, [messages, user]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // ⚡ Realtime: listen for admin replies
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`teacher-support-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const msg = payload.new as any;
          if (!msg.is_from_admin) return;
          setEscalated(true);
          setMessages((prev) => {
            if (prev.some((m) => m.id === `support-${msg.id}`)) return prev;
            return [...prev, { id: `support-${msg.id}`, role: "support", content: msg.message }];
          });
          playSound();
          if (!open) setUnreadReplies((c) => c + 1);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, open, playSound]);

  useEffect(() => {
    if (open) setUnreadReplies(0);
  }, [open]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setEscalated(false);
    if (user) localStorage.removeItem(`${STORAGE_KEY}_${user.id}`);
  }, [user]);

  const handleCloseSupportChat = async () => {
    if (!user) return;
    try {
      await closeUserSupportConversation(user.id, true);
      setEscalated(false);
      setShowCloseDialog(false);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "تم إنهاء المحادثة مع الدعم. يمكنك متابعة الحديث مع المساعد الذكي أو طلب الدعم مرة أخرى في أي وقت." },
      ]);
    } catch (e: any) {
      toast.error(e?.message || "تعذر إنهاء المحادثة");
    }
  };

  const buildProblemSummary = () => {
    return messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .slice(-3)
      .join("\n")
      .slice(0, 300);
  };

  const confirmEscalation = async () => {
    if (!user) return;
    setShowEscalateConfirm(false);
    setEscalated(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, teacher_code")
      .eq("id", user.id)
      .maybeSingle();
    const summary = buildProblemSummary();
    const escalationMsg = `📋 طلب دعم من معلم\n\n👨‍🏫 الاسم: ${profile?.full_name || "غير معروف"}\n🆔 كود المعلم: ${profile?.teacher_code || "غير متاح"}\n\n📝 وصف المشكلة:\n${summary}`;

    await supabase.from("support_messages").insert({
      user_id: user.id,
      message: escalationMsg,
      is_from_admin: false,
      is_teacher_request: true,
      metadata: { source: "ai-escalation", client_id: createSupportClientId("teacher-escalation") },
    });

    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: "✅ تم تحويلك للدعم الفني. سيتواصل معك المطور قريباً وستصلك الردود هنا مباشرة.",
      },
    ]);
  };

  const rejectEscalation = () => {
    setShowEscalateConfirm(false);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "تمام! أنا هنا لمساعدتك. اسألني أي شيء آخر 😊" },
    ]);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading || !user) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    const allMsgs = [...messages, userMsg];
    setMessages(allMsgs);
    setInput("");

    // If already escalated → forward directly to support
    if (escalated) {
      try {
        await supabase.from("support_messages").insert({
          user_id: user.id,
          message: text.trim(),
          is_from_admin: false,
          is_teacher_request: true,
          metadata: { source: "human-support", client_id: createSupportClientId("teacher-text") },
        });
      } catch (err) {
        console.error(err);
      }
      return;
    }

    // Detect support trigger phrases
    const lower = text.trim().toLowerCase();
    if (SUPPORT_TRIGGERS.some((t) => lower.includes(t.toLowerCase()))) {
      setShowEscalateConfirm(true);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("teacher-assistant", {
        body: { messages: allMsgs.slice(-12).map((m) => ({ role: m.role === "support" ? "assistant" : m.role, content: m.content })) },
      });

      if (error) throw error;
      let content = typeof data?.content === "string" ? data.content.trim() : "";

      if (content.includes("[ESCALATE_TO_SUPPORT]")) {
        content = content.replace("[ESCALATE_TO_SUPPORT]", "").trim();
        if (content) {
          setMessages([...allMsgs, { role: "assistant", content }]);
        }
        setShowEscalateConfirm(true);
        return;
      }

      setMessages([...allMsgs, { role: "assistant", content: content || "تعذر الرد، حاول مرة أخرى." }]);
    } catch {
      setMessages([...allMsgs, { role: "assistant", content: "عذراً، حدث خطأ. حاول مرة أخرى." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-6 left-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-400/30 flex items-center justify-center hover:shadow-xl hover:scale-105 transition-all"
            title="المساعد الذكي"
          >
            <Headset className="h-6 w-6" />
            {unreadReplies > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white animate-pulse">
                {unreadReplies}
              </span>
            ) : (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-white animate-pulse" />
            )}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-6 left-3 right-3 z-50 lg:left-6 lg:right-auto lg:w-[400px] max-h-[70vh] flex flex-col bg-card rounded-2xl border border-border shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-l from-blue-600 to-purple-600 text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                  <Headset className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold">{escalated ? "الدعم الفني" : "مساعد المعلم"}</p>
                  <p className="text-[10px] text-white/70">{escalated && adminTyping ? "يكتب الآن..." : "متصل الآن"}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {escalated && (
                  <button
                    onClick={() => setShowCloseDialog(true)}
                    className="px-2 h-7 rounded-lg bg-red-500/90 hover:bg-red-600 text-white text-[10px] font-bold flex items-center gap-1"
                    title="إنهاء الشات"
                  >
                    <PhoneOff className="h-3 w-3" /> إنهاء
                  </button>
                )}
                {messages.length > 0 && !escalated && (
                  <button onClick={clearChat} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors" title="مسح المحادثة">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px] max-h-[50vh]" dir="rtl">
              {messages.length === 0 && (
                <div className="text-center py-6">
                  <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center mb-3">
                    <Headset className="h-8 w-8 text-blue-600" />
                  </div>
                  <p className="text-sm font-bold text-foreground">أهلاً بك! أنا مساعدك الشخصي 😊</p>
                  <p className="text-xs text-muted-foreground mt-1">أعرف كل شيء عن حسابك وطلابك وأرباحك</p>
                  <div className="flex flex-wrap gap-1.5 mt-4 justify-center">
                    {quickSuggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(s)}
                        className="text-[10px] px-2.5 py-1.5 rounded-full bg-accent text-accent-foreground hover:bg-accent/80 transition-colors font-medium"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => {
                const isUser = m.role === "user";
                const isSupport = m.role === "support";
                return (
                  <div key={i} className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                        isUser
                          ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-tr-sm"
                          : isSupport
                            ? "bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-tl-sm"
                            : "bg-muted text-foreground rounded-tl-sm"
                      }`}
                    >
                      {isSupport && (
                        <p className="text-[10px] font-bold text-emerald-700 mb-1 flex items-center gap-1">
                          <Headphones className="h-3 w-3" /> رد المطور
                        </p>
                      )}
                      {m.role === "assistant" ? (
                        <div className="prose prose-xs prose-neutral dark:prose-invert max-w-none [&>p]:m-0">
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      )}
                    </div>
                  </div>
                );
              })}

              {showEscalateConfirm && (
                <div className="flex justify-end">
                  <div className="max-w-[90%] rounded-2xl p-3 bg-amber-50 border border-amber-200 text-sm space-y-3">
                    <p className="text-amber-800 font-medium text-xs">هل تريد التواصل مع الدعم الفني (المطور)؟</p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={confirmEscalation} className="flex-1 h-8 text-xs rounded-xl bg-blue-500 hover:bg-blue-600">
                        نعم، حوّلني
                      </Button>
                      <Button size="sm" variant="outline" onClick={rejectEscalation} className="flex-1 h-8 text-xs rounded-xl">
                        لا، شكراً
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {loading && (
                <div className="flex justify-end">
                  <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              )}
            </div>

            <div className="px-3 py-2 border-t border-border shrink-0" dir="rtl">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage(input);
                }}
                className="flex items-center gap-2"
              >
                <input
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    if (escalated) sendTyping();
                  }}
                  placeholder={escalated ? "اكتب رسالتك للمطور..." : "اكتب سؤالك..."}
                  className="flex-1 text-xs bg-muted rounded-xl px-3 py-2.5 outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
                  disabled={loading || showEscalateConfirm}
                />
                <Button type="submit" size="icon" disabled={!input.trim() || loading || showEscalateConfirm} className="h-9 w-9 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 shrink-0 border-0">
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AlertDialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <AlertDialogContent dir="rtl" className="max-w-[22rem] rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>إنهاء المحادثة مع الدعم؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إنهاء هذه المحادثة والعودة للمساعد الذكي. يمكنك التواصل مع المطور مرة أخرى في أي وقت.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogCancel className="rounded-2xl">إلغاء</AlertDialogCancel>
            <AlertDialogAction className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleCloseSupportChat}>
              تأكيد الإنهاء
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

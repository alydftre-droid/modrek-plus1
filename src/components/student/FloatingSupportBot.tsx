import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { invokeSupportAssistant } from "@/lib/supportAssistant";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Headset, Headphones, PhoneOff } from "lucide-react";
import { ChatMarkdown } from "@/components/chat/ChatMarkdown";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { useSupportTyping } from "@/hooks/useSupportTyping";
import supportAgentImg from "@/assets/support-agent.png";
import { closeUserSupportConversation, createSupportClientId, fetchSupportMessagesForUser, hasActiveSupportSession, mapSupportRowsToUiMessages, markAdminSupportMessagesRead, mergeSupportMessages } from "@/lib/supportChat";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { clearDraftValue, loadDraftValue, saveDraftValue } from "@/lib/mobileRuntime";
import { insertSupportMessage, subscribeSupportThread, summarizeSupportRow, supportTrace } from "@/lib/supportRealtime";

type Msg = { role: "user" | "assistant" | "support"; content: string; id?: string };

type SupportWidgetMessage = Msg & { id: string };

const quickSuggestions = [
  "كيف أشترك في مادة؟",
  "كيف أعمل إيداع؟",
  "أريد التواصل مع الدعم البشري",
  "عرّفني على المنصة",
];

export default function FloatingSupportBot() {
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
  const draftKey = `floating-support-draft-${user?.id || "guest"}`;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    supportTrace("student-widget:render:messages", {
      count: messages.length,
      lastId: messages[messages.length - 1]?.id ?? null,
      escalated,
    });
  }, [messages, loading, showEscalateConfirm]);

  const applySupportRow = useCallback(async (msg: any, source: string) => {
    if (!msg?.id) return;
    supportTrace("student-widget:state:apply-row:start", { source, row: summarizeSupportRow(msg), open });
    const supportMessages = (await mapSupportRowsToUiMessages([msg])) as SupportWidgetMessage[];
    const nextMessage = supportMessages[0];
    const clientId = msg.metadata?.client_id ? `local-support-${msg.metadata.client_id}` : null;
    setMessages((prev) => {
      if (!nextMessage || prev.some((m) => m.id === nextMessage.id)) {
        supportTrace("student-widget:state:messages:dedupe", { source, rowId: msg.id, previousCount: prev.length });
        return prev;
      }
      const cleared = clientId ? prev.filter((m) => m.id !== clientId) : prev;
      const next = [...cleared, nextMessage];
      supportTrace("student-widget:state:messages:set", {
        source,
        rowId: msg.id,
        removedClientId: clientId,
        previousCount: prev.length,
        nextCount: next.length,
      });
      return next;
    });
    setEscalated(!msg.is_resolved);
    if (msg.is_from_admin) {
      playSound();
      if (!open) setUnreadReplies((c) => c + 1);
      await supabase.from("support_messages").update({ is_read: true }).eq("id", msg.id);
    }
  }, [open, playSound]);

  useEffect(() => {
    setInput(loadDraftValue(draftKey));
  }, [draftKey]);

  useEffect(() => {
    saveDraftValue(draftKey, input);
  }, [draftKey, input]);

  // Reset unread when opening
  useEffect(() => {
    if (open) setUnreadReplies(0);
  }, [open]);

  // Hydrate active support session from DB on mount
  useEffect(() => {
    if (!user) return;

    const hydrateThread = async () => {
      try {
        const rows = await fetchSupportMessagesForUser(user.id);
        if (!rows.length) {
          setMessages([]);
          setEscalated(false);
          return;
        }

        const supportMessages = (await mapSupportRowsToUiMessages(rows)) as SupportWidgetMessage[];
        setMessages((prev) => mergeSupportMessages(prev, supportMessages));
        setEscalated(hasActiveSupportSession(rows));
        await markAdminSupportMessagesRead(user.id);
      } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
    };

    void hydrateThread();

    const channel = supabase
      .channel(`student-support-widget-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages", filter: `user_id=eq.${user.id}` },
        (payload) => {
          supportTrace("student-widget:realtime:postgres:insert", { row: summarizeSupportRow(payload.new) });
          void applySupportRow(payload.new, "postgres_insert");
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "support_messages", filter: `user_id=eq.${user.id}` },
        async () => {
          supportTrace("student-widget:realtime:postgres:update", { userId: user.id });
          await hydrateThread();
        }
      )
      .subscribe((status, err) => {
        supportTrace("student-widget:realtime:postgres:status", { status, error: err?.message, userId: user.id });
      });

    const unsubscribeBroadcast = subscribeSupportThread(user.id, (event, row) => {
      if (event === "INSERT") void applySupportRow(row, "broadcast_thread");
      else void hydrateThread();
    });

    return () => {
      supabase.removeChannel(channel);
      unsubscribeBroadcast();
    };
  }, [applySupportRow, user]);

  const handleCloseSupportChat = async () => {
    if (!user) return;
    try {
      await closeUserSupportConversation(user.id, false);
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
    const userMsgs = messages.filter((m) => m.role === "user").map((m) => m.content);
    return userMsgs.slice(-3).join("\n").slice(0, 300);
  };

  const confirmEscalation = async () => {
    if (!user) return;
    setShowEscalateConfirm(false);
    setEscalated(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, student_code")
      .eq("id", user.id)
      .maybeSingle();
    const summary = buildProblemSummary();
    const escalationMsg = `📋 تحويل من المساعد الذكي\n\n👤 الاسم: ${profile?.full_name || "غير معروف"}\n🆔 كود الطالب: ${profile?.student_code || "غير متاح"}\n\n📝 وصف المشكلة:\n${summary}`;

    const savedRow = await insertSupportMessage({
      user_id: user.id,
      message: escalationMsg,
      is_from_admin: false,
      is_teacher_request: false,
      metadata: { source: "ai-escalation", client_id: createSupportClientId("student-fab-escalation") },
    });
    await applySupportRow(savedRow, "sender_after_insert");

    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: "✅ تم تحويلك لموظف الدعم بنجاح. سيتم الرد عليك قريباً وستصلك الرسائل هنا مباشرة.",
      },
    ]);
  };

  const rejectEscalation = () => {
    setShowEscalateConfirm(false);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "تمام! أنا هنا لمساعدتك. اسألني أي سؤال تاني 😊" },
    ]);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading || !user) return;
    const supportClientId = escalated ? createSupportClientId("student-fab-text") : null;
    const userMsg: Msg = {
      role: "user",
      content: text.trim(),
      id: supportClientId ? `local-support-${supportClientId}` : undefined,
    };
    const allMsgs = [...messages, userMsg];
    setMessages(allMsgs);
    setInput("");
    clearDraftValue(draftKey);

    // If already escalated → forward directly to admin support
    if (escalated) {
      try {
        const savedRow = await insertSupportMessage({
          user_id: user.id,
          message: text.trim(),
          is_from_admin: false,
          is_teacher_request: false,
          metadata: { source: "human-support", client_id: supportClientId },
        });
        await applySupportRow(savedRow, "sender_after_insert");
      } catch (err) {
        console.error(err);
      }
      return;
    }

    setLoading(true);
    // Insert empty assistant placeholder we update progressively
    setMessages([...allMsgs, { role: "assistant", content: "" }]);
    try {
      let assistantContent = await invokeSupportAssistant({
        messages: allMsgs,
        onDelta: (_chunk, full) => {
          const display = full.replace("[ESCALATE_TO_SUPPORT]", "").trim();
            setMessages((prev) => [...allMsgs, { role: "assistant", content: display || prev[prev.length - 1]?.content || "" }]);
        },
      });

      if (assistantContent.includes("[ESCALATE_TO_SUPPORT]")) {
        assistantContent = assistantContent.replace("[ESCALATE_TO_SUPPORT]", "").trim();
        setMessages([
          ...allMsgs,
          { role: "assistant", content: assistantContent || "حاضر، هحوّلك للدعم البشري." },
        ]);
        setShowEscalateConfirm(true);
        setLoading(false);
        return;
      }

      setMessages([
        ...allMsgs,
        { role: "assistant", content: assistantContent || "تعذر الرد، حاول مرة أخرى." },
      ]);
    } catch (err: any) {
      console.error(err);
      const msg = err?.message?.includes("الحد")
        ? "ضغط مؤقت على الخدمة، حاول بعد دقيقة."
        : err?.message?.includes("GEMINI") || err?.message?.includes("مفتاح")
          ? "إعدادات الذكاء الاصطناعي غير مكتملة، تواصل مع الدعم."
          : "عذراً، حدث خطأ. حاول مرة أخرى.";
      setMessages([...allMsgs, { role: "assistant", content: msg }]);
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
            className="fixed bottom-20 left-4 z-50 lg:bottom-6 w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-400/30 flex items-center justify-center hover:shadow-xl hover:scale-105 transition-all"
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
            className="fixed bottom-20 left-3 right-3 z-50 lg:bottom-6 lg:left-6 lg:right-auto lg:w-[400px] max-h-[70vh] flex flex-col bg-card rounded-2xl border border-border shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-l from-blue-600 to-purple-600 text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-white/30">
                  <img src={supportAgentImg} alt="" className="w-full h-full object-cover" />
                </div>
                <div>
                  <p className="text-sm font-bold">{escalated ? "موظف الدعم" : "المساعد الذكي"}</p>
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
                  <button
                    onClick={() => {
                      setMessages([]);
                    }}
                    className="p-1.5 rounded-lg hover:bg-white/20 transition-colors text-[10px]"
                    title="مسح المحادثة"
                  >
                    🗑️
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
                  <div className="w-16 h-16 mx-auto rounded-full overflow-hidden border-4 border-blue-100 mb-3 shadow-lg">
                    <img src={supportAgentImg} alt="" className="w-full h-full object-cover" />
                  </div>
                  <p className="text-sm font-bold text-foreground">أهلاً بك! أنا مساعدك الشخصي 😊</p>
                  <p className="text-xs text-muted-foreground mt-1">اسألني عن أي شيء يخص حسابك أو المنصة</p>
                  <div className="flex flex-wrap gap-1.5 mt-4 justify-center">
                    {quickSuggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(s)}
                        className="text-[10px] px-2.5 py-1.5 rounded-full bg-gradient-to-r from-blue-50 to-purple-50 text-blue-700 hover:from-blue-100 hover:to-purple-100 transition-colors font-medium border border-blue-200/50"
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
                  <div key={i} className={`flex ${isUser ? "justify-start" : "justify-end"} gap-2`}>
                    {!isUser && (
                      <div className={`h-6 w-6 rounded-full overflow-hidden shrink-0 mt-1 border ${isSupport ? "border-emerald-300" : "border-blue-200"}`}>
                        <img src={supportAgentImg} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}
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
                          <Headphones className="h-3 w-3" /> رد الدعم
                        </p>
                      )}
                      {m.role === "assistant" ? (
                        <ChatMarkdown content={m.content} />
                      ) : (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      )}
                    </div>
                  </div>
                );
              })}

              {showEscalateConfirm && (
                <div className="flex justify-end gap-2">
                  <div className="max-w-[90%] rounded-2xl p-3 bg-amber-50 border border-amber-200 text-sm space-y-3">
                    <p className="text-amber-800 font-medium text-xs">هل تريد التحدث مع ممثلي خدمة العملاء؟</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={confirmEscalation}
                        className="flex-1 h-8 text-xs rounded-xl bg-blue-500 hover:bg-blue-600"
                      >
                        نعم، حوّلني للدعم
                      </Button>
                      <Button size="sm" variant="outline" onClick={rejectEscalation} className="flex-1 h-8 text-xs rounded-xl">
                        لا، شكراً
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {loading && (
                <div className="flex justify-end gap-2">
                  <div className="h-6 w-6 rounded-full overflow-hidden shrink-0 mt-1 border border-blue-200">
                    <img src={supportAgentImg} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
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
                  placeholder={escalated ? "اكتب رسالتك للدعم..." : "اكتب سؤالك..."}
                  className="flex-1 text-xs bg-muted rounded-xl px-3 py-2.5 outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
                  disabled={loading || showEscalateConfirm}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim() || loading || showEscalateConfirm}
                  className="h-9 w-9 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 shrink-0 border-0"
                >
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
              سيتم إنهاء هذه المحادثة والعودة للمساعد الذكي. يمكنك التواصل مع الدعم مرة أخرى في أي وقت.
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

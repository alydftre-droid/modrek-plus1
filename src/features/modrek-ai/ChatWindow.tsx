import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowRight, Send, Loader2, Volume2, GraduationCap, Settings, X, Trash2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import mascot from "@/assets/modrek-ai-mascot.png";
import {
  appendMessage,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  listMessages,
  toGatewayMessages,
} from "./store";
import { callExamsAssistant, callStudyAssistant } from "./api";
import type { AssistantType, ModrekConversation, ModrekMessage } from "./types";
import { synthesizeSpeech } from "@/lib/openrouterTts";

interface ChatWindowProps {
  assistantType: AssistantType;
  conversationId?: string;
  onConversationCreated?: (id: string) => void;
  onSelectConversation?: (id: string | null) => void;
  initialContext?: Record<string, any>;
  headerTitle?: string;
}

const STUDY_SUGGESTIONS = [
  "اشرح لي أي سؤال سأرسله لك.",
  "لخص لي درسًا بشكل مبسط.",
  "ساعدني في حل واجب منزلي.",
  "ما أفضل طريقة لمراجعة المنهج؟",
];

const EXAMS_SUGGESTIONS = [
  "أنشئ لي امتحانًا سريعًا.",
  "اختبرني حسب مستواي.",
  "أنشئ امتحان مراجعة شامل.",
  "راجع معي أخطائي السابقة.",
];

export default function ModrekChatWindow({
  assistantType,
  conversationId,
  onConversationCreated,
  onSelectConversation,
  initialContext,
  headerTitle,
}: ChatWindowProps) {
  const navigate = useNavigate();
  const [conv, setConv] = useState<ModrekConversation | null>(null);
  const [messages, setMessages] = useState<ModrekMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [ttsPlayingId, setTtsPlayingId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [history, setHistory] = useState<ModrekConversation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const suggestions = assistantType === "exams" ? EXAMS_SUGGESTIONS : STUDY_SUGGESTIONS;
  const assistantLabel =
    assistantType === "exams"
      ? "مساعد الامتحانات"
      : assistantType === "review"
      ? "مراجعة الامتحان"
      : "المساعد الدراسي";
  const welcomeText =
    assistantType === "exams"
      ? "اطلب أي امتحان بأسلوبك ومستوى منهجك، وسأنشئه لك فورًا."
      : "اسألني في أي درس، أو ألصق صورة/PDF لأشرحه لك.";
  const placeholder =
    assistantType === "exams" ? "اطلب امتحانًا... (Enter للإرسال)" : "اكتب سؤالك... (Enter للإرسال)";

  useEffect(() => {
    (async () => {
      if (conversationId) {
        const c = await getConversation(conversationId);
        setConv(c);
        if (c) setMessages(await listMessages(c.id));
      } else {
        setConv(null);
        setMessages([]);
      }
    })();
  }, [conversationId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [conversationId]);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      setHistory(await listConversations(assistantType));
    } catch (e: any) {
      toast.error(e?.message || "تعذر تحميل المحادثات");
    } finally {
      setHistoryLoading(false);
    }
  };

  const openSidebar = () => {
    setSidebarOpen(true);
    void loadHistory();
  };

  const handleNewChat = () => {
    setSidebarOpen(false);
    setConv(null);
    setMessages([]);
    setInput("");
    onSelectConversation?.(null);
  };

  const handleSelect = (id: string) => {
    setSidebarOpen(false);
    onSelectConversation?.(id);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("حذف هذه المحادثة نهائيًا؟")) return;
    try {
      await deleteConversation(id);
      setHistory((prev) => prev.filter((x) => x.id !== id));
      if (conv?.id === id) {
        setConv(null);
        setMessages([]);
        onSelectConversation?.(null);
      }
    } catch (err: any) {
      toast.error(err?.message || "فشل الحذف");
    }
  };

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || sending) return;
    setSending(true);
    if (!overrideText) setInput("");

    try {
      let activeConv = conv;
      if (!activeConv) {
        const autoTitle = text.length > 40 ? text.slice(0, 40) + "…" : text;
        activeConv = await createConversation({
          assistant_type: assistantType,
          title: initialContext?.title || autoTitle,
          context_json: initialContext || {},
        });
        setConv(activeConv);
        onConversationCreated?.(activeConv.id);
      }

      const userMsg = await appendMessage(activeConv.id, {
        role: "user",
        parts: [{ type: "text", text }],
      });
      setMessages((prev) => [...prev, userMsg]);

      const history = await listMessages(activeConv.id);
      const gwMessages = toGatewayMessages(history);

      if (assistantType === "exams") {
        const result = await callExamsAssistant({ messages: gwMessages, conversationContext: activeConv.context_json });
        const replyText = result.reply || (result.examId ? "تم إنشاء الامتحان." : "");
        const asstMsg = await appendMessage(activeConv.id, {
          role: "assistant",
          parts: [{ type: "text", text: replyText }],
          metadata: result.examId ? { examId: result.examId, title: result.title } : {},
        });
        setMessages((prev) => [...prev, asstMsg]);
        if (result.examId) {
          toast.success("تم إنشاء الامتحان");
          setTimeout(() => navigate(`/student/exams/${result.examId}/take`), 900);
        }
      } else {
        const result = await callStudyAssistant({ messages: gwMessages, conversationContext: activeConv.context_json });
        const asstMsg = await appendMessage(activeConv.id, {
          role: "assistant",
          parts: [{ type: "text", text: result.reply }],
        });
        setMessages((prev) => [...prev, asstMsg]);
      }
    } catch (e: any) {
      toast.error(e?.message || "حدث خطأ");
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const speak = async (id: string, text: string) => {
    if (ttsPlayingId === id) return;
    setTtsPlayingId(id);
    try {
      const clean = text.replace(/[#*_`~>]/g, "").replace(/\s+/g, " ").trim();
      const result = await synthesizeSpeech({ text: clean.slice(0, 3000) });
      const audio = new Audio(result.audioUrl);
      await audio.play();
      audio.onended = () => { setTtsPlayingId(null); result.revoke(); };
      return;
    } catch {
      toast.error("تعذر تشغيل الصوت");
    }
    setTtsPlayingId(null);
  };

  const showWelcome = useMemo(() => messages.length === 0 && !sending, [messages, sending]);

  return (
    <div
      className="fixed inset-0 z-50 flex bg-background"
      dir="rtl"
      style={{
        top: "max(env(safe-area-inset-top), var(--status-bar-offset, 0px))",
        height:
          "calc(100dvh - max(env(safe-area-inset-top), var(--status-bar-offset, 0px)))",
      }}
    >
      {/* Sidebar drawer — mirrors support */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-x-0 bottom-0 top-[max(env(safe-area-inset-top),var(--status-bar-offset,0px))] bg-black/40 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed bottom-0 right-0 top-[max(env(safe-area-inset-top),var(--status-bar-offset,0px))] w-72 z-50 flex flex-col bg-card border-l border-border shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-sm font-bold">السجلات</h2>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-lg hover:bg-accent transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3">
              <Button
                onClick={handleNewChat}
                className="w-full bg-gradient-to-r from-primary to-primary/80 text-primary-foreground border-0 text-sm"
              >
                محادثة جديدة
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 space-y-1 pb-3">
              {historyLoading ? (
                <p className="text-xs text-muted-foreground text-center py-8">جاري التحميل...</p>
              ) : history.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">لا توجد محادثات بعد</p>
              ) : (
                history.map((c) => (
                  <div
                    key={c.id}
                    className={`group w-full rounded-xl transition-colors ${
                      conv?.id === c.id ? "bg-accent" : "hover:bg-accent"
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleSelect(c.id)}
                        className="flex-1 text-right p-3 flex items-center gap-2 min-w-0"
                      >
                        <MessageSquare className="h-4 w-4 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{c.title}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date((c as any).last_message_at || (c as any).created_at).toLocaleDateString("ar-EG")}
                          </p>
                        </div>
                      </button>
                      <button
                        onClick={(e) => handleDelete(c.id, e)}
                        className="opacity-60 hover:opacity-100 text-destructive p-2 rounded-lg hover:bg-destructive/10 mr-1"
                        aria-label="حذف"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="mobile-app-header-inner flex items-center justify-between px-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-lg hover:bg-accent transition-colors"
            >
              <ArrowRight className="h-5 w-5" />
            </button>
            <div className="h-9 w-9 rounded-full overflow-hidden border-2 border-primary/30 bg-primary/10 shrink-0">
              <img src={mascot} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{headerTitle || conv?.title || assistantLabel}</p>
              <p className="text-[10px] text-primary font-medium">Modrek AI • متصل</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openSidebar}
              className="p-2 rounded-lg hover:bg-accent transition-colors"
              aria-label="الإعدادات"
            >
              <Settings className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {showWelcome && (
            <div className="flex flex-col items-center justify-center h-full py-12">
              <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-primary/20 mb-4 shadow-lg bg-primary/5">
                <img src={mascot} alt="" className="w-full h-full object-cover" />
              </div>
              <h2 className="text-lg font-bold mb-1">مرحبًا بك في Modrek AI</h2>
              <p className="text-sm text-muted-foreground mb-6 text-center max-w-xs">{welcomeText}</p>
              <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                {suggestions.slice(0, 4).map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s)}
                    className="text-xs px-4 py-2 rounded-full bg-gradient-to-r from-blue-50 to-purple-50 text-blue-700 hover:from-blue-100 hover:to-purple-100 transition-colors font-medium border border-blue-200/50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => {
            const text = m.parts.map((p: any) => (p.type === "text" ? p.text : "")).join("");
            const isUser = m.role === "user";
            if (isUser) {
              return (
                <div key={m.id} className="flex justify-start gap-2 animate-fade-in">
                  <div className="max-w-[80%] min-w-0 rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed bg-primary text-primary-foreground">
                    <p className="whitespace-pre-wrap break-words">{text}</p>
                  </div>
                </div>
              );
            }
            const examId = (m.metadata as any)?.examId;
            return (
              <div key={m.id} className="flex justify-end gap-2 animate-fade-in">
                <div className="h-7 w-7 rounded-full overflow-hidden shrink-0 mt-1 border border-primary/30 bg-primary/10">
                  <img src={mascot} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="max-w-[85%] min-w-0 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed bg-muted text-foreground">
                  <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                  </div>
                  {examId && (
                    <Button
                      size="sm"
                      onClick={() => navigate(`/student/exams/${examId}/take`)}
                      className="mt-2 gap-2 h-9 rounded-xl"
                    >
                      <GraduationCap className="h-4 w-4" /> بدء الامتحان
                    </Button>
                  )}
                  <div className="flex gap-2 pt-2 mt-1 border-t border-border/50">
                    <button
                      onClick={() => speak(m.id, text)}
                      disabled={ttsPlayingId === m.id}
                      className="h-7 px-2 text-xs rounded-lg hover:bg-background/60 text-muted-foreground flex items-center gap-1 disabled:opacity-50"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                      {ttsPlayingId === m.id ? "..." : "استمع"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="flex justify-end gap-2 animate-fade-in">
              <div className="h-7 w-7 rounded-full overflow-hidden shrink-0 mt-1 border border-primary/30 bg-primary/10">
                <img src={mascot} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div
          className="px-4 py-3 border-t border-border bg-card shrink-0"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <form
            onSubmit={(e) => { e.preventDefault(); void send(); }}
            className="flex items-end gap-2 bg-muted rounded-2xl p-1.5 focus-within:ring-2 focus-within:ring-primary/30 transition min-w-0"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                const el = e.target as HTMLTextAreaElement;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 180) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder={placeholder}
              className="flex-1 min-w-0 w-full text-base bg-transparent px-2 py-2 outline-none placeholder:text-muted-foreground resize-none overflow-y-auto overflow-x-hidden break-words whitespace-pre-wrap min-h-[42px] max-h-[180px] leading-relaxed [overflow-wrap:anywhere]"
              disabled={sending}
              dir="rtl"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || sending}
              className="h-9 w-9 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shrink-0 border-0"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

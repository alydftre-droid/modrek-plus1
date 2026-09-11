import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, Send, Loader2, GraduationCap, Settings, X, Trash2, MessageSquare, Image as ImageIcon, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import mascot from "@/assets/modrek-ai-mascot.png";
import { RichMarkdown } from "./RichMarkdown";
import { LessonDiagramCard } from "./LessonDiagramCard";
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
import { useStudentAiQuota } from "@/hooks/useStudentAiQuota";
import { AiQuotaBadge } from "./AiQuotaBadge";
import { AiQuotaLimitDialog } from "./AiQuotaLimitDialog";

interface ChatWindowProps {
  assistantType: AssistantType;
  conversationId?: string;
  onConversationCreated?: (id: string) => void;
  onSelectConversation?: (id: string | null) => void;
  initialContext?: Record<string, any>;
  headerTitle?: string;
  /** Render inside a container instead of covering the viewport */
  inline?: boolean;
  /** Custom back handler; defaults to navigate(-1) */
  onBack?: () => void;
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
  inline = false,
  onBack,
}: ChatWindowProps) {
  const navigate = useNavigate();
  const [conv, setConv] = useState<ModrekConversation | null>(null);
  const [messages, setMessages] = useState<ModrekMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [history, setHistory] = useState<ModrekConversation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<
    Array<{ id: string; kind: "image" | "file"; name: string; dataUrl: string }>
  >([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Daily AI quota applies to the study + exams assistants only (never support).
  const meteredAssistant = assistantType === "study" || assistantType === "exams";
  const { quota, refresh: refreshQuota } = useStudentAiQuota(meteredAssistant);
  const quotaExhausted = Boolean(quota && quota.plan === "free" && quota.remaining <= 0);
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);

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
  const placeholder = "اكتب سؤالك...";

  useEffect(() => {
    (async () => {
      if (conversationId) {
        // Skip reload if we already have this conversation loaded
        // (prevents wiping in-flight messages after first-message auto-create)
        if (conv?.id === conversationId) return;
        const c = await getConversation(conversationId);
        setConv(c);
        if (c) setMessages(await listMessages(c.id));
      } else if (conv) {
        // Explicit reset to new chat
        setConv(null);
        setMessages([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(file);
    });

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    for (const f of files.slice(0, 4)) {
      if (f.size > 8 * 1024 * 1024) { toast.error("الصورة كبيرة (>8MB)"); continue; }
      try {
        const dataUrl = await readFileAsDataUrl(f);
        setPendingAttachments((prev) => [...prev, { id: crypto.randomUUID(), kind: "image", name: f.name, dataUrl }]);
      } catch { toast.error("تعذر قراءة الصورة"); }
    }
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    for (const f of files.slice(0, 2)) {
      if (f.size > 15 * 1024 * 1024) { toast.error("الملف كبير (>15MB)"); continue; }
      try {
        const dataUrl = await readFileAsDataUrl(f);
        setPendingAttachments((prev) => [...prev, { id: crypto.randomUUID(), kind: "file", name: f.name, dataUrl }]);
      } catch { toast.error("تعذر قراءة الملف"); }
    }
  };

  const removeAttachment = (id: string) =>
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    const attachments = overrideText ? [] : pendingAttachments;
    if ((!text && attachments.length === 0) || sending) return;
    if (meteredAssistant && quotaExhausted) {
      setLimitDialogOpen(true);
      void refreshQuota();
      return;
    }
    let activeConvForError: ModrekConversation | null = conv;
    setSending(true);
    if (!overrideText) { setInput(""); setPendingAttachments([]); }

    try {
      let activeConv = conv;
      if (!activeConv) {
        const autoTitle = text ? (text.length > 40 ? text.slice(0, 40) + "…" : text) : "محادثة جديدة";
        activeConv = await createConversation({
          assistant_type: assistantType,
          title: initialContext?.title || autoTitle,
          context_json: initialContext || {},
        });
        setConv(activeConv);
        activeConvForError = activeConv;
        onConversationCreated?.(activeConv.id);
      }
      activeConvForError = activeConv;

      const parts: any[] = [];
      if (text) parts.push({ type: "text", text });
      for (const a of attachments) {
        if (a.kind === "image") parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
        else parts.push({ type: "file", file: { filename: a.name, file_data: a.dataUrl } });
      }

      const userMsg = await appendMessage(activeConv.id, { role: "user", parts });
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
          navigate((result as any).redirectTo || `/student/exams/${result.examId}/take${result.attemptId ? `?attempt=${result.attemptId}` : ""}`);
        }
      } else {
        const result = await callStudyAssistant({ messages: gwMessages, conversationContext: activeConv.context_json });
        const asstMsg = await appendMessage(activeConv.id, {
          role: "assistant",
          parts: [{ type: "text", text: result.reply }],
          metadata: result.diagram?.code ? { diagram: result.diagram } : {},
        });
        setMessages((prev) => [...prev, asstMsg]);
      }
    } catch (e: any) {
      console.error("[src/features/modrek-ai/ChatWindow.tsx:send] assistant request failed", {
        assistantType,
        publicMessage: e?.publicMessage || e?.message,
        technicalMessage: e?.technicalMessage,
        code: e?.code,
        traceId: e?.traceId,
        stack: e?.stack,
      });
      const raw = e?.publicMessage || e?.message || "حدث خطأ";
      const code = String(e?.code || e?.errorCode || "");
      const isQuota =
        e?.status === 429 ||
        /rate_limited|daily_limit|burst_limit|quota/i.test(code) ||
        (typeof raw === "string" && raw.includes("الحد اليومي"));
      if (meteredAssistant && isQuota) {
        setLimitDialogOpen(true);
        void refreshQuota();
        setSending(false);
        return;
      }
      const hasTraceInMessage = typeof raw === "string" && raw.includes("كود التتبع");
      const message = assistantType === "exams"
        ? `تعذر إنشاء الامتحان: ${raw}${e?.traceId && !hasTraceInMessage ? `\nكود التتبع: ${e.traceId}` : ""}`
        : raw;
      toast.error(message, { duration: 8000 });
      try {
        const cid = activeConvForError?.id || conv?.id;
        if (cid) {
          const asstMsg = await appendMessage(cid, {
            role: "assistant",
            parts: [{ type: "text", text: `⚠️ ${message}` }],
          });
          setMessages((prev) => [...prev, asstMsg]);
        }
      } catch { /* ignore */ }
    } finally {
      setSending(false);
      if (meteredAssistant) void refreshQuota();
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const showWelcome = useMemo(() => messages.length === 0 && !sending, [messages, sending]);

  return (
    <div
      className={inline ? "relative flex bg-background w-full h-full" : "fixed inset-0 z-50 flex bg-background"}
      dir="rtl"
      style={inline ? undefined : {
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
              onClick={() => (onBack ? onBack() : navigate(-1))}
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
            {meteredAssistant && (
              <>
                <button
                  type="button"
                  onClick={() => quota?.plan === "free" && setLimitDialogOpen(true)}
                  className="shrink-0"
                  aria-label="تفاصيل الاستخدام اليومي"
                >
                  <AiQuotaBadge quota={quota} />
                </button>
                <AiQuotaLimitDialog open={limitDialogOpen} onOpenChange={setLimitDialogOpen} quota={quota} />
              </>
            )}
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
            <div className="flex flex-col items-center pt-4 pb-6">
              <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-primary/20 mb-3 shadow-lg bg-primary/5">
                <img src={mascot} alt="" className="w-full h-full object-cover" />
              </div>
              <h2 className="text-lg font-bold mb-1">مرحبًا بك في Modrek AI</h2>
              <p className="text-sm text-muted-foreground mb-4 text-center max-w-xs">{welcomeText}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md px-2">
                {suggestions.slice(0, 4).map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s)}
                    className="text-xs px-4 py-2.5 rounded-full bg-gradient-to-r from-blue-50 to-purple-50 text-blue-700 hover:from-blue-100 hover:to-purple-100 transition-colors font-medium border border-blue-200/50 text-center"
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
                <div className="max-w-[92%] min-w-0 rounded-2xl rounded-tl-sm px-4 py-3 bg-white border border-slate-200 shadow-sm text-slate-900">
                  <RichMarkdown>{text}</RichMarkdown>
                  {(m.metadata as any)?.diagram?.code && (
                    <LessonDiagramCard diagram={(m.metadata as any).diagram} />
                  )}
                  {examId && (
                    <Button
                      size="sm"
                      onClick={() => navigate(`/student/exams/${examId}/take`)}
                      className="mt-2 gap-2 h-9 rounded-xl"
                    >
                      <GraduationCap className="h-4 w-4" /> بدء الامتحان
                    </Button>
                  )}
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
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {pendingAttachments.map((a) => (
                <div key={a.id} className="flex items-center gap-1.5 bg-muted rounded-full pl-2 pr-1 py-1 text-xs max-w-[200px]">
                  {a.kind === "image" ? <ImageIcon className="h-3.5 w-3.5 text-primary shrink-0" /> : <Paperclip className="h-3.5 w-3.5 text-primary shrink-0" />}
                  <span className="truncate">{a.name}</span>
                  <button type="button" onClick={() => removeAttachment(a.id)} className="p-0.5 rounded-full hover:bg-background/60" aria-label="حذف">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => { e.preventDefault(); void send(); }}
            className="flex items-end gap-2 bg-muted rounded-2xl p-1.5 focus-within:ring-2 focus-within:ring-primary/30 transition min-w-0"
          >
            <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImagePick} />
            <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={handleFilePick} />
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={sending}
              className="h-9 w-9 rounded-xl bg-background/80 hover:bg-background flex items-center justify-center shrink-0 disabled:opacity-40"
              aria-label="إرفاق صورة"
            >
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              className="h-9 w-9 rounded-xl bg-background/80 hover:bg-background flex items-center justify-center shrink-0 disabled:opacity-40"
              aria-label="إرفاق ملف PDF"
            >
              <Paperclip className="h-4 w-4 text-muted-foreground" />
            </button>
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
              disabled={(!input.trim() && pendingAttachments.length === 0) || sending}
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

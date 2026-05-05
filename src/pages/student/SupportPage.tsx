import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { invokeSupportAssistant } from "@/lib/supportAssistant";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import supportAgentImg from "@/assets/support-agent.png";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  ArrowRight, Send, Settings, X, Image as ImageIcon, Mic, MicOff, Loader2, Headphones, PhoneOff,
} from "lucide-react";
import { useSupportTyping } from "@/hooks/useSupportTyping";
import { SUPPORT_BUCKET, closeUserSupportConversation, createSupportClientId, fetchSupportMessagesForUser, hasActiveSupportSession, mapSupportRowsToUiMessages, markAdminSupportMessagesRead, mergeSupportMessages, signedSupportUrl, supportFilePath } from "@/lib/supportChat";

type UiMessage = {
  id: string;
  role: "user" | "assistant" | "support" | "escalate-confirm";
  content: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  createdAt: string;
};

type ChatHistoryEntry = {
  id: string; title: string; date: string; messageCount: number; messages: UiMessage[];
};

const quickSuggestions = [
  "كيف أشترك في مادة؟",
  "أين آخر إيداع لي؟",
  "كيف أغير كلمة السر؟",
  "ما آخر نشاط قمت به؟",
];

export default function StudentSupportPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistoryEntry[]>([]);
  const { otherTyping: adminTyping, sendTyping } = useSupportTyping(user?.id, "user");

  const firstName = useMemo(() => {
    const fullName = String(user?.user_metadata?.full_name || "").trim();
    return fullName.split(" ")[0] || "يا بطل";
  }, [user?.user_metadata?.full_name]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    const saved = localStorage.getItem(`student-support-history-${user?.id}`);
    if (saved) { try { setChatHistory(JSON.parse(saved)); } catch {} }
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;

    const hydrateSupportThread = async () => {
      try {
        const rows = await fetchSupportMessagesForUser(user.id);
        if (!rows.length) {
          setEscalated(false);
          return;
        }

        const supportUi = await mapSupportRowsToUiMessages(rows);
        setMessages((prev) => mergeSupportMessages(prev, supportUi));
        const stillActive = hasActiveSupportSession(rows);
        setEscalated(stillActive);
        await markAdminSupportMessagesRead(user.id);
      } catch (error) {
        console.error(error);
      }
    };

    void hydrateSupportThread();

    const channel = supabase
      .channel(`student-support-live-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `user_id=eq.${user.id}` }, async (payload) => {
        const row = payload.new as any;
        const signedUrl = row.file_url ? await signedSupportUrl(row.file_url) : null;
        const supportMsg: UiMessage = {
          id: `support-${row.id}`,
          role: row.is_from_admin ? "support" : "user",
          content: row.message,
          imageUrl: row.file_type === "image" ? signedUrl : null,
          audioUrl: row.file_type === "audio" ? signedUrl : null,
          createdAt: row.created_at,
        };
        const clientId = row.metadata?.client_id ? `local-support-${row.metadata.client_id}` : null;

        setMessages((prev) => {
          if (prev.some((m) => m.id === supportMsg.id)) return prev;
          const next = prev.filter((m) => m.id !== clientId);
          const withoutConfirm = row.is_resolved ? next.filter((m) => m.role !== "escalate-confirm") : next;
          return [...withoutConfirm, supportMsg];
        });

        setEscalated(!row.is_resolved);
        if (row.is_from_admin) {
          await supabase.from("support_messages").update({ is_read: true }).eq("id", row.id);
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, async (payload) => {
        const row = payload.new as any;
        if (row.notification_type === "support") {
          await hydrateSupportThread();
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_messages", filter: `user_id=eq.${user.id}` }, async () => {
        await hydrateSupportThread();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const saveCurrentChat = useCallback(() => {
    if (messages.length < 2) return;
    const userMsgs = messages.filter(m => m.role === "user");
    const title = userMsgs[0]?.content?.slice(0, 40) || "محادثة جديدة";
    const newEntry: ChatHistoryEntry = { id: Date.now().toString(), title, date: new Date().toISOString(), messageCount: messages.length, messages };
    const updated = [newEntry, ...chatHistory].slice(0, 20);
    setChatHistory(updated);
    localStorage.setItem(`student-support-history-${user?.id}`, JSON.stringify(updated));
  }, [messages, chatHistory, user?.id]);

  const loadChat = (chat: ChatHistoryEntry) => { setMessages(chat.messages); setEscalated(false); setSidebarOpen(false); };
  const startNewChat = () => { if (messages.length >= 2) saveCurrentChat(); setMessages([]); setEscalated(false); setInput(""); setSidebarOpen(false); };

  const appendMessage = useCallback((msg: UiMessage) => setMessages(p => [...p, msg]), []);

  const buildConversationPayload = useCallback(
    (next: { text: string; imageUrl?: string | null }) => {
      const history = messages.filter(m => m.role !== "support" && m.role !== "escalate-confirm")
        .map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));
      if (next.imageUrl) {
        return [...history, { role: "user", content: [{ type: "text", text: next.text }, { type: "image_url", image_url: { url: next.imageUrl } }] }];
      }
      return [...history, { role: "user", content: next.text }];
    }, [messages]
  );

  const buildProblemSummary = () => {
    return messages.filter(m => m.role === "user").map(m => m.content).slice(-3).join("\n").slice(0, 300);
  };

  const confirmEscalation = async () => {
    if (!user) return;
    setEscalated(true);
    setMessages(prev => prev.filter(m => m.role !== "escalate-confirm"));

    const { data: profile } = await supabase.from("profiles").select("full_name, student_code").eq("id", user.id).maybeSingle();
    const summary = buildProblemSummary();
    const escalationMsg = `📋 تحويل من المساعد الذكي\n\n👤 الاسم: ${profile?.full_name || "غير معروف"}\n🆔 كود الطالب: ${profile?.student_code || "غير متاح"}\n\n📝 وصف المشكلة:\n${summary}`;

    await supabase.from("support_messages").insert({
      user_id: user.id, message: escalationMsg, is_from_admin: false, is_teacher_request: false, metadata: { source: "ai-escalation", client_id: createSupportClientId("student-escalation") }
    });

    appendMessage({ id: `escalated-${Date.now()}`, role: "support", content: "✅ تم تحويلك لموظف الدعم بنجاح.\n\nسيتم الرد عليك قريباً. يمكنك متابعة المحادثة من هنا.", createdAt: new Date().toISOString() });
  };

  const rejectEscalation = () => {
    setMessages(prev => prev.filter(m => m.role !== "escalate-confirm"));
    appendMessage({ id: `reject-${Date.now()}`, role: "assistant", content: "تمام! أنا هنا لمساعدتك. اسألني أي سؤال تاني 😊", createdAt: new Date().toISOString() });
  };

  const streamAssistantReply = useCallback(
    async (payloadMessages: Array<{ role: string; content: unknown }>, fallbackText?: string) => {
      if (!user) return;
      setLoading(true);
      try {
        const assistantContent = await invokeSupportAssistant({ messages: payloadMessages });
        const shouldEscalate = assistantContent.includes("[ESCALATE_TO_SUPPORT]");
        const cleaned = assistantContent.replace("[ESCALATE_TO_SUPPORT]", "").trim();

        if (shouldEscalate) {
          if (cleaned) appendMessage({ id: `ai-${Date.now()}`, role: "assistant", content: cleaned, createdAt: new Date().toISOString() });
          // Show confirmation instead of auto-escalating
          appendMessage({ id: `confirm-${Date.now()}`, role: "escalate-confirm", content: "", createdAt: new Date().toISOString() });
          return;
        }
        appendMessage({ id: `assistant-${Date.now()}`, role: "assistant", content: cleaned, createdAt: new Date().toISOString() });
      } catch (error: any) {
        console.error(error);
        toast.error(error?.message || "تعذر الوصول للمساعد الآن");
        appendMessage({ id: `err-${Date.now()}`, role: "assistant", content: "تعذر الرد الآن، حاول مرة أخرى بعد قليل.", createdAt: new Date().toISOString() });
      } finally {
        setLoading(false);
      }
    }, [appendMessage, user]
  );

  const sendTextMessage = useCallback(async () => {
    if (!input.trim() || !user || loading) return;
    const text = input.trim();
    setInput("");

    if (escalated) {
      try {
        const clientId = createSupportClientId("student-text");
        appendMessage({ id: `local-support-${clientId}`, role: "user", content: text, createdAt: new Date().toISOString() });
        await supabase.from("support_messages").insert({ user_id: user.id, message: text, is_from_admin: false, is_teacher_request: false, metadata: { source: "human-support", client_id: clientId } });
      } catch (e: any) { toast.error(e?.message || "تعذر إرسال الرسالة"); }
      return;
    }

    appendMessage({ id: `user-${Date.now()}`, role: "user", content: text, createdAt: new Date().toISOString() });

    await streamAssistantReply(buildConversationPayload({ text }), text);
  }, [appendMessage, buildConversationPayload, escalated, input, loading, streamAssistantReply, user]);

  const uploadAttachment = useCallback(
    async (file: File, type: "image" | "audio") => {
      if (!user) return;
      setUploading(true);
      try {
        const path = supportFilePath(user.id, file.name, "student");
        const { error: uploadError } = await supabase.storage.from(SUPPORT_BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (uploadError) throw uploadError;
        const signedUrl = await signedSupportUrl(path);
        const text = type === "image" ? "أرفقت صورة للمشكلة" : "أرفقت تسجيلًا صوتيًا";

        if (escalated) {
          const clientId = createSupportClientId(`student-${type}`);
          appendMessage({ id: `local-support-${clientId}`, role: "user", content: text, imageUrl: type === "image" ? signedUrl : null, audioUrl: type === "audio" ? signedUrl : null, createdAt: new Date().toISOString() });
          await supabase.from("support_messages").insert({ user_id: user.id, message: text, is_from_admin: false, is_teacher_request: false, file_url: path, file_type: type, metadata: { source: "human-support", client_id: clientId } });
          return;
        }
        appendMessage({ id: `ua-${Date.now()}`, role: "user", content: text, imageUrl: type === "image" ? signedUrl : null, audioUrl: type === "audio" ? signedUrl : null, createdAt: new Date().toISOString() });
        if (type === "image") {
          await streamAssistantReply(buildConversationPayload({ text, imageUrl: signedUrl }), text);
          return;
        }
        appendMessage({ id: `aa-${Date.now()}`, role: "assistant", content: "استلمت التسجيل 🎙️ أرسل صورة أو اكتب وصفًا وسأكمل معك.", createdAt: new Date().toISOString() });
      } catch (e: any) { console.error(e); toast.error(e?.message || "فشل رفع المرفق"); } finally { setUploading(false); }
    }, [appendMessage, buildConversationPayload, escalated, streamAssistantReply, user]
  );

  const onChooseFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("صورة فقط"); return; }
    await uploadAttachment(file, "image");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [uploadAttachment]);

  const toggleRecording = useCallback(async () => {
    if (isRecording) { mediaRecorderRef.current?.stop(); setIsRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        await uploadAttachment(new File([blob], `record-${Date.now()}.webm`, { type: mimeType }), "audio");
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch { toast.error("تعذر الوصول للميكروفون"); }
  }, [isRecording, uploadAttachment]);

  const hasEscalateConfirm = messages.some(m => m.role === "escalate-confirm");

  const handleCloseSupportChat = useCallback(async () => {
    if (!user) return;
    try {
      await closeUserSupportConversation(user.id, false);
      setEscalated(false);
      setShowCloseDialog(false);
      setMessages((prev) => [...prev.filter((m) => !m.id.startsWith("support-closed-banner")), {
        id: `support-closed-banner-${Date.now()}`,
        role: "assistant",
        content: "تم إنهاء المحادثة مع الدعم. يمكنك متابعة الحديث مع المساعد الذكي أو بدء طلب جديد لاحقاً.",
        createdAt: new Date().toISOString(),
      }]);
    } catch (error: any) {
      toast.error(error?.message || "تعذر إنهاء المحادثة");
    }
  }, [user]);

  return (
    <div className="fixed inset-0 z-50 flex bg-background" dir="rtl">
      {/* Sidebar */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
          <div className="fixed top-0 right-0 h-full w-72 z-50 flex flex-col bg-card border-l border-border shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-sm font-bold">السجلات</h2>
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-accent transition-colors"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-3">
              <Button onClick={startNewChat} className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0 text-sm">محادثة جديدة</Button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 space-y-1">
              {chatHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">لا توجد سجلات بعد</p>
              ) : chatHistory.map((chat) => (
                <button key={chat.id} onClick={() => loadChat(chat)} className="w-full text-right p-3 rounded-xl hover:bg-accent transition-colors">
                  <p className="text-xs font-medium truncate">{chat.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(chat.date).toLocaleDateString("ar-EG")} • {chat.messageCount} رسالة</p>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between h-14 px-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => { if (messages.length >= 2) saveCurrentChat(); navigate(-1); }} className="p-2 rounded-lg hover:bg-accent transition-colors">
              <ArrowRight className="h-5 w-5" />
            </button>
            <div className="h-9 w-9 rounded-full overflow-hidden border-2 border-blue-200">
              <img src={supportAgentImg} alt="" className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="text-sm font-bold">{escalated ? "موظف الدعم" : "المساعد الذكي"}</p>
              <p className="text-[10px] text-green-500 font-medium">{escalated && adminTyping ? "يكتب الآن..." : "متصل الآن"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {escalated && (
              <button onClick={() => setShowCloseDialog(true)} className="h-9 rounded-xl px-3 bg-destructive/10 text-destructive text-xs font-bold flex items-center gap-1.5">
                <PhoneOff className="h-3.5 w-3.5" /> إنهاء الشات
              </button>
            )}
            <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-accent transition-colors">
              <Settings className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full py-12">
              <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-blue-100 mb-4 shadow-lg">
                <img src={supportAgentImg} alt="" className="w-full h-full object-cover" />
              </div>
              <h2 className="text-lg font-bold mb-1">أهلاً {firstName}! أنا مساعدك الشخصي 😊</h2>
              <p className="text-sm text-muted-foreground mb-6 text-center max-w-xs">أعرف كل شيء عن حسابك واشتراكاتك ورصيدك. اسألني أي سؤال!</p>
              <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                {quickSuggestions.map((s, i) => (
                  <button key={i} onClick={() => setInput(s)}
                    className="text-xs px-4 py-2 rounded-full bg-gradient-to-r from-blue-50 to-purple-50 text-blue-700 hover:from-blue-100 hover:to-purple-100 transition-colors font-medium border border-blue-200/50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg) => {
            if (msg.role === "escalate-confirm") {
              return (
                <div key={msg.id} className="flex justify-end gap-2">
                  <div className="max-w-[85%] rounded-2xl p-4 bg-amber-50 border border-amber-200 space-y-3">
                    <p className="text-sm font-bold text-amber-800">هل تريد التحدث مع ممثلي خدمة العملاء؟</p>
                    <p className="text-xs text-amber-600">سيتم تحويلك لموظف دعم بشري لمساعدتك</p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={confirmEscalation} className="flex-1 h-9 text-xs rounded-xl bg-blue-500 hover:bg-blue-600 gap-1.5">
                        <Headphones className="h-3.5 w-3.5" /> نعم، حوّلني
                      </Button>
                      <Button size="sm" variant="outline" onClick={rejectEscalation} className="flex-1 h-9 text-xs rounded-xl">
                        لا، شكراً
                      </Button>
                    </div>
                  </div>
                </div>
              );
            }
            const isUser = msg.role === "user";
            const isSupport = msg.role === "support";
            return (
              <div key={msg.id} className={`flex ${isUser ? "justify-start" : "justify-end"} gap-2`}>
                {!isUser && (
                  <div className="h-7 w-7 rounded-full overflow-hidden shrink-0 mt-1 border border-blue-200">
                    <img src={supportAgentImg} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  isUser ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-tr-sm"
                    : isSupport ? "bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200/50 text-foreground rounded-tl-sm"
                    : "bg-muted text-foreground rounded-tl-sm"
                }`}>
                  {msg.imageUrl && <img src={msg.imageUrl} alt="مرفق" className="mb-3 max-h-56 w-full rounded-xl object-contain" />}
                  {msg.audioUrl && <audio controls src={msg.audioUrl} className="mb-3 w-full" />}
                  {isUser ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none [&>p]:m-0 [&>ul]:my-1 [&>ol]:my-1">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="flex justify-end gap-2">
              <div className="h-7 w-7 rounded-full overflow-hidden shrink-0 mt-1 border border-blue-200">
                <img src={supportAgentImg} alt="" className="w-full h-full object-cover" />
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
        <div className="px-4 py-3 border-t border-border bg-card shrink-0">
          <form onSubmit={(e) => { e.preventDefault(); void sendTextMessage(); }} className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onChooseFile} />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading || loading || hasEscalateConfirm}
              className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center hover:bg-accent/80 transition-colors shrink-0">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <ImageIcon className="h-4 w-4 text-muted-foreground" />}
            </button>
            <button type="button" onClick={toggleRecording} disabled={uploading || loading || hasEscalateConfirm}
              className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${isRecording ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-accent hover:bg-accent/80"}`}>
              {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4 text-muted-foreground" />}
            </button>
            <input value={input} onChange={(e) => { setInput(e.target.value); if (escalated) sendTyping(); }}
              placeholder={escalated ? "رسالتك لموظف الدعم..." : "اكتب سؤالك..."}
              className="flex-1 text-sm bg-muted rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-muted-foreground"
              disabled={loading || hasEscalateConfirm} />
            <Button type="submit" size="icon" disabled={!input.trim() || loading || hasEscalateConfirm}
              className="h-10 w-10 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 shrink-0 border-0">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>

      <AlertDialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <AlertDialogContent dir="rtl" className="max-w-[22rem] rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>إنهاء المحادثة مع الدعم؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إنهاء هذه المحادثة والعودة للمساعد الذكي، ويمكنك التواصل مع الدعم مرة أخرى في أي وقت.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogCancel className="rounded-2xl">إلغاء</AlertDialogCancel>
            <AlertDialogAction className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void handleCloseSupportChat()}>
              تأكيد الإنهاء
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

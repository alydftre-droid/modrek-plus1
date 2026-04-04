import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { invokeSupportAssistant } from "@/lib/supportAssistant";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import supportAgentImg from "@/assets/support-agent.png";
import {
  ArrowRight,
  Send,
  Settings,
  X,
  Image as ImageIcon,
  Mic,
  MicOff,
  Loader2,
} from "lucide-react";

type UiMessage = {
  id: string;
  role: "user" | "assistant" | "support";
  content: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  createdAt: string;
};

type ChatHistoryEntry = {
  id: string;
  title: string;
  date: string;
  messageCount: number;
  messages: UiMessage[];
};

const quickSuggestions = [
  "كيف أشترك في مادة؟",
  "أين آخر إيداع لي؟",
  "كيف أغير كلمة السر؟",
  "ما آخر نشاط قمت به؟",
  "حوّلني للدعم",
];

const SUPPORT_BUCKET = "support-uploads";

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/_+/g, "_");
}

function supportFilePath(userId: string, fileName: string) {
  return `${userId}/${Date.now()}_${sanitizeFileName(fileName)}`;
}

async function signedSupportUrl(filePath: string) {
  const { data, error } = await supabase.storage.from(SUPPORT_BUCKET).createSignedUrl(filePath, 60 * 60 * 24);
  if (error || !data?.signedUrl) throw error || new Error("تعذر إنشاء رابط الملف");
  return data.signedUrl;
}

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
  const [chatHistory, setChatHistory] = useState<ChatHistoryEntry[]>([]);

  const firstName = useMemo(() => {
    const fullName = String(user?.user_metadata?.full_name || "").trim();
    return fullName.split(" ")[0] || "يا بطل";
  }, [user?.user_metadata?.full_name]);

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  // Load chat history
  useEffect(() => {
    const saved = localStorage.getItem(`student-support-history-${user?.id}`);
    if (saved) {
      try { setChatHistory(JSON.parse(saved)); } catch {}
    }
  }, [user?.id]);

  const saveCurrentChat = useCallback(() => {
    if (messages.length < 2) return;
    const userMsgs = messages.filter(m => m.role === "user");
    const title = userMsgs[0]?.content?.slice(0, 40) || "محادثة جديدة";
    const newEntry: ChatHistoryEntry = {
      id: Date.now().toString(),
      title,
      date: new Date().toISOString(),
      messageCount: messages.length,
      messages,
    };
    const updated = [newEntry, ...chatHistory].slice(0, 20);
    setChatHistory(updated);
    localStorage.setItem(`student-support-history-${user?.id}`, JSON.stringify(updated));
  }, [messages, chatHistory, user?.id]);

  const loadChat = (chat: ChatHistoryEntry) => {
    setMessages(chat.messages);
    setEscalated(false);
    setSidebarOpen(false);
  };

  const startNewChat = () => {
    if (messages.length >= 2) saveCurrentChat();
    setMessages([]);
    setEscalated(false);
    setInput("");
    setSidebarOpen(false);
  };

  const appendMessage = useCallback((msg: UiMessage) => setMessages(p => [...p, msg]), []);

  const buildConversationPayload = useCallback(
    (next: { text: string; imageUrl?: string | null }) => {
      const history = messages
        .filter(m => m.role !== "support")
        .map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));
      if (next.imageUrl) {
        return [...history, { role: "user", content: [{ type: "text", text: next.text }, { type: "image_url", image_url: { url: next.imageUrl } }] }];
      }
      return [...history, { role: "user", content: next.text }];
    },
    [messages]
  );

  const streamAssistantReply = useCallback(
    async (payloadMessages: Array<{ role: string; content: unknown }>, fallbackText?: string, attachment?: { imageUrl?: string | null; audioUrl?: string | null }) => {
      if (!user) return;
      setLoading(true);
      try {
        const assistantContent = await invokeSupportAssistant({ messages: payloadMessages });
        const shouldEscalate = assistantContent.includes("[ESCALATE_TO_SUPPORT]");
        const cleaned = assistantContent.replace("[ESCALATE_TO_SUPPORT]", "").trim();

        if (shouldEscalate) {
          setEscalated(true);
          appendMessage({ id: `support-${Date.now()}`, role: "support", content: `${cleaned || "تم تحويلك للدعم البشري."}\n\n✅ تم تحويلك الآن إلى موظف دعم.`, createdAt: new Date().toISOString() });
          await supabase.from("support_messages").insert({ user_id: user.id, message: `[تحويل من المساعد]\n${fallbackText || ""}`, is_from_admin: false, file_url: attachment?.imageUrl || attachment?.audioUrl || null, file_type: attachment?.imageUrl ? "image" : attachment?.audioUrl ? "audio" : null, metadata: { source: "ai-escalation" } });
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
    },
    [appendMessage, user]
  );

  const sendTextMessage = useCallback(async () => {
    if (!input.trim() || !user || loading) return;
    const text = input.trim();
    setInput("");
    appendMessage({ id: `user-${Date.now()}`, role: "user", content: text, createdAt: new Date().toISOString() });

    if (escalated) {
      try {
        await supabase.from("support_messages").insert({ user_id: user.id, message: text, is_from_admin: false, metadata: { source: "human-support" } });
        appendMessage({ id: `sw-${Date.now()}`, role: "support", content: "تم إرسال رسالتك لموظف الدعم.", createdAt: new Date().toISOString() });
      } catch (e: any) { toast.error(e?.message || "تعذر إرسال الرسالة"); }
      return;
    }

    await streamAssistantReply(buildConversationPayload({ text }), text);
  }, [appendMessage, buildConversationPayload, escalated, input, loading, streamAssistantReply, user]);

  const uploadAttachment = useCallback(
    async (file: File, type: "image" | "audio") => {
      if (!user) return;
      setUploading(true);
      try {
        const path = supportFilePath(user.id, file.name);
        const { error: uploadError } = await supabase.storage.from(SUPPORT_BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (uploadError) throw uploadError;
        const signedUrl = await signedSupportUrl(path);
        const text = type === "image" ? "أرفقت صورة للمشكلة" : "أرفقت تسجيلًا صوتيًا";
        appendMessage({ id: `ua-${Date.now()}`, role: "user", content: text, imageUrl: type === "image" ? signedUrl : null, audioUrl: type === "audio" ? signedUrl : null, createdAt: new Date().toISOString() });

        if (escalated) {
          await supabase.from("support_messages").insert({ user_id: user.id, message: text, is_from_admin: false, file_url: path, file_type: type, metadata: { source: "human-support" } });
          appendMessage({ id: `sc-${Date.now()}`, role: "support", content: "وصل المرفق لموظف الدعم.", createdAt: new Date().toISOString() });
          return;
        }

        if (type === "image") {
          await streamAssistantReply(buildConversationPayload({ text, imageUrl: signedUrl }), text, { imageUrl: path });
          return;
        }
        appendMessage({ id: `aa-${Date.now()}`, role: "assistant", content: "استلمت التسجيل 🎙️ أرسل صورة أو اكتب وصفًا وسأكمل معك.", createdAt: new Date().toISOString() });
      } catch (e: any) { console.error(e); toast.error(e?.message || "فشل رفع المرفق"); } finally { setUploading(false); }
    },
    [appendMessage, buildConversationPayload, escalated, streamAssistantReply, user]
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

  return (
    <div className="fixed inset-0 z-50 flex bg-background" dir="rtl">
      {/* Sidebar */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
          <div className="fixed top-0 right-0 h-full w-72 z-50 flex flex-col bg-card border-l border-border shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-sm font-bold">السجلات</h2>
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3">
              <Button onClick={startNewChat} className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0 text-sm">
                محادثة جديدة
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 space-y-1">
              {chatHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">لا توجد سجلات بعد</p>
              ) : (
                chatHistory.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => loadChat(chat)}
                    className="w-full text-right p-3 rounded-xl hover:bg-accent transition-colors"
                  >
                    <p className="text-xs font-medium truncate">{chat.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(chat.date).toLocaleDateString("ar-EG")} • {chat.messageCount} رسالة
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between h-14 px-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => { if (messages.length >= 2) saveCurrentChat(); navigate(-1); }}
              className="p-2 rounded-lg hover:bg-accent transition-colors">
              <ArrowRight className="h-5 w-5" />
            </button>
            <div className="h-9 w-9 rounded-full overflow-hidden border-2 border-blue-200">
              <img src={supportAgentImg} alt="" className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="text-sm font-bold">{escalated ? "موظف الدعم" : "المساعد الذكي"}</p>
              <p className="text-[10px] text-green-500 font-medium">متصل الآن</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-accent transition-colors">
            <Settings className="h-5 w-5 text-muted-foreground" />
          </button>
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
                  <button key={i} onClick={() => { setInput(s); }}
                    className="text-xs px-4 py-2 rounded-full bg-gradient-to-r from-blue-50 to-purple-50 text-blue-700 hover:from-blue-100 hover:to-purple-100 transition-colors font-medium border border-blue-200/50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg) => {
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
                  isUser
                    ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-tr-sm"
                    : isSupport
                      ? "bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200/50 text-foreground rounded-tl-sm"
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onChooseFile}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || loading}
              className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center hover:bg-accent/80 transition-colors shrink-0"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <ImageIcon className="h-4 w-4 text-muted-foreground" />}
            </button>
            <button
              type="button"
              onClick={toggleRecording}
              disabled={uploading || loading}
              className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                isRecording ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-accent hover:bg-accent/80"
              }`}
            >
              {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4 text-muted-foreground" />}
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={escalated ? "رسالتك لموظف الدعم..." : "اكتب سؤالك..."}
              className="flex-1 text-sm bg-muted rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/30 placeholder:text-muted-foreground"
              disabled={loading}
            />
            <Button type="submit" size="icon" disabled={!input.trim() || loading}
              className="h-10 w-10 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 shrink-0 border-0">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

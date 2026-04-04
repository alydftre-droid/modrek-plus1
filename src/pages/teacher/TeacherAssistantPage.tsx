import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowRight, Send, Settings, X, Image } from "lucide-react";
import ReactMarkdown from "react-markdown";
import supportAgentImg from "@/assets/support-agent.png";

type Msg = { role: "user" | "assistant"; content: string; timestamp: Date };

const quickSuggestions = [
  "كم عدد طلابي؟",
  "كم أرباحي هذا الشهر؟",
  "حالة طلبات السحب",
  "كيف أرفع محتوى؟",
  "عرّفني على المحفظة",
];

export default function TeacherAssistantPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ id: string; title: string; date: Date; messages: Msg[] }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  // Load chat history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`teacher-assistant-history-${user?.id}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setChatHistory(parsed.map((c: any) => ({ ...c, date: new Date(c.date), messages: c.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })) })));
      } catch {}
    }
  }, [user?.id]);

  const saveCurrentChat = () => {
    if (messages.length < 2) return;
    const title = messages[0]?.content?.slice(0, 40) || "محادثة جديدة";
    const newEntry = { id: Date.now().toString(), title, date: new Date(), messages };
    const updated = [newEntry, ...chatHistory].slice(0, 20);
    setChatHistory(updated);
    localStorage.setItem(`teacher-assistant-history-${user?.id}`, JSON.stringify(updated));
  };

  const loadChat = (chat: typeof chatHistory[0]) => {
    setMessages(chat.messages);
    setSidebarOpen(false);
  };

  const startNewChat = () => {
    if (messages.length >= 2) saveCurrentChat();
    setMessages([]);
    setInput("");
    setSidebarOpen(false);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading || !user) return;
    const userMsg: Msg = { role: "user", content: text.trim(), timestamp: new Date() };
    const allMsgs = [...messages, userMsg];
    setMessages(allMsgs);
    setInput("");
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("teacher-assistant", {
        body: { messages: allMsgs.slice(-12).map(m => ({ role: m.role, content: m.content })) },
      });

      if (error) throw error;
      const content = typeof data?.content === "string" ? data.content.trim() : "";
      setMessages([...allMsgs, { role: "assistant", content: content || "تعذر الرد، حاول مرة أخرى.", timestamp: new Date() }]);
    } catch {
      setMessages([...allMsgs, { role: "assistant", content: "عذراً، حدث خطأ. حاول مرة أخرى.", timestamp: new Date() }]);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const ext = file.name.split(".").pop();
    const path = `teacher-assistant/${user.id}/${Date.now()}.${ext}`;

    const { data: uploadData, error } = await supabase.storage.from("teacher-uploads").upload(path, file);
    if (error) {
      sendMessage("أريد إرسال صورة لكن حدث خطأ في الرفع");
      return;
    }

    const { data: urlData } = supabase.storage.from("teacher-uploads").getPublicUrl(path);
    sendMessage(`أرسلت لك صورة: ${urlData.publicUrl}`);
  };

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
                    className="w-full text-right p-3 rounded-xl hover:bg-accent transition-colors group"
                  >
                    <p className="text-xs font-medium truncate">{chat.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {chat.date.toLocaleDateString("ar-EG")} • {chat.messages.length} رسالة
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
              <p className="text-sm font-bold">المساعد الذكي</p>
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
              <h2 className="text-lg font-bold mb-1">أهلاً بك! أنا مساعدك الشخصي 😊</h2>
              <p className="text-sm text-muted-foreground mb-6 text-center max-w-xs">أعرف كل شيء عن حسابك وطلابك وأرباحك. اسألني أي سؤال!</p>
              <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                {quickSuggestions.map((s, i) => (
                  <button key={i} onClick={() => sendMessage(s)}
                    className="text-xs px-4 py-2 rounded-full bg-gradient-to-r from-blue-50 to-purple-50 text-blue-700 hover:from-blue-100 hover:to-purple-100 transition-colors font-medium border border-blue-200/50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"} gap-2`}>
              {m.role === "assistant" && (
                <div className="h-7 w-7 rounded-full overflow-hidden shrink-0 mt-1 border border-blue-200">
                  <img src={supportAgentImg} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-tr-sm"
                  : "bg-muted text-foreground rounded-tl-sm"
              }`}>
                {m.role === "assistant" ? (
                  <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none [&>p]:m-0 [&>ul]:my-1 [&>ol]:my-1">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : m.content}
              </div>
            </div>
          ))}
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
          <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center hover:bg-accent/80 transition-colors shrink-0"
            >
              <Image className="h-4 w-4 text-muted-foreground" />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="اكتب سؤالك..."
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

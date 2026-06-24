 import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { streamEdgeFunction } from "@/lib/aiStream";
import { clearDraftValue, loadDraftValue, saveDraftValue } from "@/lib/mobileRuntime";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { 
  Send, 
  Settings, 
  Plus, 
  MessageSquare, 
  Trash2, 
  ArrowRight,
  Bot,
  User,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

type Message = { role: "user" | "assistant"; content: string };
type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export default function AiChat() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [providerMeta, setProviderMeta] = useState<{ provider?: string; model?: string | null; fallback?: boolean } | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);
  const draftKey = `ai-chat-draft-${currentConversationId || "new"}`;

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    setInput(loadDraftValue(draftKey));
  }, [draftKey]);

  useEffect(() => {
    saveDraftValue(draftKey, input);
  }, [draftKey, input]);

  useEffect(() => {
    if (!user) return;
    const loadConversations = async () => {
      const { data } = await supabase
        .from("ai_conversations")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      setConversations(data || []);
    };
    loadConversations();
  }, [user]);

  useEffect(() => {
    if (!currentConversationId) { setMessages([]); return; }
    const loadMessages = async () => {
      const { data } = await supabase
        .from("ai_messages")
        .select("*")
        .eq("conversation_id", currentConversationId)
        .order("created_at", { ascending: true });
      setMessages(data?.map(m => ({ role: m.role as "user" | "assistant", content: m.content })) || []);
    };
    loadMessages();
  }, [currentConversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const createNewConversation = async () => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("ai_conversations")
      .insert({ user_id: user.id, title: "محادثة جديدة" })
      .select()
      .single();
    if (error) { toast.error("فشل إنشاء محادثة جديدة"); return null; }
    setConversations(prev => [data, ...prev]);
    return data.id;
  };

  const startNewChat = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setSidebarOpen(false);
    inputRef.current?.focus();
  };

  const selectConversation = (id: string) => {
    setCurrentConversationId(id);
    setSidebarOpen(false);
  };

  const deleteConversation = async (id: string) => {
    await supabase.from("ai_conversations").delete().eq("id", id);
    setConversations(prev => prev.filter(c => c.id !== id));
    if (currentConversationId === id) { setCurrentConversationId(null); setMessages([]); }
    toast.success("تم حذف المحادثة");
  };

  const updateConversationTitle = async (id: string, firstMessage: string) => {
    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? "..." : "");
    await supabase.from("ai_conversations").update({ title }).eq("id", id);
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title } : c));
  };

  const handleSend = async () => {
    // قراءة القيمة الحالية من DOM لتجاوز مشكلة IME على Android (آخر كلمة بدون مسافة)
    const liveValue = inputRef.current?.value ?? input;
    const trimmed = liveValue.trim();
    if (!trimmed || isLoading) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setIsLoading(true);
    let convId = currentConversationId;
    if (!convId) {
      convId = await createNewConversation();
      if (!convId) { setIsLoading(false); return; }
      setCurrentConversationId(convId);
    }
    const userMessage: Message = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    await supabase.from("ai_messages").insert({ conversation_id: convId, role: "user", content: trimmed });
    if (messages.length === 0) updateConversationTitle(convId, trimmed);
    try {
      let aggregate = "";
      const result = await streamEdgeFunction("ai-chat", {
        messages: nextMessages.slice(-16),
      }, {
        onDelta: (_delta, full) => {
          aggregate = full;
          setMessages((prev) => {
            const assistantMessage: Message = { role: "assistant", content: full };
            const last = prev[prev.length - 1];
            return last?.role === "assistant" ? [...prev.slice(0, -1), assistantMessage] : [...prev, assistantMessage];
          });
        },
      });
      setProviderMeta({ provider: result.provider, model: result.model, fallback: result.fallback });
      const aiText = (result.content || aggregate).trim();
      const assistantMessage: Message = { role: "assistant", content: aiText || "عذراً، لم أتمكن من الرد." };
      setMessages(prev => prev[prev.length - 1]?.role === "assistant" ? [...prev.slice(0, -1), assistantMessage] : [...prev, assistantMessage]);
      await supabase.from("ai_messages").insert({ conversation_id: convId, role: "assistant", content: assistantMessage.content });
      await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
      clearDraftValue(draftKey);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "حدث خطأ غير متوقع";
      setMessages(prev => [...prev, { role: "assistant", content: `⚠️ ${errorMsg}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(45, 30%, 97%)" }}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: "hsl(45, 30%, 97%)" }} dir="rtl">
      {/* Header */}
      <header className="bg-card border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80 p-0">
              <SheetHeader className="p-4 border-b">
                <SheetTitle className="text-right">المحادثات</SheetTitle>
              </SheetHeader>
              <div className="p-4">
                <Button onClick={startNewChat} className="w-full gap-2" variant="outline">
                  <Plus className="h-4 w-4" />
                  محادثة جديدة
                </Button>
              </div>
              <Separator />
              <ScrollArea className="h-[calc((var(--app-vh,1vh)*100)-180px)]">
                <div className="p-2 space-y-1">
                  {conversations.length === 0 ? (
                    <p className="text-center text-muted-foreground text-sm py-8">لا توجد محادثات سابقة</p>
                  ) : (
                    conversations.map((conv) => (
                      <div
                        key={conv.id}
                        className={`group flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-colors ${
                          currentConversationId === conv.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                        }`}
                        onClick={() => selectConversation(conv.id)}
                      >
                        <MessageSquare className="h-4 w-4 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{conv.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(conv.updated_at), "d MMM yyyy", { locale: ar })}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100"
                          onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-lg font-bold">المساعد الذكي</h1>
              {providerMeta?.provider && (
                <p className="text-[11px] text-muted-foreground">
                  {providerMeta.provider === "gemini" ? "Gemini" : "Fallback"}
                  {providerMeta.model ? ` • ${providerMeta.model}` : ""}
                </p>
              )}
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowRight className="h-5 w-5" />
        </Button>
      </header>

      {/* Chat Area */}
      <ScrollArea className="flex-1 px-4">
        <div className="max-w-3xl mx-auto py-6 space-y-6">
          {messages.length === 0 ? (
            <div className="text-center py-20">
              <Bot className="h-16 w-16 mx-auto text-primary/50 mb-4" />
              <h2 className="text-xl font-semibold mb-2">مرحباً! أنا المساعد الذكي</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                يمكنني مساعدتك في أي سؤال تعليمي أو عام. اكتب سؤالك وسأجيبك فوراً!
              </p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}>
                  {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted rounded-tl-sm"
                }`}>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex gap-3">
              <div className="shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <Bot className="h-4 w-4" />
              </div>
              <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area - ChatGPT-style multi-line auto-grow */}
      <div className="bg-card border-t border-border p-3 shrink-0" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="max-w-3xl mx-auto flex items-end gap-2 bg-background border-2 border-border rounded-2xl p-2 focus-within:border-primary transition-colors"
        >
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              const el = e.target as HTMLTextAreaElement;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 200) + "px";
            }}
            onCompositionStart={() => { isComposingRef.current = true; }}
            onCompositionEnd={(e) => {
              isComposingRef.current = false;
              setInput((e.target as HTMLTextAreaElement).value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !isComposingRef.current) {
                e.preventDefault();
                handleSend();
              }
            }}
            onBlur={(e) => {
              // مزامنة قسرية لتجاوز سلوك Android IME
              const v = e.target.value;
              if (v !== input) setInput(v);
            }}
            rows={1}
            placeholder="اكتب سؤالك هنا... (Shift+Enter لسطر جديد)"
            disabled={isLoading}
            className="flex-1 resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[44px] max-h-[200px] text-base leading-relaxed py-2 px-2"
            dir="rtl"
          />
          <Button type="submit" size="icon" disabled={isLoading} className="shrink-0 rounded-xl h-10 w-10">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

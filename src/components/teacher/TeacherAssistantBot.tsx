import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Headset, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "teacher_assistant_chat";

const quickSuggestions = [
  "كم عدد طلابي؟",
  "كم أرباحي هذا الشهر؟",
  "حالة طلبات السحب",
  "كيف أرفع محتوى؟",
  "عرّفني على المحفظة",
];

export default function TeacherAssistantBot() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load saved messages on mount
  useEffect(() => {
    if (!user) return;
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);
      if (saved) setMessages(JSON.parse(saved));
    } catch {}
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

  const clearChat = useCallback(() => {
    setMessages([]);
    if (user) localStorage.removeItem(`${STORAGE_KEY}_${user.id}`);
  }, [user]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading || !user) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
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
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-white animate-pulse" />
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
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-l from-blue-600 to-purple-600 text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                  <Headset className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold">مساعد المعلم الذكي</p>
                  <p className="text-[10px] text-white/70">متصل الآن • أسألني عن أي شيء</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button onClick={clearChat} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors" title="مسح المحادثة">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
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
                      <button key={i} onClick={() => sendMessage(s)}
                        className="text-[10px] px-2.5 py-1.5 rounded-full bg-accent text-accent-foreground hover:bg-accent/80 transition-colors font-medium">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                    m.role === "user"
                      ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-tr-sm"
                      : "bg-muted text-foreground rounded-tl-sm"
                  }`}>
                    {m.role === "assistant" ? (
                      <div className="prose prose-xs prose-neutral dark:prose-invert max-w-none [&>p]:m-0">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    ) : m.content}
                  </div>
                </div>
              ))}
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

            {/* Input */}
            <div className="px-3 py-2 border-t border-border shrink-0" dir="rtl">
              <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex items-center gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="اكتب سؤالك..."
                  className="flex-1 text-xs bg-muted rounded-xl px-3 py-2.5 outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
                  disabled={loading}
                />
                <Button type="submit" size="icon" disabled={!input.trim() || loading}
                  className="h-9 w-9 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 shrink-0 border-0">
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

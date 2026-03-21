import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { invokeSupportAssistant } from "@/lib/supportAssistant";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Loader2, Headphones, Bot } from "lucide-react";
import ReactMarkdown from "react-markdown";

type Msg = { role: "user" | "assistant"; content: string };

const quickSuggestions = [
  "كيف أشترك في مادة؟",
  "كيف أعمل إيداع؟",
  "كيف أغير كلمة السر؟",
  "عرّفني على المنصة",
  "أحتاج تحدث مع الدعم",
];

export default function FloatingSupportBot() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading || !user) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    const allMsgs = [...messages, userMsg];
    setMessages(allMsgs);
    setInput("");
    setLoading(true);

    let assistantContent = "";

    try {
      assistantContent = await invokeSupportAssistant({ messages: allMsgs });

      // Check for escalation
      if (assistantContent.includes("[ESCALATE_TO_SUPPORT]")) {
        assistantContent = assistantContent.replace("[ESCALATE_TO_SUPPORT]", "").trim();
        setEscalated(true);
        // Send support message
        await supabase.from("support_messages").insert({
          user_id: user.id,
          message: `[تحويل تلقائي من المساعد الذكي]\nمشكلة الطالب: ${text}\n\nرد المساعد: ${assistantContent}`,
          is_from_admin: false,
        });
        assistantContent += "\n\n✅ تم تحويلك للدعم الفني. سيتم الرد عليك قريباً.";
      }

      if (assistantContent) {
        setMessages([...allMsgs, { role: "assistant", content: assistantContent }]);
      }
    } catch (err) {
      console.error(err);
      setMessages([...allMsgs, { role: "assistant", content: "عذراً، حدث خطأ. حاول مرة أخرى." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-20 left-4 z-50 lg:bottom-6 w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-300/40 flex items-center justify-center hover:shadow-xl hover:scale-105 transition-all"
          >
            <Bot className="h-6 w-6" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white animate-pulse" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-20 left-3 right-3 z-50 lg:bottom-6 lg:left-6 lg:right-auto lg:w-[380px] max-h-[65vh] flex flex-col bg-card rounded-2xl border border-border shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-l from-violet-500 to-purple-600 text-white shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <Bot className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold">المساعد الذكي</p>
                  <p className="text-[10px] text-white/70">متصل الآن</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px] max-h-[45vh]" dir="rtl">
              {messages.length === 0 && (
                <div className="text-center py-4">
                  <div className="text-3xl mb-2">👋</div>
                  <p className="text-sm font-medium text-foreground">أهلاً! كيف أقدر أساعدك؟</p>
                  <p className="text-xs text-muted-foreground mt-1">اختر سؤال أو اكتب مشكلتك</p>
                  <div className="flex flex-wrap gap-1.5 mt-3 justify-center">
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
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
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
                  <div className="bg-muted rounded-2xl rounded-tl-sm px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
              {escalated && (
                <div className="flex justify-center">
                  <button
                    onClick={() => window.location.href = "/support"}
                    className="flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 px-3 py-2 rounded-full hover:bg-primary/20 transition-colors"
                  >
                    <Headphones className="h-3.5 w-3.5" />
                    الانتقال لصفحة الدعم
                  </button>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="px-3 py-2 border-t border-border shrink-0" dir="rtl">
              <form
                onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
                className="flex items-center gap-2"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="اكتب رسالتك..."
                  className="flex-1 text-xs bg-muted rounded-xl px-3 py-2.5 outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
                  disabled={loading}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim() || loading}
                  className="h-9 w-9 rounded-xl bg-primary shrink-0"
                >
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

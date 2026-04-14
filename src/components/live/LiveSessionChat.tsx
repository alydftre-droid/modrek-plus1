import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, MessageCircle, X, ChevronDown } from "lucide-react";

interface Message {
  id: string;
  user_name: string;
  message: string;
  is_teacher: boolean;
  created_at: string;
  user_id: string;
}

interface Props {
  sessionId: string;
  isTeacher: boolean;
  userName: string;
}

export default function LiveSessionChat({ sessionId, isTeacher, userName }: Props) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load existing messages
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("live_session_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (data) setMessages(data as Message[]);
    };
    load();
  }, [sessionId]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`live-chat-${sessionId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "live_session_messages",
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const msg = payload.new as Message;
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        if (!isOpen && msg.user_id !== user?.id) {
          setUnread((c) => c + 1);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId, isOpen, user?.id]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const sendMessage = useCallback(async () => {
    if (!newMessage.trim() || sending || !user) return;
    setSending(true);
    const text = newMessage.trim();
    setNewMessage("");

    await supabase.from("live_session_messages").insert({
      session_id: sessionId,
      user_id: user.id,
      user_name: userName,
      message: text,
      is_teacher: isTeacher,
    });
    setSending(false);
    inputRef.current?.focus();
  }, [newMessage, sending, user, sessionId, userName, isTeacher]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleChat = () => {
    setIsOpen((o) => !o);
    if (!isOpen) setUnread(0);
  };

  // Floating button
  if (!isOpen) {
    return (
      <button
        onClick={toggleChat}
        className="absolute bottom-20 right-3 z-30 w-12 h-12 rounded-full bg-primary/90 backdrop-blur-sm flex items-center justify-center text-primary-foreground shadow-lg active:scale-90 transition-transform"
      >
        <MessageCircle className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="absolute bottom-16 right-2 left-2 z-30 max-w-sm mx-auto" dir="rtl">
      <div className="bg-black/85 backdrop-blur-md rounded-2xl border border-white/10 flex flex-col overflow-hidden shadow-2xl" style={{ maxHeight: "55vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            <span className="text-white text-sm font-semibold">الدردشة</span>
            <span className="text-white/40 text-xs">({messages.length})</span>
          </div>
          <button onClick={toggleChat} className="p-1 rounded-full hover:bg-white/10 text-white/60 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[120px] max-h-[40vh]">
          {messages.length === 0 && (
            <p className="text-center text-white/30 text-xs py-8">لا توجد رسائل بعد...</p>
          )}
          {messages.map((msg) => {
            const isMine = msg.user_id === user?.id;
            return (
              <div key={msg.id} className={`flex flex-col ${isMine ? "items-start" : "items-end"}`}>
                <div className="flex items-center gap-1 mb-0.5">
                  <span className={`text-[10px] font-medium ${msg.is_teacher ? "text-yellow-400" : "text-white/50"}`}>
                    {msg.is_teacher ? `🎓 ${msg.user_name}` : msg.user_name}
                  </span>
                </div>
                <div
                  className={`max-w-[85%] px-3 py-1.5 rounded-xl text-xs leading-relaxed ${
                    isMine
                      ? "bg-primary/80 text-white rounded-br-sm"
                      : msg.is_teacher
                      ? "bg-yellow-500/20 text-yellow-100 border border-yellow-500/30 rounded-bl-sm"
                      : "bg-white/10 text-white/90 rounded-bl-sm"
                  }`}
                >
                  {msg.message}
                </div>
              </div>
            );
          })}
        </div>

        {/* Input */}
        <div className="border-t border-white/10 p-2 flex items-center gap-2">
          <input
            ref={inputRef}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="اكتب رسالة..."
            maxLength={500}
            className="flex-1 bg-white/10 text-white text-xs rounded-full px-3 py-2 placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-primary/50 border-none"
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim() || sending}
            className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-40 active:scale-90 transition-transform shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

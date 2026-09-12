import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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

    const { error } = await supabase.from("live_session_messages").insert({
      session_id: sessionId,
      user_id: user.id,
      user_name: userName,
      message: text,
      is_teacher: isTeacher,
    });
    if (error) {
      setNewMessage(text);
      toast.error("تعذر إرسال الرسالة");
    }
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
      <Button
        type="button"
        size="icon"
        onClick={toggleChat}
        aria-label="فتح دردشة الحصة"
        className="fixed bottom-20 right-3 z-[10004] h-12 w-12 rounded-full shadow-lg"
      >
        <MessageCircle className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>
    );
  }

  return (
    <div className="fixed bottom-16 right-2 left-2 z-[10004] mx-auto max-w-sm" dir="rtl">
      <div className="flex max-h-[55vh] flex-col overflow-hidden rounded-lg border bg-card/95 shadow-2xl backdrop-blur-md">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">الدردشة</span>
            <span className="text-xs text-muted-foreground">({messages.length})</span>
          </div>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={toggleChat} aria-label="إغلاق الدردشة">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[120px] max-h-[40vh]">
          {messages.length === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">لا توجد رسائل بعد...</p>
          )}
          {messages.map((msg) => {
            const isMine = msg.user_id === user?.id;
            return (
              <div key={msg.id} className={`flex flex-col ${isMine ? "items-start" : "items-end"}`}>
                <div className="flex items-center gap-1 mb-0.5">
                  <span className={`text-[10px] font-medium ${msg.is_teacher ? "text-primary" : "text-muted-foreground"}`}>
                    {msg.is_teacher ? `المعلم: ${msg.user_name}` : msg.user_name}
                  </span>
                </div>
                <div
                  className={`max-w-[85%] px-3 py-1.5 rounded-xl text-xs leading-relaxed ${
                    isMine
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : msg.is_teacher
                      ? "border border-primary/30 bg-primary/10 text-foreground rounded-bl-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}
                >
                  {msg.message}
                </div>
              </div>
            );
          })}
        </div>

        {/* Input */}
        <div className="flex items-center gap-2 border-t p-2">
          <input
            ref={inputRef}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="اكتب رسالة..."
            maxLength={500}
            className="flex-1 rounded-full border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <Button
            type="button"
            size="icon"
            onClick={sendMessage}
            disabled={!newMessage.trim() || sending}
            className="h-8 w-8 shrink-0 rounded-full"
            aria-label="إرسال الرسالة"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, GraduationCap, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

interface Props {
  teacherId: string;
  teacherName: string;
}

interface Message {
  id: string;
  message: string;
  is_from_teacher: boolean;
  created_at: string;
}

export default function StudentTeacherChat({ teacherId, teacherName }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    // Check unread count
    fetchUnread();
    const channel = supabase
      .channel(`student-teacher-chat-${teacherId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "teacher_messages",
        filter: `student_id=eq.${user.id}`
      }, () => {
        if (open) fetchMessages();
        else fetchUnread();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, teacherId, open]);

  useEffect(() => {
    if (open) {
      fetchMessages();
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchUnread = async () => {
    if (!user) return;
    const { count } = await supabase
      .from("teacher_messages")
      .select("*", { count: "exact", head: true })
      .eq("student_id", user.id)
      .eq("teacher_id", teacherId)
      .eq("is_from_teacher", true)
      .eq("is_read", false);
    setUnreadCount(count || 0);
  };

  const fetchMessages = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("teacher_messages")
      .select("id, message, is_from_teacher, created_at")
      .eq("student_id", user.id)
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: true });
    setMessages((data || []) as Message[]);

    // Mark teacher messages as read
    await supabase
      .from("teacher_messages")
      .update({ is_read: true })
      .eq("student_id", user.id)
      .eq("teacher_id", teacherId)
      .eq("is_from_teacher", true);
    setUnreadCount(0);
    setLoading(false);
  };

  const handleSend = async () => {
    if (!user || !newMessage.trim()) return;
    setSending(true);
    try {
      // For first message, prepend student info
      const isFirstMessage = messages.filter(m => !m.is_from_teacher).length === 0;
      
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, student_code")
        .eq("id", user.id)
        .maybeSingle();

      let messageText = newMessage.trim();
      if (isFirstMessage && profile) {
        messageText = `👤 ${profile.full_name}\n🆔 كود الطالب: ${profile.student_code || "غير متاح"}\n\n${messageText}`;
      }

      const { error } = await supabase.from("teacher_messages").insert({
        teacher_id: teacherId,
        student_id: user.id,
        message: messageText,
        is_from_teacher: false,
      });
      if (error) throw error;
      setNewMessage("");
      fetchMessages();
    } catch (e) {
      toast.error("خطأ في إرسال الرسالة");
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="relative flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 transition-colors text-sm font-medium text-primary">
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
            <GraduationCap className="h-4 w-4 text-primary" />
          </div>
          <span className="hidden sm:inline">التواصل مع المعلم</span>
          <span className="sm:hidden">
            <MessageCircle className="h-4 w-4" />
          </span>
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -left-1 h-5 w-5 p-0 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px]">
              {unreadCount}
            </Badge>
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-full sm:w-[400px] p-0 flex flex-col">
        <SheetHeader className="p-4 border-b border-border bg-primary/5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
              <GraduationCap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <SheetTitle className="text-base">{teacherName}</SheetTitle>
              <p className="text-xs text-muted-foreground">معلم المادة</p>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 p-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12">
              <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">ابدأ محادثة مع المعلم</p>
              <p className="text-xs text-muted-foreground mt-1">سيتم إرسال اسمك والكود تلقائياً</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map(msg => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.is_from_teacher ? "justify-start" : "justify-end"}`}
                >
                  <div className={`max-w-[85%] p-3 rounded-2xl text-sm whitespace-pre-wrap ${
                    msg.is_from_teacher
                      ? "bg-accent rounded-bl-sm"
                      : "bg-primary text-primary-foreground rounded-br-sm"
                  }`}>
                    <p>{msg.message}</p>
                    <p className={`text-[10px] mt-1 ${msg.is_from_teacher ? "text-muted-foreground" : "text-primary-foreground/50"}`}>
                      {new Date(msg.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </motion.div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        <div className="p-3 border-t border-border bg-card">
          <div className="flex gap-2">
            <Input
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder="اكتب رسالتك..."
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
              className="flex-1"
              dir="rtl"
            />
            <Button onClick={handleSend} disabled={sending || !newMessage.trim()} size="icon">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

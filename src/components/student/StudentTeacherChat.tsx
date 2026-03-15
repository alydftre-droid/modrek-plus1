import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, GraduationCap, MessageCircle, Image, Mic, Square, X } from "lucide-react";
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
  file_url?: string | null;
  file_type?: string | null;
}

export default function StudentTeacherChat({ teacherId, teacherName }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
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

  useEffect(() => { if (open) fetchMessages(); }, [open]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const fetchUnread = async () => {
    if (!user) return;
    const { count } = await supabase
      .from("teacher_messages")
      .select("*", { count: "exact", head: true })
      .eq("student_id", user.id).eq("teacher_id", teacherId)
      .eq("is_from_teacher", true).eq("is_read", false);
    setUnreadCount(count || 0);
  };

  const fetchMessages = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("teacher_messages")
      .select("id, message, is_from_teacher, created_at, file_url, file_type")
      .eq("student_id", user.id).eq("teacher_id", teacherId)
      .order("created_at", { ascending: true });
    setMessages((data || []) as Message[]);
    await supabase.from("teacher_messages").update({ is_read: true })
      .eq("student_id", user.id).eq("teacher_id", teacherId).eq("is_from_teacher", true);
    setUnreadCount(0);
    setLoading(false);
  };

  const uploadFile = async (file: Blob, ext: string): Promise<string | null> => {
    const fileName = `chat/${user!.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("payment-receipts").upload(fileName, file);
    if (error) { toast.error("خطأ في رفع الملف"); return null; }
    const { data: urlData } = supabase.storage.from("payment-receipts").getPublicUrl(fileName);
    return urlData.publicUrl;
  };

  const sendMessage = async (text: string, fileUrl?: string, fileType?: string) => {
    if (!user) return;
    setSending(true);
    try {
      const isFirstMessage = messages.filter(m => !m.is_from_teacher).length === 0;
      const { data: profile } = await supabase.from("profiles").select("full_name, student_code").eq("id", user.id).maybeSingle();
      let messageText = text.trim();
      if (isFirstMessage && profile && messageText) {
        messageText = `👤 ${profile.full_name}\n🆔 كود الطالب: ${profile.student_code || "غير متاح"}\n\n${messageText}`;
      }
      const insertData: any = {
        teacher_id: teacherId, student_id: user.id,
        message: messageText || (fileType === "image" ? "📷 صورة" : "🎤 رسالة صوتية"),
        is_from_teacher: false,
      };
      if (fileUrl) { insertData.file_url = fileUrl; insertData.file_type = fileType; }
      const { error } = await supabase.from("teacher_messages").insert(insertData);
      if (error) throw error;
      setNewMessage("");
      fetchMessages();
    } catch { toast.error("خطأ في إرسال الرسالة"); }
    finally { setSending(false); }
  };

  const handleSend = () => { if (newMessage.trim()) sendMessage(newMessage); };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("يرجى اختيار صورة"); return; }
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const url = await uploadFile(file, ext);
    if (url) await sendMessage("", url, "image");
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setUploading(true);
        const url = await uploadFile(blob, "webm");
        if (url) await sendMessage("", url, "audio");
        setUploading(false);
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setRecording(true);
    } catch { toast.error("لا يمكن الوصول للميكروفون"); }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const renderMessageContent = (msg: Message) => (
    <>
      {msg.file_url && msg.file_type === "image" && (
        <img src={msg.file_url} alt="صورة" className="rounded-lg max-w-full max-h-48 mb-1 cursor-pointer" onClick={() => window.open(msg.file_url!, "_blank")} />
      )}
      {msg.file_url && msg.file_type === "audio" && (
        <audio controls src={msg.file_url} className="max-w-full mb-1" />
      )}
      {msg.message && !(msg.file_url && (msg.message === "📷 صورة" || msg.message === "🎤 رسالة صوتية")) && (
        <p>{msg.message}</p>
      )}
      <p className={`text-[10px] mt-1 ${msg.is_from_teacher ? "text-muted-foreground" : "text-primary-foreground/50"}`}>
        {new Date(msg.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
      </p>
    </>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="relative flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 transition-colors text-sm font-medium text-primary">
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
            <GraduationCap className="h-4 w-4 text-primary" />
          </div>
          <span className="hidden sm:inline">التواصل مع المعلم</span>
          <span className="sm:hidden"><MessageCircle className="h-4 w-4" /></span>
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
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12">
              <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">ابدأ محادثة مع المعلم</p>
              <p className="text-xs text-muted-foreground mt-1">سيتم إرسال اسمك والكود تلقائياً</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map(msg => (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.is_from_teacher ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[85%] p-3 rounded-2xl text-sm whitespace-pre-wrap ${
                    msg.is_from_teacher ? "bg-accent rounded-bl-sm" : "bg-primary text-primary-foreground rounded-br-sm"
                  }`}>
                    {renderMessageContent(msg)}
                  </div>
                </motion.div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        <div className="p-3 border-t border-border bg-card">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          {recording ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10">
                <div className="h-3 w-3 rounded-full bg-destructive animate-pulse" />
                <span className="text-sm text-destructive font-medium">جاري التسجيل...</span>
              </div>
              <Button onClick={stopRecording} size="icon" variant="destructive"><Square className="h-4 w-4" /></Button>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="shrink-0">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={startRecording} disabled={uploading} className="shrink-0">
                <Mic className="h-4 w-4" />
              </Button>
              <Input value={newMessage} onChange={e => setNewMessage(e.target.value)}
                placeholder="اكتب رسالتك..." onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()} className="flex-1 h-10" dir="rtl" />
              <Button onClick={handleSend} disabled={sending || !newMessage.trim()} size="icon" className="shrink-0">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

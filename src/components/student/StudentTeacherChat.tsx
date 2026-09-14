import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, MessageCircle, Image, Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import teacherChatAvatar from "@/assets/teacher-chat-avatar.png";
import StoredImage from "@/components/common/StoredImage";
import ChatAttachment from "@/components/chat/ChatAttachment";

interface Props {
  teacherId: string;
  teacherName: string;
  teacherPhotoUrl?: string | null;
}

interface Message {
  id: string;
  message: string;
  is_from_teacher: boolean;
  created_at: string;
  file_url?: string | null;
  file_type?: string | null;
}

export default function StudentTeacherChat({ teacherId, teacherName, teacherPhotoUrl }: Props) {

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
    try {
      const { uploadFile: uploadToBunny } = await import("@/lib/storage");
      const stored = await uploadToBunny({
        scope: { kind: "user", id: user!.id },
        category: "chat",
        file,
        fileName: `${Date.now()}.${ext}`,
      });
      return stored.url;
    } catch {
      toast.error("خطأ في رفع الملف");
      return null;
    }
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

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("ar-EG", { day: "numeric", month: "short" });

  const groupedMessages = messages.reduce<{ date: string; msgs: Message[] }[]>((acc, msg) => {
    const date = new Date(msg.created_at).toDateString();
    const last = acc[acc.length - 1];
    if (last && last.date === date) last.msgs.push(msg);
    else acc.push({ date, msgs: [msg] });
    return acc;
  }, []);

  const displayPhoto = teacherPhotoUrl || null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="student-chat-trigger relative flex flex-col items-center gap-1 rounded-2xl px-2 py-1 transition-all duration-300" title={`راسل ${teacherName}`}>
          <div className="student-chat-trigger-avatar h-8 w-8 shrink-0 overflow-hidden rounded-full border-2 border-primary/30 bg-white shadow-sm">
            <StoredImage
              source={displayPhoto}
              fallbackSrc={teacherChatAvatar}
              alt={teacherName}
              className="h-full w-full object-cover"
              loading="lazy"
              width={256}
              height={256}
            />
          </div>
          <span className="student-chat-trigger-title block text-[10px] font-bold leading-none whitespace-nowrap text-primary">مراسلة المعلم</span>
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -left-1 h-4 min-w-[16px] p-0 flex items-center justify-center rounded-full bg-rose-500 text-white text-[9px] animate-pulse shadow-md">
              {unreadCount}
            </Badge>
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-full sm:w-[420px] p-0 flex flex-col">
        {/* Header */}
        <SheetHeader className="p-0">
          <div className="teacher-chat-sheet-header p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 overflow-hidden rounded-full border-2 border-white/40 shadow-lg bg-white">
                <StoredImage
                  source={displayPhoto}
                  fallbackSrc={teacherChatAvatar}
                  alt={teacherName}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  width={256}
                  height={256}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-white/70">المعلم</p>
                <SheetTitle className="text-base font-bold text-white truncate">{teacherName}</SheetTitle>
                <p className="text-xs text-white/70 flex items-center gap-1.5 mt-0.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
                  {teacherName}
                </p>
              </div>
            </div>
          </div>
        </SheetHeader>


        {/* Messages - with subtle pattern background */}
        <ScrollArea className="flex-1" style={{ 
          background: "linear-gradient(180deg, hsl(210 40% 98%) 0%, hsl(210 30% 96%) 100%)",
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2394a3b8' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}>
          <div className="p-4 min-h-full">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-sky-500" /></div>
            ) : messages.length === 0 ? (
              <div className="text-center py-16">
                <div className="h-20 w-20 rounded-full bg-sky-50 border-2 border-sky-100 flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="h-9 w-9 text-sky-300" />
                </div>
                <p className="text-sm font-bold text-foreground">ابدأ محادثة مع المعلم</p>
                <p className="text-xs text-muted-foreground mt-1.5">سيتم إرسال اسمك والكود تلقائياً في أول رسالة</p>
              </div>
            ) : (
              <div className="space-y-4">
                {groupedMessages.map((group, gi) => (
                  <div key={gi}>
                    <div className="flex items-center gap-3 my-3">
                      <div className="flex-1 h-px bg-sky-200/50" />
                      <span className="text-[10px] text-sky-600/70 bg-sky-50 px-3 py-1 rounded-full border border-sky-100 font-medium">
                        {formatDate(group.msgs[0].created_at)}
                      </span>
                      <div className="flex-1 h-px bg-sky-200/50" />
                    </div>
                    <div className="space-y-2.5">
                      {group.msgs.map(msg => (
                        <motion.div key={msg.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                          className={`flex ${msg.is_from_teacher ? "justify-start" : "justify-end"}`}>
                          <div className={`max-w-[85%] p-3 rounded-2xl text-sm whitespace-pre-wrap shadow-sm ${
                            msg.is_from_teacher
                              ? "bg-white border border-sky-100 rounded-bl-sm"
                              : "bg-gradient-to-br from-sky-500 to-blue-600 text-white rounded-br-sm shadow-sky-200/50"
                          }`}>
                            {msg.file_url && (msg.file_type === "image" || msg.file_type === "audio") && (
                              <ChatAttachment url={msg.file_url} type={msg.file_type} />
                            )}
                            {msg.message && !(msg.file_url && (msg.message === "📷 صورة" || msg.message === "🎤 رسالة صوتية")) && (
                              <p>{msg.message}</p>
                            )}
                            <p className={`text-[10px] mt-1 ${msg.is_from_teacher ? "text-sky-400" : "text-white/60"}`}>
                              {formatTime(msg.created_at)}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Composer */}
        <div className="p-3 border-t border-sky-100 bg-white">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          {recording ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200">
                <div className="h-3 w-3 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-sm text-rose-600 font-medium">جاري التسجيل...</span>
              </div>
              <Button onClick={stopRecording} size="icon" variant="destructive" className="rounded-xl"><Square className="h-4 w-4" /></Button>
            </div>
          ) : (
            <div className="flex gap-1.5 items-center">
              <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="shrink-0 rounded-xl h-10 w-10 text-sky-500 hover:bg-sky-50">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={startRecording} disabled={uploading} className="shrink-0 rounded-xl h-10 w-10 text-sky-500 hover:bg-sky-50">
                <Mic className="h-4 w-4" />
              </Button>
              <Input value={newMessage} onChange={e => setNewMessage(e.target.value)}
                placeholder="اكتب رسالتك..." onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                className="flex-1 h-10 rounded-xl border-sky-200 focus-visible:ring-sky-400" dir="rtl" />
              <Button onClick={handleSend} disabled={sending || !newMessage.trim()} size="icon" className="shrink-0 rounded-xl h-10 w-10 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Loader2, Send, Search, Users, Megaphone, ChevronRight, Image, Mic, Square,
  Archive, Pin, Trash2, MessageCircle, UserSearch, Mail, Settings, PinOff, X, Eye
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface StudentThread {
  student_id: string;
  student_name: string;
  student_code: string | null;
  last_message: string;
  last_time: string;
  unread_count: number;
  is_read_by_teacher: boolean;
}

interface Message {
  id: string;
  message: string;
  is_from_teacher: boolean;
  created_at: string;
  is_read: boolean;
  file_url?: string | null;
  file_type?: string | null;
}

interface StudentInfo {
  id: string;
  full_name: string;
  student_code: string | null;
  grade?: string | null;
  stage?: string | null;
}

type PageView = "inbox" | "archives" | "compose" | "broadcast" | "student-info";

export default function TeacherMessagesPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [teacherName, setTeacherName] = useState("");
  const [threads, setThreads] = useState<StudentThread[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentThread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [view, setView] = useState<PageView>("inbox");
  const [searchQuery, setSearchQuery] = useState("");
  const [composeSearch, setComposeSearch] = useState("");
  const [searchResults, setSearchResults] = useState<StudentInfo[]>([]);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastSending, setBroadcastSending] = useState(false);

  // Archives: pinned & archived threads stored in localStorage
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("teacher_pinned_threads") || "[]"); } catch { return []; }
  });
  const [archivedIds, setArchivedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("teacher_archived_threads") || "[]"); } catch { return []; }
  });
  const [contextMenu, setContextMenu] = useState<{ threadId: string; x: number; y: number } | null>(null);

  // Student info panel
  const [studentInfoData, setStudentInfoData] = useState<any>(null);
  const [studentInfoLoading, setStudentInfoLoading] = useState(false);
  const [selectedStudentForInfo, setSelectedStudentForInfo] = useState<StudentInfo | null>(null);

  useEffect(() => { localStorage.setItem("teacher_pinned_threads", JSON.stringify(pinnedIds)); }, [pinnedIds]);
  useEffect(() => { localStorage.setItem("teacher_archived_threads", JSON.stringify(archivedIds)); }, [archivedIds]);

  useEffect(() => { if (user) fetchData(); }, [user?.id]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("teacher-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "teacher_messages", filter: `teacher_id=eq.${user.id}` },
        () => { if (selectedStudent) fetchMessages(selectedStudent.student_id); fetchData(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, selectedStudent]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    if (profile) setTeacherName(profile.full_name);

    const { data: allMessages } = await supabase
      .from("teacher_messages").select("*").eq("teacher_id", user.id).order("created_at", { ascending: false });

    if (!allMessages?.length) { setThreads([]); setLoading(false); return; }

    const studentMap = new Map<string, any[]>();
    for (const msg of allMessages) {
      if (!studentMap.has(msg.student_id)) studentMap.set(msg.student_id, []);
      studentMap.get(msg.student_id)!.push(msg);
    }

    const studentIds = [...studentMap.keys()];
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, student_code").in("id", studentIds);
    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

    const threadList: StudentThread[] = studentIds.map(sid => {
      const msgs = studentMap.get(sid)!;
      const p = profileMap.get(sid);
      const unreadMsgs = msgs.filter((m: any) => !m.is_from_teacher && !m.is_read);
      return {
        student_id: sid, student_name: p?.full_name || "طالب", student_code: p?.student_code || null,
        last_message: msgs[0].message, last_time: msgs[0].created_at,
        unread_count: unreadMsgs.length,
        is_read_by_teacher: unreadMsgs.length === 0,
      };
    });
    threadList.sort((a, b) => new Date(b.last_time).getTime() - new Date(a.last_time).getTime());
    setThreads(threadList);
    setLoading(false);
  };

  const fetchMessages = async (studentId: string) => {
    if (!user) return;
    setLoadingMessages(true);
    const { data } = await supabase
      .from("teacher_messages").select("id, message, is_from_teacher, created_at, is_read, file_url, file_type")
      .eq("teacher_id", user.id).eq("student_id", studentId).order("created_at", { ascending: true });
    setMessages((data || []) as Message[]);
    await supabase.from("teacher_messages").update({ is_read: true })
      .eq("teacher_id", user.id).eq("student_id", studentId).eq("is_from_teacher", false);
    setLoadingMessages(false);
  };

  const handleSelectThread = (thread: StudentThread) => {
    setSelectedStudent(thread);
    fetchMessages(thread.student_id);
  };

  // After reading/replying, move to archive
  const archiveThread = (studentId: string) => {
    if (!archivedIds.includes(studentId)) {
      setArchivedIds(prev => [...prev, studentId]);
    }
    setSelectedStudent(null);
    setMessages([]);
  };

  const togglePin = (studentId: string) => {
    setPinnedIds(prev => prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]);
    setContextMenu(null);
  };

  const deleteThread = async (studentId: string) => {
    setArchivedIds(prev => prev.filter(id => id !== studentId));
    setPinnedIds(prev => prev.filter(id => id !== studentId));
    setContextMenu(null);
    toast.success("تم حذف السجل");
  };

  const uploadFile = async (file: Blob, ext: string): Promise<string | null> => {
    const fileName = `chat/${user!.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("payment-receipts").upload(fileName, file);
    if (error) { toast.error("خطأ في رفع الملف"); return null; }
    const { data: urlData } = supabase.storage.from("payment-receipts").getPublicUrl(fileName);
    return urlData.publicUrl;
  };

  const sendMessageWithMedia = async (text: string, fileUrl?: string, fileType?: string) => {
    if (!user || !selectedStudent) return;
    setSending(true);
    try {
      const insertData: any = {
        teacher_id: user.id, student_id: selectedStudent.student_id,
        message: text.trim() || (fileType === "image" ? "📷 صورة" : "🎤 رسالة صوتية"),
        is_from_teacher: true,
      };
      if (fileUrl) { insertData.file_url = fileUrl; insertData.file_type = fileType; }
      await supabase.from("teacher_messages").insert(insertData);
      setNewMessage("");
      fetchMessages(selectedStudent.student_id);
    } catch { toast.error("خطأ في إرسال الرسالة"); }
    finally { setSending(false); }
  };

  const handleSend = () => { if (newMessage.trim()) sendMessageWithMedia(newMessage); };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const url = await uploadFile(file, ext);
    if (url) await sendMessageWithMedia("", url, "image");
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
        if (url) await sendMessageWithMedia("", url, "audio");
        setUploading(false);
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setRecording(true);
    } catch { toast.error("لا يمكن الوصول للميكروفون"); }
  };

  const stopRecording = () => { mediaRecorderRef.current?.stop(); setRecording(false); };

  const handleComposeSearch = async () => {
    if (!composeSearch.trim() || !user) return;
    const { data: choices } = await supabase.from("student_teacher_choices").select("student_id").eq("teacher_id", user.id);
    const studentIds = [...new Set(choices?.map(c => c.student_id) || [])];
    if (!studentIds.length) { setSearchResults([]); return; }
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, student_code, grade, stage").in("id", studentIds)
      .or(`full_name.ilike.%${composeSearch}%,student_code.ilike.%${composeSearch}%`);
    setSearchResults(profiles || []);
  };

  const handleStartThread = (id: string, name: string, code: string | null) => {
    const existing = threads.find(t => t.student_id === id);
    if (existing) handleSelectThread(existing);
    else {
      setSelectedStudent({ student_id: id, student_name: name, student_code: code, last_message: "", last_time: new Date().toISOString(), unread_count: 0, is_read_by_teacher: true });
      setMessages([]);
    }
    setView("inbox");
  };

  const handleBroadcast = async () => {
    if (!user || !broadcastMessage.trim()) return;
    setBroadcastSending(true);
    try {
      const { data: choices } = await supabase.from("student_teacher_choices").select("student_id").eq("teacher_id", user.id);
      const studentIds = [...new Set(choices?.map(c => c.student_id) || [])];
      if (!studentIds.length) { toast.error("لا يوجد طلاب مسجلين"); setBroadcastSending(false); return; }
      const rows = studentIds.map(sid => ({
        teacher_id: user.id, student_id: sid, message: `📢 رسالة جماعية:\n${broadcastMessage.trim()}`, is_from_teacher: true,
      }));
      await supabase.from("teacher_messages").insert(rows);
      toast.success(`تم إرسال الرسالة لـ ${studentIds.length} طالب`);
      setBroadcastMessage("");
      setView("inbox");
      fetchData();
    } catch { toast.error("خطأ في الإرسال"); }
    finally { setBroadcastSending(false); }
  };

  // Fetch student info (only teacher's own data)
  const fetchStudentInfo = async (student: StudentInfo) => {
    if (!user) return;
    setSelectedStudentForInfo(student);
    setStudentInfoLoading(true);
    setView("student-info");

    // Get teacher's groups
    const { data: groups } = await supabase.from("content_groups")
      .select("id, title").or(`teacher_id.eq.${user.id},created_by.eq.${user.id}`);
    const groupIds = groups?.map(g => g.id) || [];

    // Get student's purchases for teacher's groups only
    const { data: purchases } = groupIds.length ? await supabase.from("student_group_purchases")
      .select("group_id, purchased_at").eq("student_id", student.id).in("group_id", groupIds) : { data: [] };

    // Get video progress for teacher's content only
    const { data: content } = groupIds.length ? await supabase.from("content")
      .select("id, title, group_id").in("group_id", groupIds).eq("type", "video") : { data: [] };
    const contentIds = content?.map(c => c.id) || [];

    const { data: videoProgress } = contentIds.length ? await supabase.from("video_progress")
      .select("content_id, progress_seconds, duration_seconds").eq("user_id", student.id).in("content_id", contentIds) : { data: [] };

    // Get exam attempts for teacher's exams only
    const { data: exams } = await supabase.from("exams")
      .select("id, title").eq("created_by", user.id);
    const examIds = exams?.map(e => e.id) || [];

    const { data: attempts } = examIds.length ? await supabase.from("exam_attempts")
      .select("exam_id, score, total, submitted_at").eq("student_id", student.id).in("exam_id", examIds) : { data: [] };

    const totalWatchSeconds = videoProgress?.reduce((sum: number, v: any) => sum + (v.progress_seconds || 0), 0) || 0;
    const totalDurationSeconds = videoProgress?.reduce((sum: number, v: any) => sum + (v.duration_seconds || 0), 0) || 0;

    setStudentInfoData({
      groups: groups || [],
      purchases: purchases || [],
      videoProgress: videoProgress || [],
      content: content || [],
      exams: exams || [],
      attempts: attempts || [],
      totalWatchMinutes: Math.round(totalWatchSeconds / 60),
      totalDurationMinutes: Math.round(totalDurationSeconds / 60),
      completedVideos: videoProgress?.filter(v => v.progress_seconds >= v.duration_seconds * 0.9).length || 0,
      totalVideos: content?.length || 0,
    });
    setStudentInfoLoading(false);
  };

  // Inbox threads: unread first, then exclude archived (unless in archives view)
  const inboxThreads = threads.filter(t => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (t.student_name.toLowerCase().includes(q) || (t.student_code || "").toLowerCase().includes(q));
    }
    return !archivedIds.includes(t.student_id) || t.unread_count > 0;
  });

  const archiveThreads = threads.filter(t => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return archivedIds.includes(t.student_id) && (t.student_name.toLowerCase().includes(q) || (t.student_code || "").toLowerCase().includes(q));
    }
    return archivedIds.includes(t.student_id);
  });

  // Sort: pinned first, then by time
  const sortThreads = (list: StudentThread[]) => {
    return [...list].sort((a, b) => {
      const aPinned = pinnedIds.includes(a.student_id) ? 1 : 0;
      const bPinned = pinnedIds.includes(b.student_id) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      if (a.unread_count !== b.unread_count) return b.unread_count - a.unread_count;
      return new Date(b.last_time).getTime() - new Date(a.last_time).getTime();
    });
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
        <p className="whitespace-pre-wrap">{msg.message}</p>
      )}
      <p className={`text-[10px] mt-1 ${msg.is_from_teacher ? "text-primary-foreground/60" : "text-muted-foreground/60"}`}>
        {new Date(msg.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
      </p>
    </>
  );

  const ThreadItem = ({ thread }: { thread: StudentThread }) => {
    const isPinned = pinnedIds.includes(thread.student_id);
    return (
      <motion.button
        layout
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={() => handleSelectThread(thread)}
        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ threadId: thread.student_id, x: e.clientX, y: e.clientY }); }}
        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-right group hover:bg-accent/60 ${
          selectedStudent?.student_id === thread.student_id ? "bg-primary/10 border border-primary/20" : ""
        } ${isPinned ? "border-r-2 border-r-primary" : ""}`}
      >
        <div className={`h-11 w-11 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
          thread.unread_count > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}>
          {thread.student_name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {isPinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
              <p className="text-sm font-bold truncate">{thread.student_name}</p>
            </div>
            {thread.unread_count > 0 && (
              <Badge className="bg-primary text-primary-foreground text-[10px] h-5 min-w-[20px] p-0 flex items-center justify-center rounded-full shrink-0">
                {thread.unread_count}
              </Badge>
            )}
          </div>
          {thread.student_code && <p className="text-[10px] text-muted-foreground">#{thread.student_code}</p>}
          <p className="text-xs text-muted-foreground truncate mt-0.5">{thread.last_message.substring(0, 50)}</p>
        </div>
      </motion.button>
    );
  };

  if (loading) {
    return (
      <TeacherSidebarLayout title="الرسائل" teacherName={teacherName}>
        <div className="flex items-center justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
      </TeacherSidebarLayout>
    );
  }

  return (
    <TeacherSidebarLayout title="التواصل مع الطلبة" teacherName={teacherName}>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-xl border border-border bg-card">
        {/* Sidebar */}
        <div className={`w-full md:w-96 border-l border-border flex flex-col bg-gradient-to-b from-card to-muted/20 ${selectedStudent ? "hidden md:flex" : "flex"}`}>
          {/* Header */}
          <div className="p-4 border-b border-border space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-primary" />
                الرسائل
              </h2>
              <Button
                variant="ghost" size="icon"
                onClick={() => setView(view === "archives" ? "inbox" : "archives")}
                className={view === "archives" ? "text-primary" : ""}
              >
                <Archive className="h-5 w-5" />
              </Button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو الكود..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pr-9 h-10 rounded-xl bg-background/80"
              />
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-3 gap-2">
              <Button
                size="sm"
                variant={view === "compose" ? "default" : "outline"}
                onClick={() => { setView("compose"); setComposeSearch(""); setSearchResults([]); }}
                className="text-xs gap-1 rounded-xl h-9"
              >
                <Mail className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">رسالة</span>
              </Button>
              <Button
                size="sm"
                variant={view === "broadcast" ? "default" : "outline"}
                onClick={() => setView("broadcast")}
                className="text-xs gap-1 rounded-xl h-9"
              >
                <Megaphone className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">جماعية</span>
              </Button>
              <Button
                size="sm"
                variant={view === "student-info" ? "default" : "outline"}
                onClick={() => { setView("compose"); setComposeSearch(""); setSearchResults([]); }}
                className="text-xs gap-1 rounded-xl h-9"
              >
                <UserSearch className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">بحث</span>
              </Button>
            </div>
          </div>

          {/* Content Area */}
          <ScrollArea className="flex-1">
            <AnimatePresence mode="wait">
              {view === "compose" ? (
                <motion.div key="compose" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 space-y-3">
                  <Button variant="ghost" size="sm" onClick={() => setView("inbox")} className="gap-1 text-muted-foreground">
                    <ChevronRight className="h-4 w-4" /> رجوع
                  </Button>
                  <p className="text-sm font-semibold text-foreground">إرسال رسالة / بحث عن طالب</p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="اسم الطالب أو الكود..."
                      value={composeSearch}
                      onChange={e => setComposeSearch(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleComposeSearch()}
                      className="h-10 rounded-xl"
                    />
                    <Button size="sm" onClick={handleComposeSearch} className="rounded-xl h-10 px-4">
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                  {searchResults.length === 0 && composeSearch && (
                    <p className="text-xs text-muted-foreground text-center py-4">لا توجد نتائج</p>
                  )}
                  {searchResults.map(s => (
                    <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-background border border-border/50 hover:border-primary/30 transition-all">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                        {s.full_name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{s.full_name}</p>
                        {s.student_code && <p className="text-[10px] text-muted-foreground">#{s.student_code}</p>}
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => fetchStudentInfo(s)} className="h-8 w-8 p-0">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="sm" onClick={() => handleStartThread(s.id, s.full_name, s.student_code)} className="h-8 rounded-lg text-xs gap-1">
                          <Send className="h-3 w-3" /> رسالة
                        </Button>
                      </div>
                    </div>
                  ))}
                </motion.div>
              ) : view === "broadcast" ? (
                <motion.div key="broadcast" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 space-y-3">
                  <Button variant="ghost" size="sm" onClick={() => setView("inbox")} className="gap-1 text-muted-foreground">
                    <ChevronRight className="h-4 w-4" /> رجوع
                  </Button>
                  <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                    <p className="text-sm font-semibold flex items-center gap-2 text-primary">
                      <Megaphone className="h-4 w-4" /> رسالة جماعية
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">ستصل لجميع الطلاب المسجلين معك</p>
                  </div>
                  <Textarea
                    placeholder="اكتب رسالتك لجميع الطلاب..."
                    value={broadcastMessage}
                    onChange={e => setBroadcastMessage(e.target.value)}
                    className="min-h-[120px] rounded-xl" dir="rtl"
                  />
                  <Button onClick={handleBroadcast} disabled={broadcastSending || !broadcastMessage.trim()} className="w-full gap-2 rounded-xl h-11">
                    {broadcastSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    إرسال للجميع
                  </Button>
                </motion.div>
              ) : view === "student-info" && selectedStudentForInfo ? (
                <motion.div key="student-info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 space-y-3">
                  <Button variant="ghost" size="sm" onClick={() => setView("compose")} className="gap-1 text-muted-foreground">
                    <ChevronRight className="h-4 w-4" /> رجوع
                  </Button>
                  <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 text-center">
                    <div className="h-14 w-14 rounded-full bg-primary/20 flex items-center justify-center mx-auto text-lg font-bold text-primary mb-2">
                      {selectedStudentForInfo.full_name.charAt(0)}
                    </div>
                    <p className="font-bold">{selectedStudentForInfo.full_name}</p>
                    {selectedStudentForInfo.student_code && <p className="text-xs text-muted-foreground">#{selectedStudentForInfo.student_code}</p>}
                  </div>
                  {studentInfoLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                  ) : studentInfoData && (
                    <div className="space-y-3">
                      {/* Watch time */}
                      <div className="p-3 rounded-xl bg-background border border-border/50">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">📺 وقت المشاهدة</p>
                        <p className="text-2xl font-bold text-primary">{studentInfoData.totalWatchMinutes} <span className="text-sm font-normal">دقيقة</span></p>
                        <p className="text-xs text-muted-foreground">{studentInfoData.completedVideos} من {studentInfoData.totalVideos} فيديو مكتمل</p>
                      </div>
                      {/* Exams */}
                      <div className="p-3 rounded-xl bg-background border border-border/50">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">📝 الامتحانات</p>
                        {studentInfoData.attempts?.length > 0 ? (
                          <div className="space-y-1">
                            {studentInfoData.attempts.map((a: any, i: number) => {
                              const exam = studentInfoData.exams.find((e: any) => e.id === a.exam_id);
                              return (
                                <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/30">
                                  <span className="truncate flex-1">{exam?.title || "امتحان"}</span>
                                  <Badge variant={a.score >= a.total * 0.5 ? "default" : "destructive"} className="text-[10px]">
                                    {a.score}/{a.total}
                                  </Badge>
                                </div>
                              );
                            })}
                          </div>
                        ) : <p className="text-xs text-muted-foreground">لا توجد محاولات</p>}
                      </div>
                      {/* Groups */}
                      <div className="p-3 rounded-xl bg-background border border-border/50">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">📚 المجموعات المشترك فيها</p>
                        {studentInfoData.purchases?.length > 0 ? (
                          <div className="space-y-1">
                            {studentInfoData.purchases.map((p: any, i: number) => {
                              const group = studentInfoData.groups.find((g: any) => g.id === p.group_id);
                              return (
                                <div key={i} className="text-xs p-2 rounded-lg bg-muted/30 flex justify-between">
                                  <span>{group?.title || "مجموعة"}</span>
                                  <span className="text-muted-foreground">{new Date(p.purchased_at).toLocaleDateString("ar-EG")}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : <p className="text-xs text-muted-foreground">لا توجد اشتراكات</p>}
                      </div>
                      <Button onClick={() => handleStartThread(selectedStudentForInfo.id, selectedStudentForInfo.full_name, selectedStudentForInfo.student_code)} className="w-full rounded-xl gap-2">
                        <Send className="h-4 w-4" /> إرسال رسالة
                      </Button>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div key="threads" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {view === "archives" && (
                    <div className="px-4 pt-3 pb-1">
                      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                        <Archive className="h-3 w-3" /> السجلات ({archiveThreads.length})
                      </p>
                    </div>
                  )}
                  {(view === "archives" ? sortThreads(archiveThreads) : sortThreads(inboxThreads)).length === 0 ? (
                    <div className="p-8 text-center">
                      <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground/20 mb-3" />
                      <p className="text-sm text-muted-foreground">
                        {view === "archives" ? "لا توجد سجلات" : "لا توجد رسائل جديدة"}
                      </p>
                    </div>
                  ) : (
                    <div className="p-2 space-y-1">
                      {(view === "archives" ? sortThreads(archiveThreads) : sortThreads(inboxThreads)).map(thread => (
                        <ThreadItem key={thread.student_id} thread={thread} />
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </ScrollArea>
        </div>

        {/* Chat Area */}
        <div className={`flex-1 flex flex-col bg-gradient-to-b from-background to-muted/10 ${!selectedStudent ? "hidden md:flex" : "flex"}`}>
          {!selectedStudent ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center p-8">
                <div className="h-20 w-20 rounded-full bg-primary/5 flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="h-10 w-10 text-primary/30" />
                </div>
                <p className="text-lg font-semibold text-muted-foreground">اختر محادثة</p>
                <p className="text-sm text-muted-foreground/60 mt-1">أو أرسل رسالة جديدة لطالب</p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="flex items-center justify-between p-4 border-b border-border bg-card/80 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="icon" className="md:hidden shrink-0" onClick={() => setSelectedStudent(null)}>
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    {selectedStudent.student_name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{selectedStudent.student_name}</p>
                    {selectedStudent.student_code && <p className="text-[10px] text-muted-foreground">#{selectedStudent.student_code}</p>}
                  </div>
                </div>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => archiveThread(selectedStudent.student_id)}
                  className="text-xs gap-1 text-muted-foreground"
                >
                  <Archive className="h-4 w-4" /> نقل للسجلات
                </Button>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                {loadingMessages ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">ابدأ المحادثة</div>
                ) : (
                  <div className="space-y-3 max-w-2xl mx-auto">
                    {messages.map(msg => (
                      <motion.div key={msg.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                        className={`flex ${msg.is_from_teacher ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                          msg.is_from_teacher
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-muted rounded-bl-sm"
                        }`}>
                          {renderMessageContent(msg)}
                        </div>
                      </motion.div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Composer */}
              <div className="p-3 border-t border-border bg-card/80 backdrop-blur-sm">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                {recording ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-destructive/10">
                      <div className="h-3 w-3 rounded-full bg-destructive animate-pulse" />
                      <span className="text-sm text-destructive font-medium">جاري التسجيل...</span>
                    </div>
                    <Button onClick={stopRecording} size="icon" variant="destructive" className="rounded-xl"><Square className="h-4 w-4" /></Button>
                  </div>
                ) : (
                  <div className="flex gap-1.5 items-end">
                    <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="shrink-0 rounded-xl">
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={startRecording} disabled={uploading} className="shrink-0 rounded-xl">
                      <Mic className="h-4 w-4" />
                    </Button>
                    <Input value={newMessage} onChange={e => setNewMessage(e.target.value)}
                      placeholder="اكتب رسالتك..." onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                      className="flex-1 h-10 rounded-xl" dir="rtl" />
                    <Button onClick={handleSend} disabled={sending || !newMessage.trim()} size="icon" className="shrink-0 rounded-xl">
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Context Menu for threads */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-card border border-border rounded-xl shadow-xl p-1 min-w-[150px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={() => setContextMenu(null)}
        >
          <button
            onClick={() => togglePin(contextMenu.threadId)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-accent transition-colors text-right"
          >
            {pinnedIds.includes(contextMenu.threadId) ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            {pinnedIds.includes(contextMenu.threadId) ? "إلغاء التثبيت" : "تثبيت"}
          </button>
          <button
            onClick={() => deleteThread(contextMenu.threadId)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-destructive/10 text-destructive transition-colors text-right"
          >
            <Trash2 className="h-4 w-4" /> حذف
          </button>
        </div>
      )}
      {contextMenu && <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />}
    </TeacherSidebarLayout>
  );
}

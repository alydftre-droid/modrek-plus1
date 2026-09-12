import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2, Send, Search, Megaphone, ChevronRight, Image, Mic, Square,
  Archive, Pin, Trash2, MessageCircle, Mail, PinOff, Eye, Settings, X, Users
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import ChatAttachment from "@/components/chat/ChatAttachment";
import { reportTeacherScopedStudentIds } from "@/lib/testStudentLeakGuard";

interface StudentThread {
  student_id: string;
  student_name: string;
  student_code: string | null;
  last_message: string;
  last_time: string;
  unread_count: number;
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

type SidePanel = "none" | "archives" | "compose" | "broadcast" | "student-info" | "student-list";

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

  const [sidePanel, setSidePanel] = useState<SidePanel>("none");
  const [searchQuery, setSearchQuery] = useState("");
  const [composeSearch, setComposeSearch] = useState("");
  const [searchResults, setSearchResults] = useState<StudentInfo[]>([]);
  const [allStudents, setAllStudents] = useState<StudentInfo[]>([]);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastSending, setBroadcastSending] = useState(false);

  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("teacher_pinned_threads") || "[]"); } catch { return []; }
  });
  const [archivedIds, setArchivedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("teacher_archived_threads") || "[]"); } catch { return []; }
  });
  const [contextMenu, setContextMenu] = useState<{ threadId: string; x: number; y: number } | null>(null);

  const [studentInfoData, setStudentInfoData] = useState<any>(null);
  const [studentInfoLoading, setStudentInfoLoading] = useState(false);
  const [selectedStudentForInfo, setSelectedStudentForInfo] = useState<StudentInfo | null>(null);

  useEffect(() => { localStorage.setItem("teacher_pinned_threads", JSON.stringify(pinnedIds)); }, [pinnedIds]);
  useEffect(() => { localStorage.setItem("teacher_archived_threads", JSON.stringify(archivedIds)); }, [archivedIds]);
  useEffect(() => { if (user) fetchData(); }, [user?.id]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel("teacher-messages")
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

    const { data: allMessages } = await supabase.from("teacher_messages").select("*").eq("teacher_id", user.id).order("created_at", { ascending: false });
    reportTeacherScopedStudentIds("teacher_messages", (allMessages || []).map((msg: any) => msg.student_id), {
      page: "TeacherMessagesPage.fetchData",
    });
    if (!allMessages?.length) { setThreads([]); setLoading(false); return; }

    const studentMap = new Map<string, any[]>();
    for (const msg of allMessages) {
      if (!studentMap.has(msg.student_id)) studentMap.set(msg.student_id, []);
      studentMap.get(msg.student_id)!.push(msg);
    }

    const studentIds = [...studentMap.keys()];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, student_code")
      .in("id", studentIds)
      .eq("is_test_account", false);
    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

    const threadList: StudentThread[] = studentIds.flatMap(sid => {
      const msgs = studentMap.get(sid)!;
      const p = profileMap.get(sid);
      if (!p) return [];
      const unreadMsgs = msgs.filter((m: any) => !m.is_from_teacher && !m.is_read);
      return [{
        student_id: sid, student_name: p.full_name || "طالب", student_code: p.student_code || null,
        last_message: msgs[0].message, last_time: msgs[0].created_at, unread_count: unreadMsgs.length,
      }];
    });
    threadList.sort((a, b) => new Date(b.last_time).getTime() - new Date(a.last_time).getTime());
    setThreads(threadList);
    setLoading(false);
  };

  const fetchMessages = async (studentId: string) => {
    if (!user) return;
    setLoadingMessages(true);
    const { data } = await supabase.from("teacher_messages").select("id, message, is_from_teacher, created_at, is_read, file_url, file_type")
      .eq("teacher_id", user.id).eq("student_id", studentId).order("created_at", { ascending: true });
    reportTeacherScopedStudentIds("teacher_messages", [studentId], {
      page: "TeacherMessagesPage.fetchMessages",
      rows: (data || []).length,
    });
    setMessages((data || []) as Message[]);
    await supabase.from("teacher_messages").update({ is_read: true })
      .eq("teacher_id", user.id).eq("student_id", studentId).eq("is_from_teacher", false);
    // Auto-archive after reading
    if (!archivedIds.includes(studentId)) {
      setArchivedIds(prev => [...prev, studentId]);
    }
    setLoadingMessages(false);
  };

  const handleSelectThread = (thread: StudentThread) => {
    setSelectedStudent(thread);
    fetchMessages(thread.student_id);
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

  const sendMsg = async (text: string, fileUrl?: string, fileType?: string) => {
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

  const handleSend = () => { if (newMessage.trim()) sendMsg(newMessage); };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const url = await uploadFile(file, ext);
    if (url) await sendMsg("", url, "image");
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
        if (url) await sendMsg("", url, "audio");
        setUploading(false);
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setRecording(true);
    } catch { toast.error("لا يمكن الوصول للميكروفون"); }
  };

  const stopRecording = () => { mediaRecorderRef.current?.stop(); setRecording(false); };

  const loadAllStudents = async () => {
    if (!user) return;
    setSidePanel("student-list");
    const { data: choices } = await supabase.from("student_teacher_choices").select("student_id").eq("teacher_id", user.id);
    reportTeacherScopedStudentIds("student_teacher_choices", (choices || []).map(c => c.student_id), {
      page: "TeacherMessagesPage.loadAllStudents",
    });
    const studentIds = [...new Set(choices?.map(c => c.student_id) || [])];
    if (!studentIds.length) { setAllStudents([]); return; }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, student_code, grade, stage")
      .in("id", studentIds)
      .eq("is_test_account", false);
    setAllStudents(profiles || []);
  };

  const handleComposeSearch = async () => {
    if (!composeSearch.trim() || !user) return;
    const { data: choices } = await supabase.from("student_teacher_choices").select("student_id").eq("teacher_id", user.id);
    reportTeacherScopedStudentIds("student_teacher_choices", (choices || []).map(c => c.student_id), {
      page: "TeacherMessagesPage.search",
    });
    const studentIds = [...new Set(choices?.map(c => c.student_id) || [])];
    if (!studentIds.length) { setSearchResults([]); return; }
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, student_code, grade, stage").in("id", studentIds)
      .eq("is_test_account", false)
      .or(`full_name.ilike.%${composeSearch}%,student_code.ilike.%${composeSearch}%`);
    setSearchResults(profiles || []);
  };

  const handleStartThread = (id: string, name: string, code: string | null) => {
    const existing = threads.find(t => t.student_id === id);
    if (existing) handleSelectThread(existing);
    else {
      setSelectedStudent({ student_id: id, student_name: name, student_code: code, last_message: "", last_time: new Date().toISOString(), unread_count: 0 });
      setMessages([]);
    }
    setSidePanel("none");
  };

  const handleBroadcast = async () => {
    if (!user || !broadcastMessage.trim()) return;
    setBroadcastSending(true);
    try {
      const { data: choices } = await supabase.from("student_teacher_choices").select("student_id").eq("teacher_id", user.id);
      reportTeacherScopedStudentIds("student_teacher_choices", (choices || []).map(c => c.student_id), {
        page: "TeacherMessagesPage.broadcast",
      });
      const studentIds = [...new Set(choices?.map(c => c.student_id) || [])];
      if (!studentIds.length) { toast.error("لا يوجد طلاب مسجلين"); setBroadcastSending(false); return; }
      const rows = studentIds.map(sid => ({
        teacher_id: user.id, student_id: sid, message: `📢 رسالة جماعية:\n${broadcastMessage.trim()}`, is_from_teacher: true,
      }));
      await supabase.from("teacher_messages").insert(rows);
      toast.success(`تم إرسال الرسالة لـ ${studentIds.length} طالب`);
      setBroadcastMessage("");
      setSidePanel("none");
      fetchData();
    } catch { toast.error("خطأ في الإرسال"); }
    finally { setBroadcastSending(false); }
  };

  const fetchStudentInfo = async (student: StudentInfo) => {
    if (!user) return;
    setSelectedStudentForInfo(student);
    setStudentInfoLoading(true);
    setSidePanel("student-info");
    const { data: groups } = await supabase.from("content_groups").select("id, title").or(`teacher_id.eq.${user.id},created_by.eq.${user.id}`);
    const groupIds = groups?.map(g => g.id) || [];
    const { data: purchases } = groupIds.length ? await supabase.from("student_group_purchases").select("group_id, purchased_at").eq("student_id", student.id).in("group_id", groupIds) : { data: [] };
    reportTeacherScopedStudentIds("student_group_purchases", [student.id], {
      page: "TeacherMessagesPage.studentInfo",
      rows: (purchases || []).length,
    });
    const { data: content } = groupIds.length ? await supabase.from("content").select("id, title, group_id").in("group_id", groupIds).eq("type", "video") : { data: [] };
    const contentIds = content?.map(c => c.id) || [];
    const { data: videoProgress } = contentIds.length ? await supabase.from("video_progress").select("content_id, progress_seconds, duration_seconds").eq("user_id", student.id).in("content_id", contentIds) : { data: [] };
    const { data: exams } = await supabase.from("exams").select("id, title").eq("created_by", user.id);
    const examIds = exams?.map(e => e.id) || [];
    const { data: attempts } = examIds.length ? await supabase.from("exam_attempts").select("exam_id, score:total_score, total:max_score, submitted_at").eq("student_id", student.id).in("exam_id", examIds) : { data: [] };
    reportTeacherScopedStudentIds("video_progress", [student.id], {
      page: "TeacherMessagesPage.studentInfo",
      rows: (videoProgress || []).length,
    });
    reportTeacherScopedStudentIds("exam_attempts", [student.id], {
      page: "TeacherMessagesPage.studentInfo",
      rows: (attempts || []).length,
    });
    const totalWatchSeconds = (videoProgress as any[])?.reduce((sum: number, v: any) => sum + (v.progress_seconds || 0), 0) || 0;
    const totalDurationSeconds = (videoProgress as any[])?.reduce((sum: number, v: any) => sum + (v.duration_seconds || 0), 0) || 0;
    setStudentInfoData({
      groups: groups || [], purchases: purchases || [], videoProgress: videoProgress || [], content: content || [],
      exams: exams || [], attempts: attempts || [],
      totalWatchMinutes: Math.round(totalWatchSeconds / 60), totalDurationMinutes: Math.round(totalDurationSeconds / 60),
      completedVideos: videoProgress?.filter(v => v.progress_seconds >= v.duration_seconds * 0.9).length || 0,
      totalVideos: content?.length || 0,
    });
    setStudentInfoLoading(false);
  };

  // Thread sorting and filtering
  const sortedThreads = (list: StudentThread[]) => {
    return [...list].sort((a, b) => {
      const ap = pinnedIds.includes(a.student_id) ? 1 : 0;
      const bp = pinnedIds.includes(b.student_id) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      if (a.unread_count !== b.unread_count) return b.unread_count - a.unread_count;
      return new Date(b.last_time).getTime() - new Date(a.last_time).getTime();
    });
  };

  const inboxThreads = threads.filter(t => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return t.student_name.toLowerCase().includes(q) || (t.student_code || "").toLowerCase().includes(q);
    }
    return !archivedIds.includes(t.student_id) || t.unread_count > 0;
  });

  const archiveThreadsList = threads.filter(t => archivedIds.includes(t.student_id));

  const formatTime = (d: string) => new Date(d).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });

  if (loading) {
    return (
      <TeacherSidebarLayout title="الرسائل" teacherName={teacherName}>
        <div className="flex items-center justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
      </TeacherSidebarLayout>
    );
  }

  return (
    <TeacherSidebarLayout title="التواصل مع الطلبة" teacherName={teacherName}>
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card" dir="rtl">
        
        {/* Right Sidebar - Threads */}
        <div className={`w-full md:w-[340px] border-l border-border flex flex-col bg-gradient-to-b from-card to-muted/10 ${selectedStudent ? "hidden md:flex" : "flex"}`}>
          {/* Top Bar */}
          <div className="p-3 border-b border-border space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-sky-500" />
                الرسائل
              </h2>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSidePanel(sidePanel === "archives" ? "none" : "archives")}>
                <Settings className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="بحث بالاسم أو الكود..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="pr-9 h-9 rounded-xl text-sm bg-muted/50 border-0 focus-visible:ring-sky-400" />
            </div>

            {/* Action buttons */}
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={() => { setSidePanel("compose"); setComposeSearch(""); setSearchResults([]); }}
                className="flex-1 text-xs gap-1.5 rounded-xl h-8 border-sky-200 text-sky-600 hover:bg-sky-50">
                <Mail className="h-3.5 w-3.5" /> رسالة لطالب
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSidePanel("broadcast")}
                className="flex-1 text-xs gap-1.5 rounded-xl h-8 border-amber-200 text-amber-600 hover:bg-amber-50">
                <Megaphone className="h-3.5 w-3.5" /> رسالة للجميع
              </Button>
            </div>
          </div>

          {/* Thread List */}
          <ScrollArea className="flex-1">
            <AnimatePresence mode="wait">
              {sidePanel === "archives" ? (
                <motion.div key="archives" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-2">
                  <div className="flex items-center justify-between px-2 py-1 mb-2">
                    <p className="text-xs font-bold text-muted-foreground flex items-center gap-1"><Archive className="h-3 w-3" /> السجلات ({archiveThreadsList.length})</p>
                    <Button variant="ghost" size="sm" onClick={() => setSidePanel("none")} className="h-7 text-xs"><X className="h-3 w-3" /></Button>
                  </div>
                  {archiveThreadsList.length === 0 ? (
                    <p className="text-center text-xs text-muted-foreground py-8">لا توجد سجلات</p>
                  ) : sortedThreads(archiveThreadsList).map(t => <ThreadItem key={t.student_id} thread={t} />)}
                </motion.div>
              ) : sidePanel === "compose" ? (
                <motion.div key="compose" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold">إرسال رسالة لطالب</p>
                    <Button variant="ghost" size="sm" onClick={() => setSidePanel("none")} className="h-7"><X className="h-3.5 w-3.5" /></Button>
                  </div>
                  <div className="flex gap-2">
                    <Input placeholder="اسم الطالب أو الكود..." value={composeSearch} onChange={e => setComposeSearch(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleComposeSearch()} className="h-9 rounded-xl text-sm" />
                    <Button size="sm" onClick={handleComposeSearch} className="rounded-xl h-9 px-3 bg-sky-500 hover:bg-sky-600"><Search className="h-3.5 w-3.5" /></Button>
                  </div>
                  <Button variant="outline" size="sm" onClick={loadAllStudents} className="w-full text-xs gap-1.5 rounded-xl h-8">
                    <Users className="h-3.5 w-3.5" /> عرض جميع الطلاب
                  </Button>
                  {searchResults.map(s => <StudentCard key={s.id} student={s} />)}
                </motion.div>
              ) : sidePanel === "broadcast" ? (
                <motion.div key="broadcast" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold flex items-center gap-2 text-amber-600"><Megaphone className="h-4 w-4" /> رسالة جماعية</p>
                    <Button variant="ghost" size="sm" onClick={() => setSidePanel("none")} className="h-7"><X className="h-3.5 w-3.5" /></Button>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200/60">
                    <p className="text-xs text-amber-700">ستصل الرسالة لجميع الطلاب المسجلين معك</p>
                  </div>
                  <Textarea placeholder="اكتب رسالتك لجميع الطلاب..." value={broadcastMessage} onChange={e => setBroadcastMessage(e.target.value)}
                    className="min-h-[100px] rounded-xl text-sm" dir="rtl" />
                  <Button onClick={handleBroadcast} disabled={broadcastSending || !broadcastMessage.trim()} className="w-full gap-2 rounded-xl h-10 bg-amber-500 hover:bg-amber-600">
                    {broadcastSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    إرسال للجميع
                  </Button>
                </motion.div>
              ) : sidePanel === "student-list" ? (
                <motion.div key="student-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold">جميع الطلاب</p>
                    <Button variant="ghost" size="sm" onClick={() => setSidePanel("compose")} className="h-7 text-xs gap-1"><ChevronRight className="h-3.5 w-3.5" /> رجوع</Button>
                  </div>
                  {allStudents.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">لا يوجد طلاب مسجلين</p>
                  ) : allStudents.map(s => <StudentCard key={s.id} student={s} />)}
                </motion.div>
              ) : sidePanel === "student-info" && selectedStudentForInfo ? (
                <motion.div key="student-info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-3 space-y-3">
                  <Button variant="ghost" size="sm" onClick={() => setSidePanel("compose")} className="gap-1 text-muted-foreground h-7 text-xs">
                    <ChevronRight className="h-3.5 w-3.5" /> رجوع
                  </Button>
                  <div className="p-4 rounded-xl bg-gradient-to-br from-sky-50 to-blue-50 border border-sky-200/50 text-center">
                    <div className="h-14 w-14 rounded-full bg-sky-100 flex items-center justify-center mx-auto text-lg font-bold text-sky-600 mb-2 border-2 border-sky-200">
                      {selectedStudentForInfo.full_name.charAt(0)}
                    </div>
                    <p className="font-bold text-sm">{selectedStudentForInfo.full_name}</p>
                    {selectedStudentForInfo.student_code && <p className="text-xs text-muted-foreground">#{selectedStudentForInfo.student_code}</p>}
                  </div>
                  {studentInfoLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-sky-500" /></div>
                  ) : studentInfoData && (
                    <div className="space-y-2.5">
                      <div className="p-3 rounded-xl bg-background border border-border/50">
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5">📺 وقت المشاهدة</p>
                        <p className="text-xl font-bold text-sky-600">{studentInfoData.totalWatchMinutes} <span className="text-xs font-normal">دقيقة</span></p>
                        <p className="text-[10px] text-muted-foreground">{studentInfoData.completedVideos} من {studentInfoData.totalVideos} فيديو مكتمل</p>
                      </div>
                      <div className="p-3 rounded-xl bg-background border border-border/50">
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5">📝 الامتحانات</p>
                        {studentInfoData.attempts?.length > 0 ? (
                          <div className="space-y-1">
                            {studentInfoData.attempts.map((a: any, i: number) => {
                              const exam = studentInfoData.exams.find((e: any) => e.id === a.exam_id);
                              return (
                                <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded-lg bg-muted/30">
                                  <span className="truncate flex-1">{exam?.title || "امتحان"}</span>
                                  <Badge variant={a.score >= a.total * 0.5 ? "default" : "destructive"} className="text-[10px]">{a.score}/{a.total}</Badge>
                                </div>
                              );
                            })}
                          </div>
                        ) : <p className="text-[10px] text-muted-foreground">لا توجد محاولات</p>}
                      </div>
                      <Button onClick={() => handleStartThread(selectedStudentForInfo.id, selectedStudentForInfo.full_name, selectedStudentForInfo.student_code)} className="w-full rounded-xl gap-2 h-9 text-sm bg-sky-500 hover:bg-sky-600">
                        <Send className="h-3.5 w-3.5" /> إرسال رسالة
                      </Button>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div key="inbox" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {sortedThreads(inboxThreads).length === 0 ? (
                    <div className="p-8 text-center">
                      <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground/15 mb-3" />
                      <p className="text-sm text-muted-foreground">لا توجد رسائل جديدة</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">أرسل رسالة لطالب للبدء</p>
                    </div>
                  ) : (
                    <div className="p-1.5 space-y-0.5">
                      {sortedThreads(inboxThreads).map(t => <ThreadItem key={t.student_id} thread={t} />)}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </ScrollArea>
        </div>

        {/* Chat Area */}
        <div className={`flex-1 flex flex-col ${!selectedStudent ? "hidden md:flex" : "flex"}`}
          style={{ 
            background: "linear-gradient(180deg, hsl(210 40% 98%) 0%, hsl(210 30% 96%) 100%)",
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2394a3b8' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}>
          {!selectedStudent ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center p-8">
                <div className="h-20 w-20 rounded-full bg-sky-50 border-2 border-sky-100 flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="h-10 w-10 text-sky-200" />
                </div>
                <p className="text-lg font-bold text-foreground/60">اختر محادثة أو أرسل رسالة</p>
                <p className="text-sm text-muted-foreground mt-1">اختر طالب من القائمة للبدء</p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="flex items-center justify-between p-3 border-b border-sky-100 bg-white/80 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="icon" className="md:hidden shrink-0 h-8 w-8" onClick={() => setSelectedStudent(null)}>
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center text-sm font-bold text-white shadow-sm">
                    {selectedStudent.student_name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{selectedStudent.student_name}</p>
                    {selectedStudent.student_code && <p className="text-[10px] text-muted-foreground">#{selectedStudent.student_code}</p>}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                {loadingMessages ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-sky-500" /></div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">ابدأ المحادثة</div>
                ) : (
                  <div className="space-y-2.5 max-w-2xl mx-auto">
                    {messages.map(msg => (
                      <motion.div key={msg.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                        className={`flex ${msg.is_from_teacher ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                          msg.is_from_teacher
                            ? "bg-gradient-to-br from-sky-500 to-blue-600 text-white rounded-br-sm shadow-sky-200/30 shadow-sm"
                            : "bg-white border border-sky-100 rounded-bl-sm shadow-sm"
                        }`}>
                          {msg.file_url && (msg.file_type === "image" || msg.file_type === "audio") && (
                            <ChatAttachment url={msg.file_url} type={msg.file_type} />
                          )}
                          {msg.message && !(msg.file_url && (msg.message === "📷 صورة" || msg.message === "🎤 رسالة صوتية")) && (
                            <p className="whitespace-pre-wrap">{msg.message}</p>
                          )}
                          <p className={`text-[10px] mt-1 ${msg.is_from_teacher ? "text-white/60" : "text-sky-400"}`}>
                            {formatTime(msg.created_at)}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Composer */}
              <div className="p-3 border-t border-sky-100 bg-white/80 backdrop-blur-sm">
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
                    <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="shrink-0 rounded-xl h-9 w-9 text-sky-500 hover:bg-sky-50">
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={startRecording} disabled={uploading} className="shrink-0 rounded-xl h-9 w-9 text-sky-500 hover:bg-sky-50">
                      <Mic className="h-4 w-4" />
                    </Button>
                    <Input value={newMessage} onChange={e => setNewMessage(e.target.value)}
                      placeholder="اكتب رسالتك..." onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                      className="flex-1 h-9 rounded-xl border-sky-200 focus-visible:ring-sky-400 text-sm" dir="rtl" />
                    <Button onClick={handleSend} disabled={sending || !newMessage.trim()} size="icon" className="shrink-0 rounded-xl h-9 w-9 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700">
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div className="fixed z-50 bg-card border border-border rounded-xl shadow-xl p-1 min-w-[140px]" style={{ top: contextMenu.y, left: contextMenu.x }}>
            <button onClick={() => togglePin(contextMenu.threadId)} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-accent transition-colors text-right">
              {pinnedIds.includes(contextMenu.threadId) ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              {pinnedIds.includes(contextMenu.threadId) ? "إلغاء التثبيت" : "تثبيت"}
            </button>
            <button onClick={() => deleteThread(contextMenu.threadId)} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-destructive/10 text-destructive transition-colors text-right">
              <Trash2 className="h-4 w-4" /> حذف
            </button>
          </div>
        </>
      )}
    </TeacherSidebarLayout>
  );

  function StudentCard({ student }: { student: StudentInfo }) {
    return (
      <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-background border border-border/50 hover:border-sky-200 transition-all">
        <div className="h-9 w-9 rounded-full bg-sky-100 flex items-center justify-center text-xs font-bold text-sky-600 shrink-0">
          {student.full_name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{student.full_name}</p>
          {student.student_code && <p className="text-[10px] text-muted-foreground">#{student.student_code}</p>}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => fetchStudentInfo(student)} className="h-7 w-7 p-0 text-sky-500 hover:bg-sky-50">
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" onClick={() => handleStartThread(student.id, student.full_name, student.student_code)} className="h-7 rounded-lg text-[10px] gap-1 px-2 bg-sky-500 hover:bg-sky-600">
            <Send className="h-3 w-3" /> رسالة
          </Button>
        </div>
      </div>
    );
  }

  function ThreadItem({ thread }: { thread: StudentThread }) {
    const isPinned = pinnedIds.includes(thread.student_id);
    return (
      <motion.button layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        onClick={() => handleSelectThread(thread)}
        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ threadId: thread.student_id, x: e.clientX, y: e.clientY }); }}
        className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl transition-all text-right hover:bg-sky-50/50 ${
          selectedStudent?.student_id === thread.student_id ? "bg-sky-50 border border-sky-200" : ""
        } ${isPinned ? "border-r-2 border-r-sky-400" : ""}`}
      >
        <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
          thread.unread_count > 0 ? "bg-gradient-to-br from-sky-400 to-blue-500 text-white" : "bg-sky-100 text-sky-600"
        }`}>
          {thread.student_name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              {isPinned && <Pin className="h-2.5 w-2.5 text-sky-500 shrink-0" />}
              <p className="text-sm font-bold truncate">{thread.student_name}</p>
            </div>
            {thread.unread_count > 0 && (
              <Badge className="bg-sky-500 text-white text-[10px] h-5 min-w-[20px] p-0 flex items-center justify-center rounded-full shrink-0">
                {thread.unread_count}
              </Badge>
            )}
          </div>
          {thread.student_code && <p className="text-[10px] text-muted-foreground">#{thread.student_code}</p>}
          <p className="text-xs text-muted-foreground truncate mt-0.5">{thread.last_message.substring(0, 40)}</p>
        </div>
      </motion.button>
    );
  }
}

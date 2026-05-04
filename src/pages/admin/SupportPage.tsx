import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowRight,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  Clock3,
  FolderClock,
  FolderOpen,
  GraduationCap,
  Headphones,
  Image as ImageIcon,
  Loader2,
  MessageCircleMore,
  MoreVertical,
  RefreshCw,
  Search,
  Send,
  StickyNote,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import { useSupportTyping } from "@/hooks/useSupportTyping";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SUPPORT_BUCKET = "support-uploads";

type SupportSection = "students" | "teachers" | "students_archive" | "teachers_archive";
type ViewMode = "home" | "list" | "chat";
type ResolutionState = "solved" | "unsolved" | null;

interface Conversation {
  user_id: string;
  user_name: string;
  user_code: string | null;
  avatar_url: string | null;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  is_teacher: boolean;
  is_archived: boolean;
  resolution_state: ResolutionState;
}

interface SupportMessage {
  id: string;
  message: string;
  is_from_admin: boolean;
  created_at: string;
  is_read: boolean;
  file_url?: string | null;
  file_type?: string | null;
  attachment_url?: string | null;
}

interface InternalNote {
  id: string;
  note: string;
  created_at: string;
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/_+/g, "_");
}

function supportFilePath(userId: string, fileName: string) {
  return `${userId}/admin_${Date.now()}_${sanitizeFileName(fileName)}`;
}

async function getSignedSupportUrl(filePath: string | null | undefined) {
  if (!filePath) return null;
  const { data, error } = await supabase.storage.from(SUPPORT_BUCKET).createSignedUrl(filePath, 60 * 60 * 24);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

function isSolvedMessage(text: string) {
  return text.includes("تم حل المشكلة") || text.includes('كـ"تم حل المشكلة"');
}

function isArchiveMessage(text: string) {
  return text.includes("نقل المحادثة إلى السجلات") || text.includes("تم النقل للسجلات");
}

const SECTION_META: Record<SupportSection, { title: string; subtitle: string; icon: any; from: string; to: string; accent: string }> = {
  students: {
    title: "دعم الطلبة",
    subtitle: "الطلبات الحالية من الطلبة",
    icon: MessageCircleMore,
    from: "hsl(var(--sub-card-1-from))",
    to: "hsl(var(--sub-card-1-to))",
    accent: "hsl(var(--sub-card-1-border))",
  },
  teachers: {
    title: "دعم المعلمين",
    subtitle: "الطلبات الحالية من المعلمين",
    icon: Users,
    from: "hsl(var(--sub-card-2-from))",
    to: "hsl(var(--sub-card-2-to))",
    accent: "hsl(var(--sub-card-2-border))",
  },
  students_archive: {
    title: "سجل الطلبة",
    subtitle: "كل المحادثات السابقة للطلبة",
    icon: FolderOpen,
    from: "hsl(var(--sub-card-5-from))",
    to: "hsl(var(--sub-card-5-to))",
    accent: "hsl(var(--sub-card-5-border))",
  },
  teachers_archive: {
    title: "سجل المعلمين",
    subtitle: "كل المحادثات السابقة للمعلمين",
    icon: FolderClock,
    from: "hsl(var(--sub-card-4-from))",
    to: "hsl(var(--sub-card-4-to))",
    accent: "hsl(var(--sub-card-4-border))",
  },
};

export default function SupportPage() {
  const { user: adminUser } = useAuth();
  const playSound = useNotificationSound();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<ViewMode>("home");
  const [section, setSection] = useState<SupportSection>("students");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [newNote, setNewNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  const { otherTyping: userTyping, sendTyping } = useSupportTyping(selectedUserId, "admin");

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.user_id === selectedUserId) ?? null,
    [conversations, selectedUserId],
  );

  const hydrateMessages = useCallback(async (rows: any[]) => {
    const hydrated = await Promise.all(
      (rows || []).map(async (row) => ({
        ...row,
        is_from_admin: !!row.is_from_admin,
        is_read: !!row.is_read,
        attachment_url: row.file_url ? await getSignedSupportUrl(row.file_url) : null,
      })),
    );
    return hydrated as SupportMessage[];
  }, []);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from("support_messages")
        .select("id, user_id, message, is_from_admin, is_read, created_at, is_teacher_request, is_resolved")
        .order("created_at", { ascending: false })
        .limit(4000);
      if (error) throw error;

      const map = new Map<string, Conversation>();
      for (const row of rows || []) {
        const current = map.get(row.user_id);
        const resolvedText = typeof row.message === "string" ? row.message : "";
        const rowArchived = !!row.is_resolved || isSolvedMessage(resolvedText) || isArchiveMessage(resolvedText);
        const rowResolution: ResolutionState = isSolvedMessage(resolvedText) ? "solved" : isArchiveMessage(resolvedText) ? "unsolved" : null;

        if (!current) {
          map.set(row.user_id, {
            user_id: row.user_id,
            user_name: "",
            user_code: null,
            avatar_url: null,
            last_message: row.message,
            last_message_at: row.created_at || new Date().toISOString(),
            unread_count: !row.is_from_admin && !row.is_read ? 1 : 0,
            is_teacher: !!row.is_teacher_request,
            is_archived: rowArchived,
            resolution_state: rowResolution,
          });
          continue;
        }

        if (!row.is_from_admin && !row.is_read) current.unread_count += 1;
        current.is_teacher = current.is_teacher || !!row.is_teacher_request;
        current.is_archived = current.is_archived || rowArchived;
        if (!current.resolution_state && rowResolution) current.resolution_state = rowResolution;
      }

      const userIds = Array.from(map.keys());
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, student_code, teacher_code, avatar_url")
          .in("id", userIds);

        for (const profile of profiles || []) {
          const conversation = map.get(profile.id);
          if (!conversation) continue;
          conversation.user_name = profile.full_name || (conversation.is_teacher ? "معلم" : "طالب");
          conversation.user_code = conversation.is_teacher ? profile.teacher_code : profile.student_code;
          conversation.avatar_url = profile.avatar_url;
        }
      }

      const next = Array.from(map.values()).sort((a, b) => {
        if (a.unread_count !== b.unread_count) return b.unread_count - a.unread_count;
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      });
      setConversations(next);
    } catch (error) {
      console.error(error);
      toast.error("تعذر تحميل طلبات الدعم");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (userId: string) => {
    const { data: rows, error } = await supabase
      .from("support_messages")
      .select("id, message, is_from_admin, created_at, is_read, file_url, file_type")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const hydrated = await hydrateMessages(rows || []);
    setMessages(hydrated);

    await supabase
      .from("support_messages")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_from_admin", false)
      .eq("is_read", false);
  }, [hydrateMessages]);

  const loadNotes = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("support_internal_notes")
      .select("id, note, created_at")
      .eq("conversation_user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    setNotes((data as InternalNote[]) || []);
  }, []);

  const openSection = (nextSection: SupportSection) => {
    setSection(nextSection);
    setView("list");
    setSelectedUserId(null);
  };

  const openConversation = async (userId: string) => {
    setSelectedUserId(userId);
    setView("chat");
    try {
      await Promise.all([loadMessages(userId), loadNotes(userId)]);
      setConversations((prev) => prev.map((item) => (item.user_id === userId ? { ...item, unread_count: 0 } : item)));
    } catch (error) {
      console.error(error);
      toast.error("تعذر فتح المحادثة");
    }
  };

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-support-live-v3")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, async (payload) => {
        const next = payload.new as any;
        if (!next.is_from_admin) playSound();

        if (selectedUserId && next.user_id === selectedUserId) {
          const hydrated = await hydrateMessages([next]);
          setMessages((prev) => (prev.some((message) => message.id === next.id) ? prev : [...prev, hydrated[0]]));
          if (!next.is_from_admin) {
            await supabase.from("support_messages").update({ is_read: true }).eq("id", next.id);
          }
        }

        await loadConversations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [hydrateMessages, loadConversations, playSound, selectedUserId]);

  const handleSendReply = async () => {
    if (!selectedUserId || !newMessage.trim()) return;
    setSending(true);
    try {
      const { error } = await supabase.from("support_messages").insert({
        user_id: selectedUserId,
        message: newMessage.trim(),
        is_from_admin: true,
        is_teacher_request: !!selectedConversation?.is_teacher,
      });
      if (error) throw error;
      setNewMessage("");
    } catch (error) {
      console.error(error);
      toast.error("تعذر إرسال الرسالة");
    } finally {
      setSending(false);
    }
  };

  const handleUploadImage = async (file: File) => {
    if (!selectedUserId) return;
    setUploading(true);
    try {
      const path = supportFilePath(selectedUserId, file.name);
      const { error: uploadError } = await supabase.storage.from(SUPPORT_BUCKET).upload(path, file, {
        upsert: false,
        contentType: file.type || undefined,
      });
      if (uploadError) throw uploadError;

      const { error } = await supabase.from("support_messages").insert({
        user_id: selectedUserId,
        message: newMessage.trim() || "📷 صورة من الدعم",
        is_from_admin: true,
        is_teacher_request: !!selectedConversation?.is_teacher,
        file_url: path,
        file_type: "image",
      });
      if (error) throw error;
      setNewMessage("");
      toast.success("تم إرسال الصورة");
    } catch (error) {
      console.error(error);
      toast.error("تعذر إرسال الصورة");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleResolve = async (resolved: boolean) => {
    if (!selectedUserId) return;
    try {
      const { error } = await supabase.rpc("set_support_resolution", {
        _user_id: selectedUserId,
        _resolved: resolved,
      });
      if (error) throw error;

      await supabase.from("support_messages").insert({
        user_id: selectedUserId,
        message: resolved
          ? "✅ تم حل المشكلة ونقل المحادثة إلى السجلات. إذا عادت المشكلة يمكنك المتابعة من نفس المحادثة."
          : "📋 لم يتم حل المشكلة حتى الآن وتم نقل المحادثة إلى السجلات للمتابعة لاحقاً.",
        is_from_admin: true,
        is_teacher_request: !!selectedConversation?.is_teacher,
        is_resolved: true,
      });

      toast.success(resolved ? "تم تعليم الطلب كمحلول" : "تم نقل الطلب للسجلات كغير محلول");
      setView("list");
      setSelectedUserId(null);
      await loadConversations();
    } catch (error) {
      console.error(error);
      toast.error("تعذر تحديث حالة الطلب");
    }
  };

  const handleAddNote = async () => {
    if (!selectedUserId || !adminUser || !newNote.trim()) return;
    setSavingNote(true);
    try {
      const { data, error } = await supabase
        .from("support_internal_notes")
        .insert({
          conversation_user_id: selectedUserId,
          admin_id: adminUser.id,
          note: newNote.trim(),
        })
        .select("id, note, created_at")
        .single();
      if (error) throw error;
      setNotes((prev) => [data as InternalNote, ...prev]);
      setNewNote("");
    } catch (error) {
      console.error(error);
      toast.error("تعذر حفظ الملاحظة");
    } finally {
      setSavingNote(false);
    }
  };

  const stats = useMemo(() => ({
    students: conversations.filter((item) => !item.is_teacher && !item.is_archived),
    teachers: conversations.filter((item) => item.is_teacher && !item.is_archived),
    studentsArchive: conversations.filter((item) => !item.is_teacher && item.is_archived),
    teachersArchive: conversations.filter((item) => item.is_teacher && item.is_archived),
  }), [conversations]);

  const visibleConversations = useMemo(() => {
    const isArchive = section.includes("archive");
    const isTeacher = section.includes("teachers");

    return conversations.filter((item) => {
      if (isTeacher !== item.is_teacher) return false;
      if (isArchive !== item.is_archived) return false;

      const haystack = `${item.user_name} ${item.user_code || ""} ${item.last_message || ""}`.toLowerCase();
      const matchesSearch = !searchQuery.trim() || haystack.includes(searchQuery.trim().toLowerCase());
      if (!matchesSearch) return false;

      const date = new Date(item.last_message_at);
      if (fromDate) {
        const start = new Date(`${fromDate}T${fromTime || "00:00"}:00`);
        if (date < start) return false;
      }
      if (toDate) {
        const end = new Date(`${toDate}T${toTime || "23:59"}:59`);
        if (date > end) return false;
      }
      return true;
    });
  }, [conversations, fromDate, fromTime, searchQuery, section, toDate, toTime]);

  const currentMeta = SECTION_META[section];
  const pendingCount = conversations.filter((item) => item.unread_count > 0 && !item.is_archived).length;

  return (
    <div className="min-h-[calc(100vh-7rem)] overflow-hidden rounded-[28px] border border-border/60 bg-background" dir="rtl">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleUploadImage(file);
        }}
      />

      {view === "home" && (
        <div className="space-y-5 p-4 md:p-6">
          <div className="rounded-[28px] border border-border/60 bg-card p-4 shadow-dashboard-soft md:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Headphones className="h-4 w-4" /> مركز الدعم الفني
                </div>
                <h2 className="text-3xl font-black text-foreground">صفحة الدعم الرئيسية</h2>
                <p className="mt-1 text-sm text-muted-foreground">تنقل سريع بين طلبات الطلبة والمعلمين والسجلات مع بحث وفلاتر وواجهة محادثة كاملة.</p>
              </div>
              <Button variant="outline" onClick={() => void loadConversations()} className="gap-2 rounded-2xl">
                <RefreshCw className="h-4 w-4" /> تحديث
              </Button>
            </div>

            <div className="relative mt-4">
              <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="ابحث باسم الطالب / المعلم أو الكود أو نص الطلب..."
                className="h-12 rounded-2xl border-border/70 bg-background pr-11 text-sm"
              />
            </div>
          </div>

          {pendingCount > 0 && (
            <div className="student-ticker-shell relative overflow-hidden rounded-[24px] px-4 py-3 text-sm font-semibold">
              <div className="student-ticker-glow absolute inset-0" />
              <div className="relative z-10 flex items-center gap-3">
                <span className="student-ticker-dot h-2.5 w-2.5 rounded-full" />
                <span>يوجد الآن {pendingCount} طلب بانتظار الرد الفوري.</span>
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <HomeCard sectionKey="students" count={stats.students.length} unread={stats.students.filter((item) => item.unread_count > 0).length} onClick={openSection} />
            <HomeCard sectionKey="teachers" count={stats.teachers.length} unread={stats.teachers.filter((item) => item.unread_count > 0).length} onClick={openSection} />
            <HomeCard sectionKey="students_archive" count={stats.studentsArchive.length} unread={0} onClick={openSection} />
            <HomeCard sectionKey="teachers_archive" count={stats.teachersArchive.length} unread={0} onClick={openSection} />
          </div>
        </div>
      )}

      {view === "list" && (
        <div className="space-y-5 p-4 md:p-6">
          <div className="rounded-[28px] border border-border/60 bg-card p-4 shadow-dashboard-soft md:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="rounded-2xl" onClick={() => setView("home")}>
                  <ArrowRight className="h-5 w-5" />
                </Button>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-white" style={{ background: `linear-gradient(135deg, ${currentMeta.from}, ${currentMeta.to})` }}>
                  <currentMeta.icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-2xl font-black">{currentMeta.title}</h3>
                  <p className="text-sm text-muted-foreground">{currentMeta.subtitle}</p>
                </div>
              </div>
              <Badge className="h-8 rounded-full border-0 px-4 text-sm" style={{ backgroundColor: currentMeta.accent, color: "hsl(var(--primary-foreground))" }}>
                {visibleConversations.length} طلب
              </Badge>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))]">
              <div className="relative">
                <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="ابحث داخل هذه الصفحة" className="h-11 rounded-2xl pr-11" />
              </div>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-11 rounded-2xl" />
              <Input type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} className="h-11 rounded-2xl" />
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-11 rounded-2xl" />
              <Input type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} className="h-11 rounded-2xl" />
            </div>
          </div>

          <div className="grid gap-3">
            {loading ? (
              <div className="flex items-center justify-center rounded-[28px] border border-border/60 bg-card p-14">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              </div>
            ) : visibleConversations.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-border bg-card p-14 text-center">
                <CalendarDays className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-lg font-bold">لا توجد نتائج مطابقة</p>
                <p className="mt-1 text-sm text-muted-foreground">جرّب تعديل البحث أو تاريخ السجل.</p>
              </div>
            ) : (
              visibleConversations.map((conversation) => (
                <ConversationCard key={conversation.user_id} conversation={conversation} onClick={() => void openConversation(conversation.user_id)} />
              ))
            )}
          </div>
        </div>
      )}

      {view === "chat" && selectedConversation && (
        <div className="flex min-h-[calc(100vh-7rem)] flex-col bg-background">
          <div className="border-b border-border/60 bg-card px-4 py-3 md:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Button variant="ghost" size="icon" className="rounded-2xl" onClick={() => setView("list")}>
                  <ArrowRight className="h-5 w-5" />
                </Button>
                <AvatarBubble conversation={selectedConversation} large />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-lg font-black">{selectedConversation.user_name}</h3>
                    <Badge variant="outline" className="rounded-full px-3 text-[11px]">
                      {selectedConversation.is_teacher ? "معلم" : "طالب"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedConversation.user_code ? `#${selectedConversation.user_code}` : "بدون كود"} • {userTyping ? "يكتب الآن..." : "متصل الآن"}
                  </p>
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-2xl">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 rounded-2xl">
                  <DropdownMenuItem className="gap-2 text-emerald" onClick={() => void handleResolve(true)}>
                    <CheckCircle2 className="h-4 w-4" /> تم حل المشكلة
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="gap-2 text-destructive" onClick={() => void handleResolve(false)}>
                    <XCircle className="h-4 w-4" /> لم يتم حل المشكلة
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex-1 overflow-hidden px-3 py-3 md:px-6 md:py-5" style={{ background: "linear-gradient(180deg, hsl(var(--teacher-chat-from)) 0%, hsl(var(--teacher-chat-to)) 100%)" }}>
            <div className="grid h-full gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-border/60 bg-card/70 backdrop-blur">
                <ScrollArea className="flex-1 px-4 py-5 md:px-6">
                  <div className="mx-auto flex max-w-3xl flex-col gap-4">
                    {messages.map((message) => (
                      <ChatBubble key={message.id} message={message} />
                    ))}
                    {userTyping && <TypingBubble />}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                <div className="border-t border-border/60 bg-card px-4 py-3 md:px-6">
                  <div className="mx-auto flex max-w-3xl items-end gap-2">
                    <Button type="button" variant="outline" size="icon" className="h-11 w-11 rounded-2xl" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                    </Button>
                    <Textarea
                      value={newMessage}
                      onChange={(event) => {
                        setNewMessage(event.target.value);
                        sendTyping();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void handleSendReply();
                        }
                      }}
                      placeholder="اكتب ردك هنا أو أرسل صورة للمستخدم..."
                      className="min-h-[48px] rounded-2xl border-border/70 bg-background text-sm"
                    />
                    <Button type="button" className="h-11 rounded-2xl px-5" disabled={sending || (!newMessage.trim() && !uploading)} onClick={() => void handleSendReply()}>
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
                <div className="rounded-[28px] border border-border/60 bg-card p-4 shadow-dashboard-soft">
                  <div className="mb-3 flex items-center gap-2">
                    <StickyNote className="h-4 w-4 text-primary" />
                    <h4 className="font-bold">ملاحظات داخلية للمطور</h4>
                  </div>
                  <Textarea value={newNote} onChange={(event) => setNewNote(event.target.value)} placeholder="اكتب ملاحظة خاصة بالمحادثة..." className="min-h-[90px] rounded-2xl" />
                  <Button className="mt-3 w-full rounded-2xl" disabled={savingNote || !newNote.trim()} onClick={() => void handleAddNote()}>
                    {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <StickyNote className="h-4 w-4" />} حفظ الملاحظة
                  </Button>
                </div>

                <ScrollArea className="min-h-0 flex-1 rounded-[28px] border border-border/60 bg-card p-4 shadow-dashboard-soft">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Clock3 className="h-4 w-4 text-primary" />
                      <h4 className="font-bold">سجل الملاحظات</h4>
                    </div>
                    {notes.length === 0 ? (
                      <p className="rounded-2xl bg-muted px-4 py-5 text-sm text-muted-foreground">لا توجد ملاحظات داخلية حتى الآن.</p>
                    ) : (
                      notes.map((note) => (
                        <div key={note.id} className="rounded-2xl border border-border/60 bg-background px-4 py-3">
                          <p className="text-sm leading-7">{note.note}</p>
                          <p className="mt-2 text-[11px] text-muted-foreground">{new Date(note.created_at).toLocaleString("ar-EG")}</p>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HomeCard({
  sectionKey,
  count,
  unread,
  onClick,
}: {
  sectionKey: SupportSection;
  count: number;
  unread: number;
  onClick: (section: SupportSection) => void;
}) {
  const meta = SECTION_META[sectionKey];
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={() => onClick(sectionKey)}
      className="relative overflow-hidden rounded-[30px] border border-border/60 p-5 text-right shadow-dashboard-soft transition-transform duration-300 hover:-translate-y-1"
      style={{ background: `linear-gradient(135deg, ${meta.from} 0%, ${meta.to} 100%)` }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.26),transparent_46%)]" />
      {unread > 0 && <span className="absolute left-4 top-4 flex h-8 min-w-8 items-center justify-center rounded-full bg-white/90 px-2 text-xs font-black text-foreground">{unread}</span>}
      <div className="relative z-10 flex min-h-[180px] flex-col justify-between text-primary-foreground">
        <div className="flex items-start justify-between gap-4">
          <div className="rounded-2xl bg-white/18 p-3 backdrop-blur">
            <Icon className="h-6 w-6" />
          </div>
        </div>
        <div>
          <h3 className="text-3xl font-black">{meta.title}</h3>
          <p className="mt-2 max-w-[18rem] text-sm text-white/80">{meta.subtitle}</p>
          <div className="mt-5 flex items-end justify-between">
            <span className="text-5xl font-black leading-none">{count}</span>
            <span className="rounded-full bg-white/15 px-4 py-2 text-xs font-bold backdrop-blur">فتح الصفحة</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function AvatarBubble({ conversation, large = false }: { conversation: Conversation; large?: boolean }) {
  const size = large ? "h-12 w-12" : "h-14 w-14";
  return (
    <div className={`flex ${size} items-center justify-center overflow-hidden rounded-2xl text-white`} style={{ background: conversation.is_teacher ? "linear-gradient(135deg, hsl(var(--sub-card-2-from)), hsl(var(--sub-card-2-to)))" : "linear-gradient(135deg, hsl(var(--sub-card-1-from)), hsl(var(--sub-card-1-to)))" }}>
      {conversation.avatar_url ? (
        <img src={conversation.avatar_url} alt="" className="h-full w-full object-cover" />
      ) : conversation.is_teacher ? (
        <GraduationCap className="h-5 w-5" />
      ) : (
        <UserRound className="h-5 w-5" />
      )}
    </div>
  );
}

function ConversationCard({ conversation, onClick }: { conversation: Conversation; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-[28px] border border-border/60 bg-card p-4 text-right shadow-dashboard-soft transition-all hover:-translate-y-0.5 hover:border-primary/30">
      <div className="flex items-start gap-4">
        <AvatarBubble conversation={conversation} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-lg font-black">{conversation.user_name}</h4>
            {conversation.user_code && <Badge variant="outline" className="rounded-full px-3 text-[11px]">{conversation.user_code}</Badge>}
            {conversation.unread_count > 0 && <Badge className="rounded-full border-0 px-3">{conversation.unread_count} جديد</Badge>}
            {conversation.is_archived && (
              <Badge variant="outline" className="rounded-full px-3 text-[11px]">
                {conversation.resolution_state === "solved" ? "تم الحل" : "غير محلول"}
              </Badge>
            )}
          </div>
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{conversation.last_message}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>{conversation.is_teacher ? "طلب معلم" : "طلب طالب"}</span>
            <span>{new Date(conversation.last_message_at).toLocaleString("ar-EG")}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function ChatBubble({ message }: { message: SupportMessage }) {
  const fromAdmin = message.is_from_admin;
  return (
    <div className={`flex ${fromAdmin ? "justify-start" : "justify-end"} gap-2`}>
      {!fromAdmin && (
        <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-white text-primary shadow-sm">
          <UserRound className="h-4 w-4" />
        </div>
      )}
      <div className={`max-w-[85%] rounded-[24px] px-4 py-3 text-sm leading-7 shadow-sm ${fromAdmin ? "rounded-tr-sm bg-gradient-to-br from-primary to-primary text-primary-foreground" : "rounded-tl-sm border border-border/60 bg-white text-foreground"}`}>
        {message.attachment_url && message.file_type === "image" && <img src={message.attachment_url} alt="مرفق" className="mb-3 max-h-80 w-full rounded-2xl object-contain" />}
        {message.attachment_url && message.file_type === "audio" && <audio controls src={message.attachment_url} className="mb-3 w-full" />}
        {message.message && <p className="whitespace-pre-wrap">{message.message}</p>}
        <div className={`mt-2 flex items-center gap-2 text-[11px] ${fromAdmin ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
          <Clock3 className="h-3 w-3" />
          <span>{new Date(message.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</span>
          {fromAdmin && <CheckCheck className="h-3 w-3" />}
        </div>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-end gap-2">
      <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-white text-primary shadow-sm">
        <UserRound className="h-4 w-4" />
      </div>
      <div className="rounded-[24px] rounded-tl-sm border border-border/60 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:120ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:240ms]" />
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCheck,
  CheckCircle2,
  Clock3,
  FolderClock,
  FolderOpen,
  GraduationCap,
  Image as ImageIcon,
  Loader2,
  MessageCircleMore,
  Mic,
  MicOff,
  MoreVertical,
  Search,
  Send,
  StickyNote,
  UserRound,
  Users,
  XCircle,
  Headphones,
  RefreshCw,
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
import { notifySupportReply } from "@/lib/supportChat";
import {
  insertSupportMessage,
  summarizeSupportRow,
  supportTrace,
  updateSupportMessage,
  subscribeSupportGlobal,
  subscribeSupportThread,
} from "@/lib/supportRealtime";

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
  return `admin_${Date.now()}_${sanitizeFileName(fileName)}`;
}

/** Uploads a support attachment to Bunny under the conversation owner's folder. */
async function uploadSupportFile(userId: string, file: File) {
  const { uploadFile } = await import("@/lib/storage");
  const stored = await uploadFile({
    scope: { kind: "user", id: userId },
    category: "support",
    file,
    fileName: supportFilePath(userId, file.name),
  });
  return stored.url;
}

async function getSignedSupportUrl(filePath: string | null | undefined) {
  if (!filePath) return null;
  const { isBunnyStorageFile, getFileUrl } = await import("@/lib/storage");
  if (isBunnyStorageFile(filePath)) return await getFileUrl(filePath);
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

// === EXACT spec gradients (per user mockup) ===
const SECTION_META: Record<
  SupportSection,
  { title: string; subtitle: string; icon: any; from: string; to: string; emoji: string }
> = {
  students: {
    title: "دعم الطلبة",
    subtitle: "الطلبات الحالية من الطلبة",
    icon: MessageCircleMore,
    from: "#4F46E5",
    to: "#7C3AED",
    emoji: "💬",
  },
  teachers: {
    title: "دعم المعلمين",
    subtitle: "الطلبات الحالية من المعلمين",
    icon: Users,
    from: "#059669",
    to: "#10B981",
    emoji: "👨‍🏫",
  },
  students_archive: {
    title: "سجل الطلبة",
    subtitle: "جميع المحادثات السابقة",
    icon: FolderOpen,
    from: "#F59E0B",
    to: "#F97316",
    emoji: "📁",
  },
  teachers_archive: {
    title: "سجل المعلمين",
    subtitle: "جميع محادثات المعلمين السابقة",
    icon: FolderClock,
    from: "#EC4899",
    to: "#F43F5E",
    emoji: "🗂",
  },
};

export default function SupportPage() {
  const { user: adminUser } = useAuth();
  const playSound = useNotificationSound();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  const [view, setView] = useState<ViewMode>("home");
  const [section, setSection] = useState<SupportSection>("students");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [newNote, setNewNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [showNotesPanel, setShowNotesPanel] = useState(false);

  const { otherTyping: userTyping, sendTyping } = useSupportTyping(selectedUserId, "admin");

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.user_id === selectedUserId) ?? null,
    [conversations, selectedUserId],
  );

  const hydrateMessages = useCallback(async (rows: any[]) => {
    return Promise.all(
      (rows || []).map(async (row) => ({
        ...row,
        is_from_admin: !!row.is_from_admin,
        is_read: !!row.is_read,
        attachment_url: row.file_url ? await getSignedSupportUrl(row.file_url) : null,
      })),
    ) as Promise<SupportMessage[]>;
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
        const text = typeof row.message === "string" ? row.message : "";
        const rowArchived = !!row.is_resolved || isSolvedMessage(text) || isArchiveMessage(text);
        const rowResolution: ResolutionState = isSolvedMessage(text) ? "solved" : isArchiveMessage(text) ? "unsolved" : null;
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
        // NOTE: is_archived/resolution_state are set ONLY from the newest message (the first row
        // we see per user, since rows are ordered DESC). A new user message after a resolved
        // conversation must reopen it as active, not stay stuck in the archive.
      }

      const userIds = Array.from(map.keys());
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, student_code, teacher_code, avatar_url")
          .in("id", userIds);
        for (const p of profiles || []) {
          const c = map.get(p.id);
          if (!c) continue;
          c.user_name = p.full_name || (c.is_teacher ? "معلم" : "طالب");
          c.user_code = c.is_teacher ? p.teacher_code : p.student_code;
          c.avatar_url = p.avatar_url;
        }
      }

      const next = Array.from(map.values()).sort((a, b) => {
        if (a.unread_count !== b.unread_count) return b.unread_count - a.unread_count;
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      });
      setConversations(next);
    } catch (e) {
      console.error(e);
      toast.error("تعذر تحميل طلبات الدعم");
    } finally {
      setLoading(false);
    }
  }, []);

  const appendSupportRow = useCallback(
    async (row: any, source: string) => {
      if (!row?.id) return;
      supportTrace("admin:state:append-row:start", {
        source,
        selectedUserId,
        row: summarizeSupportRow(row),
      });
      if (!row.is_from_admin) playSound();
      if (selectedUserId && row.user_id === selectedUserId) {
        const hydrated = await hydrateMessages([row]);
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === row.id);
          const next = exists ? prev : [...prev, hydrated[0]];
          supportTrace("admin:state:messages:set", {
            source,
            rowId: row.id,
            existed: exists,
            previousCount: prev.length,
            nextCount: next.length,
          });
          return next;
        });
        if (!row.is_from_admin) {
          await updateSupportMessage(row.id, row.user_id, { is_read: true });
        }
      } else {
        supportTrace("admin:state:append-row:skipped-current-chat", {
          source,
          selectedUserId,
          rowUserId: row.user_id,
        });
      }
      await loadConversations();
    },
    [hydrateMessages, loadConversations, playSound, selectedUserId],
  );

  const loadMessages = useCallback(
    async (userId: string) => {
      const { data: rows, error } = await supabase
        .from("support_messages")
        .select("id, message, is_from_admin, created_at, is_read, file_url, file_type")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const hydrated = await hydrateMessages(rows || []);
      supportTrace("admin:state:messages:hydrate", { userId, count: hydrated.length });
      setMessages(hydrated);
      await supabase
        .from("support_messages")
        .update({ is_read: true })
        .eq("user_id", userId)
        .eq("is_from_admin", false)
        .eq("is_read", false);
    },
    [hydrateMessages],
  );

  const loadNotes = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("support_internal_notes")
      .select("id, note, created_at")
      .eq("conversation_user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    setNotes((data as InternalNote[]) || []);
  }, []);

  const openSection = (s: SupportSection) => {
    setSection(s);
    setView("list");
    setSelectedUserId(null);
  };

  const openConversation = async (userId: string) => {
    setSelectedUserId(userId);
    setView("chat");
    try {
      await Promise.all([loadMessages(userId), loadNotes(userId)]);
      setConversations((prev) => prev.map((i) => (i.user_id === userId ? { ...i, unread_count: 0 } : i)));
    } catch (e) {
      console.error(e);
      toast.error("تعذر فتح المحادثة");
    }
  };

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    supportTrace("admin:render:messages", {
      selectedUserId,
      count: messages.length,
      lastId: messages[messages.length - 1]?.id ?? null,
    });
  }, [messages]);

  useEffect(() => {
    const handleUpdate = (next: any) => {
      if (!next?.id) return;
      supportTrace("admin:state:update-row:start", { row: summarizeSupportRow(next), selectedUserId });
      if (selectedUserId && next.user_id === selectedUserId) {
        setMessages((prev) => {
          const nextMessages = prev.map((m) => (m.id === next.id ? { ...m, is_read: !!next.is_read } : m));
          supportTrace("admin:state:messages:update", {
            rowId: next.id,
            previousCount: prev.length,
            nextCount: nextMessages.length,
          });
          return nextMessages;
        });
      }
    };

    const channel = supabase
      .channel("admin-support-live-v5")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, (payload) => {
        supportTrace("admin:realtime:postgres:insert", { row: summarizeSupportRow(payload.new) });
        void appendSupportRow(payload.new, "postgres_insert");
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_messages" }, (payload) => {
        supportTrace("admin:realtime:postgres:update", { row: summarizeSupportRow(payload.new) });
        handleUpdate(payload.new);
      })
      .subscribe((status, err) => {
        supportTrace("admin:realtime:postgres:status", { status, error: err?.message });
      });

    // Broadcast fallback — guarantees delivery even when postgres_changes
    // silently drops events under RLS. Both handlers dedupe by row id.
    const unsubscribeGlobal = subscribeSupportGlobal((event, row) => {
      if (event === "INSERT") void appendSupportRow(row, "broadcast_global");
      else handleUpdate(row);
    });
    const unsubscribeThread = selectedUserId
      ? subscribeSupportThread(selectedUserId, (event, row) => {
          if (event === "INSERT") void appendSupportRow(row, "broadcast_thread");
          else handleUpdate(row);
        })
      : () => {};

    return () => {
      supabase.removeChannel(channel);
      unsubscribeGlobal();
      unsubscribeThread();
    };
  }, [appendSupportRow, selectedUserId]);

  const handleSendReply = async () => {
    if (!selectedUserId || !newMessage.trim()) return;
    setSending(true);
    try {
      const text = newMessage.trim();
      supportTrace("admin:send:click", { selectedUserId, isTeacher: !!selectedConversation?.is_teacher, messageLength: text.length });
      const savedRow = await insertSupportMessage({
        user_id: selectedUserId,
        message: text,
        is_from_admin: true,
        is_teacher_request: !!selectedConversation?.is_teacher,
      });
      await appendSupportRow(savedRow, "sender_after_insert");
      await notifySupportReply(selectedUserId, text, !!selectedConversation?.is_teacher, adminUser?.id);
      setNewMessage("");
    } catch (e) {
      console.error(e);
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
      const text = newMessage.trim() || "📷 صورة من الدعم";
      supportTrace("admin:send:image", { selectedUserId, isTeacher: !!selectedConversation?.is_teacher, path });
      const savedRow = await insertSupportMessage({
        user_id: selectedUserId,
        message: text,
        is_from_admin: true,
        is_teacher_request: !!selectedConversation?.is_teacher,
        file_url: path,
        file_type: "image",
      });
      await appendSupportRow(savedRow, "sender_after_insert_image");
      await notifySupportReply(selectedUserId, text, !!selectedConversation?.is_teacher, adminUser?.id);
      setNewMessage("");
      toast.success("تم إرسال الصورة");
    } catch (e) {
      console.error(e);
      toast.error("تعذر إرسال الصورة");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleUploadAudio = async (file: File) => {
    if (!selectedUserId) return;
    setUploading(true);
    try {
      const path = supportFilePath(selectedUserId, file.name);
      const { error: upErr } = await supabase.storage
        .from(SUPPORT_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type || "audio/webm" });
      if (upErr) throw upErr;
      supportTrace("admin:send:audio", { selectedUserId, isTeacher: !!selectedConversation?.is_teacher, path });
      const savedRow = await insertSupportMessage({
        user_id: selectedUserId,
        message: "🎤 رسالة صوتية من الدعم",
        is_from_admin: true,
        is_teacher_request: !!selectedConversation?.is_teacher,
        file_url: path,
        file_type: "audio",
      });
      await appendSupportRow(savedRow, "sender_after_insert_audio");
      await notifySupportReply(selectedUserId, "🎤 رسالة صوتية من الدعم", !!selectedConversation?.is_teacher, adminUser?.id);
      toast.success("تم إرسال الرسالة الصوتية");
    } catch (e) {
      console.error(e);
      toast.error("تعذر إرسال الرسالة الصوتية");
    } finally {
      setUploading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const ext = mimeType.includes("mp4") ? "m4a" : "webm";
        await handleUploadAudio(new File([blob], `record-${Date.now()}.${ext}`, { type: mimeType }));
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (e) {
      console.error(e);
      toast.error("تعذر الوصول للميكروفون");
    }
  };

  const stopRecording = () => {
    try {
      mediaRecorderRef.current?.stop();
    } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
    setIsRecording(false);
  };

  const handleResolve = async (resolved: boolean) => {
    if (!selectedUserId) return;
    try {
      const { error } = await supabase.rpc("set_support_resolution", { _user_id: selectedUserId, _resolved: resolved });
      if (error) throw error;
      const resolutionText = resolved
        ? "✅ تم حل المشكلة ونقل المحادثة إلى السجلات."
        : "📋 لم يتم حل المشكلة وتم نقل المحادثة إلى السجلات للمتابعة لاحقاً.";
      supportTrace("admin:send:resolution", { selectedUserId, resolved, isTeacher: !!selectedConversation?.is_teacher });
      const savedRow = await insertSupportMessage({
        user_id: selectedUserId,
        message: resolutionText,
        is_from_admin: true,
        is_teacher_request: !!selectedConversation?.is_teacher,
        is_resolved: true,
      });
      await appendSupportRow(savedRow, "sender_after_insert_resolution");
      toast.success(resolved ? "تم تعليم الطلب كمحلول" : "تم نقل الطلب للسجلات");
      setView("list");
      setSelectedUserId(null);
      await loadConversations();
    } catch (e) {
      console.error(e);
      toast.error("تعذر تحديث حالة الطلب");
    }
  };

  const handleAddNote = async () => {
    if (!selectedUserId || !adminUser || !newNote.trim()) return;
    setSavingNote(true);
    try {
      const { data, error } = await supabase
        .from("support_internal_notes")
        .insert({ conversation_user_id: selectedUserId, admin_id: adminUser.id, note: newNote.trim() })
        .select("id, note, created_at")
        .single();
      if (error) throw error;
      setNotes((prev) => [data as InternalNote, ...prev]);
      setNewNote("");
      toast.success("تم حفظ الملاحظة");
    } catch (e) {
      console.error(e);
      toast.error("تعذر حفظ الملاحظة");
    } finally {
      setSavingNote(false);
    }
  };

  const stats = useMemo(
    () => ({
      students: conversations.filter((i) => !i.is_teacher && !i.is_archived),
      teachers: conversations.filter((i) => i.is_teacher && !i.is_archived),
      studentsArchive: conversations.filter((i) => !i.is_teacher && i.is_archived),
      teachersArchive: conversations.filter((i) => i.is_teacher && i.is_archived),
    }),
    [conversations],
  );

  const visibleConversations = useMemo(() => {
    const isArchive = section.includes("archive");
    const isTeacher = section.includes("teachers");
    return conversations.filter((item) => {
      if (isTeacher !== item.is_teacher) return false;
      if (isArchive !== item.is_archived) return false;
      const haystack = `${item.user_name} ${item.user_code || ""} ${item.last_message || ""}`.toLowerCase();
      if (searchQuery.trim() && !haystack.includes(searchQuery.trim().toLowerCase())) return false;
      const date = new Date(item.last_message_at);
      if (fromDate && date < new Date(`${fromDate}T00:00:00`)) return false;
      if (toDate && date > new Date(`${toDate}T23:59:59`)) return false;
      return true;
    });
  }, [conversations, fromDate, searchQuery, section, toDate]);

  return (
    <div className="min-h-[calc((var(--app-vh,1vh)*100)-7rem)] bg-[#F8FAFC] text-[#0F172A]" dir="rtl">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleUploadImage(f);
        }}
      />

      {/* ============== HOME ============== */}
      {view === "home" && (
        <div className="mx-auto max-w-md p-4 space-y-4">
          {/* Title */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-[#0F172A]">مركز الدعم</h1>
              <p className="text-xs text-[#64748B] mt-1">إدارة طلبات الدعم والتواصل مع المستخدمين</p>
            </div>
            <button
              onClick={() => void loadConversations()}
              className="h-10 w-10 rounded-2xl bg-white shadow-sm border border-slate-200 flex items-center justify-center text-[#4F46E5] active:scale-95 transition"
              aria-label="تحديث"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {/* Search 48h */}
          <div className="relative">
            <Search className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B]" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم الطالب / المعلم / الكود"
              className="h-12 w-full rounded-[14px] bg-[#F1F5F9] pr-11 pl-4 text-sm placeholder:text-[#64748B] outline-none focus:ring-2 focus:ring-[#4F46E5]/30"
            />
          </div>

          {/* 2x2 grid */}
          <div className="grid grid-cols-2 gap-3">
            <HomeCard sectionKey="students" count={stats.students.length} unread={stats.students.filter((i) => i.unread_count > 0).length} onClick={openSection} />
            <HomeCard sectionKey="teachers" count={stats.teachers.length} unread={stats.teachers.filter((i) => i.unread_count > 0).length} onClick={openSection} />
            <HomeCard sectionKey="students_archive" count={stats.studentsArchive.length} unread={0} onClick={openSection} />
            <HomeCard sectionKey="teachers_archive" count={stats.teachersArchive.length} unread={0} onClick={openSection} />
          </div>

          {/* Latest activity preview */}
          <div className="rounded-[20px] bg-white border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-[#0F172A] flex items-center gap-2">
                <Headphones className="h-4 w-4 text-[#4F46E5]" />
                الطلبات الأخيرة
              </h3>
              {stats.students.length + stats.teachers.length > 0 && (
                <span className="text-[11px] bg-[#4F46E5]/10 text-[#4F46E5] rounded-full px-2 py-0.5 font-bold">
                  {stats.students.length + stats.teachers.length}
                </span>
              )}
            </div>
            {loading ? (
              <div className="py-6 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-[#4F46E5]" />
              </div>
            ) : conversations.filter((c) => !c.is_archived).slice(0, 4).length === 0 ? (
              <p className="text-sm text-[#64748B] text-center py-4">لا توجد طلبات حالياً</p>
            ) : (
              <div className="space-y-2">
                {conversations
                  .filter((c) => !c.is_archived)
                  .slice(0, 4)
                  .map((c) => (
                    <MiniRow key={c.user_id} c={c} onClick={() => void openConversation(c.user_id)} />
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============== LIST ============== */}
      {view === "list" && (
        <div className="mx-auto max-w-md p-4 space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView("home")}
              className="h-10 w-10 rounded-2xl bg-white shadow-sm border border-slate-200 flex items-center justify-center active:scale-95"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
            <div
              className="h-12 w-12 rounded-2xl flex items-center justify-center text-white text-xl"
              style={{ background: `linear-gradient(135deg, ${SECTION_META[section].from}, ${SECTION_META[section].to})` }}
            >
              {SECTION_META[section].emoji}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-black text-lg truncate">{SECTION_META[section].title}</h2>
              <p className="text-xs text-[#64748B]">{visibleConversations.length} طلب</p>
            </div>
          </div>

          {/* Filters */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B]" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث في القائمة"
                className="h-11 w-full rounded-[14px] bg-[#F1F5F9] pr-11 pl-4 text-sm outline-none focus:ring-2 focus:ring-[#4F46E5]/30"
              />
            </div>
            {section.includes("archive") && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-10 rounded-[12px] bg-[#F1F5F9] px-3 text-xs outline-none focus:ring-2 focus:ring-[#4F46E5]/30"
                />
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-10 rounded-[12px] bg-[#F1F5F9] px-3 text-xs outline-none focus:ring-2 focus:ring-[#4F46E5]/30"
                />
              </div>
            )}
          </div>

          {/* List */}
          <div className="space-y-2">
            {loading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#4F46E5]" />
              </div>
            ) : visibleConversations.length === 0 ? (
              <div className="rounded-[20px] bg-white border border-dashed border-slate-300 p-10 text-center">
                <p className="text-sm text-[#64748B]">لا توجد نتائج</p>
              </div>
            ) : (
              visibleConversations.map((c) => <ConversationRow key={c.user_id} c={c} onClick={() => void openConversation(c.user_id)} />)
            )}
          </div>
        </div>
      )}

      {/* ============== CHAT ============== */}
      {view === "chat" && selectedConversation && (
        <div className="mx-auto max-w-md flex flex-col h-[calc((var(--app-vh,1vh)*100)-7rem)] bg-[#F8FAFC]">
          {/* Header */}
          <div className="bg-white border-b border-slate-200 px-3 py-3 flex items-center gap-3">
            <button
              onClick={() => setView("list")}
              className="h-9 w-9 rounded-xl bg-[#F1F5F9] flex items-center justify-center active:scale-95"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
            <Avatar c={selectedConversation} />
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm truncate">{selectedConversation.user_name}</h3>
              <p className="text-[11px] text-[#10B981] flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                {userTyping ? "يكتب الآن..." : "متصل الآن"}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-9 w-9 rounded-xl bg-[#F1F5F9] flex items-center justify-center active:scale-95">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-2xl">
                <DropdownMenuItem className="gap-2 text-[#10B981] font-semibold" onClick={() => void handleResolve(true)}>
                  <CheckCircle2 className="h-4 w-4" /> تم حل المشكلة
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 text-[#F43F5E] font-semibold" onClick={() => void handleResolve(false)}>
                  <XCircle className="h-4 w-4" /> لم يتم حل المشكلة
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2" onClick={() => setShowNotesPanel((v) => !v)}>
                  <StickyNote className="h-4 w-4" /> ملاحظات داخلية ({notes.length})
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 px-3 py-4">
            <div className="space-y-3">
              {messages.map((m) => (
                <ChatBubble key={m.id} m={m} />
              ))}
              {userTyping && <TypingBubble />}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Notes panel slide-in */}
          {showNotesPanel && (
            <div className="absolute inset-0 bg-black/40 z-50 flex items-end" onClick={() => setShowNotesPanel(false)}>
              <div
                className="w-full max-h-[80vh] bg-white rounded-t-[24px] p-4 space-y-3 overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 mb-2">
                  <StickyNote className="h-4 w-4 text-[#4F46E5]" />
                  <h4 className="font-bold">ملاحظات داخلية للمطور</h4>
                </div>
                <Textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="اكتب ملاحظة خاصة بالمحادثة..."
                  className="min-h-[80px] rounded-2xl border-slate-200 bg-[#F8FAFC]"
                />
                <Button
                  className="w-full rounded-2xl text-white"
                  style={{ background: "linear-gradient(135deg, #4F46E5, #7C3AED)" }}
                  disabled={savingNote || !newNote.trim()}
                  onClick={() => void handleAddNote()}
                >
                  {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ الملاحظة"}
                </Button>
                <div className="space-y-2 pt-2">
                  {notes.length === 0 ? (
                    <p className="text-sm text-[#64748B] text-center py-4">لا توجد ملاحظات</p>
                  ) : (
                    notes.map((n) => (
                      <div key={n.id} className="rounded-2xl border border-slate-200 bg-[#F8FAFC] p-3">
                        <p className="text-sm leading-6">{n.note}</p>
                        <p className="mt-2 text-[10px] text-[#64748B]">{new Date(n.created_at).toLocaleString("ar-EG")}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Input */}
          <div className="bg-white border-t border-slate-200 px-3 py-2.5 flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-11 w-11 shrink-0 rounded-2xl bg-[#F1F5F9] flex items-center justify-center text-[#4F46E5] active:scale-95"
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={() => (isRecording ? stopRecording() : void startRecording())}
              className={`h-11 w-11 shrink-0 rounded-2xl flex items-center justify-center active:scale-95 ${
                isRecording ? "bg-[#FEE2E2] text-[#DC2626] animate-pulse" : "bg-[#F1F5F9] text-[#4F46E5]"
              }`}
              disabled={uploading}
              title={isRecording ? "إيقاف التسجيل" : "تسجيل صوتي"}
            >
              {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            <div className="flex-1 bg-[#F8FAFC] rounded-[20px] px-4 py-2 border border-slate-200">
              <textarea
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  sendTyping();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSendReply();
                  }
                }}
                placeholder="اكتب رسالتك..."
                rows={1}
                className="w-full bg-transparent text-sm outline-none resize-none max-h-24"
              />
            </div>
            <button
              type="button"
              onClick={() => void handleSendReply()}
              disabled={sending || !newMessage.trim()}
              className="h-11 w-11 shrink-0 rounded-2xl text-white flex items-center justify-center active:scale-95 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #4F46E5, #7C3AED)" }}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============== Sub-components ==============

function HomeCard({
  sectionKey,
  count,
  unread,
  onClick,
}: {
  sectionKey: SupportSection;
  count: number;
  unread: number;
  onClick: (s: SupportSection) => void;
}) {
  const meta = SECTION_META[sectionKey];
  return (
    <button
      type="button"
      onClick={() => onClick(sectionKey)}
      className="relative overflow-hidden rounded-[20px] p-4 text-right text-white shadow-md active:scale-[0.98] transition-transform min-h-[130px] flex flex-col justify-between"
      style={{ background: `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.25),transparent_60%)] pointer-events-none" />
      {unread > 0 && (
        <span className="absolute top-2 left-2 z-10 h-6 min-w-[24px] px-1.5 rounded-full bg-white text-[#0F172A] text-[11px] font-black flex items-center justify-center shadow">
          {unread}
        </span>
      )}
      <div className="relative flex items-start justify-between">
        <span className="text-[28px] leading-none">{meta.emoji}</span>
        <span className="text-2xl font-black">{count}</span>
      </div>
      <div className="relative">
        <h3 className="font-black text-base">{meta.title}</h3>
        <p className="text-[11px] text-white/80 mt-0.5 line-clamp-1">{meta.subtitle}</p>
      </div>
    </button>
  );
}

function Avatar({ c }: { c: Conversation }) {
  return (
    <div
      className="h-10 w-10 rounded-full flex items-center justify-center text-white shrink-0 overflow-hidden"
      style={{
        background: c.is_teacher
          ? "linear-gradient(135deg, #059669, #10B981)"
          : "linear-gradient(135deg, #4F46E5, #7C3AED)",
      }}
    >
      {c.avatar_url ? (
        <img src={c.avatar_url} alt="" className="h-full w-full object-cover" />
      ) : c.is_teacher ? (
        <GraduationCap className="h-5 w-5" />
      ) : (
        <UserRound className="h-5 w-5" />
      )}
    </div>
  );
}

function StatusDot({ c }: { c: Conversation }) {
  const base = "text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1";
  if (c.is_archived) {
    if (c.resolution_state === "solved") {
      return <span className={base} style={{ background: "#D1FAE5", color: "#059669" }}>● تم الحل</span>;
    }
    return <span className={base} style={{ background: "#E2E8F0", color: "#475569" }}>● مغلقة</span>;
  }
  if (c.unread_count > 0) {
    return <span className={base} style={{ background: "#FEE2E2", color: "#DC2626" }}>● جديد</span>;
  }
  return <span className={base} style={{ background: "#FEF3C7", color: "#D97706" }}>● قيد المعالجة</span>;
}

function MiniRow({ c, onClick }: { c: Conversation; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 p-2 rounded-2xl hover:bg-[#F8FAFC] transition text-right">
      <Avatar c={c} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-sm truncate">{c.user_name || (c.is_teacher ? "معلم" : "طالب")}</span>
          {c.unread_count > 0 && (
            <span className="h-5 min-w-5 px-1.5 rounded-full bg-[#4F46E5] text-white text-[10px] font-black flex items-center justify-center">
              {c.unread_count}
            </span>
          )}
        </div>
        <p className="text-[11px] text-[#64748B] truncate">{c.last_message}</p>
      </div>
    </button>
  );
}

function ConversationRow({ c, onClick }: { c: Conversation; onClick: () => void }) {
  const accent = c.is_teacher
    ? "linear-gradient(135deg, #059669, #10B981)"
    : "linear-gradient(135deg, #4F46E5, #7C3AED)";
  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-[16px] border border-slate-200 p-3 shadow-sm flex items-center gap-3 text-right active:scale-[0.99] transition min-h-[72px]"
    >
      <div
        className="h-12 w-12 rounded-full flex items-center justify-center text-white shrink-0 overflow-hidden"
        style={{ background: accent }}
      >
        {c.avatar_url ? (
          <img src={c.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : c.is_teacher ? (
          <GraduationCap className="h-6 w-6" />
        ) : (
          <UserRound className="h-6 w-6" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <h4 className="font-bold text-sm truncate text-[#0F172A]">
            {c.user_name || (c.is_teacher ? "معلم" : "طالب")}
          </h4>
          <span className="text-[10px] text-[#64748B] shrink-0">
            {new Date(c.last_message_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <p className="text-xs text-[#64748B] truncate mb-1.5">{c.last_message}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusDot c={c} />
          {c.user_code && (
            <span className="text-[10px] text-[#64748B] bg-[#F1F5F9] px-1.5 py-0.5 rounded-md">#{c.user_code}</span>
          )}
        </div>
      </div>
      {c.unread_count > 0 && !c.is_archived && (
        <span
          className="h-6 min-w-6 px-1.5 rounded-full text-white text-[11px] font-black flex items-center justify-center shrink-0 shadow"
          style={{ background: accent }}
        >
          {c.unread_count}
        </span>
      )}
    </button>
  );
}

function ChatBubble({ m }: { m: SupportMessage }) {
  const fromAdmin = m.is_from_admin;
  return (
    <div className={`flex ${fromAdmin ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] px-3.5 py-2.5 text-sm leading-6 shadow-sm ${
          fromAdmin
            ? "rounded-[16px] rounded-tr-sm text-white"
            : "rounded-[16px] rounded-tl-sm bg-[#E5E7EB] text-[#0F172A]"
        }`}
        style={fromAdmin ? { background: "linear-gradient(135deg, #4F46E5, #7C3AED)" } : undefined}
      >
        {m.attachment_url && m.file_type === "image" && (
          <img src={m.attachment_url} alt="مرفق" className="mb-2 max-h-72 w-full rounded-[12px] object-contain" />
        )}
        {m.attachment_url && m.file_type === "audio" && <audio controls src={m.attachment_url} className="mb-2 w-full" />}
        {m.message && <p className="whitespace-pre-wrap break-words">{m.message}</p>}
        <div className={`mt-1 flex items-center gap-1 text-[10px] ${fromAdmin ? "text-white/75 justify-end" : "text-[#64748B]"}`}>
          <Clock3 className="h-2.5 w-2.5" />
          <span>{new Date(m.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</span>
          {fromAdmin && <CheckCheck className={`h-3 w-3 ${m.is_read ? "text-[#A7F3D0]" : ""}`} />}
        </div>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="rounded-[16px] rounded-tl-sm bg-[#E5E7EB] px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-[#64748B] [animation-delay:0ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-[#64748B] [animation-delay:120ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-[#64748B] [animation-delay:240ms]" />
        </div>
      </div>
    </div>
  );
}

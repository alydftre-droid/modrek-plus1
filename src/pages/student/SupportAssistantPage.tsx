import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { invokeSupportAssistant } from "@/lib/supportAssistant";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChatMarkdown } from "@/components/chat/ChatMarkdown";
import supportAgentImg from "@/assets/support-agent.png";
import { loadChatHistory, saveChatHistory, shouldPersistActiveThread } from "@/lib/chatSession";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  ArrowRight, Send, Settings, X, Image as ImageIcon, Mic, MicOff, Loader2, Headphones, PhoneOff,
} from "lucide-react";
import { useSupportTyping } from "@/hooks/useSupportTyping";
import { uploadSupportAttachment,
  SUPPORT_BUCKET, closeUserSupportConversation, createSupportClientId, fetchSupportMessagesForUser, hasActiveSupportSession, mapSupportRowsToUiMessages, markAdminSupportMessagesRead, mergeSupportMessages, signedSupportUrl, supportFilePath } from "@/lib/supportChat";
import { clearDraftValue, loadDraftValue, saveDraftValue } from "@/lib/mobileRuntime";
import { insertSupportMessage, subscribeSupportThread, summarizeSupportRow, supportTrace } from "@/lib/supportRealtime";

type UiMessage = {
  id: string;
  role: "user" | "assistant" | "support" | "escalate-confirm";
  content: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  createdAt: string;
};

type ChatHistoryEntry = {
  id: string; title: string; date: string; messageCount: number; messages: UiMessage[];
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("تعذر قراءة الصورة"));
    reader.readAsDataURL(file);
  });
}

const quickSuggestions: { label: string; to?: string }[] = [
  { label: "كيف أشترك في مادة؟" },
  { label: "أين آخر إيداع لي؟" },
  { label: "التواصل مع الدعم البشري", to: "/support" },
  { label: "ما آخر نشاط قمت به؟" },
];

export default function StudentSupportAssistantPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [pendingImages, setPendingImages] = useState<Array<{ id: string; file: File; previewUrl: string }>>([]);
  const [escalated, setEscalated] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistoryEntry[]>([]);
  const { otherTyping: adminTyping, sendTyping } = useSupportTyping(user?.id, "user");

  const firstName = useMemo(() => {
    const fullName = String(user?.user_metadata?.full_name || "").trim();
    return fullName.split(" ")[0] || "يا بطل";
  }, [user?.user_metadata?.full_name]);
  const draftKey = `student-support-draft-${user?.id || "guest"}`;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    supportTrace("student-page:render:messages", {
      count: messages.length,
      lastId: messages[messages.length - 1]?.id ?? null,
      escalated,
    });
  }, [messages, loading]);

  const applySupportRow = useCallback(async (row: any, source: string) => {
    if (!row?.id) return;
    supportTrace("student-page:state:apply-row:start", { source, row: summarizeSupportRow(row) });
    const signedUrl = row.file_url ? await signedSupportUrl(row.file_url) : null;
    const supportMsg: UiMessage = {
      id: `support-${row.id}`,
      role: row.is_from_admin ? "support" : "user",
      content: row.message,
      imageUrl: row.file_type === "image" ? signedUrl : null,
      audioUrl: row.file_type === "audio" ? signedUrl : null,
      createdAt: row.created_at,
    };
    const clientId = row.metadata?.client_id ? `local-support-${row.metadata.client_id}` : null;
    setMessages((prev) => {
      const exists = prev.some((m) => m.id === supportMsg.id);
      if (exists) {
        supportTrace("student-page:state:messages:dedupe", { source, rowId: row.id, previousCount: prev.length });
        return prev;
      }
      const next = prev.filter((m) => m.id !== clientId);
      const withoutConfirm = row.is_resolved ? next.filter((m) => m.role !== "escalate-confirm") : next;
      const updated = [...withoutConfirm, supportMsg];
      supportTrace("student-page:state:messages:set", {
        source,
        rowId: row.id,
        removedClientId: clientId,
        previousCount: prev.length,
        nextCount: updated.length,
      });
      return updated;
    });
    setEscalated(!row.is_resolved);
    if (row.is_from_admin) {
      await supabase.from("support_messages").update({ is_read: true }).eq("id", row.id);
    }
  }, []);

  useEffect(() => {
    setInput(loadDraftValue(draftKey));
  }, [draftKey]);

  useEffect(() => {
    saveDraftValue(draftKey, input);
  }, [draftKey, input]);

  useEffect(() => {
    if (!user?.id) return;
    setChatHistory(loadChatHistory<UiMessage>(`student-support-history-${user.id}`));
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;

    const hydrateSupportThread = async () => {
      try {
        const rows = await fetchSupportMessagesForUser(user.id);
        if (!rows.length) {
          setMessages((prev) => prev.filter((message) => !String(message.id).startsWith("support-") && !String(message.id).startsWith("local-support-")));
          setEscalated(false);
          return;
        }

        const supportUi = await mapSupportRowsToUiMessages(rows);
        const stillActive = hasActiveSupportSession(rows);
        setMessages((prev) => stillActive
          ? mergeSupportMessages(prev.filter((message) => message.role !== "escalate-confirm"), supportUi)
          : prev.filter((message) => !String(message.id).startsWith("support-") && !String(message.id).startsWith("local-support-")));
        supportTrace("student-page:state:hydrate", { rowCount: rows.length, stillActive });
        setEscalated(stillActive);
        await markAdminSupportMessagesRead(user.id);
      } catch (error) {
        console.error(error);
      }
    };

    void hydrateSupportThread();

    const channel = supabase
      .channel(`student-support-live-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `user_id=eq.${user.id}` }, (payload) => {
        supportTrace("student-page:realtime:postgres:insert", { row: summarizeSupportRow(payload.new) });
        void applySupportRow(payload.new, "postgres_insert");
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, async (payload) => {
        const row = payload.new as any;
        if (row.notification_type === "support") {
          await hydrateSupportThread();
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_messages", filter: `user_id=eq.${user.id}` }, async () => {
        supportTrace("student-page:realtime:postgres:update", { userId: user.id });
        await hydrateSupportThread();
      })
      .subscribe((status, err) => {
        supportTrace("student-page:realtime:postgres:status", { status, error: err?.message, userId: user.id });
      });

    // Broadcast fallback (postgres_changes drops events silently under RLS).
    const unsubscribeBroadcast = subscribeSupportThread(user.id, (event, row) => {
      if (event === "INSERT") void applySupportRow(row, "broadcast_thread");
      else void hydrateSupportThread();
    });

    return () => {
      supabase.removeChannel(channel);
      unsubscribeBroadcast();
    };
  }, [applySupportRow, user]);

  const saveCurrentChat = useCallback(() => {
    if (!user?.id || messages.length < 2 || shouldPersistActiveThread(messages, escalated)) return;
    const userMsgs = messages.filter(m => m.role === "user");
    const title = userMsgs[0]?.content?.slice(0, 40) || "محادثة جديدة";
    const newEntry: ChatHistoryEntry = { id: Date.now().toString(), title, date: new Date().toISOString(), messageCount: messages.length, messages };
    const updated = [newEntry, ...chatHistory].slice(0, 20);
    setChatHistory(updated);
    saveChatHistory(`student-support-history-${user.id}`, updated);
  }, [messages, escalated, chatHistory, user?.id]);

  const loadChat = (chat: ChatHistoryEntry) => {
    if (escalated) return;
    setMessages(chat.messages);
    setEscalated(false);
    setSidebarOpen(false);
  };
  const startNewChat = () => {
    if (escalated) return;
    if (messages.length >= 2) saveCurrentChat();
    setMessages([]);
    setEscalated(false);
    setInput("");
    setSidebarOpen(false);
  };

  const appendMessage = useCallback((msg: UiMessage) => setMessages(p => [...p, msg]), []);

  const buildConversationPayload = useCallback(
    (next: { text: string; imageUrl?: string | null }) => {
      const history = messages.filter(m => m.role !== "support" && m.role !== "escalate-confirm")
        .map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));
      if (next.imageUrl) {
        return [...history, { role: "user", content: [{ type: "text", text: next.text }, { type: "image_url", image_url: { url: next.imageUrl } }] }];
      }
      return [...history, { role: "user", content: next.text }];
    }, [messages]
  );

  const buildProblemSummary = () => {
    return messages.filter(m => m.role === "user").map(m => m.content).slice(-3).join("\n").slice(0, 300);
  };

  const confirmEscalation = async () => {
    if (!user) return;
    setEscalated(true);
    setMessages(prev => prev.filter(m => m.role !== "escalate-confirm"));

    const { data: profile } = await supabase.from("profiles").select("full_name, student_code").eq("id", user.id).maybeSingle();
    const summary = buildProblemSummary();
    const escalationMsg = `📋 تحويل من المساعد الذكي\n\n👤 الاسم: ${profile?.full_name || "غير معروف"}\n🆔 كود الطالب: ${profile?.student_code || "غير متاح"}\n\n📝 وصف المشكلة:\n${summary}`;

    const savedRow = await insertSupportMessage({
      user_id: user.id, message: escalationMsg, is_from_admin: false, is_teacher_request: false, metadata: { source: "ai-escalation", client_id: createSupportClientId("student-escalation") }
    });
    await applySupportRow(savedRow, "sender_after_insert");

    appendMessage({ id: `escalated-${Date.now()}`, role: "support", content: "✅ تم تحويلك لموظف الدعم بنجاح.\n\nسيتم الرد عليك قريباً. يمكنك متابعة المحادثة من هنا.", createdAt: new Date().toISOString() });
  };

  const rejectEscalation = () => {
    setMessages(prev => prev.filter(m => m.role !== "escalate-confirm"));
    appendMessage({ id: `reject-${Date.now()}`, role: "assistant", content: "تمام! أنا هنا لمساعدتك. اسألني أي سؤال تاني 😊", createdAt: new Date().toISOString() });
  };

  const streamAssistantReply = useCallback(
    async (payloadMessages: Array<{ role: string; content: unknown }>, fallbackText?: string) => {
      if (!user) return;
      setLoading(true);
      try {
        const assistantContent = await invokeSupportAssistant({ messages: payloadMessages });
        const shouldEscalate = assistantContent.includes("[ESCALATE_TO_SUPPORT]");
        const cleaned = assistantContent.replace("[ESCALATE_TO_SUPPORT]", "").trim();

        if (shouldEscalate) {
          if (cleaned) appendMessage({ id: `ai-${Date.now()}`, role: "assistant", content: cleaned, createdAt: new Date().toISOString() });
          // Show confirmation instead of auto-escalating
          appendMessage({ id: `confirm-${Date.now()}`, role: "escalate-confirm", content: "", createdAt: new Date().toISOString() });
          return;
        }
        appendMessage({ id: `assistant-${Date.now()}`, role: "assistant", content: cleaned, createdAt: new Date().toISOString() });
      } catch (error: any) {
        console.error(error);
        toast.error(error?.message || "تعذر الوصول للمساعد الآن");
        appendMessage({ id: `err-${Date.now()}`, role: "assistant", content: "تعذر الرد الآن، حاول مرة أخرى بعد قليل.", createdAt: new Date().toISOString() });
      } finally {
        setLoading(false);
      }
    }, [appendMessage, user]
  );

  const uploadOne = useCallback(
    async (file: File): Promise<{ path: string; signedUrl: string | null }> => {
      if (!user) throw new Error("لم يتم التعرف على الحساب");
      let path: string;
      try {
        path = await uploadSupportAttachment(user.id, file, "student");
      } catch (uploadError: any) {
        const msg = String(uploadError?.message || "").toLowerCase();
        if (msg.includes("size") || msg.includes("large") || msg.includes("كبير")) {
          throw new Error("حجم الصورة كبير جداً. جرّب صورة أصغر من 10 ميجابايت.");
        }
        throw new Error(uploadError?.message || "فشل رفع الصورة");
      }
      const signedUrl = await signedSupportUrl(path);
      return { path, signedUrl };
    },
    [user],
  );

  const sendTextMessage = useCallback(async () => {
    if (!user || loading) return;
    const text = input.trim();
    const attachments = pendingImages;
    if (!text && attachments.length === 0) return;

    setInput("");
    clearDraftValue(draftKey);
    setPendingImages([]);
    // Revoke object URLs (previews) to free memory
    attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));

    if (escalated) {
      try {
        // Upload attachments (if any) then send text
        if (attachments.length > 0) {
          setUploading(true);
          setUploadProgress({ current: 0, total: attachments.length });
          for (let i = 0; i < attachments.length; i++) {
            const att = attachments[i];
            setUploadProgress({ current: i + 1, total: attachments.length });
            const { path, signedUrl } = await uploadOne(att.file);
            const clientId = createSupportClientId("student-image");
            appendMessage({ id: `local-support-${clientId}`, role: "user", content: text || "أرفقت صورة للمشكلة", imageUrl: signedUrl, createdAt: new Date().toISOString() });
            const savedRow = await insertSupportMessage({ user_id: user.id, message: text || "أرفقت صورة للمشكلة", is_from_admin: false, is_teacher_request: false, file_url: path, file_type: "image", metadata: { source: "human-support", client_id: clientId } });
            await applySupportRow(savedRow, "sender_after_insert");
          }
          setUploading(false);
          setUploadProgress(null);
        } else if (text) {
          const clientId = createSupportClientId("student-text");
          appendMessage({ id: `local-support-${clientId}`, role: "user", content: text, createdAt: new Date().toISOString() });
          const savedRow = await insertSupportMessage({ user_id: user.id, message: text, is_from_admin: false, is_teacher_request: false, metadata: { source: "human-support", client_id: clientId } });
          await applySupportRow(savedRow, "sender_after_insert");
        }
      } catch (e: any) {
        setUploading(false); setUploadProgress(null);
        toast.error(e?.message || "تعذر إرسال الرسالة");
      }
      return;
    }

    // AI branch: upload images (if any) then send one combined message to the assistant
    try {
      const imageDataUrls: string[] = [];
      if (attachments.length > 0) {
        for (let i = 0; i < attachments.length; i++) {
          imageDataUrls.push(await fileToDataUrl(attachments[i].file));
        }
      }

      const combinedText = text || (imageDataUrls.length > 0 ? "اشرح لي هذه الصورة" : "");
      // Show user's message locally
      appendMessage({
        id: `user-${Date.now()}`,
        role: "user",
        content: combinedText,
        imageUrl: imageDataUrls[0] || null,
        createdAt: new Date().toISOString(),
      });
      // Additional images as separate bubbles for visual clarity
      for (let i = 1; i < imageDataUrls.length; i++) {
        appendMessage({ id: `user-img-${Date.now()}-${i}`, role: "user", content: "", imageUrl: imageDataUrls[i], createdAt: new Date().toISOString() });
      }

      // Build payload with the first image (assistant vision typically supports one primary image)
      const payload = imageDataUrls.length > 0
        ? buildConversationPayload({ text: combinedText, imageUrl: imageDataUrls[0] })
        : buildConversationPayload({ text: combinedText });
      await streamAssistantReply(payload, combinedText);
    } catch (e: any) {
      setUploading(false); setUploadProgress(null);
      toast.error(e?.message || "فشل إرسال الصور");
    }
  }, [appendMessage, applySupportRow, buildConversationPayload, draftKey, escalated, input, loading, pendingImages, streamAssistantReply, uploadOne, user]);

  const onChooseFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const validImages = files.filter((f) => f.type.startsWith("image/"));
    if (validImages.length === 0) { toast.error("يرجى اختيار صورة"); return; }
    const oversized = validImages.find((f) => f.size > 10 * 1024 * 1024);
    if (oversized) { toast.error("حجم الصورة كبير جداً (الحد الأقصى 10 ميجابايت)"); return; }
    const next = validImages.slice(0, 4 - pendingImages.length).map((file) => ({
      id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setPendingImages((prev) => [...prev, ...next].slice(0, 4));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [pendingImages.length]);

  const removePendingImage = useCallback((id: string) => {
    setPendingImages((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const uploadAttachment = useCallback(
    async (file: File, type: "image" | "audio") => {
      if (!user) return;
      setUploading(true);
      try {
        const { path, signedUrl } = await uploadOne(file);
        const text = type === "image" ? "أرفقت صورة للمشكلة" : "أرفقت تسجيلًا صوتيًا";

        if (escalated) {
          const clientId = createSupportClientId(`student-${type}`);
          appendMessage({ id: `local-support-${clientId}`, role: "user", content: text, imageUrl: type === "image" ? signedUrl : null, audioUrl: type === "audio" ? signedUrl : null, createdAt: new Date().toISOString() });
          const savedRow = await insertSupportMessage({ user_id: user.id, message: text, is_from_admin: false, is_teacher_request: false, file_url: path, file_type: type, metadata: { source: "human-support", client_id: clientId } });
          await applySupportRow(savedRow, "sender_after_insert");
          return;
        }
        appendMessage({ id: `ua-${Date.now()}`, role: "user", content: text, imageUrl: type === "image" ? signedUrl : null, audioUrl: type === "audio" ? signedUrl : null, createdAt: new Date().toISOString() });
        if (type === "image") {
          await streamAssistantReply(buildConversationPayload({ text, imageUrl: signedUrl }), text);
          return;
        }
        appendMessage({ id: `aa-${Date.now()}`, role: "assistant", content: "استلمت التسجيل 🎙️ أرسل صورة أو اكتب وصفًا وسأكمل معك.", createdAt: new Date().toISOString() });
      } catch (e: any) { console.error(e); toast.error(e?.message || "فشل رفع المرفق"); } finally { setUploading(false); }
    }, [appendMessage, applySupportRow, buildConversationPayload, escalated, streamAssistantReply, uploadOne, user]
  );

  const toggleRecording = useCallback(async () => {
    if (isRecording) { mediaRecorderRef.current?.stop(); setIsRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        await uploadAttachment(new File([blob], `record-${Date.now()}.webm`, { type: mimeType }), "audio");
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch { toast.error("تعذر الوصول للميكروفون"); }
  }, [isRecording, uploadAttachment]);

  const hasEscalateConfirm = messages.some(m => m.role === "escalate-confirm");

  const handleCloseSupportChat = useCallback(async () => {
    if (!user) return;
    try {
      await closeUserSupportConversation(user.id, false);
      setEscalated(false);
      setShowCloseDialog(false);
      setMessages((prev) => [...prev.filter((m) => !m.id.startsWith("support-closed-banner")), {
        id: `support-closed-banner-${Date.now()}`,
        role: "assistant",
        content: "تم إنهاء المحادثة مع الدعم. يمكنك متابعة الحديث مع المساعد الذكي أو بدء طلب جديد لاحقاً.",
        createdAt: new Date().toISOString(),
      }]);
    } catch (error: any) {
      toast.error(error?.message || "تعذر إنهاء المحادثة");
    }
  }, [user]);

  return (
    <div
      className="fixed inset-0 z-50 flex bg-background"
      dir="rtl"
      style={{
        top: "max(env(safe-area-inset-top), var(--status-bar-offset, 0px))",
        height:
          "calc(100dvh - max(env(safe-area-inset-top), var(--status-bar-offset, 0px)))",
      }}
    >
      {/* Sidebar */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-x-0 bottom-0 top-[max(env(safe-area-inset-top),var(--status-bar-offset,0px))] bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
          <div className="fixed bottom-0 right-0 top-[max(env(safe-area-inset-top),var(--status-bar-offset,0px))] w-72 z-50 flex flex-col bg-card border-l border-border shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-sm font-bold">السجلات</h2>
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-accent transition-colors"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-3">
              <Button onClick={startNewChat} className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0 text-sm">محادثة جديدة</Button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 space-y-1">
              {chatHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">لا توجد سجلات بعد</p>
              ) : chatHistory.map((chat) => (
                <button key={chat.id} onClick={() => loadChat(chat)} className="w-full text-right p-3 rounded-xl hover:bg-accent transition-colors">
                  <p className="text-xs font-medium truncate">{chat.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(chat.date).toLocaleDateString("ar-EG")} • {chat.messageCount} رسالة</p>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="mobile-app-header-inner flex items-center justify-between px-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => { if (messages.length >= 2) saveCurrentChat(); navigate(-1); }} className="p-2 rounded-lg hover:bg-accent transition-colors">
              <ArrowRight className="h-5 w-5" />
            </button>
            <div className="h-9 w-9 rounded-full overflow-hidden border-2 border-blue-200">
              <img src={supportAgentImg} alt="" className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="text-sm font-bold">{escalated ? "موظف الدعم" : "المساعد الذكي"}</p>
              <p className="text-[10px] text-green-500 font-medium">{escalated && adminTyping ? "يكتب الآن..." : "متصل الآن"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {escalated && (
              <button onClick={() => setShowCloseDialog(true)} className="h-9 rounded-xl px-3 bg-destructive/10 text-destructive text-xs font-bold flex items-center gap-1.5">
                <PhoneOff className="h-3.5 w-3.5" /> إنهاء الشات
              </button>
            )}
            <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-accent transition-colors">
              <Settings className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full py-12">
              <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-blue-100 mb-4 shadow-lg">
                <img src={supportAgentImg} alt="" className="w-full h-full object-cover" />
              </div>
              <h2 className="text-lg font-bold mb-1">أهلاً {firstName}! أنا مساعدك الشخصي 😊</h2>
              <p className="text-sm text-muted-foreground mb-6 text-center max-w-xs">أعرف كل شيء عن حسابك واشتراكاتك ورصيدك. اسألني أي سؤال!</p>
              <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                {quickSuggestions.map((s, i) => (
                  <button key={i} onClick={() => setInput(s)}
                    className="text-xs px-4 py-2 rounded-full bg-gradient-to-r from-blue-50 to-purple-50 text-blue-700 hover:from-blue-100 hover:to-purple-100 transition-colors font-medium border border-blue-200/50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg) => {
            if (msg.role === "escalate-confirm") {
              return (
                <div key={msg.id} className="flex justify-end gap-2">
                  <div className="max-w-[85%] rounded-2xl p-4 bg-amber-50 border border-amber-200 space-y-3">
                    <p className="text-sm font-bold text-amber-800">هل تريد التحدث مع ممثلي خدمة العملاء؟</p>
                    <p className="text-xs text-amber-600">سيتم تحويلك لموظف دعم بشري لمساعدتك</p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={confirmEscalation} className="flex-1 h-9 text-xs rounded-xl bg-blue-500 hover:bg-blue-600 gap-1.5">
                        <Headphones className="h-3.5 w-3.5" /> نعم، حوّلني
                      </Button>
                      <Button size="sm" variant="outline" onClick={rejectEscalation} className="flex-1 h-9 text-xs rounded-xl">
                        لا، شكراً
                      </Button>
                    </div>
                  </div>
                </div>
              );
            }
            const isUser = msg.role === "user";
            const isSupport = msg.role === "support";
            const hasStructuredTable = !isUser && /\n\|.+\|\n\|[\s:|-]+\|/.test(msg.content);
            return (
              <div key={msg.id} className={`flex ${isUser ? "justify-start" : "justify-end"} gap-2`}>
                {!isUser && (
                  <div className="h-7 w-7 rounded-full overflow-hidden shrink-0 mt-1 border border-blue-200">
                    <img src={supportAgentImg} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className={`${hasStructuredTable ? "w-[94%] max-w-[94%] sm:max-w-[88%]" : "max-w-[80%]"} min-w-0 rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  isUser ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-tr-sm"
                    : isSupport ? "bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200/50 text-foreground rounded-tl-sm"
                    : "bg-muted text-foreground rounded-tl-sm"
                }`}>
                  {msg.imageUrl && <img src={msg.imageUrl} alt="مرفق" className="mb-3 max-h-56 w-full rounded-xl object-contain" />}
                  {msg.audioUrl && <audio controls src={msg.audioUrl} className="mb-3 w-full" />}
                  {isUser ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <ChatMarkdown content={msg.content} />
                  )}
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="flex justify-end gap-2">
              <div className="h-7 w-7 rounded-full overflow-hidden shrink-0 mt-1 border border-blue-200">
                <img src={supportAgentImg} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div
          className="px-4 py-3 border-t border-border bg-card shrink-0"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          {/* Upload progress bar */}
          {uploadProgress && (
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>جاري رفع الصور {uploadProgress.current} / {uploadProgress.total}...</span>
            </div>
          )}
          {/* Pending image previews (like ChatGPT) */}
          {pendingImages.length > 0 && (
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {pendingImages.map((p) => (
                <div key={p.id} className="relative shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 border-border bg-muted">
                  <img src={p.previewUrl} alt="معاينة" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePendingImage(p.id)}
                    className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black transition-colors"
                    aria-label="إزالة الصورة"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {pendingImages.length < 4 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 w-16 h-16 rounded-xl border-2 border-dashed border-border bg-muted/40 hover:bg-muted flex items-center justify-center text-muted-foreground"
                  aria-label="إضافة صورة"
                >
                  <ImageIcon className="h-5 w-5" />
                </button>
              )}
            </div>
          )}
          <form
            onSubmit={(e) => { e.preventDefault(); void sendTextMessage(); }}
            className="flex items-end gap-2 bg-muted rounded-2xl p-1.5 focus-within:ring-2 focus-within:ring-blue-500/30 transition min-w-0"
          >
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onChooseFile} />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading || loading || hasEscalateConfirm || pendingImages.length >= 4}
              className="h-9 w-9 rounded-xl bg-background/80 flex items-center justify-center hover:bg-background transition-colors shrink-0 disabled:opacity-40"
              aria-label="إرفاق صورة">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <ImageIcon className="h-4 w-4 text-muted-foreground" />}
            </button>
            <button type="button" onClick={toggleRecording} disabled={uploading || loading || hasEscalateConfirm}
              className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${isRecording ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-background/80 hover:bg-background"}`}
              aria-label="تسجيل صوتي">
              {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4 text-muted-foreground" />}
            </button>
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (escalated) sendTyping();
                const el = e.target as HTMLTextAreaElement;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 180) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendTextMessage();
                }
              }}
              rows={1}
              placeholder={escalated ? "رسالتك لموظف الدعم..." : pendingImages.length > 0 ? "أضف وصفاً للصور (اختياري)..." : "اكتب سؤالك..."}
              className="flex-1 min-w-0 w-full text-base bg-transparent px-2 py-2 outline-none placeholder:text-muted-foreground resize-none overflow-y-auto overflow-x-hidden break-words whitespace-pre-wrap min-h-[42px] max-h-[180px] leading-relaxed [overflow-wrap:anywhere]"
              disabled={loading || hasEscalateConfirm}
              dir="rtl"
            />
            <Button type="submit" size="icon"
              disabled={(!input.trim() && pendingImages.length === 0) || loading || uploading || hasEscalateConfirm}
              className="h-9 w-9 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 shrink-0 border-0">
              {loading || uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      </div>

      <AlertDialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <AlertDialogContent dir="rtl" className="max-w-[22rem] rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>إنهاء المحادثة مع الدعم؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إنهاء هذه المحادثة والعودة للمساعد الذكي، ويمكنك التواصل مع الدعم مرة أخرى في أي وقت.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogCancel className="rounded-2xl">إلغاء</AlertDialogCancel>
            <AlertDialogAction className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void handleCloseSupportChat()}>
              تأكيد الإنهاء
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAccessToken, getSupabaseFunctionsConfig, uploadToBunnyStorage } from "@/lib/bunnyStorage";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import * as tus from "tus-js-client";
import { Loader2, Upload, FileText, Package, BookMarked, X, MoreVertical, Target, Check } from "lucide-react";
import { getCurrentTermForSubject } from "@/lib/termSystem";
import { queueExternalSync } from "@/lib/externalSync";

export type ContentType = "video" | "pdf" | "summary" | "exam";

export interface ContentItem {
  id: string;
  title: string;
  type: string;
  file_url: string;
  description: string | null;
  sub_subject?: string | null;
  subject_id?: string | null;
  education_type?: string | null;
  target_section?: string | null;
  subject_section?: string | null;
}

export function extractStoragePathFromPublicUrl(url: string): { bucket: string; path: string } | null {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/storage/v1/object/public/");
    if (parts.length > 1) {
      const [bucket, ...rest] = parts[1].split("/");
      return { bucket, path: rest.join("/") };
    }
    return null;
  } catch {
    return null;
  }
}

function getBucketName(type: ContentType): string {
  switch (type) {
    case "video": return "videos";
    case "pdf":
    case "summary": return "books";
    case "exam": return "exams";
    default: return "books";
  }
}

function getAcceptedFileTypes(type: ContentType): string {
  switch (type) {
    case "video": return "video/*";
    case "pdf":
    case "summary":
    case "exam": return ".pdf";
    default: return "*/*";
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)} ثانية`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} دقيقة`;
  return `${(seconds / 3600).toFixed(1)} ساعة`;
}

const isContentTargetDebugEnabled = () => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("debugContent") === "1" || window.localStorage.getItem("modrek-content-target-debug") === "1";
};

const traceContentTarget = (stage: string, payload: Record<string, unknown>) => {
  if (!isContentTargetDebugEnabled()) return;
  console.info(`[content-target-debug] ${stage}`, payload);
};

interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
  speed: number; // bytes/sec
  eta: number; // seconds
  startTime: number;
}

interface ContentUpsertDialogProps {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  type?: ContentType;
  uploadedBy?: string;
  item?: ContentItem;
  onSuccess?: () => void;
  groups?: { id: string; title: string; term?: string | null }[];
  sectionTarget?: string | null;
  allSubjectIds?: string[];
  defaultGroupId?: string;
  hasSections?: boolean;
  onSectionTargetChange?: (target: string) => void;
  subSubjects?: string[];
  defaultSubSubject?: string;
  subSubjectId?: string;
  currentTerm?: string;
  sessionAccessToken?: string | null;
  /** Show education type targeting for secondary subjects */
  showEducationTypeTarget?: boolean;
  educationTypeTarget?: string;
  onEducationTypeTargetChange?: (t: string) => void;
}

type GroupResolutionRow = {
  id: string;
  subject_id: string;
  term?: string | null;
  teacher_id?: string | null;
  created_by?: string | null;
  title?: string | null;
  month_label?: string | null;
};

type InsertTargetRow = {
  subjectId: string;
  groupId: string | null;
};

type ResolvedSubSubject = {
  id: string;
  name: string;
};

const ContentUpsertDialog = ({
  mode,
  open,
  onOpenChange,
  subjectId,
  type = "video",
  uploadedBy,
  item,
  onSuccess,
  groups = [],
  sectionTarget,
  allSubjectIds,
  defaultGroupId,
  hasSections,
  onSectionTargetChange,
  subSubjects = [],
  defaultSubSubject,
  subSubjectId,
  currentTerm,
  sessionAccessToken,
  showEducationTypeTarget,
  educationTypeTarget,
  onEducationTypeTargetChange,
}: ContentUpsertDialogProps) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [selectedSubSubject, setSelectedSubSubject] = useState<string>("");
  const [dbSubSubjects, setDbSubSubjects] = useState<ResolvedSubSubject[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const tusUploadRef = useRef<tus.Upload | null>(null);

  const resolvedSubSubjects = useMemo<ResolvedSubSubject[]>(() => {
    const byName = new Map<string, ResolvedSubSubject>();

    dbSubSubjects.forEach((sub) => {
      const name = sub.name.trim();
      if (sub.id && name) byName.set(name, { id: sub.id, name });
    });

    subSubjects.forEach((name) => {
      const cleanName = String(name || "").trim();
      if (cleanName && !byName.has(cleanName)) byName.set(cleanName, { id: cleanName, name: cleanName });
    });

    return Array.from(byName.values());
  }, [dbSubSubjects, subSubjects]);

  const selectedSubSubjectRow = useMemo(
    () => resolvedSubSubjects.find((sub) => sub.id === selectedSubSubject || sub.name === selectedSubSubject) || null,
    [resolvedSubSubjects, selectedSubSubject],
  );

  useEffect(() => {
    if (!open || !defaultGroupId || subSubjectId) {
      setDbSubSubjects([]);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("sub_subjects")
        .select("id, name")
        .eq("group_id", defaultGroupId)
        .eq("is_active", true)
        .order("order_index", { ascending: true });

      if (cancelled) return;
      if (error) {
        console.warn("Failed to load DB sub-subjects", error);
        setDbSubSubjects([]);
        return;
      }

      setDbSubSubjects(((data || []) as any[]).map((sub) => ({ id: sub.id, name: sub.name })).filter((sub) => sub.id && sub.name));
    })();

    return () => { cancelled = true; };
  }, [open, defaultGroupId, subSubjectId]);

  useEffect(() => {
    if (mode === "edit" && item) {
      setTitle(item.title);
      setDescription(item.description || "");
      setSelectedSubSubject(item.sub_subject || "");
    } else {
      setTitle("");
      setDescription("");
      setFile(null);
      setThumbnailFile(null);
      setSelectedGroupId(defaultGroupId || "");
      setSelectedSubSubject(defaultSubSubject || "");
    }
    setUploadProgress(null);
  }, [mode, item, open, defaultGroupId, defaultSubSubject]);

  // Upload video to Bunny Stream with resumable direct upload
  const uploadVideoToBunny = async (file: File, title: string): Promise<string> => {
    const { supabaseUrl, supabaseKey } = getSupabaseFunctionsConfig();

    // Get current user session token (required by edge function auth check)
    const accessToken = await getCurrentAccessToken(sessionAccessToken);
    if (!accessToken || !supabaseUrl || !supabaseKey) {
      throw new Error("تعذر تجهيز جلسة الحساب. أغلق نافذة الرفع وافتحها مرة أخرى ثم حاول مجددًا");
    }

    // Step 1: Create video object on Bunny
    const createRes = await fetch(`${supabaseUrl}/functions/v1/bunny-stream?action=create-video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseKey,
      },
      body: JSON.stringify({ title }),
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      throw new Error(err.error || "فشل إنشاء الفيديو على Bunny Stream");
    }

    const { videoId, libraryId, expirationTime, signature, tusEndpoint } = await createRes.json();
    const startTime = Date.now();

    setUploadProgress({
      loaded: 0,
      total: file.size,
      percent: 0,
      speed: 0,
      eta: 0,
      startTime,
    });

    await new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(file, {
        endpoint: tusEndpoint,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        chunkSize: 5 * 1024 * 1024,
        removeFingerprintOnSuccess: true,
        metadata: {
          filetype: file.type || "video/mp4",
          title,
        },
        headers: {
          AuthorizationSignature: signature,
          AuthorizationExpire: String(expirationTime),
          VideoId: videoId,
          LibraryId: String(libraryId),
        },
        onError: (error) => {
          tusUploadRef.current = null;
          reject(new Error(error?.message || "تعذر رفع الفيديو، تحقق من الاتصال وحاول مرة أخرى"));
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = elapsed > 0 ? bytesUploaded / elapsed : 0;
          const remaining = speed > 0 ? (bytesTotal - bytesUploaded) / speed : 0;
          setUploadProgress({
            loaded: bytesUploaded,
            total: bytesTotal,
            percent: Math.max(1, Math.round((bytesUploaded / bytesTotal) * 100)),
            speed,
            eta: remaining,
            startTime,
          });
        },
        onSuccess: () => {
          tusUploadRef.current = null;
          setUploadProgress({
            loaded: file.size,
            total: file.size,
            percent: 100,
            speed: 0,
            eta: 0,
            startTime,
          });
          resolve();
        },
      });

      tusUploadRef.current = upload;
      upload.findPreviousUploads().then((previousUploads) => {
        if (previousUploads.length > 0) {
          upload.resumeFromPreviousUpload(previousUploads[0]);
        }
        upload.start();
      }).catch((error) => {
        tusUploadRef.current = null;
        reject(new Error(error?.message || "تعذر بدء رفع الفيديو"));
      });
    });

    return `bunny://${videoId}`;
  };

  const resolveGroupIdsForSubjects = async (params: {
    sourceGroupId: string | null;
    targetSubjectIds: string[];
    uploaderId?: string | null;
    fallbackTerm?: string | null;
  }) => {
    const { sourceGroupId, targetSubjectIds, uploaderId, fallbackTerm } = params;
    const groupBySubject = new Map<string, string | null>();
    targetSubjectIds.forEach((sid) => groupBySubject.set(sid, sourceGroupId));

    if (!sourceGroupId || targetSubjectIds.length <= 1) return groupBySubject;

    const { data: sourceGroup, error: sourceGroupError } = await supabase
      .from("content_groups")
      .select("id, subject_id, term, teacher_id, created_by, title, month_label")
      .eq("id", sourceGroupId)
      .maybeSingle();

    if (sourceGroupError) throw sourceGroupError;
    if (!sourceGroup) return groupBySubject;

    const ownerId = (sourceGroup as GroupResolutionRow).teacher_id || (sourceGroup as GroupResolutionRow).created_by || uploaderId || null;
    const siblingQuery = supabase
      .from("content_groups")
      .select("id, subject_id, term, teacher_id, created_by, title, month_label")
      .in("subject_id", targetSubjectIds)
      .eq("is_active", true);

    const sourceTerm = (sourceGroup as GroupResolutionRow).term || fallbackTerm || null;
    if (sourceTerm) siblingQuery.eq("term", sourceTerm);
    if (ownerId) siblingQuery.or(`teacher_id.eq.${ownerId},created_by.eq.${ownerId}`);

    const { data: siblingGroups, error: siblingError } = await siblingQuery;
    if (siblingError) throw siblingError;

    const rows = ((siblingGroups || []) as GroupResolutionRow[]).filter((group) => group.subject_id);
    const sourceTitle = String((sourceGroup as GroupResolutionRow).title || "").trim();
    const sourceMonth = String((sourceGroup as GroupResolutionRow).month_label || "").trim();
    const pickBestGroup = (sid: string) => {
      const candidates = rows.filter((group) => group.subject_id === sid);
      if (candidates.length === 0) return sourceGroupId;
      return (
        candidates.find((group) => group.id === sourceGroupId)?.id ||
        candidates.find((group) => sourceMonth && String(group.month_label || "").trim() === sourceMonth)?.id ||
        candidates.find((group) => sourceTitle && String(group.title || "").trim() === sourceTitle)?.id ||
        candidates[0].id
      );
    };

    targetSubjectIds.forEach((sid) => groupBySubject.set(sid, pickBestGroup(sid)));
    traceContentTarget("teacher-upload.group-resolution", {
      sourceGroupId,
      sourceSubjectId: (sourceGroup as GroupResolutionRow).subject_id,
      targetSubjectIds,
      resolved: Array.from(groupBySubject.entries()).map(([sid, gid]) => ({ subjectId: sid, groupId: gid })),
    });

    return groupBySubject;
  };

  const resolveSubSubjectIdsForGroups = async (params: {
    groupIdsBySubject: Map<string, string | null>;
    targetSubjectIds: string[];
    selectedSubSubjectId: string | null;
    selectedSubSubjectName: string | null;
  }) => {
    const { groupIdsBySubject, targetSubjectIds, selectedSubSubjectId, selectedSubSubjectName } = params;
    const subSubjectBySubject = new Map<string, string | null>();
    targetSubjectIds.forEach((sid) => subSubjectBySubject.set(sid, selectedSubSubjectId));

    const cleanName = String(selectedSubSubjectName || "").trim();
    const uniqueGroupIds = Array.from(new Set(Array.from(groupIdsBySubject.values()).filter(Boolean) as string[]));
    if (!cleanName || uniqueGroupIds.length === 0) return subSubjectBySubject;

    const { data, error } = await supabase
      .from("sub_subjects")
      .select("id, group_id, name")
      .in("group_id", uniqueGroupIds)
      .eq("is_active", true);

    if (error) throw error;

    const rows = ((data || []) as Array<{ id: string; group_id: string; name: string }>).filter((row) => row.id && row.group_id);
    targetSubjectIds.forEach((sid) => {
      const gid = groupIdsBySubject.get(sid);
      if (!gid) return;
      const matching = rows.find((row) => row.group_id === gid && String(row.name || "").trim() === cleanName);
      subSubjectBySubject.set(sid, matching?.id || selectedSubSubjectId);
    });

    traceContentTarget("teacher-upload.sub-subject-resolution", {
      selectedSubSubjectId,
      selectedSubSubjectName: cleanName,
      resolved: targetSubjectIds.map((sid) => ({
        subjectId: sid,
        groupId: groupIdsBySubject.get(sid) || null,
        subSubjectId: subSubjectBySubject.get(sid) || null,
      })),
    });

    return subSubjectBySubject;
  };

  const buildInsertTargets = async (params: {
    targetSubjectIds: string[];
    groupIdsBySubject: Map<string, string | null>;
    eduType: string | null;
    targetSection: string | null;
    subSubjectName: string | null;
    type: ContentType;
  }): Promise<InsertTargetRow[]> => {
    const { targetSubjectIds, groupIdsBySubject, eduType, targetSection, subSubjectName, type } = params;
    const uniqueGroupIds = Array.from(new Set(Array.from(groupIdsBySubject.values()).filter(Boolean) as string[]));
    const groupSubjectById = new Map<string, string>();

    if (uniqueGroupIds.length > 0) {
      const { data, error } = await supabase
        .from("content_groups")
        .select("id, subject_id")
        .in("id", uniqueGroupIds);
      if (error) throw error;
      ((data || []) as Array<{ id: string; subject_id: string }>).forEach((group) => {
        if (group.id && group.subject_id) groupSubjectById.set(group.id, group.subject_id);
      });
    }

    const byLogicalSlot = new Map<string, InsertTargetRow>();
    targetSubjectIds.forEach((sid) => {
      const resolvedGroupId = groupIdsBySubject.get(sid) ?? null;
      const key = [resolvedGroupId || `subject:${sid}`, eduType || "both-edu", targetSection || "both-section", subSubjectName || "no-sub", type].join("|");
      const current = byLogicalSlot.get(key);
      const groupSubjectId = resolvedGroupId ? groupSubjectById.get(resolvedGroupId) : null;
      const next = { subjectId: sid, groupId: resolvedGroupId };

      if (!current) {
        byLogicalSlot.set(key, next);
        return;
      }

      if (groupSubjectId === sid && current.subjectId !== groupSubjectId) {
        byLogicalSlot.set(key, next);
      }
    });

    const targets = Array.from(byLogicalSlot.values());
    traceContentTarget("teacher-upload.insert-targets", {
      targetSubjectIds,
      targets,
      groupSubjects: Array.from(groupSubjectById.entries()).map(([groupId, subjectId]) => ({ groupId, subjectId })),
    });
    return targets;
  };

  const handleSubmit = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (mode === "create") {
      if (!title || !file) {
        toast.error("يرجى إدخال العنوان واختيار ملف");
        return;
      }

      if (resolvedSubSubjects.length > 0 && !subSubjectId && !selectedSubSubjectRow) {
        toast.error("يرجى اختيار المادة الفرعية");
        return;
      }

      setUploading(true);
      setUploadProgress(null);
      try {
        const groupId = selectedGroupId && selectedGroupId !== "none" ? selectedGroupId : (defaultGroupId || null);
        let groupTerm: string | null = null;
        if (groupId) {
          groupTerm = groups.find((group) => group.id === groupId)?.term || null;
          if (!groupTerm) {
            const { data: groupRow, error: groupTermError } = await supabase
              .from("content_groups")
              .select("term")
              .eq("id", groupId)
              .maybeSingle();

            if (groupTermError) throw groupTermError;
            groupTerm = (groupRow as any)?.term || null;
          }
        }

        const resolvedTerm = groupTerm || currentTerm || await getCurrentTermForSubject(subjectId);
        
        let fileUrl: string;
        let thumbnailUrl: string | null = null;
        
        if (type === "video") {
          // Optional teacher-uploaded thumbnail
          if (thumbnailFile) {
            try {
              const ext = thumbnailFile.name.split(".").pop() || "jpg";
              const tName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
              const tPath = `content/${subjectId}/thumbnails/${tName}`;
              thumbnailUrl = await uploadToBunnyStorage(thumbnailFile, tPath, undefined, sessionAccessToken);
            } catch (err) {
              console.warn("Thumbnail upload failed, continuing without it:", err);
            }
          }
          // Upload video to Bunny Stream
          fileUrl = await uploadVideoToBunny(file, title);
        } else {
          // Upload non-video files to Bunny Storage
          const fileExt = file.name.split(".").pop();
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
          const storagePath = `content/${subjectId}/${type}/${fileName}`;
          const startTime = Date.now();
          
          fileUrl = await uploadToBunnyStorage(file, storagePath, (loaded, total) => {
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = elapsed > 0 ? loaded / elapsed : 0;
            const remaining = speed > 0 ? (total - loaded) / speed : 0;
            setUploadProgress({
              loaded,
              total,
              percent: Math.round((loaded / total) * 100),
              speed,
              eta: remaining,
              startTime,
            });
          }, sessionAccessToken);
        }

        // Always trust the parent-provided allSubjectIds (already resolved per section).
        // Fallback to single subjectId only if parent did not provide a list.
        const targetIds = Array.isArray(allSubjectIds)
          ? allSubjectIds.filter(Boolean)
          : [subjectId].filter(Boolean);

        if (targetIds.length === 0) {
          toast.error("لا توجد مادة مطابقة للفئة المستهدفة التي اخترتها");
          setUploading(false);
          return;
        }

        const resolvedSubSubjectId = subSubjectId || (selectedSubSubjectRow && selectedSubSubjectRow.id !== selectedSubSubjectRow.name ? selectedSubSubjectRow.id : null);
        const resolvedSubSubjectName = defaultSubSubject || selectedSubSubjectRow?.name || selectedSubSubject || null;

        const eduType = educationTypeTarget === "both" ? null : (educationTypeTarget || null);
        const targetSection = sectionTarget === "both" ? null : (sectionTarget || null);
        traceContentTarget("teacher-upload.insert-plan", {
          groupId,
          targetSubjectIds: targetIds,
          subjectId,
          uploadedBy: uploadedBy || null,
          sectionTarget: sectionTarget || "both",
          savedTargetSection: targetSection,
          selectedEducationTypeTarget: educationTypeTarget || "both",
          savedEducationType: eduType,
          term: resolvedTerm,
          subSubjectId: resolvedSubSubjectId,
          subSubjectName: resolvedSubSubjectName,
          type,
        });

        const groupIdsBySubject = await resolveGroupIdsForSubjects({
          sourceGroupId: groupId,
          targetSubjectIds: targetIds,
          uploaderId: uploadedBy || null,
          fallbackTerm: resolvedTerm,
        });

        const subSubjectIdsBySubject = await resolveSubSubjectIdsForGroups({
          groupIdsBySubject,
          targetSubjectIds: targetIds,
          selectedSubSubjectId: resolvedSubSubjectId,
          selectedSubSubjectName: resolvedSubSubjectName,
        });

        const insertTargets = await buildInsertTargets({
          targetSubjectIds: targetIds,
          groupIdsBySubject,
          eduType,
          targetSection,
          subSubjectName: resolvedSubSubjectName,
          type,
        });

        const insertedIds: string[] = [];
        for (const target of insertTargets) {
          const sid = target.subjectId;
          const contentId = crypto.randomUUID();
          const resolvedGroupId = target.groupId ?? groupId;
          const rowSubSubjectId = subSubjectIdsBySubject.get(sid) ?? resolvedSubSubjectId;
          const { error: dbError } = await supabase.from("content").insert({
            id: contentId,
            title,
            type,
            file_url: fileUrl,
            thumbnail_url: thumbnailUrl,
            subject_id: sid,
            description: description || null,
            uploaded_by: uploadedBy || null,
            group_id: resolvedGroupId,
            sub_subject: resolvedSubSubjectName,
            sub_subject_id: rowSubSubjectId,
            term: resolvedTerm,
            education_type: eduType,
            target_section: targetSection,
          } as any);
          if (dbError) {
            console.error("[teacher-content-targeting] DB insert error", {
              error: dbError,
              subjectId: sid,
              groupId: resolvedGroupId,
              educationTypeTarget: eduType,
              sectionTarget: targetSection || "both",
            });
            toast.error(dbError.message || "خطأ في حفظ المحتوى");
            setUploading(false);
            return;
          }
          insertedIds.push(contentId);
        }

        if (insertedIds.length > 0) {
          const { data: insertedRows, error: verifyError } = await supabase
            .from("content")
            .select("id, title, group_id, subject_id, education_type, target_section, sub_subject_id, term, uploaded_by, is_active")
            .in("id", insertedIds);

          traceContentTarget("teacher-upload.insert-verified", {
            insertedIds,
            verifyError: verifyError ? { message: verifyError.message, code: (verifyError as any).code } : null,
            rows: (insertedRows || []).map((row: any) => ({
              id: row.id,
              title: row.title,
              groupId: row.group_id,
              subjectId: row.subject_id,
              savedEducationType: row.education_type,
              savedTargetSection: row.target_section,
              subSubjectId: row.sub_subject_id,
              term: row.term,
              uploadedBy: row.uploaded_by,
              isActive: row.is_active,
            })),
          });
        }

        toast.success("تم رفع المحتوى بنجاح");

        queueExternalSync(["tables"], true);
        
        setUploading(false);
        setUploadProgress(null);
        onOpenChange(false);
        setTimeout(() => {
          onSuccess?.();
        }, 100);
      } catch (error: any) {
        console.error("Upload error:", error);
        toast.error(error?.message || "خطأ في رفع المحتوى");
        setUploading(false);
        setUploadProgress(null);
      }
    } else if (mode === "edit" && item) {
      if (!title) {
        toast.error("يرجى إدخال العنوان");
        return;
      }

      setUploading(true);
      try {
        const targetSection = sectionTarget === "both" ? null : (sectionTarget || item.target_section || null);
        const eduType = educationTypeTarget === "both" ? null : (educationTypeTarget || item.education_type || null);

        traceContentTarget("teacher-upload.update-plan", {
          id: item.id,
          title,
          savedEducationType: eduType,
          savedTargetSection: targetSection,
          selectedEducationTypeTarget: educationTypeTarget || "both",
          selectedSectionTarget: sectionTarget || "both",
        });

        const { error } = await supabase
          .from("content")
          .update({ 
            title, 
            description: description || null,
            sub_subject: selectedSubSubject || null,
            education_type: eduType,
            target_section: targetSection,
          })
          .eq("id", item.id);

        if (error) {
          console.error("Update error:", error);
          toast.error(error.message || "خطأ في تحديث المحتوى");
          setUploading(false);
          return;
        }

        queueExternalSync(["tables"], true);
        toast.success("تم تحديث المحتوى");
        setUploading(false);
        onOpenChange(false);
        setTimeout(() => {
          onSuccess?.();
        }, 100);
      } catch (error: any) {
        console.error("Update error:", error);
        toast.error(error?.message || "خطأ في تحديث المحتوى");
        setUploading(false);
      }
    }
  };

  const handleCancel = () => {
    if (uploading && xhrRef.current) {
      xhrRef.current.abort();
    }
    if (uploading && tusUploadRef.current) {
      tusUploadRef.current.abort(true).catch(() => {});
      tusUploadRef.current = null;
    }
    setUploading(false);
    setUploadProgress(null);
    onOpenChange(false);
  };

  const typeLabels: Record<string, string> = {
    video: "فيديو",
    pdf: "كتاب PDF",
    summary: "ملخص",
    exam: "امتحان",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!uploading) onOpenChange(v); }}>
      <DialogContent className="max-w-md" onPointerDownOutside={(e) => { if (uploading) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? `رفع ${typeLabels[type] || "محتوى"}` : "تعديل المحتوى"}
          </DialogTitle>
        </DialogHeader>
        
        {/* Upload Progress Overlay */}
        {uploading && uploadProgress && (
          <div className="rounded-xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-accent/10 p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-foreground">جاري الرفع...</span>
              <span className="font-bold text-primary">{uploadProgress.percent}%</span>
            </div>
            <Progress value={uploadProgress.percent} className="h-3" />
            <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
              <div className="text-center">
                <div className="font-semibold text-foreground">{formatFileSize(uploadProgress.loaded)}</div>
                <div>من {formatFileSize(uploadProgress.total)}</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-foreground">{formatFileSize(uploadProgress.speed)}/ث</div>
                <div>السرعة</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-foreground">{uploadProgress.eta > 0 ? formatTime(uploadProgress.eta) : "..."}</div>
                <div>الوقت المتبقي</div>
              </div>
            </div>
            {file && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-background/50 rounded-lg p-2">
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{file.name}</span>
                <span className="shrink-0">({formatFileSize(file.size)})</span>
              </div>
            )}
          </div>
        )}

        {!uploading && (
          <div className="space-y-4">
            {/* Sub-Subject Selection */}
            {resolvedSubSubjects.length > 0 && !subSubjectId && (
              <div className="p-3 rounded-lg border bg-primary/5 border-primary/20">
                <Label className="flex items-center gap-2 font-bold mb-2">
                  <BookMarked className="h-4 w-4 text-primary" />
                  المادة الفرعية *
                </Label>
                <Select value={selectedSubSubject} onValueChange={setSelectedSubSubject}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المادة الفرعية" />
                  </SelectTrigger>
                  <SelectContent>
                    {resolvedSubSubjects.map(sub => (
                      <SelectItem key={sub.id} value={sub.id}>{sub.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Compact Targeting (optional, hidden behind 3-dots button) */}
            {((hasSections && onSectionTargetChange) || (showEducationTypeTarget && onEducationTypeTargetChange)) && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Target className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="text-[11px] text-muted-foreground truncate">
                    <span className="font-medium text-foreground">المستهدف:</span>{" "}
                    {(() => {
                      const parts: string[] = [];
                      if (showEducationTypeTarget && onEducationTypeTargetChange) {
                        if (educationTypeTarget === "عام") parts.push("عام");
                        else if (educationTypeTarget === "أزهر") parts.push("أزهر");
                        else parts.push("عام + أزهر");
                      }
                        if (hasSections && onSectionTargetChange) {
                          if (sectionTarget === "scientific") parts.push("علمي");
                          else if (sectionTarget === "literary") parts.push("أدبي");
                          else parts.push("علمي + أدبي");
                        }
                      return parts.length > 0 ? parts.join(" • ") : "الجميع";
                    })()}
                  </div>
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      aria-label="تحديد الفئة المستهدفة"
                      title="تحديد الفئة المستهدفة من الطلاب (اختياري)"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-3 space-y-3" align="end">
                    <div className="text-[11px] text-muted-foreground border-b pb-2">
                      اتركها كما هي ليصل المحتوى لكل الطلاب، أو حدّد فئة معينة.
                    </div>

                    {showEducationTypeTarget && onEducationTypeTargetChange && (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">نوع التعليم</Label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[
                            { v: "عام", label: "عام" },
                            { v: "أزهر", label: "أزهر" },
                            { v: "both", label: "الاثنين" },
                          ].map(opt => (
                            <button
                              key={opt.v}
                              type="button"
                              onClick={() => onEducationTypeTargetChange(opt.v)}
                              className={`px-2 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                                educationTypeTarget === opt.v
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background hover:bg-accent"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {hasSections && onSectionTargetChange && (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">الشعبة</Label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[
                            { v: "scientific", label: "علمي" },
                            { v: "literary", label: "أدبي" },
                            { v: "both", label: "الاثنين" },
                          ].map(opt => (
                            <button
                              key={opt.v}
                              type="button"
                              onClick={() => onSectionTargetChange(opt.v)}
                              className={`px-2 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                                sectionTarget === opt.v
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background hover:bg-accent"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            )}


            <div>
              <Label>العنوان *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان المحتوى" />
            </div>
            <div>
              <Label>الوصف</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف المحتوى" />
            </div>

            {/* Group Selection */}
            {mode === "create" && !defaultGroupId && groups.length > 0 && (
              <div>
                <Label className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  المجموعة / الكورس
                </Label>
                <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="اختر مجموعة (اختياري)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون مجموعة</SelectItem>
                    {groups.map(g => (
                      <SelectItem key={g.id} value={g.id}>{g.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {mode === "create" && (
              <div>
                <Label>الملف *</Label>
                <Input
                  type="file"
                  accept={getAcceptedFileTypes(type)}
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="cursor-pointer"
                />
                {file && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2 bg-accent/50 rounded-lg p-2">
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="truncate">{file.name}</span>
                    <span className="text-xs shrink-0">({formatFileSize(file.size)})</span>
                  </div>
                )}
              </div>
            )}

            {/* Optional video cover image */}
            {mode === "create" && type === "video" && (
              <div>
                <Label>صورة غلاف الفيديو (اختياري)</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setThumbnailFile(e.target.files?.[0] || null)}
                  className="cursor-pointer"
                />
                {thumbnailFile && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2 bg-accent/50 rounded-lg p-2">
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="truncate">{thumbnailFile.name}</span>
                    <span className="text-xs shrink-0">({formatFileSize(thumbnailFile.size)})</span>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground mt-1">إذا لم يتم اختيار صورة، سيتم استخدام صورة Bunny التلقائية أو لقطة من الفيديو.</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel}>
            {uploading ? "إلغاء الرفع" : "إلغاء"}
          </Button>
          {!uploading && (
            <Button type="button" onClick={handleSubmit} disabled={uploading}>
              <Upload className="h-4 w-4 ml-2" />
              {mode === "create" ? "رفع" : "تحديث"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ContentUpsertDialog;

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { uploadToBunnyStorage } from "@/lib/bunnyStorage";
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
import { Loader2, Upload, FileText, Package, BookMarked, X, MoreVertical, Target, Check } from "lucide-react";
import { getCurrentTermForSubject } from "@/lib/termSystem";

export type ContentType = "video" | "pdf" | "summary" | "exam";

export interface ContentItem {
  id: string;
  title: string;
  type: string;
  file_url: string;
  description: string | null;
  sub_subject?: string | null;
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
  groups?: { id: string; title: string }[];
  sectionTarget?: string | null;
  allSubjectIds?: string[];
  defaultGroupId?: string;
  hasSections?: boolean;
  onSectionTargetChange?: (target: string) => void;
  subSubjects?: string[];
  defaultSubSubject?: string;
  subSubjectId?: string;
  currentTerm?: string;
  /** Show education type targeting for secondary subjects */
  showEducationTypeTarget?: boolean;
  educationTypeTarget?: string;
  onEducationTypeTargetChange?: (t: string) => void;
}

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
  showEducationTypeTarget,
  educationTypeTarget,
  onEducationTypeTargetChange,
}: ContentUpsertDialogProps) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [selectedSubSubject, setSelectedSubSubject] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  useEffect(() => {
    if (mode === "edit" && item) {
      setTitle(item.title);
      setDescription(item.description || "");
      setSelectedSubSubject(item.sub_subject || "");
    } else {
      setTitle("");
      setDescription("");
      setFile(null);
      setSelectedGroupId(defaultGroupId || "");
      setSelectedSubSubject(defaultSubSubject || "");
    }
    setUploadProgress(null);
  }, [mode, item, open, defaultGroupId, defaultSubSubject]);

  const uploadFileWithProgress = (bucket: string, filePath: string, file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://qohhrliaecdtaeyfhcvb.supabase.co";
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const url = `${supabaseUrl}/storage/v1/object/${bucket}/${filePath}`;
      
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = elapsed > 0 ? e.loaded / elapsed : 0;
          const remaining = speed > 0 ? (e.total - e.loaded) / speed : 0;
          
          setUploadProgress({
            loaded: e.loaded,
            total: e.total,
            percent: Math.round((e.loaded / e.total) * 100),
            speed,
            eta: remaining,
            startTime,
          });
        }
      });
      
      xhr.addEventListener("load", () => {
        xhrRef.current = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(filePath);
        } else {
          reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
        }
      });
      
      xhr.addEventListener("error", () => {
        xhrRef.current = null;
        reject(new Error("Upload network error"));
      });
      
      xhr.addEventListener("abort", () => {
        xhrRef.current = null;
        reject(new Error("Upload cancelled"));
      });
      
      xhr.open("POST", url);
      xhr.setRequestHeader("Authorization", `Bearer ${supabaseKey}`);
      xhr.setRequestHeader("apikey", supabaseKey);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.send(file);
    });
  };

  // Upload video to Bunny Stream with progress (server-side proxy)
  const uploadVideoToBunny = async (file: File, title: string): Promise<string> => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://qohhrliaecdtaeyfhcvb.supabase.co";
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    // Get current user session token (required by edge function auth check)
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      throw new Error("يجب تسجيل الدخول لرفع الفيديو");
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

    const { videoId } = await createRes.json();

    // Step 2: Upload binary via server-side proxy
    setUploadProgress({
      loaded: 0,
      total: file.size,
      percent: 5,
      speed: 0,
      eta: 0,
      startTime: Date.now(),
    });

    const uploadRes = await fetch(`${supabaseUrl}/functions/v1/bunny-stream?action=upload-video&videoId=${videoId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseKey,
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({}));
      throw new Error(err.error || `فشل رفع الفيديو [${uploadRes.status}]`);
    }

    setUploadProgress({
      loaded: file.size,
      total: file.size,
      percent: 100,
      speed: 0,
      eta: 0,
      startTime: Date.now(),
    });

    return `bunny://${videoId}`;
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

      if (subSubjects.length > 0 && !subSubjectId && !selectedSubSubject) {
        toast.error("يرجى اختيار المادة الفرعية");
        return;
      }

      setUploading(true);
      setUploadProgress(null);
      try {
        const resolvedTerm = currentTerm || await getCurrentTermForSubject(subjectId);
        
        let fileUrl: string;
        
        if (type === "video") {
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
          });
        }

        const targetIds = (sectionTarget === "both" && allSubjectIds?.length)
          ? allSubjectIds
          : [subjectId];

        const groupId = selectedGroupId && selectedGroupId !== "none" ? selectedGroupId : (defaultGroupId || null);

        for (const sid of targetIds) {
          const eduType = educationTypeTarget === "both" ? null : (educationTypeTarget || null);
          const { error: dbError } = await supabase.from("content").insert({
            title,
            type,
            file_url: fileUrl,
            subject_id: sid,
            description: description || null,
            uploaded_by: uploadedBy || null,
            group_id: groupId,
            sub_subject: selectedSubSubject || null,
            sub_subject_id: subSubjectId || null,
            term: resolvedTerm,
            education_type: eduType,
          } as any);
          if (dbError) {
            console.error("DB insert error:", dbError);
            toast.error(dbError.message || "خطأ في حفظ المحتوى");
            setUploading(false);
            return;
          }
        }

        toast.success("تم رفع المحتوى بنجاح");
        
        if (uploadedBy) {
          try {
            await supabase.functions.invoke("send-content-notification", {
              body: {
                teacherId: uploadedBy,
                subjectId,
                contentType: type,
                contentTitle: title,
              },
            });
          } catch (notifErr) {
            console.error("Notification error:", notifErr);
          }
        }
        
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
        const { error } = await supabase
          .from("content")
          .update({ 
            title, 
            description: description || null,
            sub_subject: selectedSubSubject || null,
          })
          .eq("id", item.id);

        if (error) {
          console.error("Update error:", error);
          toast.error(error.message || "خطأ في تحديث المحتوى");
          setUploading(false);
          return;
        }

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
            {subSubjects.length > 0 && !subSubjectId && (
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
                    {subSubjects.map(sub => (
                      <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Compact Targeting (optional, hidden behind 3-dots button) */}
            {mode === "create" && ((hasSections && onSectionTargetChange) || (showEducationTypeTarget && onEducationTypeTargetChange)) && (
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

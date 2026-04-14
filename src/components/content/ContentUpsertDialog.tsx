import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Loader2, Upload, FileText, Package, BookMarked } from "lucide-react";
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
}: ContentUpsertDialogProps) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [selectedSubSubject, setSelectedSubSubject] = useState<string>("");

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
  }, [mode, item, open, defaultGroupId, defaultSubSubject]);

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

      // Require sub-subject if available and not pre-selected via subSubjectId
      if (subSubjects.length > 0 && !subSubjectId && !selectedSubSubject) {
        toast.error("يرجى اختيار المادة الفرعية");
        return;
      }

      setUploading(true);
      try {
        const resolvedTerm = currentTerm || await getCurrentTermForSubject(subjectId);
        const fileExt = file.name.split(".").pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const bucket = getBucketName(type);
        const filePath = `${subjectId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(filePath, file, { cacheControl: "3600", upsert: false });

        if (uploadError) {
          console.error("Storage upload error:", uploadError);
          toast.error(uploadError.message || "خطأ في رفع الملف");
          setUploading(false);
          return;
        }

        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);

        // Determine target subject IDs based on section targeting
        const targetIds = (sectionTarget === "both" && allSubjectIds?.length)
          ? allSubjectIds
          : [subjectId];

        const groupId = selectedGroupId && selectedGroupId !== "none" ? selectedGroupId : (defaultGroupId || null);

        for (const sid of targetIds) {
          const { error: dbError } = await supabase.from("content").insert({
            title,
            type,
            file_url: urlData.publicUrl,
            subject_id: sid,
            description: description || null,
            uploaded_by: uploadedBy || null,
            group_id: groupId,
            sub_subject: selectedSubSubject || null,
            sub_subject_id: subSubjectId || null,
            term: resolvedTerm,
          } as any);
          if (dbError) {
            console.error("DB insert error:", dbError);
            toast.error(dbError.message || "خطأ في حفظ المحتوى");
            setUploading(false);
            return;
          }
        }

        toast.success("تم رفع المحتوى بنجاح");
        
        // Send notification to subscribed students
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
        onOpenChange(false);
        setTimeout(() => {
          onSuccess?.();
        }, 100);
      } catch (error: any) {
        console.error("Upload error:", error);
        toast.error(error?.message || "خطأ في رفع المحتوى");
        setUploading(false);
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
        <div className="space-y-4">
          {/* Sub-Subject Selection - only show if not pre-selected via subSubjectId */}
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
              <p className="text-xs text-muted-foreground mt-2">
                سيظهر المحتوى في قسم "{selectedSubSubject || "..."}" داخل المجموعة
              </p>
            </div>
          )}

          {/* Section Targeting */}
          {mode === "create" && hasSections && onSectionTargetChange && (
            <div className="p-4 rounded-xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-accent/10">
              <Label className="font-bold mb-3 block text-base flex items-center gap-2">
                🎯 استهداف القسم
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                    sectionTarget === "scientific"
                      ? "border-blue-500 bg-blue-500/15 text-blue-700 dark:text-blue-300 shadow-md"
                      : "border-border bg-background hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                  }`}
                  onClick={() => onSectionTargetChange("scientific")}
                >
                  <span className="text-lg">🔬</span>
                  <span>علمي</span>
                </button>
                <button
                  type="button"
                  className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                    sectionTarget === "literary"
                      ? "border-purple-500 bg-purple-500/15 text-purple-700 dark:text-purple-300 shadow-md"
                      : "border-border bg-background hover:border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                  }`}
                  onClick={() => onSectionTargetChange("literary")}
                >
                  <span className="text-lg">📖</span>
                  <span>أدبي</span>
                </button>
                <button
                  type="button"
                  className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                    sectionTarget === "both"
                      ? "border-green-500 bg-green-500/15 text-green-700 dark:text-green-300 shadow-md"
                      : "border-border bg-background hover:border-green-300 hover:bg-green-50 dark:hover:bg-green-900/20"
                  }`}
                  onClick={() => onSectionTargetChange("both")}
                >
                  <span className="text-lg">🎓</span>
                  <span>القسمين</span>
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                {sectionTarget === "scientific" && "✅ سيظهر المحتوى لطلاب القسم العلمي فقط"}
                {sectionTarget === "literary" && "✅ سيظهر المحتوى لطلاب القسم الأدبي فقط"}
                {sectionTarget === "both" && "✅ سيظهر المحتوى لطلاب القسمين العلمي والأدبي"}
              </p>
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
              <p className="text-xs text-muted-foreground mt-1">اختر المجموعة لربط المحتوى بكورس معين</p>
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
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                  <FileText className="h-4 w-4" />
                  <span>{file.name}</span>
                  <span className="text-xs">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={(e) => { e.preventDefault(); onOpenChange(false); }}>إلغاء</Button>
          <Button type="button" onClick={handleSubmit} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Upload className="h-4 w-4 ml-2" />}
            {mode === "create" ? "رفع" : "تحديث"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ContentUpsertDialog;

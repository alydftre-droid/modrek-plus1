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
import { Loader2, Upload, FileText, Package } from "lucide-react";

export type ContentType = "video" | "pdf" | "summary" | "exam";

export interface ContentItem {
  id: string;
  title: string;
  type: string;
  file_url: string;
  description: string | null;
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
}: ContentUpsertDialogProps) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");

  useEffect(() => {
    if (mode === "edit" && item) {
      setTitle(item.title);
      setDescription(item.description || "");
    } else {
      setTitle("");
      setDescription("");
      setFile(null);
      setSelectedGroupId("");
    }
  }, [mode, item, open]);

  const handleSubmit = async () => {
    if (mode === "create") {
      if (!title || !file) {
        toast.error("يرجى إدخال العنوان واختيار ملف");
        return;
      }

      setUploading(true);
      try {
        const fileExt = file.name.split(".").pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const bucket = getBucketName(type);
        const filePath = `${subjectId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(filePath, file, { cacheControl: "3600", upsert: false });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);

        // If section target is "both", insert into all subject variants
        const targetIds = (sectionTarget === "both" && allSubjectIds?.length) 
          ? allSubjectIds 
          : [subjectId];

        for (const sid of targetIds) {
          const { error: dbError } = await supabase.from("content").insert({
            title,
            type,
            file_url: urlData.publicUrl,
            subject_id: sid,
            description: description || null,
            uploaded_by: uploadedBy || null,
            group_id: selectedGroupId || null,
          });
          if (dbError) throw dbError;
        }

        toast.success("تم رفع المحتوى بنجاح");
        onOpenChange(false);
        onSuccess?.();
      } catch (error: any) {
        console.error("Upload error:", error);
        toast.error(error.message || "خطأ في رفع المحتوى");
      } finally {
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
          .update({ title, description: description || null })
          .eq("id", item.id);

        if (error) throw error;

        toast.success("تم تحديث المحتوى");
        onOpenChange(false);
        onSuccess?.();
      } catch (error: any) {
        console.error("Update error:", error);
        toast.error(error.message || "خطأ في تحديث المحتوى");
      } finally {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? `رفع ${typeLabels[type] || "محتوى"}` : "تعديل المحتوى"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>العنوان *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان المحتوى" />
          </div>
          <div>
            <Label>الوصف</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف المحتوى" />
          </div>

          {/* Group Selection - only in create mode */}
          {mode === "create" && groups.length > 0 && (
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Upload className="h-4 w-4 ml-2" />}
            {mode === "create" ? "رفع" : "تحديث"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ContentUpsertDialog;

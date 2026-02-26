import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Upload, Plus } from "lucide-react";

export type ContentType = "video" | "pdf" | "summary" | "exam";

export type ContentItem = {
  id: string;
  title: string;
  type: string;
  file_url: string;
  description: string | null;
};

function getBucketName(type: ContentType) {
  switch (type) {
    case "video": return "videos";
    case "exam": return "exams";
    case "pdf":
    case "summary":
    default: return "books";
  }
}

function getAcceptedFileTypes(type: ContentType) {
  switch (type) {
    case "video": return "video/*";
    default: return ".pdf";
  }
}

export function extractStoragePathFromPublicUrl(fileUrl: string): { bucket: string; path: string } | null {
  const marker = "/storage/v1/object/public/";
  const idx = fileUrl.indexOf(marker);
  if (idx === -1) return null;
  const after = fileUrl.slice(idx + marker.length);
  const [bucket, ...rest] = after.split("/");
  if (!bucket || rest.length === 0) return null;
  return { bucket, path: rest.join("/") };
}

type ContentGroup = {
  id: string;
  title: string;
  section_name: string;
  price: number;
};

type Props =
  | {
      mode: "create";
      open: boolean;
      onOpenChange: (open: boolean) => void;
      subjectId: string;
      type: ContentType;
      uploadedBy?: string;
      onSuccess?: () => void;
    }
  | {
      mode: "edit";
      open: boolean;
      onOpenChange: (open: boolean) => void;
      subjectId: string;
      item: ContentItem;
      onSuccess?: () => void;
    };

export default function ContentUpsertDialog(props: Props) {
  const { toast } = useToast();
  const isCreate = props.mode === "create";

  const initial = useMemo(() => {
    if (props.mode === "edit") {
      return { title: props.item.title, description: props.item.description ?? "" };
    }
    return { title: "", description: "" };
  }, [props]);

  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // Group selection
  const [groups, setGroups] = useState<ContentGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [isPaid, setIsPaid] = useState(true);

  // New group creation
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const [newGroupSection, setNewGroupSection] = useState("");
  const [newGroupPrice, setNewGroupPrice] = useState("50");
  const [newGroupDesc, setNewGroupDesc] = useState("");

  // Fetch groups for subject
  useEffect(() => {
    if (!props.open || !props.subjectId) return;

    const fetchGroups = async () => {
      const { data } = await supabase
        .from("content_groups" as any)
        .select("id, title, section_name, price")
        .eq("subject_id", props.subjectId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });

      setGroups((data as any as ContentGroup[]) || []);
    };

    fetchGroups();
  }, [props.open, props.subjectId]);

  // Reset on open
  useEffect(() => {
    if (!props.open) return;
    setTitle(initial.title);
    setDescription(initial.description);
    setSelectedFile(null);
    setUploadProgress(0);
    setIsSaving(false);
    setSelectedGroupId("");
    setIsPaid(true);
    setShowNewGroup(false);
    setNewGroupTitle("");
    setNewGroupSection("");
    setNewGroupPrice("50");
    setNewGroupDesc("");
  }, [props.open, initial.title, initial.description]);

  const accepted = isCreate ? getAcceptedFileTypes(props.type) : undefined;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      toast({ title: "خطأ", description: "حجم الملف كبير جداً (الحد الأقصى 100 ميجا)", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
  };

  const createNewGroup = async (): Promise<string | null> => {
    if (!newGroupTitle.trim() || !newGroupSection.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال اسم المجموعة والقسم", variant: "destructive" });
      return null;
    }

    const { data, error } = await supabase
      .from("content_groups" as any)
      .insert({
        subject_id: props.subjectId,
        section_name: newGroupSection.trim(),
        title: newGroupTitle.trim(),
        description: newGroupDesc.trim() || null,
        price: parseFloat(newGroupPrice) || 50,
        is_active: true,
        created_by: isCreate && 'uploadedBy' in props ? props.uploadedBy : null,
      } as any)
      .select("id")
      .single();

    if (error) {
      console.error(error);
      toast({ title: "خطأ", description: "فشل إنشاء المجموعة", variant: "destructive" });
      return null;
    }

    return (data as any)?.id || null;
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال عنوان", variant: "destructive" });
      return;
    }

    setIsSaving(true);

    try {
      if (props.mode === "edit") {
        const { error } = await supabase
          .from("content")
          .update({ title: title.trim(), description: description.trim() || null })
          .eq("id", props.item.id);
        if (error) throw error;
        toast({ title: "تم", description: "تم تعديل المحتوى" });
        props.onOpenChange(false);
        props.onSuccess?.();
        return;
      }

      // Create mode
      if (!selectedFile) {
        toast({ title: "خطأ", description: "يرجى اختيار ملف", variant: "destructive" });
        setIsSaving(false);
        return;
      }

      // Resolve group_id
      let groupId: string | null = selectedGroupId || null;
      if (showNewGroup) {
        groupId = await createNewGroup();
        if (!groupId) {
          setIsSaving(false);
          return;
        }
      }

      const bucket = getBucketName(props.type);
      const safeBase = selectedFile.name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-.]/g, "");
      const fileName = `${props.subjectId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeBase}`;

      const interval = window.setInterval(() => {
        setUploadProgress((p) => (p >= 90 ? 90 : p + 10));
      }, 200);

      const { error: uploadError } = await supabase.storage.from(bucket).upload(fileName, selectedFile);
      window.clearInterval(interval);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);

      const { error: insertError } = await supabase.from("content").insert({
        title: title.trim(),
        type: props.type,
        file_url: urlData.publicUrl,
        subject_id: props.subjectId,
        description: description.trim() || null,
        uploaded_by: props.uploadedBy ?? null,
        group_id: groupId,
        is_paid: isPaid,
      });

      if (insertError) throw insertError;

      setUploadProgress(100);
      toast({ title: "تم", description: "تم رفع المحتوى بنجاح" });
      props.onOpenChange(false);
      props.onSuccess?.();
    } catch (err: any) {
      console.error(err);
      toast({ title: "خطأ", description: "فشل حفظ المحتوى", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{props.mode === "create" ? "رفع محتوى جديد" : "تعديل المحتوى"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>العنوان</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: الدرس الأول" />
          </div>

          <div className="space-y-2">
            <Label>الوصف (اختياري)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="اكتب وصفاً مختصراً..." />
          </div>

          {/* Group Selection - only in create mode */}
          {isCreate && (
            <>
              <div className="space-y-2">
                <Label>المجموعة</Label>
                {!showNewGroup ? (
                  <div className="space-y-2">
                    <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                      <SelectTrigger>
                        <SelectValue placeholder="اختر مجموعة..." />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.title} ({g.section_name}) - {g.price} جنيه
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2 w-full"
                      onClick={() => setShowNewGroup(true)}
                    >
                      <Plus className="h-4 w-4" />
                      إنشاء مجموعة جديدة
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                    <div className="space-y-2">
                      <Label>اسم القسم (مثل: نحو، صرف، بلاغة)</Label>
                      <Input value={newGroupSection} onChange={(e) => setNewGroupSection(e.target.value)} placeholder="نحو" />
                    </div>
                    <div className="space-y-2">
                      <Label>اسم المجموعة</Label>
                      <Input value={newGroupTitle} onChange={(e) => setNewGroupTitle(e.target.value)} placeholder="باب المبتدأ والخبر" />
                    </div>
                    <div className="space-y-2">
                      <Label>السعر (جنيه)</Label>
                      <Input type="number" value={newGroupPrice} onChange={(e) => setNewGroupPrice(e.target.value)} placeholder="50" />
                    </div>
                    <div className="space-y-2">
                      <Label>وصف المجموعة (اختياري)</Label>
                      <Textarea value={newGroupDesc} onChange={(e) => setNewGroupDesc(e.target.value)} placeholder="وصف مختصر..." />
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowNewGroup(false)}>
                      اختيار مجموعة موجودة
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border">
                <Label htmlFor="is-paid" className="cursor-pointer">محتوى مدفوع</Label>
                <Switch id="is-paid" checked={isPaid} onCheckedChange={setIsPaid} />
              </div>
            </>
          )}

          {isCreate && (
            <div className="space-y-2">
              <Label>الملف</Label>
              <Input type="file" accept={accepted} onChange={handleFileChange} />
              {selectedFile && (
                <p className="text-xs text-muted-foreground">
                  {selectedFile.name} • {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                </p>
              )}
            </div>
          )}

          {isCreate && uploadProgress > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>جاري الرفع</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={isSaving}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={isSaving} className="gap-2">
            <Upload className="h-4 w-4" />
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


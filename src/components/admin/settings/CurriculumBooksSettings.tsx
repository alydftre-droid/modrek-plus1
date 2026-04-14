import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { uploadToBunnyStorage } from "@/lib/bunnyStorage";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  Loader2,
  Trash2,
  BookOpen,
  FileText,
  Search,
} from "lucide-react";

interface AiSource {
  id: string;
  file_name: string;
  file_url: string;
  subject_id: string | null;
  uploaded_by: string | null;
  created_at: string | null;
}

interface Subject {
  id: string;
  name: string;
  stage: string;
  grade: string;
  section: string | null;
}

const stageLabels: Record<string, string> = {
  preparatory: "إعدادي",
  secondary: "ثانوي",
};

const gradeLabels: Record<string, string> = {
  first: "أولى",
  second: "تانية",
  third: "تالتة",
};

export default function CurriculumBooksSettings() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [sources, setSources] = useState<AiSource[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sourcesRes, subjectsRes] = await Promise.all([
        supabase
          .from("ai_sources")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("subjects")
          .select("id, name, stage, grade, section")
          .eq("is_active", true)
          .order("stage")
          .order("grade")
          .order("name"),
      ]);
      if (sourcesRes.error) throw sourcesRes.error;
      if (subjectsRes.error) throw subjectsRes.error;
      setSources((sourcesRes.data as AiSource[]) || []);
      setSubjects((subjectsRes.data as Subject[]) || []);
    } catch (err: any) {
      toast.error(err?.message || "خطأ في تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("يرجى رفع ملف PDF فقط");
      return;
    }

    if (!selectedSubjectId) {
      toast.error("يرجى اختيار المادة أولاً");
      return;
    }

    setUploading(true);
    try {
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.pdf`;
      const storagePath = `ai-sources/${selectedSubjectId}/${fileName}`;

      // Upload to Bunny Storage
      const fileUrl = await uploadToBunnyStorage(file, storagePath);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error: dbError } = await supabase.from("ai_sources").insert({
        file_name: file.name,
        file_url: fileUrl,
        subject_id: selectedSubjectId,
        uploaded_by: user?.id || null,
      });

      if (dbError) {
        throw dbError;
      }

      toast.success(`تم رفع "${file.name}" بنجاح — المساعد الذكي سيستخدمه في الإجابات`);
      await fetchData();
    } catch (err: any) {
      toast.error(err?.message || "فشل رفع الكتاب");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (source: AiSource) => {
    if (!confirm(`حذف "${source.file_name}"؟`)) return;
    try {
      const { error: dbError } = await supabase
        .from("ai_sources")
        .delete()
        .eq("id", source.id);
      if (dbError) throw dbError;

      // Try to delete from Bunny Storage if it's a bstorage:// URL
      if (source.file_url?.startsWith("bstorage://")) {
        const path = source.file_url.replace("bstorage://", "");
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://qohhrliaecdtaeyfhcvb.supabase.co";
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        await fetch(`${supabaseUrl}/functions/v1/bunny-storage?action=delete&path=${encodeURIComponent(path)}`, {
          headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey },
        }).catch(() => {});
      } else if (source.file_url && !source.file_url.startsWith("http")) {
        await supabase.storage.from("ai-sources").remove([source.file_url]);
      }

      setSources((prev) => prev.filter((s) => s.id !== source.id));
      toast.success("تم حذف الكتاب");
    } catch (err: any) {
      toast.error(err?.message || "فشل الحذف");
    }
  };

  const getSubjectLabel = (subjectId: string | null) => {
    if (!subjectId) return "عام";
    const s = subjects.find((sub) => sub.id === subjectId);
    if (!s) return "—";
    return `${s.name} (${stageLabels[s.stage] || s.stage} ${gradeLabels[s.grade] || s.grade}${s.section ? ` - ${s.section === "scientific" ? "علمي" : "أدبي"}` : ""})`;
  };

  const filteredSources = sources.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.file_name.toLowerCase().includes(q) ||
      getSubjectLabel(s.subject_id).toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Upload section */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            رفع كتاب منهج جديد
          </h3>
          <p className="text-xs text-muted-foreground">
            ارفع كتب المنهج الأزهري (الكتاب المدرسي، سلاح الأزهر، كتب الامتحانات) وسيقرأها المساعد الذكي ويستخدمها في شرحه وإجاباته للطلاب.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>المادة *</Label>
              <Select value={selectedSubjectId} onValueChange={setSelectedSubjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر المادة" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} — {stageLabels[s.stage] || s.stage} {gradeLabels[s.grade] || s.grade}
                      {s.section ? ` (${s.section === "scientific" ? "علمي" : "أدبي"})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                onClick={() => fileRef.current?.click()}
                disabled={uploading || !selectedSubjectId}
                className="w-full gap-2"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {uploading ? "جاري الرفع..." : "رفع ملف PDF"}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={handleUpload}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ابحث في الكتب المرفوعة..."
          className="pr-9"
        />
      </div>

      {/* Sources list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : filteredSources.length === 0 ? (
        <div className="py-10 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <BookOpen className="h-7 w-7 text-primary" />
          </div>
          <p className="text-sm font-bold text-foreground">لا توجد كتب مرفوعة</p>
          <p className="text-xs text-muted-foreground mt-1">
            ارفع كتب المنهج الأزهري ليستخدمها المساعد الذكي
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {filteredSources.length} كتاب مرفوع — المساعد الذكي يستخدمها في الإجابات
          </p>
          {filteredSources.map((source) => (
            <Card key={source.id} className="overflow-hidden">
              <div className="flex items-center gap-3 p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">
                    {source.file_name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {getSubjectLabel(source.subject_id)}
                    {source.created_at && (
                      <> • {new Date(source.created_at).toLocaleDateString("ar-EG")}</>
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleDelete(source)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

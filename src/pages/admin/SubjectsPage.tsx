import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  BookOpen,
  Plus,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";

type Subject = {
  id: string;
  name: string;
  description: string | null;
  stage: string;
  grade: string;
  section: string | null;
  category: string;
  is_active: boolean | null;
  created_at: string | null;
};

const stages = [
  { id: "preparatory", name: "المرحلة الإعدادية" },
  { id: "secondary", name: "المرحلة الثانوية" },
];

const grades = [
  { id: "first", name: "الصف الأول" },
  { id: "second", name: "الصف الثاني" },
  { id: "third", name: "الصف الثالث" },
];

const sections = [
  { id: "scientific", name: "علمي" },
  { id: "literary", name: "أدبي" },
];

const categories = [
  { id: "arabic", name: "المواد العربية" },
  { id: "sharia", name: "المواد الشرعية" },
  { id: "literary", name: "المواد الأدبية" },
  { id: "science", name: "العلوم" },
  { id: "math", name: "الرياضيات" },
];

const SubjectsPage = () => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    stage: "",
    grade: "",
    section: "",
    category: "",
    is_active: true,
  });

  const loadSubjects = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("subjects")
        .select("*")
        .order("stage", { ascending: true })
        .order("grade", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      setSubjects(data || []);
    } catch (error) {
      console.error("Error loading subjects:", error);
      toast.error("خطأ في تحميل المواد");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubjects();
  }, []);

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      stage: "",
      grade: "",
      section: "",
      category: "",
      is_active: true,
    });
    setEditingSubject(null);
  };

  const handleEdit = (subject: Subject) => {
    setEditingSubject(subject);
    setFormData({
      name: subject.name,
      description: subject.description || "",
      stage: subject.stage,
      grade: subject.grade,
      section: subject.section || "",
      category: subject.category,
      is_active: subject.is_active ?? true,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.stage || !formData.grade || !formData.category) {
      toast.error("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        description: formData.description || null,
        stage: formData.stage,
        grade: formData.grade,
        section: formData.section || null,
        category: formData.category,
        is_active: formData.is_active,
      };

      if (editingSubject) {
        const { error } = await supabase
          .from("subjects")
          .update(payload)
          .eq("id", editingSubject.id);
        if (error) throw error;
        toast.success("تم تحديث المادة");
      } else {
        const { error } = await supabase.from("subjects").insert(payload);
        if (error) throw error;
        toast.success("تم إضافة المادة");
      }

      setShowDialog(false);
      resetForm();
      loadSubjects();
    } catch (error) {
      console.error("Save error:", error);
      toast.error("خطأ في حفظ المادة");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (subject: Subject) => {
    if (!confirm(`هل أنت متأكد من حذف مادة "${subject.name}"؟`)) return;

    try {
      const { error } = await supabase.from("subjects").delete().eq("id", subject.id);
      if (error) throw error;
      toast.success("تم حذف المادة");
      loadSubjects();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("خطأ في حذف المادة");
    }
  };

  const getStageName = (id: string) => stages.find((s) => s.id === id)?.name || id;
  const getGradeName = (id: string) => grades.find((g) => g.id === id)?.name || id;
  const getCategoryName = (id: string) => categories.find((c) => c.id === id)?.name || id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6" />
          إدارة المواد الدراسية
        </h2>
        <Button
          onClick={() => {
            resetForm();
            setShowDialog(true);
          }}
        >
          <Plus className="h-4 w-4 ml-2" />
          إضافة مادة
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : subjects.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              لا توجد مواد دراسية
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">اسم المادة</TableHead>
                  <TableHead className="text-right">المرحلة</TableHead>
                  <TableHead className="text-right">الصف</TableHead>
                  <TableHead className="text-right">التصنيف</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subjects.map((subject) => (
                  <TableRow key={subject.id}>
                    <TableCell className="font-medium">{subject.name}</TableCell>
                    <TableCell>{getStageName(subject.stage)}</TableCell>
                    <TableCell>{getGradeName(subject.grade)}</TableCell>
                    <TableCell>{getCategoryName(subject.category)}</TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${
                          subject.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {subject.is_active ? "نشط" : "معطل"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(subject)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => handleDelete(subject)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog إضافة/تعديل */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingSubject ? "تعديل المادة" : "إضافة مادة جديدة"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>اسم المادة *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="مثال: النحو"
              />
            </div>

            <div>
              <Label>الوصف</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="وصف مختصر للمادة..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>المرحلة *</Label>
                <Select
                  value={formData.stage}
                  onValueChange={(v) => setFormData({ ...formData, stage: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المرحلة" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>الصف *</Label>
                <Select
                  value={formData.grade}
                  onValueChange={(v) => setFormData({ ...formData, grade: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الصف" />
                  </SelectTrigger>
                  <SelectContent>
                    {grades.map((grade) => (
                      <SelectItem key={grade.id} value={grade.id}>
                        {grade.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>القسم (اختياري)</Label>
                <Select
                  value={formData.section || "__none__"}
                  onValueChange={(v) => setFormData({ ...formData, section: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر القسم" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">بدون قسم</SelectItem>
                    {sections.map((section) => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>التصنيف *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => setFormData({ ...formData, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر التصنيف" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>المادة نشطة</Label>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              {editingSubject ? "تحديث" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SubjectsPage;

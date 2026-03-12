import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  BookOpen,
  ChevronLeft,
  Settings,
  LogOut,
  User,
  Upload,
  Loader2,
  Book,
  Plus,
  Edit,
  Trash2,
  BookText,
  BookMarked,
  Beaker,
  Globe,
  Languages,
  Atom,
  Palette,
} from "lucide-react";

type SubjectRow = {
  id: string;
  name: string;
  category: string;
  description: string | null;
};

// معلومات الأقسام
const CATEGORY_INFO: Record<string, { name: string; icon: typeof BookText; gradient: string; shadow: string }> = {
  arabic: { name: "المواد العربية", icon: BookText, gradient: "from-emerald-500 via-emerald-600 to-teal-700", shadow: "shadow-emerald-500/30" },
  religious: { name: "المواد الشرعية", icon: BookMarked, gradient: "from-amber-500 via-amber-600 to-orange-700", shadow: "shadow-amber-500/30" },
  science: { name: "العلوم", icon: Beaker, gradient: "from-blue-500 via-blue-600 to-indigo-700", shadow: "shadow-blue-500/30" },
  social: { name: "الدراسات", icon: Globe, gradient: "from-purple-500 via-purple-600 to-violet-700", shadow: "shadow-purple-500/30" },
  english: { name: "الإنجليزية", icon: Languages, gradient: "from-rose-500 via-rose-600 to-pink-700", shadow: "shadow-rose-500/30" },
  scientific: { name: "المواد العلمية", icon: Atom, gradient: "from-cyan-500 via-cyan-600 to-blue-700", shadow: "shadow-cyan-500/30" },
  literary: { name: "المواد الأدبية", icon: Palette, gradient: "from-indigo-500 via-indigo-600 to-purple-700", shadow: "shadow-indigo-500/30" },
  french: { name: "الفرنسية", icon: Globe, gradient: "from-sky-500 via-sky-600 to-blue-700", shadow: "shadow-sky-500/30" },
};

function stageLabel(stage: string) {
  if (stage === "preparatory") return "المرحلة الإعدادية";
  if (stage === "secondary") return "المرحلة الثانوية";
  return "";
}

function gradeLabel(grade: string) {
  if (grade === "first") return "الصف الأول";
  if (grade === "second") return "الصف الثاني";
  if (grade === "third") return "الصف الثالث";
  return "";
}

function sectionLabel(section: string) {
  if (section === "scientific") return "علمي";
  if (section === "literary") return "أدبي";
  return "";
}

const AdminUploadSubjects = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { signOut } = useAuth();

  const stage = params.get("stage") || "";
  const grade = params.get("grade") || "";
  const section = params.get("section") || "";
  const category = params.get("category") || "";

  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectDescription, setNewSubjectDescription] = useState("");
  const [editingSubject, setEditingSubject] = useState<SubjectRow | null>(null);
  const [deletingSubject, setDeletingSubject] = useState<SubjectRow | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // معلومات القسم الحالي
  const categoryInfo = CATEGORY_INFO[category] || { name: "المواد", icon: Book, gradient: "from-gray-500 to-gray-600", shadow: "shadow-gray-500/30" };
  const CategoryIcon = categoryInfo.icon;

  const fetchSubjects = async () => {
    if (!stage || !grade || !category) {
      navigate("/admin/upload", { replace: true });
      return;
    }

    setIsLoading(true);
    try {
      let q = supabase
        .from("subjects")
        .select("id, name, category, description")
        .eq("is_active", true)
        .eq("stage", stage)
        .eq("grade", grade)
        .eq("category", category);

      if (stage === "secondary" && section && section !== "both") {
        q = q.eq("section", section);
      }

      const { data, error } = await q.order("name", { ascending: true });
      if (error) throw error;

      let results = (data as SubjectRow[]) || [];
      // Deduplicate by name when showing both sections
      if (section === "both") {
        const seen = new Set<string>();
        results = results.filter(s => {
          if (seen.has(s.name)) return false;
          seen.add(s.name);
          return true;
        });
      }
      setSubjects(results);
    } catch (e) {
      console.error(e);
      toast.error("فشل تحميل المواد");
      setSubjects([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubjects();
  }, [stage, grade, section, category]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const handleAddSubject = async () => {
    if (!newSubjectName.trim()) {
      toast.error("الرجاء إدخال اسم المادة");
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.from("subjects").insert({
        name: newSubjectName.trim(),
        description: newSubjectDescription.trim() || null,
        stage,
        grade,
        section: stage === "secondary" ? section : null,
        category,
        is_active: true,
      });

      if (error) throw error;

      toast.success("تمت إضافة المادة بنجاح");
      setAddDialogOpen(false);
      setNewSubjectName("");
      setNewSubjectDescription("");
      fetchSubjects();
    } catch (e) {
      console.error(e);
      toast.error("فشل إضافة المادة");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditSubject = async () => {
    if (!editingSubject || !editingSubject.name.trim()) {
      toast.error("الرجاء إدخال اسم المادة");
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("subjects")
        .update({
          name: editingSubject.name.trim(),
          description: editingSubject.description?.trim() || null,
        })
        .eq("id", editingSubject.id);

      if (error) throw error;

      toast.success("تم تعديل المادة بنجاح");
      setEditDialogOpen(false);
      setEditingSubject(null);
      fetchSubjects();
    } catch (e) {
      console.error(e);
      toast.error("فشل تعديل المادة");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSubject = async () => {
    if (!deletingSubject) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("subjects")
        .update({ is_active: false })
        .eq("id", deletingSubject.id);

      if (error) throw error;

      toast.success("تم حذف المادة بنجاح");
      setDeleteDialogOpen(false);
      setDeletingSubject(null);
      fetchSubjects();
    } catch (e) {
      console.error(e);
      toast.error("فشل حذف المادة");
    } finally {
      setIsSaving(false);
    }
  };

  const openEditDialog = (subject: SubjectRow) => {
    setEditingSubject({ ...subject });
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (subject: SubjectRow) => {
    setDeletingSubject(subject);
    setDeleteDialogOpen(true);
  };

  const subtitle = `${stageLabel(stage)} - ${gradeLabel(grade)}${section ? ` - ${sectionLabel(section)}` : ""}`;

  const backUrl = `/admin/upload?stage=${stage}&grade=${grade}${section ? `&section=${section}` : ""}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between px-4">
          <Link to="/admin" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-azhari shadow-lg shadow-primary/20 group-hover:shadow-primary/40 transition-shadow">
              <BookOpen className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-gradient-azhari">أزهاريون - رفع المحتوى</span>
          </Link>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
              <Upload className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">وضع الرفع</span>
            </div>

            <Button variant="ghost" size="icon" className="hover:bg-accent">
              <Settings className="h-5 w-5" />
            </Button>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent">
              <User className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">أدمن</span>
            </div>

            <Button variant="ghost" size="icon" onClick={handleSignOut} className="hover:bg-destructive/10 hover:text-destructive">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container px-4 py-8">
        <Button variant="ghost" className="mb-6 hover:bg-accent" onClick={() => navigate(backUrl)}> 
          <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />
          رجوع للأقسام
        </Button>

        {/* رأس الصفحة مع معلومات القسم */}
        <div className="mb-10">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-4">
              <div className={`p-4 rounded-2xl bg-gradient-to-br ${categoryInfo.gradient} text-white shadow-xl ${categoryInfo.shadow}`}>
                <CategoryIcon className="h-10 w-10" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">{categoryInfo.name}</h1>
                <p className="text-muted-foreground text-lg">{subtitle}</p>
              </div>
            </div>

            <Button onClick={() => setAddDialogOpen(true)} className="gap-2 shadow-lg">
              <Plus className="h-5 w-5" />
              إضافة مادة جديدة
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </div>
        ) : subjects.length === 0 ? (
          <Card className="border-2 border-dashed">
            <CardContent className="p-12 text-center">
              <div className={`w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br ${categoryInfo.gradient} flex items-center justify-center shadow-xl ${categoryInfo.shadow}`}>
                <CategoryIcon className="h-10 w-10 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-3">لا توجد مواد</h3>
              <p className="text-muted-foreground text-lg mb-6">لم يتم إضافة مواد لهذا القسم بعد</p>
              <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
                <Plus className="h-5 w-5" />
                إضافة مادة جديدة
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {subjects.map((subject, index) => (
              <Card
                key={subject.id}
                className="border-2 border-transparent hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10 transition-all duration-300 group bg-card/50 backdrop-blur overflow-hidden"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <CardContent className="p-6 relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="flex items-start gap-4 relative">
                    <div 
                      className={`p-3 rounded-xl bg-gradient-to-br ${categoryInfo.gradient} text-white shadow-lg ${categoryInfo.shadow} cursor-pointer hover:scale-110 transition-transform duration-300`}
                      onClick={() => navigate(`/admin/upload/subject/${subject.id}?stage=${stage}&grade=${grade}${section ? `&section=${section}` : ""}&category=${category}`)}
                    >
                      <Book className="h-6 w-6" />
                    </div>
                    <div 
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => navigate(`/admin/upload/subject/${subject.id}?stage=${stage}&grade=${grade}${section ? `&section=${section}` : ""}&category=${category}`)}
                    >
                      <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors mb-1 truncate">
                        {subject.name}
                      </h3>
                      {subject.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{subject.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <span 
                      className="text-xs text-muted-foreground cursor-pointer hover:text-primary"
                      onClick={() => navigate(`/admin/upload/subject/${subject.id}?stage=${stage}&grade=${grade}${section ? `&section=${section}` : ""}&category=${category}`)}
                    >
                      اضغط للدخول
                    </span>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(subject)}>
                        <Edit className="h-4 w-4 text-muted-foreground hover:text-primary" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDeleteDialog(subject)}>
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Dialog إضافة مادة */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة مادة جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">اسم المادة *</label>
              <Input
                placeholder="مثال: النحو"
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">الوصف (اختياري)</label>
              <Input
                placeholder="وصف مختصر للمادة"
                value={newSubjectDescription}
                onChange={(e) => setNewSubjectDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleAddSubject} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog تعديل المادة */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل المادة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">اسم المادة *</label>
              <Input
                placeholder="مثال: النحو"
                value={editingSubject?.name || ""}
                onChange={(e) => setEditingSubject(prev => prev ? { ...prev, name: e.target.value } : null)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">الوصف (اختياري)</label>
              <Input
                placeholder="وصف مختصر للمادة"
                value={editingSubject?.description || ""}
                onChange={(e) => setEditingSubject(prev => prev ? { ...prev, description: e.target.value } : null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleEditSubject} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog حذف المادة */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>حذف المادة</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            هل أنت متأكد من حذف مادة "{deletingSubject?.name}"؟ سيتم حذف جميع المحتوى المرتبط بها.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDeleteSubject} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUploadSubjects;

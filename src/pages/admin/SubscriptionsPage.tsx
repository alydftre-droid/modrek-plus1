import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CreditCard, Search, Loader2, Users, BookOpen, Edit, Trash2,
  Plus, CheckCircle, ChevronLeft, Package, TrendingUp,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

type ContentGroup = {
  id: string;
  subject_id: string;
  section_name: string;
  title: string;
  description: string | null;
  price: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
};

type GroupPurchase = {
  id: string;
  student_id: string;
  group_id: string;
  purchased_at: string;
  activated_by_admin: boolean;
  student_name?: string;
  student_email?: string;
  student_code?: string;
  group_title?: string;
  subject_name?: string;
};

type Subject = {
  id: string;
  name: string;
  stage: string;
  grade: string;
  section: string | null;
  category: string;
};

const SubscriptionsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [groups, setGroups] = useState<ContentGroup[]>([]);
  const [purchases, setPurchases] = useState<GroupPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Activation dialog
  const [activateOpen, setActivateOpen] = useState(false);
  const [activateGroupId, setActivateGroupId] = useState("");
  const [activateStudentCode, setActivateStudentCode] = useState("");
  const [activating, setActivating] = useState(false);

  // Edit group dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<ContentGroup | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [saving, setSaving] = useState(false);

  // Stats
  const [stats, setStats] = useState({ totalPurchases: 0, totalRevenue: 0, activeGroups: 0 });

  const fetchSubjects = useCallback(async () => {
    const { data } = await supabase
      .from("subjects")
      .select("id, name, stage, grade, section, category")
      .eq("is_active", true)
      .order("name");
    setSubjects((data as Subject[]) || []);
  }, []);

  const fetchGroups = useCallback(async () => {
    if (!selectedSubjectId) {
      setGroups([]);
      return;
    }
    const { data } = await supabase
      .from("content_groups" as any)
      .select("*")
      .eq("subject_id", selectedSubjectId)
      .order("created_at", { ascending: true });
    setGroups((data as any as ContentGroup[]) || []);
  }, [selectedSubjectId]);

  const fetchPurchases = useCallback(async () => {
    let query = supabase
      .from("student_group_purchases" as any)
      .select("*")
      .order("purchased_at", { ascending: false });

    if (selectedSubjectId) {
      // Get group IDs for this subject
      const { data: groupData } = await supabase
        .from("content_groups" as any)
        .select("id")
        .eq("subject_id", selectedSubjectId);
      const groupIds = (groupData as any[] || []).map((g) => g.id);
      if (groupIds.length > 0) {
        query = query.in("group_id", groupIds);
      } else {
        setPurchases([]);
        return;
      }
    }

    const { data } = await query;
    const rawPurchases = (data as any as GroupPurchase[]) || [];

    // Enrich with student info and group info
    if (rawPurchases.length > 0) {
      const studentIds = [...new Set(rawPurchases.map((p) => p.student_id))];
      const groupIds = [...new Set(rawPurchases.map((p) => p.group_id))];

      const [{ data: profiles }, { data: groupsData }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, student_code").in("id", studentIds),
        supabase.from("content_groups" as any).select("id, title, subject_id").in("id", groupIds),
      ]);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      const groupMap = new Map(((groupsData as any[]) || []).map((g) => [g.id, g]));

      // Get subject names for groups
      const subjectIds = [...new Set(((groupsData as any[]) || []).map((g) => g.subject_id))];
      const { data: subjectsData } = await supabase.from("subjects").select("id, name").in("id", subjectIds);
      const subjectMap = new Map((subjectsData || []).map((s: any) => [s.id, s.name]));

      rawPurchases.forEach((p) => {
        const profile = profileMap.get(p.student_id);
        const group = groupMap.get(p.group_id);
        p.student_name = (profile as any)?.full_name || "غير معروف";
        p.student_email = (profile as any)?.email || "";
        p.student_code = (profile as any)?.student_code || "";
        p.group_title = group?.title || "";
        p.subject_name = subjectMap.get(group?.subject_id) || "";
      });
    }

    setPurchases(rawPurchases);
  }, [selectedSubjectId]);

  const fetchStats = useCallback(async () => {
    const { count: totalPurchases } = await supabase
      .from("student_group_purchases" as any)
      .select("*", { count: "exact", head: true });

    const { data: allGroups } = await supabase
      .from("content_groups" as any)
      .select("id, price, is_active");

    const activeGroups = ((allGroups as any[]) || []).filter((g) => g.is_active).length;

    // Estimate revenue from purchases
    const { data: allPurchases } = await supabase
      .from("student_group_purchases" as any)
      .select("group_id");

    const groupPriceMap = new Map(((allGroups as any[]) || []).map((g) => [g.id, g.price]));
    let totalRevenue = 0;
    ((allPurchases as any[]) || []).forEach((p) => {
      totalRevenue += groupPriceMap.get(p.group_id) || 0;
    });

    setStats({
      totalPurchases: totalPurchases || 0,
      totalRevenue,
      activeGroups,
    });
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchSubjects(), fetchStats()]);
      setLoading(false);
    };
    load();
  }, [fetchSubjects, fetchStats]);

  useEffect(() => {
    fetchGroups();
    fetchPurchases();
  }, [fetchGroups, fetchPurchases]);

  const handleActivateGroup = async () => {
    if (!activateGroupId || !activateStudentCode.trim()) {
      toast.error("يرجى اختيار المجموعة وإدخال كود الطالب");
      return;
    }

    setActivating(true);
    try {
      // Find student by code
      const { data: student, error: studentError } = await supabase
        .from("profiles")
        .select("id")
        .eq("student_code", activateStudentCode.trim())
        .single();

      if (studentError || !student) {
        toast.error("لم يتم العثور على طالب بهذا الكود");
        setActivating(false);
        return;
      }

      // Check if already purchased
      const { data: existing } = await supabase
        .from("student_group_purchases" as any)
        .select("id")
        .eq("student_id", student.id)
        .eq("group_id", activateGroupId)
        .maybeSingle();

      if (existing) {
        toast.error("الطالب مشترك بالفعل في هذه المجموعة");
        setActivating(false);
        return;
      }

      const { error } = await supabase
        .from("student_group_purchases" as any)
        .insert({
          student_id: student.id,
          group_id: activateGroupId,
          activated_by_admin: true,
        } as any);

      if (error) throw error;

      toast.success("تم تفعيل المجموعة للطالب بنجاح");
      setActivateOpen(false);
      setActivateGroupId("");
      setActivateStudentCode("");
      fetchPurchases();
      fetchStats();
    } catch (e) {
      console.error(e);
      toast.error("خطأ في تفعيل المجموعة");
    } finally {
      setActivating(false);
    }
  };

  const handleEditGroup = async () => {
    if (!editGroup) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("content_groups" as any)
        .update({
          title: editTitle.trim(),
          price: parseFloat(editPrice) || editGroup.price,
        } as any)
        .eq("id", editGroup.id);

      if (error) throw error;
      toast.success("تم تحديث المجموعة");
      setEditOpen(false);
      fetchGroups();
    } catch (e) {
      console.error(e);
      toast.error("خطأ في تحديث المجموعة");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePurchase = async (purchaseId: string) => {
    if (!confirm("هل أنت متأكد من إلغاء هذا الاشتراك؟")) return;
    try {
      const { error } = await supabase
        .from("student_group_purchases" as any)
        .delete()
        .eq("id", purchaseId);
      if (error) throw error;
      toast.success("تم إلغاء الاشتراك");
      fetchPurchases();
      fetchStats();
    } catch (e) {
      console.error(e);
      toast.error("خطأ في إلغاء الاشتراك");
    }
  };

  const filteredPurchases = purchases.filter(
    (p) =>
      (p.student_name?.includes(searchTerm) || false) ||
      (p.student_code?.includes(searchTerm) || false) ||
      (p.student_email?.includes(searchTerm) || false) ||
      (p.group_title?.includes(searchTerm) || false)
  );

  // Get all groups for activation dropdown (across all subjects)
  const [allGroups, setAllGroups] = useState<(ContentGroup & { subject_name?: string })[]>([]);
  useEffect(() => {
    const fetchAll = async () => {
      const { data } = await supabase
        .from("content_groups" as any)
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      const gs = (data as any as ContentGroup[]) || [];
      // Enrich with subject names
      if (gs.length > 0) {
        const subjectIds = [...new Set(gs.map((g) => g.subject_id))];
        const { data: subs } = await supabase.from("subjects").select("id, name").in("id", subjectIds);
        const subMap = new Map((subs || []).map((s: any) => [s.id, s.name]));
        gs.forEach((g: any) => { g.subject_name = subMap.get(g.subject_id) || ""; });
      }
      setAllGroups(gs as any);
    };
    fetchAll();
  }, [groups]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <BookOpen className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">إدارة الاشتراكات</span>
          </div>
          <Button variant="ghost" onClick={() => navigate("/admin")} className="gap-2">
            <ChevronLeft className="h-4 w-4 rotate-180" />
            رجوع للوحة التحكم
          </Button>
        </div>
      </header>

      <main className="container px-4 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <Package className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">المجموعات النشطة</p>
                <p className="text-3xl font-bold">{stats.activeGroups}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-green-500/10">
                <Users className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">إجمالي الاشتراكات</p>
                <p className="text-3xl font-bold">{stats.totalPurchases}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-amber-500/10">
                <TrendingUp className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">الإيرادات المتوقعة</p>
                <p className="text-3xl font-bold">{stats.totalRevenue.toLocaleString("ar-EG")} جنيه</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setActivateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            تفعيل مجموعة لطالب
          </Button>
          <Select value={selectedSubjectId || "__all__"} onValueChange={(v) => setSelectedSubjectId(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="تصفية حسب المادة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">جميع المواد</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name} ({s.stage} - {s.grade})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Groups for selected subject */}
        {selectedSubjectId && groups.length > 0 && (
          <div>
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Package className="h-5 w-5" />
              المجموعات في هذه المادة
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {groups.map((g) => (
                <Card key={g.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold">{g.title}</h4>
                        <Badge variant="outline" className="mt-1">{g.section_name}</Badge>
                        <p className="text-lg font-bold text-primary mt-2">{g.price} جنيه</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditGroup(g);
                          setEditTitle(g.title);
                          setEditPrice(String(g.price));
                          setEditOpen(true);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <Separator />

        {/* Purchases Table */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              سجل الاشتراكات
            </h3>
            <div className="relative w-64">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو الكود..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-10"
              />
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الطالب</TableHead>
                    <TableHead className="text-right">الكود</TableHead>
                    <TableHead className="text-right">المجموعة</TableHead>
                    <TableHead className="text-right">المادة</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-right">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPurchases.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        لا توجد اشتراكات
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPurchases.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.student_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{p.student_code || "-"}</Badge>
                        </TableCell>
                        <TableCell>{p.group_title}</TableCell>
                        <TableCell>{p.subject_name}</TableCell>
                        <TableCell>
                          {new Date(p.purchased_at).toLocaleDateString("ar-EG")}
                        </TableCell>
                        <TableCell>
                          {p.activated_by_admin ? (
                            <Badge className="bg-amber-100 text-amber-800">يدوي</Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-800">تلقائي</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeletePurchase(p.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Activate Group Dialog */}
      <Dialog open={activateOpen} onOpenChange={setActivateOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تفعيل مجموعة لطالب</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>كود الطالب</Label>
              <Input
                value={activateStudentCode}
                onChange={(e) => setActivateStudentCode(e.target.value)}
                placeholder="أدخل كود الطالب"
              />
            </div>
            <div>
              <Label>المجموعة</Label>
              <Select value={activateGroupId} onValueChange={setActivateGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر المجموعة" />
                </SelectTrigger>
                <SelectContent>
                  {allGroups.map((g: any) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.title} ({(g as any).subject_name}) - {g.price} جنيه
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivateOpen(false)}>إلغاء</Button>
            <Button onClick={handleActivateGroup} disabled={activating} className="gap-2">
              {activating && <Loader2 className="h-4 w-4 animate-spin" />}
              <CheckCircle className="h-4 w-4" />
              تفعيل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Group Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل المجموعة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>اسم المجموعة</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div>
              <Label>السعر (جنيه)</Label>
              <Input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>إلغاء</Button>
            <Button onClick={handleEditGroup} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SubscriptionsPage;

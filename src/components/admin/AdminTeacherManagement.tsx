import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  GraduationCap,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Eye,
  Search,
  Ban,
  Video,
  FileText,
  Users,
  Shield,
  User,
  Trash2,
  Play,
  Image,
} from "lucide-react";

interface TeacherData {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  school_name: string | null;
  employee_id: string | null;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  created_at: string | null;
  assigned_stages: string[] | null;
  assigned_grades: string[] | null;
  assigned_category: string | null;
  // Profile data
  bio: string | null;
  photo_url: string | null;
  video_url: string | null;
  is_profile_approved: boolean | null;
  // Stats
  video_count: number;
  pdf_count: number;
  student_count: number;
  is_banned: boolean;
}

const AdminTeacherManagement = () => {
  const [teachers, setTeachers] = useState<TeacherData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherData | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showVideoDialog, setShowVideoDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  const fetchTeachers = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch teacher requests
      const { data: requests, error } = await supabase
        .from("teacher_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!requests || requests.length === 0) {
        setTeachers([]);
        setLoading(false);
        return;
      }

      const teacherIds = requests.map(r => r.user_id);

      // Fetch profiles, teacher_profiles, content stats, student counts in parallel
      const [profilesRes, teacherProfilesRes, contentRes, choicesRes, bannedRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, is_banned").in("id", teacherIds),
        supabase.from("teacher_profiles").select("teacher_id, bio, photo_url, video_url, is_approved").in("teacher_id", teacherIds),
        supabase.from("content").select("uploaded_by, type").in("uploaded_by", teacherIds).eq("is_active", true),
        supabase.from("student_teacher_choices").select("teacher_id").in("teacher_id", teacherIds),
        supabase.from("profiles").select("id, is_banned").in("id", teacherIds),
      ]);

      const profileMap = new Map(profilesRes.data?.map(p => [p.id, p]) || []);
      const teacherProfileMap = new Map(teacherProfilesRes.data?.map(p => [p.teacher_id, p]) || []);
      const bannedMap = new Map(bannedRes.data?.map(p => [p.id, p.is_banned]) || []);

      // Count content per teacher
      const contentCounts = new Map<string, { videos: number; pdfs: number }>();
      contentRes.data?.forEach(c => {
        if (!c.uploaded_by) return;
        const existing = contentCounts.get(c.uploaded_by) || { videos: 0, pdfs: 0 };
        if (c.type === "video") existing.videos++;
        else existing.pdfs++;
        contentCounts.set(c.uploaded_by, existing);
      });

      // Count students per teacher
      const studentCounts = new Map<string, number>();
      choicesRes.data?.forEach(c => {
        studentCounts.set(c.teacher_id, (studentCounts.get(c.teacher_id) || 0) + 1);
      });

      const enriched: TeacherData[] = requests.map(req => {
        const profile = profileMap.get(req.user_id);
        const tProfile = teacherProfileMap.get(req.user_id);
        const counts = contentCounts.get(req.user_id) || { videos: 0, pdfs: 0 };
        return {
          id: req.id,
          user_id: req.user_id,
          full_name: req.full_name,
          email: req.email,
          phone: req.phone,
          school_name: req.school_name,
          employee_id: req.employee_id,
          status: req.status as "pending" | "approved" | "rejected",
          rejection_reason: req.rejection_reason,
          created_at: req.created_at,
          assigned_stages: req.assigned_stages,
          assigned_grades: req.assigned_grades,
          assigned_category: req.assigned_category,
          bio: tProfile?.bio || null,
          photo_url: tProfile?.photo_url || null,
          video_url: tProfile?.video_url || null,
          is_profile_approved: tProfile?.is_approved ?? null,
          video_count: counts.videos,
          pdf_count: counts.pdfs,
          student_count: studentCounts.get(req.user_id) || 0,
          is_banned: bannedMap.get(req.user_id) || false,
        };
      });

      setTeachers(enriched);
    } catch (e) {
      console.error("Error fetching teachers:", e);
      toast.error("خطأ في تحميل بيانات المعلمين");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeachers();
  }, [fetchTeachers]);

  const handleApproveRequest = async (teacher: TeacherData) => {
    setActionLoading(true);
    try {
      const { error: reqError } = await supabase
        .from("teacher_requests")
        .update({ status: "approved", reviewed_at: new Date().toISOString() })
        .eq("id", teacher.id);
      if (reqError) throw reqError;

      // Update profile role
      await supabase.from("profiles").update({ role: "teacher" }).eq("id", teacher.user_id);

      // Add teacher role
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({ user_id: teacher.user_id, role: "teacher" });
      if (roleError && !roleError.message.includes("duplicate")) throw roleError;

      // Sync assignments
      const stage = teacher.assigned_stages?.[0] || "secondary";
      const cat = teacher.assigned_category || "";
      const grades = teacher.assigned_grades || [];
      if (cat && grades.length > 0) {
        await supabase.from("teacher_assignments").delete().eq("teacher_id", teacher.user_id).eq("stage", stage).eq("category", cat);
        const assignments = grades.map(grade => ({ teacher_id: teacher.user_id, stage, grade, category: cat, section: null }));
        await supabase.from("teacher_assignments").insert(assignments);
      }

      toast.success("تمت الموافقة على المعلم");
      fetchTeachers();
      setShowDetails(false);
    } catch (e) {
      console.error("Error approving:", e);
      toast.error("خطأ في الموافقة");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectRequest = async () => {
    if (!selectedTeacher) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("teacher_requests")
        .update({ status: "rejected", rejection_reason: rejectionReason || "لم يستوفِ الشروط", reviewed_at: new Date().toISOString() })
        .eq("id", selectedTeacher.id);
      if (error) throw error;
      toast.success("تم رفض الطلب");
      setShowRejectDialog(false);
      setShowDetails(false);
      setRejectionReason("");
      fetchTeachers();
    } catch (e) {
      console.error("Error rejecting:", e);
      toast.error("خطأ في الرفض");
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveProfile = async (teacher: TeacherData) => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("teacher_profiles")
        .update({ is_approved: true })
        .eq("teacher_id", teacher.user_id);
      if (error) throw error;
      toast.success("تمت الموافقة على السيرة الذاتية - ستظهر للطلاب الآن");
      fetchTeachers();
    } catch (e) {
      console.error("Error approving profile:", e);
      toast.error("خطأ في الموافقة على السيرة");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectProfile = async (teacher: TeacherData) => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("teacher_profiles")
        .update({ is_approved: false })
        .eq("teacher_id", teacher.user_id);
      if (error) throw error;
      toast.success("تم رفض السيرة الذاتية");
      fetchTeachers();
    } catch (e) {
      console.error("Error rejecting profile:", e);
      toast.error("خطأ في رفض السيرة");
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleBan = async (teacher: TeacherData) => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_banned: !teacher.is_banned })
        .eq("id", teacher.user_id);
      if (error) throw error;
      toast.success(teacher.is_banned ? "تم فك حظر المعلم" : "تم حظر المعلم");
      fetchTeachers();
    } catch (e) {
      console.error("Error toggling ban:", e);
      toast.error("خطأ في تحديث الحالة");
    } finally {
      setActionLoading(false);
    }
  };

  const filteredTeachers = teachers.filter(t =>
    t.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.assigned_category || "").includes(searchTerm)
  );

  const pendingRequests = filteredTeachers.filter(t => t.status === "pending");
  const approvedTeachers = filteredTeachers.filter(t => t.status === "approved");
  const pendingProfiles = approvedTeachers.filter(t => t.bio && t.is_profile_approved === false);

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" }) : "-";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="h-6 w-6" />
            إدارة المعلمين
          </h2>
          <div className="flex gap-2">
            {pendingRequests.length > 0 && (
              <Badge variant="destructive">{pendingRequests.length} طلب جديد</Badge>
            )}
            {pendingProfiles.length > 0 && (
              <Badge className="bg-amber-500">{pendingProfiles.length} سيرة تنتظر الموافقة</Badge>
            )}
          </div>
        </div>
        <Badge variant="secondary">{approvedTeachers.length} معلم نشط</Badge>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="بحث بالاسم أو البريد أو المادة..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pr-10"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">إجمالي المعلمين</p>
              <p className="text-2xl font-bold">{teachers.length}</p>
            </div>
            <GraduationCap className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">طلبات معلقة</p>
              <p className="text-2xl font-bold">{pendingRequests.length}</p>
            </div>
            <Clock className="h-8 w-8 text-amber-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">معلمين نشطين</p>
              <p className="text-2xl font-bold">{approvedTeachers.length}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">سيرة تنتظر مراجعة</p>
              <p className="text-2xl font-bold">{pendingProfiles.length}</p>
            </div>
            <Image className="h-8 w-8 text-blue-500" />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="approved" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending" className="gap-1">
            <Clock className="h-4 w-4" />
            طلبات معلقة ({pendingRequests.length})
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-1">
            <CheckCircle className="h-4 w-4" />
            المعلمين النشطين ({approvedTeachers.length})
          </TabsTrigger>
          <TabsTrigger value="profiles" className="gap-1">
            <Image className="h-4 w-4" />
            مراجعة السير ({pendingProfiles.length})
          </TabsTrigger>
        </TabsList>

        {/* Pending Requests Tab */}
        <TabsContent value="pending">
          {pendingRequests.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">لا توجد طلبات معلقة</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map(t => (
                <Card key={t.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="bg-primary/10"><User className="h-5 w-5 text-primary" /></AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-bold truncate">{t.full_name}</p>
                          <p className="text-sm text-muted-foreground truncate">{t.email}</p>
                          <div className="flex gap-1 mt-1">
                            {t.assigned_category && <Badge variant="outline" className="text-xs">{t.assigned_category}</Badge>}
                            <Badge variant="secondary" className="text-xs">{formatDate(t.created_at)}</Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => { setSelectedTeacher(t); setShowDetails(true); }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="sm" className="bg-green-500 hover:bg-green-600 gap-1" onClick={() => handleApproveRequest(t)}>
                          <CheckCircle className="h-4 w-4" /> قبول
                        </Button>
                        <Button size="sm" variant="destructive" className="gap-1" onClick={() => { setSelectedTeacher(t); setShowRejectDialog(true); }}>
                          <XCircle className="h-4 w-4" /> رفض
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Approved Teachers Tab */}
        <TabsContent value="approved">
          {approvedTeachers.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">لا يوجد معلمين نشطين</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {approvedTeachers.map(t => (
                <Card key={t.id} className={`hover:shadow-md transition-shadow ${t.is_banned ? "border-destructive/50 bg-destructive/5" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={t.photo_url || undefined} />
                          <AvatarFallback className="bg-primary/10"><GraduationCap className="h-5 w-5 text-primary" /></AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold truncate">{t.full_name}</p>
                            {t.is_banned && <Badge variant="destructive" className="text-xs">محظور</Badge>}
                            {t.is_profile_approved && <Badge className="bg-green-500 text-xs">السيرة منشورة</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">{t.email}</p>
                          <div className="flex gap-2 mt-1">
                            {t.assigned_category && <Badge variant="outline" className="text-xs">{t.assigned_category}</Badge>}
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Video className="h-3 w-3" /> {t.video_count}
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <FileText className="h-3 w-3" /> {t.pdf_count}
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Users className="h-3 w-3" /> {t.student_count} طالب
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => { setSelectedTeacher(t); setShowDetails(true); }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant={t.is_banned ? "outline" : "destructive"}
                          className="gap-1"
                          onClick={() => handleToggleBan(t)}
                        >
                          <Ban className="h-4 w-4" />
                          {t.is_banned ? "فك الحظر" : "حظر"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Profile Review Tab */}
        <TabsContent value="profiles">
          {pendingProfiles.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">لا توجد سير ذاتية تنتظر المراجعة</CardContent></Card>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {pendingProfiles.map(t => (
                <Card key={t.id} className="overflow-hidden border-amber-500/30">
                  <CardContent className="p-0">
                    <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/20 dark:to-amber-900/10 p-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-16 w-16 border-2 border-background">
                          <AvatarImage src={t.photo_url || undefined} />
                          <AvatarFallback><GraduationCap className="h-6 w-6" /></AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-bold">{t.full_name}</p>
                          <Badge variant="outline" className="text-xs">{t.assigned_category}</Badge>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      {t.bio && <p className="text-sm text-muted-foreground leading-relaxed">{t.bio}</p>}
                      {t.video_url && (
                        <Button variant="outline" size="sm" className="w-full gap-1" onClick={() => { setSelectedTeacher(t); setShowVideoDialog(true); }}>
                          <Play className="h-4 w-4" /> مشاهدة الفيديو التعريفي
                        </Button>
                      )}
                      <div className="flex gap-2">
                        <Button className="flex-1 bg-green-500 hover:bg-green-600 gap-1" size="sm" onClick={() => handleApproveProfile(t)} disabled={actionLoading}>
                          <CheckCircle className="h-4 w-4" /> موافقة ونشر
                        </Button>
                        <Button variant="destructive" className="flex-1 gap-1" size="sm" onClick={() => handleRejectProfile(t)} disabled={actionLoading}>
                          <XCircle className="h-4 w-4" /> رفض
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Teacher Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تفاصيل المعلم</DialogTitle>
          </DialogHeader>
          {selectedTeacher && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={selectedTeacher.photo_url || undefined} />
                  <AvatarFallback className="bg-primary/10"><GraduationCap className="h-6 w-6 text-primary" /></AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-bold text-lg">{selectedTeacher.full_name}</p>
                  <p className="text-sm text-muted-foreground">{selectedTeacher.email}</p>
                  <div className="flex gap-2 mt-1">
                    <Badge variant={selectedTeacher.status === "approved" ? "default" : selectedTeacher.status === "pending" ? "secondary" : "destructive"}>
                      {selectedTeacher.status === "approved" ? "مقبول" : selectedTeacher.status === "pending" ? "معلق" : "مرفوض"}
                    </Badge>
                    {selectedTeacher.is_banned && <Badge variant="destructive">محظور</Badge>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-accent/50">
                  <p className="text-xs text-muted-foreground">الهاتف</p>
                  <p className="font-medium text-sm">{selectedTeacher.phone || "غير محدد"}</p>
                </div>
                <div className="p-3 rounded-lg bg-accent/50">
                  <p className="text-xs text-muted-foreground">المدرسة</p>
                  <p className="font-medium text-sm">{selectedTeacher.school_name || "غير محدد"}</p>
                </div>
                <div className="p-3 rounded-lg bg-accent/50">
                  <p className="text-xs text-muted-foreground">رقم الموظف</p>
                  <p className="font-medium text-sm">{selectedTeacher.employee_id || "غير محدد"}</p>
                </div>
                <div className="p-3 rounded-lg bg-accent/50">
                  <p className="text-xs text-muted-foreground">المادة</p>
                  <p className="font-medium text-sm">{selectedTeacher.assigned_category || "غير محدد"}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <Video className="h-5 w-5 mx-auto text-red-500 mb-1" />
                    <p className="text-lg font-bold">{selectedTeacher.video_count}</p>
                    <p className="text-xs text-muted-foreground">فيديو</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <FileText className="h-5 w-5 mx-auto text-orange-500 mb-1" />
                    <p className="text-lg font-bold">{selectedTeacher.pdf_count}</p>
                    <p className="text-xs text-muted-foreground">ملف</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <Users className="h-5 w-5 mx-auto text-blue-500 mb-1" />
                    <p className="text-lg font-bold">{selectedTeacher.student_count}</p>
                    <p className="text-xs text-muted-foreground">طالب</p>
                  </CardContent>
                </Card>
              </div>

              {selectedTeacher.bio && (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-sm font-medium text-primary mb-1">السيرة الذاتية:</p>
                  <p className="text-sm">{selectedTeacher.bio}</p>
                </div>
              )}

              {selectedTeacher.assigned_grades && selectedTeacher.assigned_grades.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-sm text-muted-foreground">الصفوف:</span>
                  {selectedTeacher.assigned_grades.map(g => (
                    <Badge key={g} variant="secondary" className="text-xs">{g}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {selectedTeacher?.status === "pending" && (
              <div className="flex gap-2 w-full">
                <Button variant="destructive" className="flex-1" onClick={() => { setShowDetails(false); setShowRejectDialog(true); }}>
                  رفض الطلب
                </Button>
                <Button className="flex-1" onClick={() => handleApproveRequest(selectedTeacher)} disabled={actionLoading}>
                  {actionLoading && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                  قبول الطلب
                </Button>
              </div>
            )}
            {selectedTeacher?.status === "approved" && (
              <div className="flex gap-2 w-full">
                <Button variant={selectedTeacher.is_banned ? "outline" : "destructive"} className="flex-1" onClick={() => handleToggleBan(selectedTeacher)} disabled={actionLoading}>
                  <Ban className="h-4 w-4 ml-1" />
                  {selectedTeacher.is_banned ? "فك الحظر" : "حظر المعلم"}
                </Button>
                {selectedTeacher.bio && !selectedTeacher.is_profile_approved && (
                  <Button className="flex-1 bg-green-500 hover:bg-green-600" onClick={() => handleApproveProfile(selectedTeacher)} disabled={actionLoading}>
                    <CheckCircle className="h-4 w-4 ml-1" />
                    نشر السيرة
                  </Button>
                )}
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>رفض طلب المعلم</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="سبب الرفض (اختياري)..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleRejectRequest} disabled={actionLoading}>
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              تأكيد الرفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Video Dialog */}
      <Dialog open={showVideoDialog} onOpenChange={setShowVideoDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>فيديو تعريفي - {selectedTeacher?.full_name}</DialogTitle>
          </DialogHeader>
          {selectedTeacher?.video_url && (
            <video src={selectedTeacher.video_url} controls autoPlay className="w-full rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTeacherManagement;

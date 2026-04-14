import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminTeacherWithdrawals from "@/components/admin/AdminTeacherWithdrawals";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  GraduationCap,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Eye,
  Mail,
  Phone,
  Building,
  IdCard,
} from "lucide-react";

type TeacherRequest = {
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
};

const TeachersPage = () => {
  const [requests, setRequests] = useState<TeacherRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<TeacherRequest | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  const syncTeacherAssignments = async (request: TeacherRequest) => {
    const stage = request.assigned_stages?.[0] || "secondary";
    const category = request.assigned_category || "";
    const grades = request.assigned_grades || [];

    if (!category || grades.length === 0) {
      toast.error("لا توجد مادة/صفوف محفوظة في طلب المعلم");
      return;
    }

    // لضمان عدم تكرار التعيينات عند إعادة المزامنة
    await supabase
      .from("teacher_assignments")
      .delete()
      .eq("teacher_id", request.user_id)
      .eq("stage", stage)
      .eq("category", category);

    const assignments = grades.map((grade) => ({
      teacher_id: request.user_id,
      stage,
      grade,
      category,
      section: null,
    }));

    const { error } = await supabase.from("teacher_assignments").insert(assignments);
    if (error) throw error;
  };

  const loadRequests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("teacher_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error("Error loading requests:", error);
      toast.error("خطأ في تحميل طلبات المعلمين");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleApprove = async (request: TeacherRequest) => {
    setActionLoading(true);
    try {
      // Update request status
      const { error: requestError } = await supabase
        .from("teacher_requests")
        .update({
          status: "approved",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", request.id);

      if (requestError) throw requestError;

      // Update profile role (الاعتماد النهائي)
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ role: "teacher" })
        .eq("id", request.user_id);

      if (profileError) {
        console.error("Error updating profile role:", profileError);
      }

      // Add teacher role
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({
          user_id: request.user_id,
          role: "teacher",
        });

      if (roleError && !roleError.message.includes("duplicate")) {
        throw roleError;
      }

      try {
        await syncTeacherAssignments(request);
      } catch (assignError) {
        console.error("Error creating teacher assignments:", assignError);
        // Don't throw - teacher is still approved, just assignments failed
        toast.error("تم قبول المعلم لكن حدث خطأ في تعيين المواد");
      }

      toast.success("تمت الموافقة على طلب المعلم وتعيين المواد");
      loadRequests();
      setShowDetails(false);
    } catch (error) {
      console.error("Error approving:", error);
      toast.error("خطأ في الموافقة على الطلب");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("teacher_requests")
        .update({
          status: "rejected",
          rejection_reason: rejectionReason || "لم يستوفِ الشروط المطلوبة",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", selectedRequest.id);

      if (error) throw error;

      toast.success("تم رفض طلب المعلم");
      setRejectionReason("");
      setShowRejectDialog(false);
      setShowDetails(false);
      loadRequests();
    } catch (error) {
      console.error("Error rejecting:", error);
      toast.error("خطأ في رفض الطلب");
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> قيد المراجعة</Badge>;
      case "approved":
        return <Badge className="bg-green-500 gap-1"><CheckCircle className="h-3 w-3" /> مقبول</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> مرفوض</Badge>;
      default:
        return null;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            طلبات المعلمين
            {pendingCount > 0 && (
              <Badge variant="destructive" className="mr-2">{pendingCount} طلب جديد</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : requests.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              لا توجد طلبات معلمين
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الاسم</TableHead>
                    <TableHead className="text-right">البريد</TableHead>
                    <TableHead className="text-right">المدرسة</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">تاريخ الطلب</TableHead>
                    <TableHead className="text-right">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">{request.full_name}</TableCell>
                      <TableCell>{request.email}</TableCell>
                      <TableCell>{request.school_name || "-"}</TableCell>
                      <TableCell>{getStatusBadge(request.status)}</TableCell>
                      <TableCell>{formatDate(request.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedRequest(request);
                              setShowDetails(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {request.status === "pending" && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-green-600"
                                onClick={() => handleApprove(request)}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive"
                                onClick={() => {
                                  setSelectedRequest(request);
                                  setShowRejectDialog(true);
                                }}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog تفاصيل الطلب */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تفاصيل طلب المعلم</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <GraduationCap className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-bold text-lg">{selectedRequest.full_name}</p>
                  {getStatusBadge(selectedRequest.status)}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{selectedRequest.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{selectedRequest.phone || "غير محدد"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{selectedRequest.school_name || "غير محدد"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <IdCard className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{selectedRequest.employee_id || "غير محدد"}</span>
                </div>
              </div>

              {/* معلومات المادة والمرحلة */}
              <div className="p-3 bg-primary/5 rounded-lg border border-primary/20 space-y-2">
                <p className="text-sm font-medium text-primary">التخصص المطلوب:</p>
                {selectedRequest.assigned_category && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-background">
                      المادة: {selectedRequest.assigned_category}
                    </Badge>
                  </div>
                )}
                {selectedRequest.assigned_stages && selectedRequest.assigned_stages.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-background">
                      المرحلة: {selectedRequest.assigned_stages[0] === "secondary" ? "ثانوي" : "إعدادي"}
                    </Badge>
                  </div>
                )}
                {selectedRequest.assigned_grades && selectedRequest.assigned_grades.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <span className="text-xs text-muted-foreground">الصفوف:</span>
                    {selectedRequest.assigned_grades.map((grade) => (
                      <Badge key={grade} variant="secondary" className="text-xs">
                        {grade}
                      </Badge>
                    ))}
                  </div>
                )}
                {!selectedRequest.assigned_category && !selectedRequest.assigned_stages?.length && (
                  <p className="text-xs text-muted-foreground">لم يتم تحديد التخصص</p>
                )}
              </div>

              {selectedRequest.rejection_reason && (
                <div className="p-3 bg-destructive/10 rounded-lg">
                  <p className="text-sm font-medium text-destructive">سبب الرفض:</p>
                  <p className="text-sm">{selectedRequest.rejection_reason}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {selectedRequest?.status === "pending" && (
              <div className="flex gap-2 w-full">
                <Button
                  variant="destructive"
                  onClick={() => {
                    setShowDetails(false);
                    setShowRejectDialog(true);
                  }}
                  className="flex-1"
                >
                  رفض
                </Button>
                <Button
                  onClick={() => handleApprove(selectedRequest)}
                  disabled={actionLoading}
                  className="flex-1"
                >
                  {actionLoading && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                  قبول
                </Button>
              </div>
            )}

            {selectedRequest?.status === "approved" && (
              <Button
                variant="outline"
                disabled={actionLoading}
                onClick={async () => {
                  if (!selectedRequest) return;
                  setActionLoading(true);
                  try {
                    await syncTeacherAssignments(selectedRequest);
                    toast.success("تمت مزامنة تعيينات المعلم");
                    loadRequests();
                  } catch (e) {
                    console.error("Error syncing assignments:", e);
                    toast.error("حدث خطأ أثناء مزامنة التعيينات");
                  } finally {
                    setActionLoading(false);
                  }
                }}
              >
                {actionLoading && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                إعادة مزامنة التعيينات
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog الرفض */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>رفض طلب المعلم</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              يرجى كتابة سبب الرفض (سيظهر للمعلم)
            </p>
            <Textarea
              placeholder="سبب الرفض..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={actionLoading}
            >
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              تأكيد الرفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Teacher Withdrawals Section */}
      <AdminTeacherWithdrawals />
    </div>
  );
};

export default TeachersPage;

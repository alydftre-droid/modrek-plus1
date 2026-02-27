import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  GraduationCap, Search, CheckCircle, XCircle, Loader2, Eye, Trash2,
} from "lucide-react";

interface TeacherRequest {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  school_name: string | null;
  employee_id: string | null;
  status: "pending" | "approved" | "rejected";
  assigned_stages: string[] | null;
  assigned_grades: string[] | null;
  assigned_category: string | null;
  created_at: string | null;
}

const AdminTeacherManagement = () => {
  const [requests, setRequests] = useState<TeacherRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<TeacherRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);

  const fetchRequests = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("teacher_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRequests((data as TeacherRequest[]) || []);
    } catch (e) {
      console.error(e);
      toast.error("خطأ في تحميل طلبات المعلمين");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleApprove = async (req: TeacherRequest) => {
    setProcessing(true);
    try {
      // Update request status
      const { error: updateError } = await supabase
        .from("teacher_requests")
        .update({ status: "approved" })
        .eq("id", req.id);
      if (updateError) throw updateError;

      // Add teacher role
      const { error: roleError } = await supabase
        .from("user_roles")
        .upsert({ user_id: req.user_id, role: "teacher" }, { onConflict: "user_id,role" });
      if (roleError) console.error("Role error:", roleError);

      toast.success(`تمت الموافقة على ${req.full_name}`);
      fetchRequests();
    } catch (e) {
      console.error(e);
      toast.error("خطأ في الموافقة على الطلب");
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (req: TeacherRequest) => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from("teacher_requests")
        .update({ status: "rejected", rejection_reason: rejectionReason || null })
        .eq("id", req.id);
      if (error) throw error;
      toast.success(`تم رفض طلب ${req.full_name}`);
      setSelectedRequest(null);
      setRejectionReason("");
      fetchRequests();
    } catch (e) {
      console.error(e);
      toast.error("خطأ في رفض الطلب");
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("teacher_requests").delete().eq("id", id);
      if (error) throw error;
      toast.success("تم حذف الطلب");
      fetchRequests();
    } catch (e) {
      console.error(e);
      toast.error("خطأ في حذف الطلب");
    }
  };

  const filtered = requests.filter(
    (r) =>
      r.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pending = filtered.filter((r) => r.status === "pending");
  const approved = filtered.filter((r) => r.status === "approved");
  const rejected = filtered.filter((r) => r.status === "rejected");

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">إدارة المعلمين</h2>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <GraduationCap className="h-6 w-6" />
          إدارة المعلمين
        </h2>
        <Badge variant="secondary">{requests.length} طلب</Badge>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="بحث بالاسم أو البريد..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pr-10"
        />
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div>
          <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
            <Badge variant="outline" className="bg-amber-100 text-amber-800">{pending.length} معلق</Badge>
          </h3>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الاسم</TableHead>
                    <TableHead className="text-right">البريد</TableHead>
                    <TableHead className="text-right">المدرسة</TableHead>
                    <TableHead className="text-right">التخصص</TableHead>
                    <TableHead className="text-right">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{req.full_name}</TableCell>
                      <TableCell>{req.email}</TableCell>
                      <TableCell>{req.school_name || "-"}</TableCell>
                      <TableCell>{req.assigned_category || "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleApprove(req)} disabled={processing} className="gap-1">
                            <CheckCircle className="h-4 w-4" />
                            قبول
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => setSelectedRequest(req)} className="gap-1">
                            <XCircle className="h-4 w-4" />
                            رفض
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Approved */}
      <div>
        <h3 className="font-bold text-lg mb-3">المعلمون المعتمدون ({approved.length})</h3>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الاسم</TableHead>
                  <TableHead className="text-right">البريد</TableHead>
                  <TableHead className="text-right">الهاتف</TableHead>
                  <TableHead className="text-right">التخصص</TableHead>
                  <TableHead className="text-right">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approved.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      لا يوجد معلمون معتمدون
                    </TableCell>
                  </TableRow>
                ) : (
                  approved.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{req.full_name}</TableCell>
                      <TableCell>{req.email}</TableCell>
                      <TableCell>{req.phone || "-"}</TableCell>
                      <TableCell>{req.assigned_category || "-"}</TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                              <AlertDialogDescription>هل أنت متأكد من حذف هذا المعلم؟</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>إلغاء</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(req.id)}>حذف</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Rejection Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>رفض طلب {selectedRequest?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>سبب الرفض (اختياري)</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="اكتب سبب الرفض..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRequest(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={() => selectedRequest && handleReject(selectedRequest)}
              disabled={processing}
            >
              {processing && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              تأكيد الرفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTeacherManagement;

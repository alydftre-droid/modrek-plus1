import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  CheckCircle,
  XCircle,
  DollarSign,
  User,
  FileText,
} from "lucide-react";

interface PriceChangeRequest {
  id: string;
  teacher_id: string;
  group_id: string;
  current_price: number;
  requested_price: number;
  reason: string;
  status: string;
  created_at: string;
}

const AdminTeacherAffairs = () => {
  const [requests, setRequests] = useState<PriceChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [teacherNames, setTeacherNames] = useState<Map<string, string>>(new Map());
  const [groupNames, setGroupNames] = useState<Map<string, string>>(new Map());
  const [selectedRequest, setSelectedRequest] = useState<PriceChangeRequest | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [adminMessage, setAdminMessage] = useState("");
  const [processing, setProcessing] = useState(false);

  const fetchRequests = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("price_change_requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRequests(data || []);

      const teacherIds = [...new Set((data || []).map(r => r.teacher_id))];
      const groupIds = [...new Set((data || []).map(r => r.group_id))];

      if (teacherIds.length > 0) {
        const { data: teachers } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", teacherIds);
        const map = new Map<string, string>();
        (teachers || []).forEach(t => map.set(t.id, t.full_name));
        setTeacherNames(map);
      }

      if (groupIds.length > 0) {
        const { data: groups } = await supabase
          .from("content_groups")
          .select("id, title")
          .in("id", groupIds);
        const map = new Map<string, string>();
        (groups || []).forEach(g => map.set(g.id, g.title));
        setGroupNames(map);
      }
    } catch (e) {
      console.error(e);
      toast.error("خطأ في تحميل الطلبات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleAction = async () => {
    if (!selectedRequest || !actionType) return;
    setProcessing(true);
    try {
      if (actionType === "approve") {
        // Update group price
        await supabase
          .from("content_groups")
          .update({ price: selectedRequest.requested_price, price_approved: true })
          .eq("id", selectedRequest.group_id);
      }

      // Update request
      await supabase
        .from("price_change_requests")
        .update({
          status: actionType === "approve" ? "approved" : "rejected",
          admin_message: adminMessage || null,
          processed_at: new Date().toISOString(),
        })
        .eq("id", selectedRequest.id);

      // Notification
      await supabase.from("notifications").insert({
        user_id: selectedRequest.teacher_id,
        title: actionType === "approve" ? "تم الموافقة على تغيير السعر" : "تم رفض طلب تغيير السعر",
        message: actionType === "approve"
          ? `تم الموافقة على تغيير سعر الكورس إلى ${selectedRequest.requested_price} جنيه.${adminMessage ? ` ملاحظة: ${adminMessage}` : ""}`
          : `تم رفض طلب تغيير السعر.${adminMessage ? ` السبب: ${adminMessage}` : ""}`,
      });

      toast.success(actionType === "approve" ? "تم الموافقة" : "تم الرفض");
      setSelectedRequest(null);
      setActionType(null);
      setAdminMessage("");
      fetchRequests();
    } catch (e) {
      console.error(e);
      toast.error("خطأ في معالجة الطلب");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <div className="space-y-6"><h2 className="text-2xl font-bold">شؤون المعلمين</h2><Skeleton className="h-96" /></div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        <User className="h-6 w-6" />
        إدارة شؤون المعلمين
      </h2>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2"><DollarSign className="h-5 w-5" />طلبات تغيير الأسعار</span>
            <Badge variant="secondary">{requests.length} طلب</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد طلبات معلقة</p>
          ) : (
            <div className="grid gap-4">
              {requests.map(req => (
                <Card key={req.id} className="border-2">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-bold">{teacherNames.get(req.teacher_id) || "معلم"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span>{groupNames.get(req.group_id) || "كورس"}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground line-through">{req.current_price} جنيه</span>
                          <span className="text-lg font-bold text-primary">{req.requested_price} جنيه</span>
                        </div>
                        <p className="text-sm text-muted-foreground">السبب: {req.reason}</p>
                        <p className="text-xs text-muted-foreground">{new Date(req.created_at).toLocaleString("ar-EG")}</p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 gap-1"
                          onClick={() => { setSelectedRequest(req); setActionType("approve"); }}
                        >
                          <CheckCircle className="h-4 w-4" />
                          موافقة
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="gap-1"
                          onClick={() => { setSelectedRequest(req); setActionType("reject"); }}
                        >
                          <XCircle className="h-4 w-4" />
                          رفض
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!actionType} onOpenChange={() => { setActionType(null); setAdminMessage(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionType === "approve" ? "تأكيد الموافقة" : "رفض الطلب"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea value={adminMessage} onChange={(e) => setAdminMessage(e.target.value)} placeholder="رسالة اختيارية..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionType(null)}>إلغاء</Button>
            <Button onClick={handleAction} disabled={processing} className={actionType === "approve" ? "bg-green-600 hover:bg-green-700" : ""} variant={actionType === "reject" ? "destructive" : "default"}>
              {processing ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
              {actionType === "approve" ? "موافقة" : "رفض"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTeacherAffairs;

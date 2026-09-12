import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Loader2, ArrowDownCircle, CheckCircle, XCircle, Clock, Copy, Send, ImageIcon
} from "lucide-react";
import { toast } from "sonner";

interface WithdrawalRequest {
  id: string;
  teacher_id: string;
  amount: number;
  payment_method: string;
  phone_number: string;
  status: string;
  admin_message: string | null;
  transfer_receipt_url: string | null;
  created_at: string;
  teacher_name?: string;
}

const methodLabels: Record<string, string> = {
  vodafone_cash: "فودافون كاش",
  orange_cash: "أورانج كاش",
  etisalat_cash: "اتصالات كاش",
  instapay: "InstaPay",
};

export default function AdminTeacherWithdrawals() {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [selectedReq, setSelectedReq] = useState<WithdrawalRequest | null>(null);
  const [showAction, setShowAction] = useState<"approve" | "reject" | null>(null);
  const [adminMessage, setAdminMessage] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { fetchRequests(); }, []);

  const fetchRequests = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("teacher_withdrawal_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (data && data.length > 0) {
      const teacherIds = [...new Set(data.map(r => r.teacher_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", teacherIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);
      const enriched = data.map(r => ({
        ...r,
        teacher_name: profileMap.get(r.teacher_id) || "معلم",
      }));
      setRequests(enriched as WithdrawalRequest[]);
    } else {
      setRequests([]);
    }
    setLoading(false);
  };

  const handleApprove = async () => {
    if (!selectedReq) return;
    setSubmitting(true);
    try {
      let receiptUrl: string | null = null;
      if (receiptFile) {
        try {
          const { uploadFile } = await import("@/lib/storage");
          const stored = await uploadFile({
            scope: { kind: "main" },
            category: `withdrawal-receipts/${selectedReq.id}`,
            file: receiptFile,
          });
          receiptUrl = stored.url;
        } catch (uploadErr) {
          console.error("withdrawal receipt upload failed", uploadErr);
        }
      }

      await supabase.from("teacher_withdrawal_requests").update({
        status: "approved",
        admin_message: adminMessage || "تمت الموافقة على طلب السحب",
        transfer_receipt_url: receiptUrl,
        processed_at: new Date().toISOString(),
      }).eq("id", selectedReq.id);

      // Notify teacher
      await supabase.from("notifications").insert({
        user_id: selectedReq.teacher_id,
        title: "تمت الموافقة على طلب السحب",
        message: `تم تحويل مبلغ ${selectedReq.amount} جنيه بنجاح. ${adminMessage || ""}`,
        notification_type: "withdrawal_approved",
      });

      toast.success("تمت الموافقة على طلب السحب");
      setShowAction(null);
      setSelectedReq(null);
      setAdminMessage("");
      setReceiptFile(null);
      fetchRequests();
    } catch {
      toast.error("خطأ في معالجة الطلب");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selectedReq) return;
    setSubmitting(true);
    try {
      await supabase.from("teacher_withdrawal_requests").update({
        status: "rejected",
        admin_message: adminMessage || "تم رفض طلب السحب",
        processed_at: new Date().toISOString(),
      }).eq("id", selectedReq.id);

      // Return amount to teacher wallet
      const { data: wallet } = await supabase
        .from("teacher_wallets")
        .select("balance")
        .eq("teacher_id", selectedReq.teacher_id)
        .maybeSingle();

      if (wallet) {
        await supabase.from("teacher_wallets").update({
          balance: (wallet.balance || 0) + selectedReq.amount,
          updated_at: new Date().toISOString(),
        }).eq("teacher_id", selectedReq.teacher_id);
      }

      // Notify teacher
      await supabase.from("notifications").insert({
        user_id: selectedReq.teacher_id,
        title: "تم رفض طلب السحب",
        message: `تم رفض طلب سحب ${selectedReq.amount} جنيه وتم إرجاع المبلغ. ${adminMessage || ""}`,
        notification_type: "withdrawal_rejected",
      });

      toast.success("تم رفض الطلب وإرجاع المبلغ للمعلم");
      setShowAction(null);
      setSelectedReq(null);
      setAdminMessage("");
      fetchRequests();
    } catch {
      toast.error("خطأ في معالجة الطلب");
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("تم نسخ الرقم");
  };

  const statusBadge = (status: string) => {
    if (status === "pending") return <Badge className="bg-amber-100 text-amber-700 border-0"><Clock className="h-3 w-3 ml-1" />معلق</Badge>;
    if (status === "approved") return <Badge className="bg-emerald-100 text-emerald-700 border-0"><CheckCircle className="h-3 w-3 ml-1" />مكتمل</Badge>;
    if (status === "rejected") return <Badge className="bg-red-100 text-red-700 border-0"><XCircle className="h-3 w-3 ml-1" />مرفوض</Badge>;
    return <Badge>{status}</Badge>;
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <ArrowDownCircle className="h-5 w-5 text-primary" />
        <h3 className="font-bold text-lg">طلبات سحب المعلمين</h3>
        <Badge variant="secondary">{requests.filter(r => r.status === "pending").length} معلق</Badge>
      </div>

      {requests.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="p-8 text-center">
            <ArrowDownCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">لا توجد طلبات سحب</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <Card key={req.id} className={req.status === "pending" ? "border-amber-200 bg-amber-50/30 dark:bg-amber-950/10" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <ArrowDownCircle className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">{req.teacher_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(req.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}
                      </p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-lg">{req.amount.toLocaleString()} جنيه</p>
                    {statusBadge(req.status)}
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-accent/50 text-sm">
                  <span className="text-muted-foreground">{methodLabels[req.payment_method] || req.payment_method}:</span>
                  <span className="font-mono font-bold">{req.phone_number}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(req.phone_number)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>

                {req.status === "pending" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="gap-1 flex-1"
                      onClick={() => { setSelectedReq(req); setShowAction("approve"); }}
                    >
                      <CheckCircle className="h-3 w-3" />
                      موافقة
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-1 flex-1"
                      onClick={() => { setSelectedReq(req); setShowAction("reject"); }}
                    >
                      <XCircle className="h-3 w-3" />
                      رفض
                    </Button>
                  </div>
                )}

                {req.admin_message && (
                  <p className="text-sm mt-2 p-2 rounded-lg bg-background/60">{req.admin_message}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Approve Dialog */}
      <Dialog open={showAction === "approve"} onOpenChange={() => setShowAction(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-emerald-600" />الموافقة على السحب</DialogTitle>
          </DialogHeader>
          {selectedReq && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-accent/50">
                <p className="text-sm"><strong>{selectedReq.teacher_name}</strong> - {selectedReq.amount.toLocaleString()} جنيه</p>
                <p className="text-xs text-muted-foreground">{methodLabels[selectedReq.payment_method]} - {selectedReq.phone_number}</p>
              </div>
              <div>
                <label className="text-sm font-medium">رسالة للمعلم (اختياري)</label>
                <Textarea value={adminMessage} onChange={e => setAdminMessage(e.target.value)} placeholder="تم التحويل بنجاح..." rows={2} />
              </div>
              <div>
                <label className="text-sm font-medium">صورة التحويل (اختياري)</label>
                <Input type="file" accept="image/*" onChange={e => setReceiptFile(e.target.files?.[0] || null)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAction(null)}>إلغاء</Button>
            <Button onClick={handleApprove} disabled={submitting} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              تأكيد الموافقة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showAction === "reject"} onOpenChange={() => setShowAction(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><XCircle className="h-5 w-5 text-red-600" />رفض طلب السحب</DialogTitle>
          </DialogHeader>
          {selectedReq && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-accent/50">
                <p className="text-sm"><strong>{selectedReq.teacher_name}</strong> - {selectedReq.amount.toLocaleString()} جنيه</p>
              </div>
              <div>
                <label className="text-sm font-medium">سبب الرفض</label>
                <Textarea value={adminMessage} onChange={e => setAdminMessage(e.target.value)} placeholder="سبب رفض الطلب..." rows={3} />
              </div>
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30">
                <p className="text-sm text-amber-700 dark:text-amber-300">سيتم إرجاع المبلغ تلقائياً لمحفظة المعلم</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAction(null)}>إلغاء</Button>
            <Button onClick={handleReject} disabled={submitting} variant="destructive" className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              تأكيد الرفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

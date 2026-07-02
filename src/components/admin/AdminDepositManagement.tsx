import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Eye,
  DollarSign,
  User,
  Phone,
  Image,
  KeyRound,
  Plus,
  Search,
} from "lucide-react";

interface DepositRequest {
  id: string;
  student_id: string;
  amount: number;
  phone_number: string;
  receipt_url: string;
  payment_method: string;
  status: string;
  admin_message: string | null;
  created_at: string;
}

interface StudentProfile {
  id: string;
  full_name: string;
  student_code: string | null;
  email: string;
}

const AdminDepositManagement = () => {
  const [requests, setRequests] = useState<DepositRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Map<string, StudentProfile>>(new Map());
  const [selectedRequest, setSelectedRequest] = useState<DepositRequest | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [adminMessage, setAdminMessage] = useState("");
  const [processing, setProcessing] = useState(false);
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);

  // Manual balance transfer
  const [searchQuery, setSearchQuery] = useState("");
  const [foundStudent, setFoundStudent] = useState<StudentProfile | null>(null);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [searching, setSearching] = useState(false);

  // Recharge codes
  const [codeAmount, setCodeAmount] = useState("");
  const [codeUses, setCodeUses] = useState("1");
  const [generatedCode, setGeneratedCode] = useState("");
  const [generating, setGenerating] = useState(false);

  const fetchRequests = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("deposit_requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRequests(data || []);

      // Fetch profiles for all student IDs
      const studentIds = [...new Set((data || []).map(r => r.student_id))];
      if (studentIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, student_code, email")
          .in("id", studentIds);

        const map = new Map<string, StudentProfile>();
        (profs || []).forEach(p => map.set(p.id, p));
        setProfiles(map);
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
      const { data, error } = await (supabase as any).rpc("admin_process_deposit_request", {
        _request_id: selectedRequest.id,
        _action: actionType,
        _message: adminMessage || null,
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "خطأ في معالجة الطلب");

      toast.success(actionType === "approve" ? "تم إضافة الرصيد بنجاح" : "تم رفض الطلب");
      setSelectedRequest(null);
      setActionType(null);
      setAdminMessage("");
      fetchRequests();
    } catch (e: any) {
      console.error(e);
      toast.error("خطأ في معالجة الطلب");
    } finally {
      setProcessing(false);
    }
  };

  const searchStudent = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setFoundStudent(null);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, student_code, email")
        .or(`student_code.eq.${searchQuery.trim()},full_name.ilike.%${searchQuery.trim()}%`)
        .limit(1)
        .maybeSingle();

      if (data) {
        setFoundStudent(data);
      } else {
        toast.error("لم يتم العثور على الطالب");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSearching(false);
    }
  };

  const transferBalance = async () => {
    if (!foundStudent || !transferAmount) return;
    const amount = parseFloat(transferAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("يرجى إدخال مبلغ صحيح");
      return;
    }
    setTransferring(true);
    try {
      const { data, error } = await (supabase as any).rpc("admin_add_student_wallet_credit", {
        _student_id: foundStudent.id,
        _amount: amount,
        _reason: "إعادة شحن تلقائي من الإدارة",
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "خطأ في تحويل الرصيد");

      toast.success(`تم إضافة ${amount} جنيه لـ ${foundStudent.full_name}`);
      setTransferAmount("");
      setFoundStudent(null);
      setSearchQuery("");
    } catch (e) {
      console.error(e);
      toast.error("خطأ في تحويل الرصيد");
    } finally {
      setTransferring(false);
    }
  };

  const generateCode = async () => {
    const amount = parseFloat(codeAmount);
    const uses = parseInt(codeUses);
    if (isNaN(amount) || amount <= 0 || isNaN(uses) || uses <= 0) {
      toast.error("يرجى إدخال بيانات صحيحة");
      return;
    }
    setGenerating(true);
    try {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      const { error } = await supabase.from("recharge_codes").insert({
        code,
        amount,
        max_uses: uses,
      });
      if (error) throw error;
      setGeneratedCode(code);
      toast.success("تم إنشاء الكود بنجاح");
    } catch (e: any) {
      console.error(e);
      toast.error("خطأ في إنشاء الكود");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <div className="space-y-6"><h2 className="text-2xl font-bold">طلبات الإيداع</h2><Skeleton className="h-96" /></div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        <DollarSign className="h-6 w-6" />
        طلبات الإيداع وإدارة الرصيد
      </h2>

      {/* Pending Deposit Requests */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>طلبات الإيداع المعلقة</span>
            <Badge variant="secondary">{requests.length} طلب</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد طلبات معلقة</p>
          ) : (
            <div className="grid gap-4">
              {requests.map(req => {
                const student = profiles.get(req.student_id);
                return (
                  <Card key={req.id} className="border-2">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="font-bold">{student?.full_name || "غير معروف"}</span>
                            {student?.student_code && (
                              <Badge variant="outline">#{student.student_code}</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-green-600" />
                            <span className="text-xl font-bold text-green-600">{req.amount} جنيه</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{req.phone_number}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {new Date(req.created_at).toLocaleString("ar-EG")}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button variant="outline" size="sm" onClick={() => setViewImageUrl(req.receipt_url)} className="gap-1">
                            <Image className="h-4 w-4" />
                            عرض الصورة
                          </Button>
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 gap-1"
                            onClick={() => { setSelectedRequest(req); setActionType("approve"); }}
                          >
                            <CheckCircle className="h-4 w-4" />
                            تم الإيداع
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
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Balance Transfer */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            تحويل رصيد يدوي
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="كود الطالب أو الاسم..."
              className="flex-1"
              onKeyDown={(e) => e.key === "Enter" && searchStudent()}
            />
            <Button onClick={searchStudent} disabled={searching}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          {foundStudent && (
            <div className="p-4 rounded-lg border bg-accent/30">
              <p className="font-bold">{foundStudent.full_name}</p>
              <p className="text-sm text-muted-foreground">{foundStudent.email}</p>
              {foundStudent.student_code && <Badge variant="outline" className="mt-1">#{foundStudent.student_code}</Badge>}
              <div className="flex gap-2 mt-3">
                <Input
                  type="number"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="المبلغ..."
                  className="flex-1"
                />
                <Button onClick={transferBalance} disabled={transferring}>
                  {transferring ? <Loader2 className="h-4 w-4 animate-spin" /> : "تحويل"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recharge Code Generator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            توليد كود شحن
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">المبلغ (جنيه)</label>
              <Input type="number" value={codeAmount} onChange={(e) => setCodeAmount(e.target.value)} placeholder="100" />
            </div>
            <div>
              <label className="text-sm font-medium">عدد الاستخدامات</label>
              <Input type="number" value={codeUses} onChange={(e) => setCodeUses(e.target.value)} placeholder="1" />
            </div>
          </div>
          <Button onClick={generateCode} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            توليد كود
          </Button>
          {generatedCode && (
            <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-center">
              <p className="text-sm text-green-700 mb-1">الكود الجديد:</p>
              <p className="text-3xl font-bold tracking-wider text-green-800">{generatedCode}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  navigator.clipboard.writeText(generatedCode);
                  toast.success("تم نسخ الكود");
                }}
              >
                نسخ الكود
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Dialog */}
      <Dialog open={!!actionType} onOpenChange={() => { setActionType(null); setSelectedRequest(null); setAdminMessage(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionType === "approve" ? "تأكيد الإيداع" : "رفض الطلب"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedRequest && (
              <div className="p-3 rounded-lg bg-accent/30">
                <p>المبلغ: <strong>{selectedRequest.amount} جنيه</strong></p>
                <p>الهاتف: {selectedRequest.phone_number}</p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">رسالة (اختيارية)</label>
              <Textarea value={adminMessage} onChange={(e) => setAdminMessage(e.target.value)} placeholder={actionType === "reject" ? "سبب الرفض..." : "ملاحظة..."} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionType(null); setAdminMessage(""); }}>إلغاء</Button>
            <Button onClick={handleAction} disabled={processing} className={actionType === "approve" ? "bg-green-600 hover:bg-green-700" : ""} variant={actionType === "reject" ? "destructive" : "default"}>
              {processing ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
              {actionType === "approve" ? "تأكيد الإيداع" : "رفض الطلب"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Viewer */}
      <Dialog open={!!viewImageUrl} onOpenChange={() => setViewImageUrl(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>صورة التحويل</DialogTitle></DialogHeader>
          {viewImageUrl && (
            <ReceiptImage receiptUrl={viewImageUrl} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Component to handle receipt image display (signed URL — bucket is private)
const ReceiptImage = ({ receiptUrl }: { receiptUrl: string }) => {
  const [imgSrc, setImgSrc] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { getPrivateFileSignedUrl } = await import("@/lib/privateStorage");
      const signed = await getPrivateFileSignedUrl("payment-receipts", receiptUrl, 3600);
      if (!cancelled) setImgSrc(signed);
    };
    load();
    return () => { cancelled = true; };
  }, [receiptUrl]);

  if (!imgSrc) return <Loader2 className="h-8 w-8 animate-spin mx-auto" />;
  return <img src={imgSrc} alt="صورة التحويل" className="w-full rounded-lg" />;
};

export default AdminDepositManagement;

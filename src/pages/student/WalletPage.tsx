import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StudentLayout from "@/components/student/StudentLayout";
import DepositModal from "@/components/wallet/DepositModal";
import PaymentLogo, { PAYMENT_METHODS } from "@/components/wallet/PaymentLogo";
import { loadPaymentMethodsConfig, PaymentMethodsConfig } from "@/lib/paymentMethods";
import {
  Wallet,
  Plus,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  KeyRound,
  History,
  ArrowDownCircle,
  ArrowUpCircle,
} from "lucide-react";

const WalletPage = () => {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [showDeposit, setShowDeposit] = useState(false);
  const [rechargeCode, setRechargeCode] = useState("");
  const [applyingCode, setApplyingCode] = useState(false);
  const [depositHistory, setDepositHistory] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [paymentConfig, setPaymentConfig] = useState<PaymentMethodsConfig | null>(null);

  useEffect(() => { if (user) fetchData(); }, [user]);
  useEffect(() => { loadPaymentMethodsConfig().then(setPaymentConfig); }, []);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [walletRes, depositsRes, purchasesRes] = await Promise.all([
        supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
        supabase.from("deposit_requests").select("*").eq("student_id", user.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("student_group_purchases").select("*, content_groups:group_id(title, price)").eq("student_id", user.id).order("purchased_at", { ascending: false }).limit(20),
      ]);
      setBalance(walletRes.data?.balance || 0);
      setDepositHistory(depositsRes.data || []);
      setPurchases(purchasesRes.data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const applyRechargeCode = async () => {
    if (!rechargeCode.trim() || !user) return;
    setApplyingCode(true);
    try {
      const { data, error } = await supabase.rpc("redeem_recharge_code", {
        _user_id: user.id,
        _code_text: rechargeCode.trim(),
      });
      if (error) { toast.error("خطأ في تطبيق الكود"); console.error(error); return; }
      const result = data as any;
      if (!result?.success) { toast.error(result?.error || "كود غير صالح"); return; }
      toast.success(`تم إضافة ${result.amount} جنيه إلى رصيدك`);
      setRechargeCode("");
      fetchData();
    } catch (e: any) { console.error(e); toast.error("خطأ في تطبيق الكود"); } finally { setApplyingCode(false); }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />قيد المراجعة</Badge>;
      case "approved": return <Badge className="bg-green-500 gap-1"><CheckCircle className="h-3 w-3" />مقبول</Badge>;
      case "rejected": return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />مرفوض</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <StudentLayout title="محفظتي">
      <DepositModal open={showDeposit} onOpenChange={setShowDeposit} onSuccess={fetchData} />
      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      ) : (
        <div className="p-3 lg:p-6 max-w-2xl mx-auto">
          {/* Payment Methods Card - TOP */}
          <Card className="mb-4 border-2 border-border/60 shadow-sm">
            <CardContent className="p-4">
              <p className="text-sm font-bold text-center mb-3">طرق الدفع المتاحة</p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {(paymentConfig?.all_enabled === false
                  ? []
                  : (paymentConfig?.methods.filter(m => m.enabled && m.number) || PAYMENT_METHODS.map(m => ({ key: m.key })))
                ).map((m: any) => (
                  <PaymentLogo key={m.key} methodKey={m.key} size="md" rounded="xl" />
                ))}
                {paymentConfig?.all_enabled === false && (
                  <p className="text-xs text-amber-600 font-medium">طرق الدفع متوقفة مؤقتًا</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Wallet Balance Card */}
          <Card className="mb-6 overflow-hidden">
            <div className="bg-gradient-to-br from-primary to-primary/80 p-8 text-center text-primary-foreground">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                <Wallet className="h-10 w-10" />
              </div>
              <p className="text-sm opacity-80 mb-1">رصيدك الحالي</p>
              <p className="text-5xl font-bold">{balance.toLocaleString("ar-EG")}</p>
              <p className="text-lg opacity-80 mt-1">جنيه مصري</p>
            </div>
            <CardContent className="p-4">
              <Button onClick={() => setShowDeposit(true)} className="w-full h-12 text-lg font-bold gap-2">
                <Plus className="h-5 w-5" />
                تعبئة الرصيد
              </Button>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4" />كود شحن</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex gap-2">
                <Input value={rechargeCode} onChange={(e) => setRechargeCode(e.target.value)} placeholder="أدخل كود الشحن..." className="flex-1" />
                <Button onClick={applyRechargeCode} disabled={applyingCode || !rechargeCode.trim()}>
                  {applyingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : "تطبيق"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" />سجل الإيداعات والإنفاق</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Tabs defaultValue="deposits" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="deposits" className="gap-1 text-xs"><ArrowDownCircle className="h-3 w-3" />الإيداعات</TabsTrigger>
                  <TabsTrigger value="purchases" className="gap-1 text-xs"><ArrowUpCircle className="h-3 w-3" />المشتريات</TabsTrigger>
                </TabsList>
                <TabsContent value="deposits">
                  {depositHistory.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">لا توجد إيداعات</p>
                  ) : (
                    <div className="space-y-3">
                      {depositHistory.map(dep => (
                        <div key={dep.id} className="flex items-center justify-between p-3 rounded-lg border">
                          <div>
                            <div className="flex items-center gap-2">
                              <ArrowDownCircle className="h-4 w-4 text-green-500" />
                              <p className="font-bold text-lg">{dep.amount} جنيه</p>
                            </div>
                            <p className="text-xs text-muted-foreground">{new Date(dep.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                            {dep.rejection_reason && <p className="text-xs text-destructive mt-1">سبب الرفض: {dep.rejection_reason}</p>}
                          </div>
                          {statusBadge(dep.status)}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="purchases">
                  {purchases.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">لا توجد مشتريات</p>
                  ) : (
                    <div className="space-y-3">
                      {purchases.map(p => (
                        <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border">
                          <div>
                            <div className="flex items-center gap-2">
                              <ArrowUpCircle className="h-4 w-4 text-red-500" />
                              <p className="font-bold">{(p.content_groups as any)?.title || "كورس"}</p>
                            </div>
                            <p className="text-sm text-muted-foreground">{p.amount_paid} جنيه</p>
                            <p className="text-xs text-muted-foreground">{new Date(p.purchased_at).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" })}</p>
                          </div>
                          <Badge variant="outline" className="gap-1"><CheckCircle className="h-3 w-3 text-green-500" />مكتمل</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      )}
    </StudentLayout>
  );
};

export default WalletPage;

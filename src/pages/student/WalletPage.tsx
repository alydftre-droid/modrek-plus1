import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StudentLayout from "@/components/student/StudentLayout";
import {
  Wallet, Plus, Loader2, Clock, CheckCircle, XCircle,
  KeyRound, History, ArrowDownCircle, ArrowUpCircle, Sparkles, Ticket, Copy,
} from "lucide-react";

const WalletPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [rechargeCode, setRechargeCode] = useState("");
  const [applyingCode, setApplyingCode] = useState(false);
  const [depositHistory, setDepositHistory] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);

  useEffect(() => { if (user) fetchData(); }, [user]);

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
        _user_id: user.id, _code_text: rechargeCode.trim(),
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
      case "approved": return <Badge className="bg-emerald-500 gap-1"><CheckCircle className="h-3 w-3" />مقبول</Badge>;
      case "rejected": return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />مرفوض</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <StudentLayout title="محفظتي">
      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      ) : (
        <div className="p-3 lg:p-6 max-w-2xl mx-auto">
          {/* Modern Wallet Hero */}
          <div className="relative mb-5 rounded-3xl overflow-hidden shadow-2xl">
            {/* Background gradient */}
            <div
              className="relative p-6 text-white"
              style={{
                background:
                  "linear-gradient(135deg, #0f766e 0%, #14b8a6 45%, #06b6d4 100%)",
              }}
            >
              {/* Decorative blurs */}
              <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute -bottom-16 -left-12 w-56 h-56 rounded-full bg-cyan-300/20 blur-3xl" />
              <div className="absolute top-4 left-4 opacity-30">
                <Sparkles className="h-5 w-5" />
              </div>

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center ring-1 ring-white/30">
                      <Wallet className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[11px] opacity-80 leading-none mb-1">مدرك Plus</p>
                      <p className="text-sm font-bold leading-none">محفظتي</p>
                    </div>
                  </div>
                  <Badge className="bg-white/20 hover:bg-white/20 border-0 backdrop-blur text-white text-[10px]">
                    EGP
                  </Badge>
                </div>

                <p className="text-xs opacity-80 mb-1">الرصيد المتاح</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-5xl font-extrabold tracking-tight">
                    {balance.toLocaleString("ar-EG")}
                  </p>
                  <p className="text-base opacity-80 font-bold">ج.م</p>
                </div>

                {/* Card chip-like dots */}
                <div className="flex items-center justify-between mt-6">
                  <div className="flex gap-1.5 opacity-70">
                    <span className="w-2 h-2 rounded-full bg-white" />
                    <span className="w-2 h-2 rounded-full bg-white" />
                    <span className="w-2 h-2 rounded-full bg-white" />
                    <span className="w-2 h-2 rounded-full bg-white" />
                  </div>
                  <p className="text-[10px] opacity-70 tracking-widest">SECURE • WALLET</p>
                </div>
              </div>
            </div>

            {/* Recharge button on the card edge */}
            <div className="bg-card p-4">
              <Button
                onClick={() => navigate("/wallet/deposit")}
                className="w-full h-14 text-lg font-extrabold gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/20"
              >
                <Plus className="h-5 w-5" />
                تعبئة الرصيد
              </Button>
            </div>
          </div>

          <Card className="mb-6 border-2 border-dashed">
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
                              <ArrowDownCircle className="h-4 w-4 text-emerald-500" />
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
                          <Badge variant="outline" className="gap-1"><CheckCircle className="h-3 w-3 text-emerald-500" />مكتمل</Badge>
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

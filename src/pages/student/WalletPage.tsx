import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import NotificationsDropdown from "@/components/student/NotificationsDropdown";
import DepositModal from "@/components/wallet/DepositModal";
import paymentMethodsImg from "@/assets/payment-methods.png";
import {
  BookOpen,
  Wallet,
  Plus,
  ChevronLeft,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  LogOut,
  Info,
  MessageSquare,
  KeyRound,
  History,
  ArrowDownCircle,
  ArrowUpCircle,
} from "lucide-react";

const WalletPage = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [showDeposit, setShowDeposit] = useState(false);
  const [rechargeCode, setRechargeCode] = useState("");
  const [applyingCode, setApplyingCode] = useState(false);
  const [depositHistory, setDepositHistory] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      let { data: wallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!wallet) {
        await supabase.from("wallets").insert({ user_id: user.id, balance: 0 });
        wallet = { balance: 0 };
      }
      setBalance(wallet.balance || 0);

      const { data: deposits } = await supabase
        .from("deposit_requests")
        .select("*")
        .eq("student_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setDepositHistory(deposits || []);

      const { data: purchaseData } = await supabase
        .from("student_group_purchases")
        .select("*, content_groups:group_id(title, price)")
        .eq("student_id", user.id)
        .order("purchased_at", { ascending: false })
        .limit(50);
      setPurchases(purchaseData || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const applyRechargeCode = async () => {
    if (!user || !rechargeCode.trim()) return;
    setApplyingCode(true);
    try {
      const { data: code } = await supabase
        .from("recharge_codes")
        .select("*")
        .eq("code", rechargeCode.trim())
        .eq("is_active", true)
        .maybeSingle();

      if (!code) { toast.error("كود غير صالح أو منتهي"); return; }
      if (code.current_uses >= code.max_uses) { toast.error("تم استخدام هذا الكود بالكامل"); return; }

      const { data: existingUse } = await supabase
        .from("recharge_code_uses")
        .select("id")
        .eq("code_id", code.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingUse) { toast.error("لقد استخدمت هذا الكود من قبل"); return; }

      const { data: currentWallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", user.id)
        .single();

      const newBalance = (currentWallet?.balance || 0) + code.amount;
      await supabase.from("wallets").update({ balance: newBalance, updated_at: new Date().toISOString() }).eq("user_id", user.id);
      await supabase.from("recharge_code_uses").insert({ code_id: code.id, user_id: user.id });
      await supabase.from("recharge_codes").update({ current_uses: code.current_uses + 1 }).eq("id", code.id);

      toast.success(`تم إضافة ${code.amount} جنيه إلى رصيدك`);
      setRechargeCode("");
      fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error("خطأ في تطبيق الكود");
    } finally {
      setApplyingCode(false);
    }
  };

  const handleSignOut = async () => { await signOut(); navigate("/"); };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />قيد المراجعة</Badge>;
      case "approved": return <Badge className="bg-green-500 gap-1"><CheckCircle className="h-3 w-3" />مقبول</Badge>;
      case "rejected": return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />مرفوض</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      {/* Always render DepositModal at top level so it never unmounts during loading */}
      <DepositModal open={showDeposit} onOpenChange={setShowDeposit} onSuccess={fetchData} />

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      ) : (
        <>
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-azhari shadow-lg shadow-primary/20">
              <BookOpen className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-gradient-azhari">أزهاريون</span>
          </Link>
          <div className="flex items-center gap-2">
            <NotificationsDropdown />
            <Button variant="ghost" size="icon" asChild><Link to="/about-platform"><Info className="h-5 w-5" /></Link></Button>
            <Button variant="ghost" size="icon" asChild><Link to="/support"><MessageSquare className="h-5 w-5" /></Link></Button>
            <Button variant="ghost" size="icon" onClick={handleSignOut}><LogOut className="h-5 w-5" /></Button>
          </div>
        </div>
      </header>

      <main className="container px-4 py-8 max-w-2xl mx-auto">
        <Button variant="ghost" className="mb-6" onClick={() => navigate("/dashboard")}>
          <ChevronLeft className="h-5 w-5 rotate-180 ml-1" />
          رجوع للرئيسية
        </Button>

        {/* Wallet Card */}
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

        {/* Payment Method Logos */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-muted-foreground mb-3 text-center">طرق الدفع المتاحة</p>
            <img src={paymentMethodsImg} alt="طرق الدفع" className="w-full max-h-32 object-contain" />
          </CardContent>
        </Card>

        {/* Recharge Code */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              كود شحن
            </CardTitle>
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

        {/* Transaction History */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />
              سجل الإيداعات والإنفاق
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Tabs defaultValue="deposits" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="deposits" className="gap-1 text-xs">
                  <ArrowDownCircle className="h-3 w-3" />
                  الإيداعات
                </TabsTrigger>
                <TabsTrigger value="purchases" className="gap-1 text-xs">
                  <ArrowUpCircle className="h-3 w-3" />
                  المشتريات
                </TabsTrigger>
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
                          <p className="text-xs text-muted-foreground">
                            {new Date(dep.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </p>
                          {dep.rejection_reason && (
                            <p className="text-xs text-destructive mt-1">سبب الرفض: {dep.rejection_reason}</p>
                          )}
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
                          <p className="text-xs text-muted-foreground">
                            {new Date(p.purchased_at).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" })}
                          </p>
                        </div>
                        <Badge variant="outline" className="gap-1">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          مكتمل
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

      </main>
        </>
      )}
    </div>
  );
};

export default WalletPage;

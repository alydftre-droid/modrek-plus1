import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import NotificationsDropdown from "@/components/student/NotificationsDropdown";
import DepositModal from "@/components/wallet/DepositModal";
import {
  BookOpen,
  Wallet,
  Plus,
  ChevronLeft,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  Settings,
  LogOut,
  Info,
  MessageSquare,
  KeyRound,
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

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Fetch or create wallet
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

      // Fetch deposit history
      const { data: deposits } = await supabase
        .from("deposit_requests")
        .select("*")
        .eq("student_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      setDepositHistory(deposits || []);
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
      // Find the code
      const { data: code, error: codeError } = await supabase
        .from("recharge_codes")
        .select("*")
        .eq("code", rechargeCode.trim())
        .eq("is_active", true)
        .maybeSingle();

      if (codeError || !code) {
        toast.error("كود غير صالح أو منتهي");
        return;
      }

      if (code.current_uses >= code.max_uses) {
        toast.error("تم استخدام هذا الكود بالكامل");
        return;
      }

      // Check if user already used this code
      const { data: existingUse } = await supabase
        .from("recharge_code_uses")
        .select("id")
        .eq("code_id", code.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingUse) {
        toast.error("لقد استخدمت هذا الكود من قبل");
        return;
      }

      // Add balance
      const { data: currentWallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", user.id)
        .single();

      const newBalance = (currentWallet?.balance || 0) + code.amount;

      await supabase
        .from("wallets")
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);

      // Record usage
      await supabase.from("recharge_code_uses").insert({
        code_id: code.id,
        user_id: user.id,
      });

      // Update code usage count
      await supabase
        .from("recharge_codes")
        .update({ current_uses: code.current_uses + 1 })
        .eq("id", code.id);

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

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />قيد المراجعة</Badge>;
      case "approved":
        return <Badge className="bg-green-500 gap-1"><CheckCircle className="h-3 w-3" />مقبول</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />مرفوض</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      {/* Header */}
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
            <Button variant="ghost" size="icon"><Settings className="h-5 w-5" /></Button>
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

        {/* Payment Methods */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-muted-foreground mb-3">طرق الدفع المتاحة</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {["فودافون كاش", "أورانج كاش", "اتصالات كاش", "WE Pay", "إنستاباي", "فوري"].map(name => (
                <Badge key={name} variant="outline" className="px-3 py-1.5">{name}</Badge>
              ))}
            </div>
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
              <Input
                value={rechargeCode}
                onChange={(e) => setRechargeCode(e.target.value)}
                placeholder="أدخل كود الشحن..."
                className="flex-1"
              />
              <Button onClick={applyRechargeCode} disabled={applyingCode || !rechargeCode.trim()}>
                {applyingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : "تطبيق"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Deposit History */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">سجل الإيداعات</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {depositHistory.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">لا توجد طلبات إيداع</p>
            ) : (
              <div className="space-y-3">
                {depositHistory.map(dep => (
                  <div key={dep.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-bold text-lg">{dep.amount} جنيه</p>
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
          </CardContent>
        </Card>

        <DepositModal open={showDeposit} onOpenChange={setShowDeposit} onSuccess={fetchData} />
      </main>
    </div>
  );
};

export default WalletPage;

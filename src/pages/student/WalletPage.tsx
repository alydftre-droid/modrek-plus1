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
import mudrikLogo from "@/assets/mudrik-logo.png";
import {
  Plus, Loader2, Clock, CheckCircle, XCircle,
  KeyRound, History, ArrowDownCircle, ArrowUpCircle, Ticket, Shield, Smartphone,
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
  const [studentName, setStudentName] = useState<string>("");

  useEffect(() => { if (user) fetchData(); }, [user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [walletRes, depositsRes, purchasesRes, profileRes] = await Promise.all([
        supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
        supabase.from("deposit_requests").select("*").eq("student_id", user.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("student_group_purchases").select("*, content_groups:group_id(title, price)").eq("student_id", user.id).order("purchased_at", { ascending: false }).limit(20),
        supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      ]);
      setBalance(walletRes.data?.balance || 0);
      setDepositHistory(depositsRes.data || []);
      setPurchases(purchasesRes.data || []);
      setStudentName((profileRes.data as any)?.full_name || "");
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
          {/* VIP Visa-style Wallet Card */}
          <div className="mb-5 flex justify-center">
            <div
              className="relative w-full max-w-[380px] aspect-[1.586/1] rounded-2xl overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, #ffffff 0%, #f8fafc 55%, #eef2f7 100%)",
                boxShadow:
                  "0 20px 45px -20px rgba(15,23,42,0.35), 0 6px 14px -8px rgba(37,99,235,0.15), inset 0 1px 0 rgba(255,255,255,0.9)",
                border: "1px solid rgba(226,232,240,0.9)",
              }}
              dir="ltr"
            >
              {/* Sheen */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(115deg, transparent 30%, rgba(37,99,235,0.06) 45%, rgba(255,255,255,0.6) 50%, transparent 65%)",
                }}
              />
              {/* Corner accents */}
              <div className="absolute -top-16 -right-16 w-52 h-52 rounded-full" style={{ background: "radial-gradient(closest-side, rgba(37,99,235,0.14), transparent 70%)" }} />
              <div className="absolute -bottom-20 -left-16 w-56 h-56 rounded-full" style={{ background: "radial-gradient(closest-side, rgba(16,185,129,0.12), transparent 70%)" }} />

              {/* Big centered watermark logo */}
              <img
                src={mudrikLogo}
                alt=""
                aria-hidden
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[68%] pointer-events-none select-none"
                style={{ opacity: 0.09, filter: "grayscale(1) contrast(1.1)" }}
              />

              {/* Top row: brand + VIP */}
              <div className="absolute top-4 left-4 right-4 flex items-start justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-black tracking-wide" style={{ fontFamily: "'Playfair Display', serif" }}>
                  <span style={{ color: "#0F172A" }}>Modrek</span>
                  <span style={{ color: "#16A34A" }}>plus</span>
                </div>
                <div
                  className="text-[9px] font-black tracking-[0.2em] px-2 py-0.5 rounded-full"
                  style={{
                    background: "linear-gradient(135deg,#f5d67a,#c9a24b)",
                    color: "#3a2a05",
                    boxShadow: "0 2px 6px -2px rgba(201,162,75,0.6), inset 0 1px 0 rgba(255,255,255,0.6)",
                  }}
                >
                  VIP
                </div>
              </div>

              {/* Chip */}
              <div className="absolute top-14 left-4">
                <div
                  className="w-10 h-7 rounded-md relative overflow-hidden"
                  style={{
                    background: "linear-gradient(135deg,#e6c976,#b28a3a 60%,#8a6a26)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 2px rgba(0,0,0,0.15)",
                  }}
                >
                  <div className="absolute inset-1 rounded-sm border border-yellow-900/25 grid grid-cols-3 grid-rows-3 gap-[1px]">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div key={i} className="bg-yellow-900/20" />
                    ))}
                  </div>
                </div>
              </div>

              {/* Balance */}
              <div className="absolute left-4 right-4" style={{ top: "44%" }}>
                <p className="text-[9px] tracking-[0.25em] font-bold" style={{ color: "#64748B" }}>AVAILABLE BALANCE</p>
                <div className="flex items-baseline gap-1.5 mt-0.5" dir="rtl">
                  <span className="text-[28px] font-black leading-none" style={{ color: "#0F172A", letterSpacing: "-0.5px" }}>
                    {balance.toLocaleString("ar-EG")}
                  </span>
                  <span className="text-xs font-bold" style={{ color: "#475569" }}>ج.م</span>
                </div>
              </div>

              {/* Bottom: engraved name */}
              <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[8px] tracking-[0.25em] font-bold mb-0.5" style={{ color: "#94A3B8" }}>CARDHOLDER</p>
                  <p
                    className="truncate text-[13px] font-black uppercase"
                    dir="rtl"
                    style={{
                      fontFamily: "'Cairo', system-ui, sans-serif",
                      color: "#1E293B",
                      letterSpacing: "1.5px",
                      textShadow:
                        "0 1px 0 rgba(255,255,255,0.9), 0 -1px 0 rgba(15,23,42,0.25), 0 2px 3px rgba(15,23,42,0.12)",
                    }}
                  >
                    {studentName || "طالب مدرك"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] tracking-[0.2em] font-bold" style={{ color: "#94A3B8" }}>MEMBER</p>
                  <p className="text-[11px] font-black" style={{ color: "#1E293B", letterSpacing: "1px" }}>
                    {new Date().getFullYear()}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Recharge CTA */}
          <div className="mb-5">
            <Button
              onClick={() => navigate("/wallet/deposit")}
              className="w-full h-14 text-base font-extrabold gap-2 rounded-2xl"
              style={{
                background: "linear-gradient(135deg,#2563EB,#1D4ED8)",
                color: "#fff",
                boxShadow: "0 14px 28px -14px rgba(37,99,235,0.55)",
              }}
            >
              <Plus className="h-5 w-5" />
              تعبئة الرصيد
            </Button>
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
                      {depositHistory.map(dep => {
                        const type = dep.deposit_type || "manual";
                        const typeMeta =
                          type === "recharge_code"
                            ? { label: "كود شحن", Icon: Ticket }
                            : type === "admin_manual"
                            ? { label: "إعادة شحن تلقائي من الإدارة", Icon: Shield }
                            : { label: "شحن عبر المحفظة", Icon: Smartphone };
                        const TypeIcon = typeMeta.Icon;
                        const identifier = dep.recharge_code || dep.wallet_adjustment_id || dep.id;
                        return (
                          <div key={dep.id} className="flex items-center justify-between p-3 rounded-lg border">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <ArrowDownCircle className="h-4 w-4 text-emerald-500" />
                                <p className="font-bold text-lg">{dep.amount} جنيه</p>
                                <Badge variant="outline" className="gap-1 text-[10px]">
                                  <TypeIcon className="h-3 w-3" />{typeMeta.label}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">المعرّف: {identifier}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {new Date(dep.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </p>
                              {dep.rejection_reason && <p className="text-xs text-destructive mt-1">سبب الرفض: {dep.rejection_reason}</p>}
                            </div>
                            {statusBadge(dep.status)}
                          </div>
                        );
                      })}
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

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
  Wallet as WalletIcon, BookOpen, PlayCircle, Calendar, Package,
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

  // Status pill (deposits)
  const statusPill = (status: string) => {
    const map: Record<string, { label: string; bg: string; color: string; Icon: any }> = {
      pending:  { label: "قيد المراجعة", bg: "#FEF9C3", color: "#A16207", Icon: Clock },
      approved: { label: "مكتمل",        bg: "#DCFCE7", color: "#15803D", Icon: CheckCircle },
      rejected: { label: "مرفوض",        bg: "#FEE2E2", color: "#B91C1C", Icon: XCircle },
    };
    const m = map[status] || { label: status, bg: "#F1F5F9", color: "#475569", Icon: Clock };
    const I = m.Icon;
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
        style={{ background: m.bg, color: m.color }}
      >
        <I className="h-2.5 w-2.5" />
        {m.label}
      </span>
    );
  };

  // Format date/time in two lines
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });

  // Mask an identifier like #PZ****2F
  const maskId = (raw: string) => {
    const s = String(raw || "").replace(/-/g, "").toUpperCase();
    if (s.length <= 4) return `#${s}`;
    return `#${s.slice(0, 2)}****${s.slice(-2)}`;
  };

  return (
    <StudentLayout title="محفظتي">
      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      ) : (
        <div className="p-3 sm:p-5 lg:p-6 max-w-2xl mx-auto">
          {/* ===== Responsive VIP Visa-style card ===== */}
          <div className="mb-5 flex justify-center">
            <div
              className="relative w-full rounded-2xl overflow-hidden"
              style={{
                maxWidth: "min(420px, 100%)",
                aspectRatio: "1.586 / 1",
                background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 55%, #eef2f7 100%)",
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
              <div className="absolute -top-16 -right-16 w-52 h-52 rounded-full" style={{ background: "radial-gradient(closest-side, rgba(37,99,235,0.14), transparent 70%)" }} />
              <div className="absolute -bottom-20 -left-16 w-56 h-56 rounded-full" style={{ background: "radial-gradient(closest-side, rgba(16,185,129,0.12), transparent 70%)" }} />

              {/* Watermark */}
              <img
                src={mudrikLogo}
                alt=""
                aria-hidden
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none"
                style={{ width: "62%", opacity: 0.09, filter: "grayscale(1) contrast(1.1)" }}
              />

              {/* Top row */}
              <div className="absolute top-[5%] left-[4%] right-[4%] flex items-start justify-between">
                <div
                  className="flex items-center gap-1 font-black tracking-wide"
                  style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(10px, 2.8vw, 13px)" }}
                >
                  <span style={{ color: "#0F172A" }}>Modrek</span>
                  <span style={{ color: "#16A34A" }}>plus</span>
                </div>
                <div
                  className="font-black tracking-[0.2em] px-2 py-[2px] rounded-full"
                  style={{
                    fontSize: "clamp(8px, 2vw, 10px)",
                    background: "linear-gradient(135deg,#f5d67a,#c9a24b)",
                    color: "#3a2a05",
                    boxShadow: "0 2px 6px -2px rgba(201,162,75,0.6), inset 0 1px 0 rgba(255,255,255,0.6)",
                  }}
                >
                  VIP
                </div>
              </div>

              {/* Chip */}
              <div className="absolute" style={{ top: "22%", left: "5%" }}>
                <div
                  className="relative overflow-hidden rounded-md"
                  style={{
                    width: "clamp(32px, 9vw, 44px)",
                    height: "clamp(22px, 6.2vw, 30px)",
                    background: "linear-gradient(135deg,#e6c976,#b28a3a 60%,#8a6a26)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 2px rgba(0,0,0,0.15)",
                  }}
                >
                  <div className="absolute inset-1 rounded-sm border border-yellow-900/25 grid grid-cols-3 grid-rows-3 gap-[1px]">
                    {Array.from({ length: 9 }).map((_, i) => (<div key={i} className="bg-yellow-900/20" />))}
                  </div>
                </div>
              </div>

              {/* Balance */}
              <div className="absolute left-[5%] right-[5%]" style={{ top: "48%" }}>
                <p
                  className="tracking-[0.25em] font-bold"
                  style={{ color: "#64748B", fontSize: "clamp(8px, 2.2vw, 10px)" }}
                >
                  AVAILABLE BALANCE
                </p>
                <div className="flex items-baseline gap-1.5 mt-0.5" dir="rtl">
                  <span
                    className="font-black leading-none"
                    style={{ color: "#0F172A", letterSpacing: "-0.5px", fontSize: "clamp(22px, 7.5vw, 32px)" }}
                  >
                    {balance.toLocaleString("ar-EG")}
                  </span>
                  <span className="font-bold" style={{ color: "#475569", fontSize: "clamp(10px, 3vw, 13px)" }}>ج.م</span>
                </div>
              </div>

              {/* Bottom */}
              <div className="absolute bottom-[5%] left-[5%] right-[5%] flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <p className="tracking-[0.25em] font-bold mb-0.5" style={{ color: "#94A3B8", fontSize: "clamp(7px, 1.9vw, 9px)" }}>
                    CARDHOLDER
                  </p>
                  <p
                    className="truncate font-black uppercase"
                    dir="rtl"
                    style={{
                      fontFamily: "'Cairo', system-ui, sans-serif",
                      color: "#1E293B",
                      letterSpacing: "1.2px",
                      fontSize: "clamp(11px, 3.4vw, 15px)",
                      textShadow: "0 1px 0 rgba(255,255,255,0.9), 0 -1px 0 rgba(15,23,42,0.25), 0 2px 3px rgba(15,23,42,0.12)",
                    }}
                  >
                    {studentName || "طالب مدرك"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="tracking-[0.2em] font-bold" style={{ color: "#94A3B8", fontSize: "clamp(7px, 1.9vw, 9px)" }}>MEMBER</p>
                  <p className="font-black" style={{ color: "#1E293B", letterSpacing: "1px", fontSize: "clamp(10px, 2.8vw, 12px)" }}>
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

          {/* Recharge code */}
          <Card className="mb-5 rounded-2xl border border-[#E8EEF6] bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-slate-800">
                <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <KeyRound className="h-4 w-4 text-blue-600" />
                </div>
                كود شحن
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex gap-2">
                <Input
                  value={rechargeCode}
                  onChange={(e) => setRechargeCode(e.target.value)}
                  placeholder="أدخل كود الشحن..."
                  className="flex-1 h-11 rounded-xl bg-white border-[#E8EEF6] focus-visible:ring-blue-500"
                />
                <Button
                  onClick={applyRechargeCode}
                  disabled={applyingCode || !rechargeCode.trim()}
                  className="h-11 px-5 rounded-xl font-bold"
                  style={{ background: "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff" }}
                >
                  {applyingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : "تطبيق"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* History */}
          <Card className="rounded-2xl border border-[#E8EEF6] shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-slate-800">
                <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center">
                  <History className="h-4 w-4 text-slate-600" />
                </div>
                سجل الإيداعات والإنفاق
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Tabs defaultValue="deposits" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4 bg-slate-100 rounded-xl p-1 h-11">
                  <TabsTrigger
                    value="deposits"
                    className="gap-1.5 text-xs sm:text-sm rounded-lg font-bold transition-all duration-300 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700"
                  >
                    <ArrowDownCircle className="h-3.5 w-3.5" />الإيداعات
                  </TabsTrigger>
                  <TabsTrigger
                    value="purchases"
                    className="gap-1.5 text-xs sm:text-sm rounded-lg font-bold transition-all duration-300 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-rose-700"
                  >
                    <ArrowUpCircle className="h-3.5 w-3.5" />المشتريات
                  </TabsTrigger>
                </TabsList>

                {/* ===== Deposits ===== */}
                <TabsContent value="deposits" className="animate-fade-in">
                  {depositHistory.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="mx-auto h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                        <ArrowDownCircle className="h-6 w-6 text-slate-400" />
                      </div>
                      <p className="text-sm text-muted-foreground">لا توجد إيداعات بعد</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {depositHistory.map((dep, idx) => {
                        const type = dep.deposit_type || "manual";
                        const meta =
                          type === "recharge_code"
                            ? { title: "كود شحن",              method: "كود شحن",       Icon: Ticket,     color: "#7C3AED", bg: "#F5F3FF" }
                          : type === "admin_manual"
                            ? { title: "إضافة من الإدارة",     method: "تحويل من الإدارة", Icon: Shield,     color: "#0EA5E9", bg: "#F0F9FF" }
                            : { title: "إيداع مباشر",          method: "إيداع مباشر",     Icon: WalletIcon, color: "#059669", bg: "#ECFDF5" };
                        const TypeIcon = meta.Icon;
                        const identifier = dep.recharge_code || dep.wallet_adjustment_id || dep.id;
                        return (
                          <div
                            key={dep.id}
                            className="group rounded-2xl border border-[#E8EEF6] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-[2px] hover:shadow-md animate-fade-in"
                            style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}
                          >
                            <div className="flex items-start gap-3">
                              {/* Icon */}
                              <div
                                className="h-12 w-12 rounded-full flex items-center justify-center shrink-0"
                                style={{ background: meta.bg, color: meta.color }}
                              >
                                <TypeIcon className="h-5 w-5" />
                              </div>

                              {/* Middle */}
                              <div className="flex-1 min-w-0">
                                <p className="text-[14px] font-bold text-slate-900 truncate">{meta.title}</p>
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  <span
                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
                                    style={{ background: meta.bg, color: meta.color }}
                                  >
                                    {meta.method}
                                  </span>
                                </div>
                                <p className="mt-1.5 text-[10px] font-mono text-slate-400 truncate">
                                  {maskId(String(identifier))}
                                </p>
                                {dep.rejection_reason && (
                                  <p className="text-[11px] text-destructive mt-1.5">سبب الرفض: {dep.rejection_reason}</p>
                                )}
                              </div>

                              {/* Right: amount + status + date/time */}
                              <div className="flex flex-col items-end gap-1.5 shrink-0">
                                <p className="text-[16px] font-extrabold text-emerald-600 whitespace-nowrap leading-none">
                                  +{dep.amount} <span className="text-[11px] font-bold text-emerald-700">ج.م</span>
                                </p>
                                {statusPill(dep.status)}
                                <div className="flex flex-col items-end gap-0.5 mt-1">
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
                                    <Calendar className="h-2.5 w-2.5" />
                                    {fmtDate(dep.created_at)}
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
                                    <Clock className="h-2.5 w-2.5" />
                                    {fmtTime(dep.created_at)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                {/* ===== Purchases ===== */}
                <TabsContent value="purchases" className="animate-fade-in">
                  {purchases.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="mx-auto h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                        <ArrowUpCircle className="h-6 w-6 text-slate-400" />
                      </div>
                      <p className="text-sm text-muted-foreground">لا توجد مشتريات بعد</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {purchases.map((p, idx) => {
                        const g: any = (p as any).content_groups || {};
                        const groupTitle = g.title || "مجموعة";
                        const subject = g.subject_name || g.subject || "";
                        const itemType = g.item_type || "group";
                        const kindMap: Record<string, { label: string; Icon: any; color: string; bg: string }> = {
                          group:   { label: "مجموعة",  Icon: Package,    color: "#2563EB", bg: "#EFF6FF" },
                          lecture: { label: "محاضرة",  Icon: PlayCircle, color: "#7C3AED", bg: "#F5F3FF" },
                          booklet: { label: "ملزمة",   Icon: BookOpen,   color: "#0891B2", bg: "#ECFEFF" },
                        };
                        const kind = kindMap[itemType] || kindMap.group;
                        const KindIcon = kind.Icon;
                        return (
                          <div
                            key={p.id}
                            className="rounded-2xl border border-[#E8EEF6] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-[2px] hover:shadow-md animate-fade-in"
                            style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className="h-12 w-12 rounded-full flex items-center justify-center shrink-0"
                                style={{ background: kind.bg, color: kind.color }}
                              >
                                <KindIcon className="h-5 w-5" />
                              </div>

                              <div className="flex-1 min-w-0">
                                <p className="text-[14px] font-bold text-slate-900 truncate">{groupTitle}</p>
                                {subject && (
                                  <p className="mt-0.5 text-[12px] font-semibold text-slate-600 truncate">{subject}</p>
                                )}
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  <span
                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
                                    style={{ background: kind.bg, color: kind.color }}
                                  >
                                    {kind.label}
                                  </span>
                                </div>
                                <p className="mt-1.5 text-[10px] font-mono text-slate-400 truncate">
                                  {maskId(String(p.id))}
                                </p>
                              </div>

                              <div className="flex flex-col items-end gap-1.5 shrink-0">
                                <p className="text-[16px] font-extrabold text-rose-600 whitespace-nowrap leading-none">
                                  -{p.amount_paid} <span className="text-[11px] font-bold text-rose-700">ج.م</span>
                                </p>
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
                                  style={{ background: "#FEE2E2", color: "#B91C1C" }}
                                >
                                  <CheckCircle className="h-2.5 w-2.5" />
                                  تم الخصم
                                </span>
                                <div className="flex flex-col items-end gap-0.5 mt-1">
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
                                    <Calendar className="h-2.5 w-2.5" />
                                    {fmtDate(p.purchased_at)}
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
                                    <Clock className="h-2.5 w-2.5" />
                                    {fmtTime(p.purchased_at)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
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

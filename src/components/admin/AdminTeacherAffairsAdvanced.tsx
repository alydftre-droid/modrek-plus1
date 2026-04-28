import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Search, User, DollarSign, FileText, Settings, CheckCircle, XCircle, Loader2, Eye, Shield,
} from "lucide-react";
import AdminTeacherProfileDialog from "./AdminTeacherProfileDialog";

interface TeacherRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  teacher_code: string | null;
  is_banned: boolean | null;
  created_at: string | null;
  balance?: number;
}

interface PriceRequest {
  id: string;
  teacher_id: string;
  group_id: string;
  current_price: number;
  requested_price: number;
  reason: string;
  status: string;
  created_at: string;
}

export default function AdminTeacherAffairsAdvanced() {
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [priceRequests, setPriceRequests] = useState<PriceRequest[]>([]);
  const [teacherNames, setTeacherNames] = useState<Map<string, string>>(new Map());
  const [groupNames, setGroupNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  // Price action dialog
  const [selectedRequest, setSelectedRequest] = useState<PriceRequest | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [adminMessage, setAdminMessage] = useState("");
  const [processing, setProcessing] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // 1. teacher ids from user_roles
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "teacher");
      const teacherIds = (roles || []).map(r => r.user_id);
      if (teacherIds.length === 0) {
        setTeachers([]);
      } else {
        const [profRes, walletsRes] = await Promise.all([
          supabase.from("profiles").select("id,full_name,email,phone,avatar_url,teacher_code,is_banned,created_at").in("id", teacherIds),
          supabase.from("teacher_wallets").select("teacher_id,balance").in("teacher_id", teacherIds),
        ]);
        const balances = new Map<string, number>();
        (walletsRes.data || []).forEach((w: { teacher_id: string; balance: number }) => balances.set(w.teacher_id, Number(w.balance || 0)));
        const list = ((profRes.data || []) as TeacherRow[]).map(t => ({ ...t, balance: balances.get(t.id) || 0 }));
        list.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
        setTeachers(list);
      }

      // 2. price requests
      const { data: prData } = await supabase.from("price_change_requests").select("*").eq("status", "pending").order("created_at", { ascending: false });
      const prs = (prData || []) as PriceRequest[];
      setPriceRequests(prs);

      const ids = [...new Set(prs.map(r => r.teacher_id))];
      const gids = [...new Set(prs.map(r => r.group_id))];
      if (ids.length) {
        const { data } = await supabase.from("profiles").select("id,full_name").in("id", ids);
        const m = new Map<string, string>();
        (data || []).forEach(p => m.set(p.id, p.full_name));
        setTeacherNames(m);
      }
      if (gids.length) {
        const { data } = await supabase.from("content_groups").select("id,title").in("id", gids);
        const m = new Map<string, string>();
        (data || []).forEach(g => m.set(g.id, g.title));
        setGroupNames(m);
      }
    } catch (e) {
      console.error(e);
      toast.error("خطأ في تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handlePriceAction = async () => {
    if (!selectedRequest || !actionType) return;
    setProcessing(true);
    try {
      if (actionType === "approve") {
        await supabase.from("content_groups").update({ price: selectedRequest.requested_price, price_approved: true }).eq("id", selectedRequest.group_id);
      }
      await supabase.from("price_change_requests").update({
        status: actionType === "approve" ? "approved" : "rejected",
        admin_message: adminMessage || null,
        processed_at: new Date().toISOString(),
      }).eq("id", selectedRequest.id);
      await supabase.from("notifications").insert({
        user_id: selectedRequest.teacher_id,
        title: actionType === "approve" ? "✅ تم قبول طلب تغيير السعر" : "❌ تم رفض طلب تغيير السعر",
        message: actionType === "approve"
          ? `تم تغيير سعر الكورس إلى ${selectedRequest.requested_price} ج.${adminMessage ? ` ملاحظة: ${adminMessage}` : ""}`
          : `${adminMessage ? `السبب: ${adminMessage}` : "تم رفض الطلب."}`,
      });
      toast.success(actionType === "approve" ? "تمت الموافقة" : "تم الرفض");
      setActionType(null); setSelectedRequest(null); setAdminMessage("");
      fetchAll();
    } catch (e) {
      toast.error("خطأ في معالجة الطلب");
    } finally {
      setProcessing(false);
    }
  };

  const filtered = teachers.filter(t => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      t.full_name?.toLowerCase().includes(q) ||
      t.email?.toLowerCase().includes(q) ||
      t.phone?.includes(q) ||
      t.teacher_code?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Shield className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold">شؤون المعلمين — وضع المطور</h2>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <User className="h-5 w-5 mx-auto text-primary" />
            <p className="text-xs text-muted-foreground mt-1">إجمالي المعلمين</p>
            <p className="text-xl font-bold">{teachers.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-5 w-5 mx-auto text-emerald-500" />
            <p className="text-xs text-muted-foreground mt-1">نشطون</p>
            <p className="text-xl font-bold">{teachers.filter(t => !t.is_banned).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <XCircle className="h-5 w-5 mx-auto text-red-500" />
            <p className="text-xs text-muted-foreground mt-1">محظورون</p>
            <p className="text-xl font-bold">{teachers.filter(t => t.is_banned).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <DollarSign className="h-5 w-5 mx-auto text-amber-500" />
            <p className="text-xs text-muted-foreground mt-1">طلبات أسعار</p>
            <p className="text-xl font-bold">{priceRequests.length}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="teachers" className="w-full">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="teachers" className="gap-1"><User className="h-3 w-3" />قائمة المعلمين</TabsTrigger>
          <TabsTrigger value="prices" className="gap-1">
            <DollarSign className="h-3 w-3" />طلبات الأسعار
            {priceRequests.length > 0 && <Badge variant="destructive" className="mr-1 h-4 px-1 text-[10px]">{priceRequests.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="teachers" className="space-y-3 mt-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ابحث بالاسم، البريد، الهاتف، أو كود المعلم..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pr-10"
            />
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : filtered.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">لا يوجد معلمون مطابقون</CardContent></Card>
          ) : (
            <div className="grid gap-2">
              {filtered.map(t => (
                <Card key={t.id} className="hover:border-primary/40 transition-colors">
                  <CardContent className="p-3 flex items-center gap-3">
                    <Avatar className="h-12 w-12 ring-1 ring-border">
                      <AvatarImage src={t.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary font-bold">{t.full_name?.[0] || "م"}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold truncate">{t.full_name}</p>
                        {t.is_banned && <Badge variant="destructive" className="text-[10px]">محظور</Badge>}
                        {t.teacher_code && <Badge variant="secondary" className="text-[10px]">{t.teacher_code}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{t.email}</p>
                      <p className="text-xs text-amber-600 font-medium">{(t.balance || 0).toLocaleString("ar-EG")} ج</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => { setSelectedTeacherId(t.id); setProfileOpen(true); }}
                      className="gap-1 shrink-0"
                    >
                      <Eye className="h-3 w-3" />
                      الملف
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="prices" className="space-y-3 mt-3">
          {loading ? (
            <Skeleton className="h-40" />
          ) : priceRequests.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">لا توجد طلبات معلقة</CardContent></Card>
          ) : (
            <div className="grid gap-3">
              {priceRequests.map(req => (
                <Card key={req.id} className="border-2">
                  <CardContent className="p-4 flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className="font-bold flex items-center gap-1"><User className="h-3 w-3" />{teacherNames.get(req.teacher_id) || "معلم"}</p>
                      <p className="text-sm flex items-center gap-1"><FileText className="h-3 w-3" />{groupNames.get(req.group_id) || "كورس"}</p>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground line-through text-sm">{req.current_price} ج</span>
                        <span className="text-lg font-bold text-primary">{req.requested_price} ج</span>
                      </div>
                      <p className="text-xs text-muted-foreground">السبب: {req.reason}</p>
                      <p className="text-xs text-muted-foreground">{new Date(req.created_at).toLocaleString("ar-EG")}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1" onClick={() => { setSelectedRequest(req); setActionType("approve"); }}>
                        <CheckCircle className="h-3 w-3" />موافقة
                      </Button>
                      <Button size="sm" variant="destructive" className="gap-1" onClick={() => { setSelectedRequest(req); setActionType("reject"); }}>
                        <XCircle className="h-3 w-3" />رفض
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AdminTeacherProfileDialog
        teacherId={selectedTeacherId}
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onTeacherChanged={fetchAll}
      />

      <Dialog open={!!actionType} onOpenChange={() => { setActionType(null); setAdminMessage(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{actionType === "approve" ? "تأكيد الموافقة" : "رفض الطلب"}</DialogTitle></DialogHeader>
          <Textarea value={adminMessage} onChange={e => setAdminMessage(e.target.value)} placeholder="رسالة اختيارية..." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionType(null)}>إلغاء</Button>
            <Button onClick={handlePriceAction} disabled={processing} className={actionType === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : ""} variant={actionType === "reject" ? "destructive" : "default"}>
              {processing && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              {actionType === "approve" ? "موافقة" : "رفض"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

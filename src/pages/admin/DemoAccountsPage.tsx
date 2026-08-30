import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Copy, KeyRound, Loader2, LogIn, Plus, Power, ShieldAlert, Trash2, UserCog, Wand2, Mail,
} from "lucide-react";
import { toast } from "sonner";
import { startDemoImpersonation } from "@/lib/devImpersonation";

type DemoRole = "admin" | "teacher" | "student";

interface DemoAccount {
  id: string;
  user_id: string;
  email: string;
  label: string;
  role: DemoRole;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  last_password_reset_at: string | null;
  full_name: string | null;
}

interface AuditRow {
  id: string;
  actor_email: string | null;
  action: string;
  demo_email: string | null;
  demo_role: string | null;
  created_at: string;
}

const ROLE_LABEL: Record<DemoRole, string> = {
  admin: "ديمو مطور",
  teacher: "ديمو معلم",
  student: "ديمو طالب",
};

const ROLE_STYLE: Record<DemoRole, string> = {
  admin: "bg-primary/15 text-primary border-primary/30",
  teacher: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  student: "bg-sky-500/15 text-sky-700 border-sky-500/30",
};

async function callDemoApi(action: string, payload: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("انتهت الجلسة، أعد تسجيل الدخول");
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-demo-accounts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "فشل تنفيذ العملية");
  return data;
}

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "—";

export default function DemoAccountsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<DemoRole>("student");
  const [credentials, setCredentials] = useState<{ email: string; password: string; label: string }[]>([]);
  const [pendingDelete, setPendingDelete] = useState<DemoAccount | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["demo-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_demo_accounts" as any);
      if (error) throw error;
      return (data || []) as DemoAccount[];
    },
  });

  const { data: auditLogs = [] } = useQuery({
    queryKey: ["demo-audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_demo_audit_logs" as any, { _limit: 20 });
      if (error) throw error;
      return (data || []) as AuditRow[];
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["demo-accounts"] });
    queryClient.invalidateQueries({ queryKey: ["demo-audit-logs"] });
  };

  const createMutation = useMutation({
    mutationFn: async () => callDemoApi("create", { role: newRole, email: newEmail.trim() }),
    onSuccess: (data: any) => {
      setCredentials((prev) => [
        { email: data.account?.email, password: data.password, label: data.account?.label },
        ...prev,
      ]);
      setNewEmail("");
      toast.success("تم إنشاء حساب الديمو");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message || "فشل الإنشاء"),
  });

  const seedMutation = useMutation({
    mutationFn: async () => callDemoApi("seed_defaults"),
    onSuccess: (data: any) => {
      const created = (data.created || []).map((c: any) => ({
        email: c.email, password: c.password, label: c.label,
      }));
      setCredentials((prev) => [...created, ...prev]);
      toast.success(created.length ? `تم إنشاء ${created.length} حساب ديمو` : "الحسابات الافتراضية موجودة بالفعل");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message || "فشل الإنشاء التلقائي"),
  });

  const runAction = async (id: string, action: string, payload: Record<string, unknown> = {}) => {
    setBusyId(id);
    try {
      const data = await callDemoApi(action, { demo_id: id, ...payload });
      if (action === "reset_password" && data?.password) {
        const acc = accounts.find((a) => a.id === id);
        setCredentials((prev) => [
          { email: acc?.email || "", password: data.password, label: acc?.label || "" },
          ...prev,
        ]);
        toast.success("تم توليد كلمة مرور جديدة — انسخها الآن");
      } else {
        toast.success("تم تنفيذ العملية");
      }
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "فشل تنفيذ العملية");
    } finally {
      setBusyId(null);
    }
  };

  const copyCredentials = async (email: string, password?: string) => {
    const text = password
      ? `البريد: ${email}\nكلمة المرور: ${password}`
      : `البريد: ${email}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("تم نسخ بيانات الدخول");
    } catch {
      toast.error("تعذر النسخ من المتصفح");
    }
  };

  const loginAs = async (account: DemoAccount) => {
    setBusyId(account.id);
    try {
      await startDemoImpersonation(account.id);
      toast.success(`تم الدخول كـ ${ROLE_LABEL[account.role]}`);
      navigate(account.role === "teacher" ? "/teacher" : "/dashboard", { replace: true });
      setTimeout(() => window.location.reload(), 250);
    } catch (e: any) {
      toast.error(e?.message || "فشل الدخول");
    } finally {
      setBusyId(null);
    }
  };

  const changeEmail = async (account: DemoAccount) => {
    const next = window.prompt("البريد الإلكتروني الجديد لحساب الديمو", account.email);
    if (!next || next.trim() === account.email) return;
    await runAction(account.id, "update_email", { email: next.trim() });
  };

  return (
    <div dir="rtl" className="space-y-6">
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-900 space-y-1">
          <p className="font-semibold">حسابات الديمو معزولة تمامًا عن الإنتاج</p>
          <ul className="list-disc pr-5 space-y-0.5">
            <li>كل حساب ديمو يحمل <span className="font-mono">is_demo = true</span> ومستثنى من إحصائيات وتقارير وأرباح المنصة.</li>
            <li>لا يظهر أي حساب ديمو للطلاب أو المعلمين الحقيقيين.</li>
            <li>كلمات المرور لا تُخزَّن في قاعدة البيانات، وتُعرض مرة واحدة فقط عند التوليد.</li>
          </ul>
        </div>
      </div>

      {credentials.length > 0 && (
        <Card className="border-emerald-300">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-emerald-600" />
              بيانات الدخول (تُعرض مرة واحدة)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {credentials.map((c, i) => (
              <div key={`${c.email}-${i}`} className="rounded-lg border bg-card p-3 space-y-2">
                <p className="text-sm font-semibold">{c.label}</p>
                <p className="text-xs font-mono break-all">Email: {c.email}</p>
                <p className="text-xs font-mono break-all">Password: {c.password}</p>
                <Button size="sm" variant="outline" onClick={() => copyCredentials(c.email, c.password)}>
                  <Copy className="h-4 w-4 ml-1" />
                  نسخ بيانات الدخول
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            إنشاء حساب ديمو
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="demo-email">البريد الإلكتروني</Label>
              <Input
                id="demo-email"
                dir="ltr"
                placeholder="demo.student@modrekplus.demo"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>نوع الحساب</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as DemoRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">ديمو طالب</SelectItem>
                  <SelectItem value="teacher">ديمو معلم</SelectItem>
                  <SelectItem value="admin">ديمو مطور</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!newEmail.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Plus className="h-4 w-4 ml-1" />}
              إنشاء الحساب
            </Button>
            <Button variant="outline" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
              {seedMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Wand2 className="h-4 w-4 ml-1" />}
              إنشاء حسابات الديمو الافتراضية
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" />
            حسابات الديمو ({accounts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">لا توجد حسابات ديمو بعد.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {accounts.map((account) => {
                const busy = busyId === account.id;
                return (
                  <div key={account.id} className="rounded-xl border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className={ROLE_STYLE[account.role]}>{ROLE_LABEL[account.role]}</Badge>
                      <Badge variant={account.is_active ? "secondary" : "destructive"}>
                        {account.is_active ? "Active" : "Disabled"}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-sm">{account.label}</p>
                      <p className="text-xs font-mono break-all" dir="ltr">{account.email}</p>
                      <p className="text-xs font-mono text-muted-foreground">Password: ********</p>
                      <p className="text-xs text-muted-foreground">أُنشئ: {formatDate(account.created_at)}</p>
                      <p className="text-xs text-muted-foreground">آخر دخول: {formatDate(account.last_login_at)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => copyCredentials(account.email)}>
                        <Copy className="h-4 w-4 ml-1" /> نسخ البريد
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => runAction(account.id, "reset_password")}>
                        <KeyRound className="h-4 w-4 ml-1" /> إعادة تعيين كلمة المرور
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => changeEmail(account)}>
                        <Mail className="h-4 w-4 ml-1" /> تغيير البريد
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => runAction(account.id, "set_active", { is_active: !account.is_active })}
                      >
                        <Power className="h-4 w-4 ml-1" /> {account.is_active ? "تعطيل" : "تفعيل"}
                      </Button>
                      {account.role !== "admin" && (
                        <Button size="sm" disabled={busy || !account.is_active} onClick={() => loginAs(account)}>
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><LogIn className="h-4 w-4 ml-1" /> الدخول كـ {ROLE_LABEL[account.role]}</>}
                        </Button>
                      )}
                      <Button size="sm" variant="destructive" disabled={busy} onClick={() => setPendingDelete(account)}>
                        <Trash2 className="h-4 w-4 ml-1" /> حذف
                      </Button>
                    </div>
                    <div className="pt-1">
                      <Select
                        value={account.role}
                        onValueChange={(v) => runAction(account.id, "update_role", { role: v })}
                      >
                        <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="student">تحويل إلى ديمو طالب</SelectItem>
                          <SelectItem value="teacher">تحويل إلى ديمو معلم</SelectItem>
                          <SelectItem value="admin">تحويل إلى ديمو مطور</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">سجل عمليات الديمو (Audit Log)</CardTitle>
        </CardHeader>
        <CardContent>
          {auditLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد عمليات مسجلة بعد.</p>
          ) : (
            <div className="space-y-2">
              {auditLogs.map((log) => (
                <div key={log.id} className="rounded-lg border bg-card p-3 text-xs flex items-center justify-between gap-2">
                  <span className="font-semibold">{log.action}</span>
                  <span className="text-muted-foreground truncate" dir="ltr">{log.demo_email || "—"}</span>
                  <span className="text-muted-foreground">{formatDate(log.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف حساب الديمو</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف حساب الديمو؟ سيتم حذف بياناته التجريبية المرتبطة به.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) runAction(pendingDelete.id, "delete");
                setPendingDelete(null);
              }}
            >
              حذف نهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogFooter>
      </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

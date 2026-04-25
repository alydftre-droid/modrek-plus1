import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  RefreshCw,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  clearGoogleOAuthAttempts,
  downloadGoogleOAuthSummary,
  getGoogleOAuthAttempts,
  type GoogleOAuthAttempt,
} from "@/lib/googleOAuthDiagnostics";

const formatDate = (value?: string) => {
  if (!value) return "—";

  try {
    return new Date(value).toLocaleString("ar-EG");
  } catch {
    return value;
  }
};

const statusMeta: Record<GoogleOAuthAttempt["status"], { label: string; className: string; icon: typeof Activity }> = {
  pending: { label: "قيد البدء", className: "bg-secondary text-secondary-foreground border-0", icon: Activity },
  redirecting: { label: "تم التحويل", className: "bg-accent text-accent-foreground border-0", icon: RefreshCw },
  callback: { label: "وصل callback", className: "bg-primary/10 text-primary border-0", icon: Activity },
  success: { label: "نجاح", className: "bg-primary text-primary-foreground border-0", icon: CheckCircle2 },
  failed: { label: "فشل", className: "bg-destructive text-destructive-foreground border-0", icon: XCircle },
  cancelled: { label: "أُلغي", className: "bg-muted text-muted-foreground border-0", icon: AlertTriangle },
};

export default function GoogleOAuthDiagnosticsPanel() {
  const [attempts, setAttempts] = useState<GoogleOAuthAttempt[]>([]);

  const refreshAttempts = () => {
    setAttempts(getGoogleOAuthAttempts());
  };

  useEffect(() => {
    refreshAttempts();

    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith("google_oauth_debug_")) {
        refreshAttempts();
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const summary = useMemo(() => {
    return {
      total: attempts.length,
      success: attempts.filter((attempt) => attempt.status === "success").length,
      failed: attempts.filter((attempt) => attempt.status === "failed").length,
      cancelled: attempts.filter((attempt) => attempt.status === "cancelled").length,
      latest: attempts[0],
    };
  }, [attempts]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <ShieldAlert className="h-6 w-6 text-primary" />
            تشخيص Google OAuth
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            يسجل كل محاولة تسجيل بواسطة Google مع correlation id وبيانات redirect والنتيجة النهائية، ثم يتيح تنزيل ملخص JSON أو CSV لمشاركته أثناء تتبع العطل.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={refreshAttempts} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            تحديث
          </Button>
          <Button variant="outline" onClick={() => downloadGoogleOAuthSummary("json")} className="gap-2" disabled={attempts.length === 0}>
            <Download className="h-4 w-4" />
            تنزيل JSON
          </Button>
          <Button variant="outline" onClick={() => downloadGoogleOAuthSummary("csv")} className="gap-2" disabled={attempts.length === 0}>
            <Download className="h-4 w-4" />
            تنزيل CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              clearGoogleOAuthAttempts();
              refreshAttempts();
            }}
            className="gap-2"
            disabled={attempts.length === 0}
          >
            <Trash2 className="h-4 w-4" />
            مسح السجل
          </Button>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="space-y-1 p-4">
            <p className="text-xs text-muted-foreground">إجمالي المحاولات</p>
            <p className="text-2xl font-extrabold text-foreground">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-4">
            <p className="text-xs text-muted-foreground">محاولات ناجحة</p>
            <p className="text-2xl font-extrabold text-foreground">{summary.success}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-4">
            <p className="text-xs text-muted-foreground">محاولات فاشلة</p>
            <p className="text-2xl font-extrabold text-foreground">{summary.failed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-4">
            <p className="text-xs text-muted-foreground">آخر correlation id</p>
            <p className="truncate text-sm font-bold text-foreground">{summary.latest?.correlationId || "—"}</p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">قراءة سريعة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• شاشة Google Cloud التي أرسلتها تخص العلامة التجارية والنطاقات المصرح بها، لكنها ليست شاشة OAuth Client الخاصة بروابط redirect.</p>
          <p>• إذا استمر خطأ تبادل الكود بعد وصول المستخدم إلى Google، فالغالب أن السبب في تدفق المصادقة المُدار أو في إعداد redirect الفعلي، وليس في روابط سياسة الخصوصية وحدها.</p>
          <p>• هذا السجل سيوضح هل المحاولة خرجت إلى Google؟ وهل عاد callback؟ وهل وصل رمز أو token؟ وأين توقفت بالضبط.</p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {attempts.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              لا يوجد سجل حتى الآن. نفّذ محاولة Google جديدة ثم افتح هذه اللوحة مرة أخرى.
            </CardContent>
          </Card>
        ) : (
          attempts.map((attempt) => {
            const meta = statusMeta[attempt.status];
            const StatusIcon = meta.icon;

            return (
              <Card key={attempt.attemptId}>
                <CardContent className="space-y-4 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={meta.className}>
                          <StatusIcon className="ml-1 h-3.5 w-3.5" />
                          {meta.label}
                        </Badge>
                        <Badge variant="outline">{attempt.environment}</Badge>
                        <Badge variant="secondary">{attempt.source}</Badge>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p><span className="font-bold text-foreground">correlation id:</span> {attempt.correlationId}</p>
                        <p><span className="font-bold text-foreground">بدأت:</span> {formatDate(attempt.startedAt)}</p>
                        <p><span className="font-bold text-foreground">انتهت:</span> {formatDate(attempt.finishedAt)}</p>
                        <p className="break-all"><span className="font-bold text-foreground">redirect:</span> {attempt.redirectUri || "—"}</p>
                        <p className="break-all"><span className="font-bold text-foreground">المسار النهائي:</span> {attempt.finalPath || "—"}</p>
                        {attempt.error ? <p className="break-words text-destructive"><span className="font-bold">الخطأ:</span> {attempt.error}</p> : null}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-xl border border-border/60 bg-card p-3">
                    <p className="text-xs font-bold text-foreground">تسلسل الأحداث</p>
                    <div className="space-y-2">
                      {attempt.events.map((event) => (
                        <div key={event.id} className="rounded-lg border border-border/60 px-3 py-2 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{event.type}</Badge>
                            <Badge className={statusMeta[event.status].className}>{statusMeta[event.status].label}</Badge>
                            <span className="text-muted-foreground">{formatDate(event.timestamp)}</span>
                          </div>
                          <div className="mt-2 space-y-1 text-muted-foreground">
                            {event.path ? <p className="break-all"><span className="font-bold text-foreground">path:</span> {event.path}</p> : null}
                            {event.redirectUri ? <p className="break-all"><span className="font-bold text-foreground">redirect:</span> {event.redirectUri}</p> : null}
                            {event.error ? <p className="break-words text-destructive"><span className="font-bold">error:</span> {event.error}</p> : null}
                            {event.details && Object.keys(event.details).length > 0 ? (
                              <div className="space-y-1 pt-1">
                                {Object.entries(event.details).map(([key, value]) => (
                                  <p key={key} className="break-all"><span className="font-bold text-foreground">{key}:</span> {value || "—"}</p>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
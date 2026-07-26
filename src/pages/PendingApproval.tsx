import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, Clock, Mail, MessageSquare, LogOut, CheckCircle, XCircle, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type RequestStatus = "pending" | "approved" | "rejected" | null;

const PendingApproval = () => {
  const navigate = useNavigate();
  const { user, role, signOut } = useAuth();
  const [status, setStatus] = useState<RequestStatus>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (role === "admin") {
      navigate("/admin", { replace: true });
      return;
    }
    if (role === "student") {
      navigate("/dashboard", { replace: true });
      return;
    }
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }

    const checkStatus = async () => {
      setLoadingStatus(true);
      try {
        const { data, error } = await supabase
          .from("teacher_requests")
          .select("status, rejection_reason")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error("Error fetching teacher request:", error);
          return;
        }

        if (data) {
          setStatus(data.status as RequestStatus);
          setRejectionReason(data.rejection_reason);
          if (data.status === "approved") {
            navigate("/teacher", { replace: true });
            return;
          }
        }
      } finally {
        setLoadingStatus(false);
      }
    };

    checkStatus();
  }, [user, role, navigate]);

  const refreshStatus = async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      const { data, error } = await supabase
        .from("teacher_requests")
        .select("status, rejection_reason")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      setStatus((data?.status as RequestStatus) || null);
      setRejectionReason(data?.rejection_reason || null);

      if (data?.status === "approved") {
        navigate("/teacher", { replace: true });
        return;
      }
    } catch (error) {
      console.error("Error refreshing teacher request:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  if (loadingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 pattern-islamic p-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">جارٍ التحقق من حالة طلب المعلم...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 pattern-islamic p-4">
      <div className="w-full max-w-md">
        {/* الشعار */}
        <Link to="/" className="flex items-center justify-center gap-3 mb-8 group">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-mudrik shadow-mudrik transition-transform duration-300 group-hover:scale-105">
            <BookOpen className="h-6 w-6 text-primary-foreground" />
          </div>
          <span className="text-2xl font-bold text-gradient-mudrik">مدرك Plus</span>
        </Link>

        <Card className="shadow-lg animate-scale-in text-center">
          <CardContent className="p-8">
            {/* حالة الرفض */}
            {status === "rejected" ? (
              <>
                <div className="mb-6 mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-destructive/10">
                  <XCircle className="h-12 w-12 text-destructive" />
                </div>

                <h1 className="text-2xl font-bold text-destructive mb-3">
                  تم رفض طلبك
                </h1>

                <p className="text-muted-foreground mb-4 leading-relaxed">
                  نأسف، تم رفض طلب التسجيل كمعلم.
                </p>

                {rejectionReason && (
                  <div className="bg-destructive/10 rounded-lg p-4 mb-6 text-right">
                    <h3 className="font-semibold text-foreground mb-2">سبب الرفض:</h3>
                    <p className="text-sm text-muted-foreground">{rejectionReason}</p>
                  </div>
                )}
              </>
            ) : status === "approved" ? (
              <>
                <div className="mb-6 mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-green-500/10">
                  <CheckCircle className="h-12 w-12 text-green-500" />
                </div>

                <h1 className="text-2xl font-bold text-green-600 mb-3">
                  تمت الموافقة على طلبك!
                </h1>

                <p className="text-muted-foreground mb-6 leading-relaxed">
                  مبروك! تم قبول طلبك كمعلم. يمكنك الآن الوصول إلى المنصة.
                </p>
              </>
            ) : (
              <>
                <div className="mb-6 mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 animate-pulse">
                  <ShieldCheck className="h-12 w-12 text-primary" />
                </div>

                <h1 className="text-2xl font-bold text-foreground mb-3">
                  تم إرسال طلبك للإدارة بنجاح
                </h1>

                <p className="text-muted-foreground mb-6 leading-relaxed">
                  طلبك قيد المراجعة الآن، ولن يظهر حسابك للطلاب أو يعمل كحساب معلم قبل الموافقة النهائية من الإدارة.
                </p>

                <div className="bg-accent/50 rounded-lg p-4 mb-6">
                  <h3 className="font-semibold text-foreground mb-2 flex items-center justify-center gap-2">
                    <Mail className="h-5 w-5 text-primary" />
                    ماذا بعد؟
                  </h3>
                  <ul className="text-sm text-muted-foreground space-y-2 text-right">
                    <li>• سيتم مراجعة بياناتك ومستنداتك</li>
                    <li>• ستصلك رسالة على بريدك الإلكتروني</li>
                    <li>• بعد الموافقة فقط يمكنك الدخول والبدء</li>
                  </ul>
                </div>

                <div className="rounded-lg border border-border bg-background/70 p-4 mb-6 text-right">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">حالة الطلب</span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                      <Clock className="h-4 w-4" />
                      طلبك قيد المراجعة الآن
                    </span>
                  </div>
                </div>
              </>
            )}

            <div className="space-y-3">
              {status === "pending" && (
                <Button className="w-full" onClick={refreshStatus} disabled={refreshing}>
                  {refreshing ? <Loader2 className="h-5 w-5 ml-2 animate-spin" /> : <RefreshCw className="h-5 w-5 ml-2" />}
                  تحديث حالة الطلب
                </Button>
              )}

              {status === "rejected" && (
                <Button className="w-full" onClick={() => navigate("/teacher-register")}>
                  <RefreshCw className="h-5 w-5 ml-2" />
                  إعادة تقديم الطلب
                </Button>
              )}

              <Button variant="secondary" className="w-full" asChild>
                <Link to="/auth">
                  <Mail className="h-5 w-5 ml-2" />
                  تسجيل الدخول
                </Link>
              </Button>

              <Button variant="outline" className="w-full" asChild>
                <a href="https://wa.me/201223909712" target="_blank" rel="noopener noreferrer">
                  <MessageSquare className="h-5 w-5 ml-2" />
                  تواصل مع الدعم
                </a>
              </Button>

              <Button variant="ghost" className="w-full" onClick={handleSignOut}>
                <LogOut className="h-5 w-5 ml-2" />
                تسجيل الخروج
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PendingApproval;

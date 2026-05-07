import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, Clock, Mail, MessageSquare, LogOut, CheckCircle, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type RequestStatus = "pending" | "approved" | "rejected" | null;

const PendingApproval = () => {
  const navigate = useNavigate();
  const { user, role, signOut } = useAuth();
  const [status, setStatus] = useState<RequestStatus>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);

  useEffect(() => {
    // If user has a role and is not a pending teacher, redirect
    if (role === "admin") {
      navigate("/admin", { replace: true });
      return;
    }
    if (role === "student") {
      navigate("/dashboard", { replace: true });
      return;
    }
    if (!user || role !== "teacher") {
      navigate("/complete-profile", { replace: true });
      return;
    }

    // Check teacher request status
    const checkStatus = async () => {

      const { data, error } = await supabase
        .from("teacher_requests")
        .select("status, rejection_reason")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching teacher request:", error);
        return;
      }

      if (data) {
        setStatus(data.status as RequestStatus);
        setRejectionReason(data.rejection_reason);
      }
    };

    checkStatus();
  }, [user, role, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  // If teacher is already approved and has teacher role, redirect to teacher dashboard
  if (role === "teacher") {
    navigate("/teacher", { replace: true });
    return null;
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
                {/* أيقونة الانتظار */}
                <div className="mb-6 mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gold/10 animate-pulse">
                  <Clock className="h-12 w-12 text-gold" />
                </div>

                <h1 className="text-2xl font-bold text-foreground mb-3">
                  طلبك قيد المراجعة
                </h1>

                <p className="text-muted-foreground mb-6 leading-relaxed">
                  تم إرسال طلب التسجيل كمعلم بنجاح. سيقوم فريق الإدارة بمراجعة طلبك وستصلك رسالة بريد إلكتروني عند الموافقة.
                </p>

                <div className="bg-accent/50 rounded-lg p-4 mb-6">
                  <h3 className="font-semibold text-foreground mb-2 flex items-center justify-center gap-2">
                    <Mail className="h-5 w-5 text-primary" />
                    ماذا بعد؟
                  </h3>
                  <ul className="text-sm text-muted-foreground space-y-2 text-right">
                    <li>• سيتم مراجعة بياناتك ومستنداتك</li>
                    <li>• ستصلك رسالة على بريدك الإلكتروني</li>
                    <li>• بعد الموافقة يمكنك الدخول والبدء</li>
                  </ul>
                </div>
              </>
            )}

            <div className="space-y-3">
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

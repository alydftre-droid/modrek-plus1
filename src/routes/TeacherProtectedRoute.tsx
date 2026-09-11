// src/routes/TeacherProtectedRoute.tsx

import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { withSupabaseTimeout } from "@/lib/supabaseQueryTimeout";

type TeacherStatus = "pending" | "approved" | "rejected";

interface Props {
  children: React.ReactNode;
}


const TeacherProtectedRoute = ({ children }: Props) => {
  const { user, role, session, isLoading, isHydrated, isRoleResolved, isAuthReady } = useAuth();
  const [teacherStatus, setTeacherStatus] = useState<TeacherStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [statusError, setStatusError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const effectiveRole = role;

  const hasCheckedRef = useState({ userId: "", status: "" as TeacherStatus | null })[0];

  useEffect(() => {
    // Don't check until auth is fully loaded (user + role resolved)
    if (!isAuthReady) return;

    const checkTeacherStatus = async () => {
      if (!user) {
        setChecking(false);
        return;
      }

      // If we already checked this user, don't re-check (prevents upload interruption)
      if (hasCheckedRef.userId === user.id && teacherStatus !== null) {
        setChecking(false);
        return;
      }

      // Admin can access teacher routes
      if (effectiveRole === "admin") {
        setTeacherStatus("approved");
        hasCheckedRef.userId = user.id;
        hasCheckedRef.status = "approved";
        setChecking(false);
        return;
      }

      // Not a teacher → no access
      if (effectiveRole !== "teacher") {
        setTeacherStatus(null);
        setChecking(false);
        return;
      }

      try {
        // Time-boxed: a stalled request must never keep this guard spinning.
        const { data, error } = await withSupabaseTimeout(
          supabase
            .from("teacher_requests")
            .select("status")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          "صلاحيات المعلم",
          8000,
        );

        if (error) {
          console.error("Error checking teacher status:", error);
          setTeacherStatus(null);
          setStatusError(true);
        } else {
          setStatusError(false);
          const s = (data?.status as TeacherStatus) ?? null;
          setTeacherStatus(s);
          hasCheckedRef.userId = user.id;
          hasCheckedRef.status = s;
        }
      } catch (err) {
        console.error("Exception checking teacher status:", err);
        setTeacherStatus(null);
        setStatusError(true);
      }

      setChecking(false);
    };

    // Only reset checking if we haven't verified this user yet
    if (hasCheckedRef.userId !== user?.id) {
      setChecking(true);
    }
    checkTeacherStatus();
  }, [effectiveRole, isAuthReady, user, retryToken]);

  console.info("[teacher-auth-guard] route_check", {
    isLoading,
    isHydrated,
    isRoleResolved,
    isAuthReady,
    checking,
    hasUser: Boolean(user),
    hasSession: Boolean(session),
    role: effectiveRole,
    teacherStatus,
  });

  // Backend did not answer → visible retry, never an endless spinner.
  if (statusError && !checking) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
        <div className="max-w-md w-full rounded-2xl border bg-card p-6 text-center space-y-4 shadow-sm">
          <h1 className="text-lg font-bold text-foreground">تعذر التحقق من صلاحيات المعلم</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            لم يستجب الخادم الآن. تحقق من الاتصال ثم أعد المحاولة.
          </p>
          <Button
            className="w-full"
            onClick={() => {
              hasCheckedRef.userId = "";
              setStatusError(false);
              setChecking(true);
              setRetryToken((value) => value + 1);
            }}
          >
            <RefreshCw className="h-4 w-4 ml-2" />
            إعادة المحاولة
          </Button>
        </div>
      </div>
    );
  }

  // Still loading auth context or checking teacher status
  if (!isAuthReady || checking) {
    console.info("[teacher-auth-guard] waiting_for_auth_resolution", {
      isLoading,
      isHydrated,
      isRoleResolved,
      isAuthReady,
      checking,
      hasUser: Boolean(user),
      hasSession: Boolean(session),
      redirectReason: "auth_not_ready",
    });
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">جاري التحقق من صلاحيات المعلم...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    console.info("[teacher-auth-guard] unauthenticated_redirect", {
      isLoading,
      isHydrated,
      isRoleResolved,
      isAuthReady,
      hasSession: Boolean(session),
      redirectReason: "missing_user_after_hydration",
    });
    return <Navigate to="/auth" replace />;
  }

  // Student → redirect to student dashboard
  if (effectiveRole === "student") {
    return <Navigate to="/dashboard" replace />;
  }

  // Admin → allow
  if (effectiveRole === "admin") {
    return <>{children}</>;
  }

  // Teacher with approved status → allow
  if (effectiveRole === "teacher" && teacherStatus === "approved") {
    return <>{children}</>;
  }

  // Teacher with pending/rejected status → pending approval page
  if (effectiveRole === "teacher" && (teacherStatus === "pending" || teacherStatus === "rejected")) {
    return <Navigate to="/pending-approval" replace />;
  }

  // Role is still null (shouldn't happen after loading) or unknown state → show loading briefly then redirect
  if (!effectiveRole && !isRoleResolved) {
    console.info("[teacher-auth-guard] waiting_for_role_resolution", {
      hasUser: Boolean(user),
      hasSession: Boolean(session),
      redirectReason: "role_not_resolved_yet",
    });
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">جارٍ تجهيز بيانات الحساب...</p>
        </div>
      </div>
    );
  }

  if (!effectiveRole) {
    console.info("[teacher-auth-guard] missing_role_redirect", {
      redirectReason: "missing_role_fallback_to_auth",
    });
    return <Navigate to="/auth" replace />;
  }

  // Any other unexpected state
  return <Navigate to="/" replace />;
};

export default TeacherProtectedRoute;

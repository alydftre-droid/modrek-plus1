// src/routes/TeacherProtectedRoute.tsx

import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

type TeacherStatus = "pending" | "approved" | "rejected";

interface Props {
  children: React.ReactNode;
}


const TeacherProtectedRoute = ({ children }: Props) => {
  const { user, role, session, isLoading, isHydrated, isRoleResolved, isAuthReady } = useAuth();
  const [teacherStatus, setTeacherStatus] = useState<TeacherStatus | null>(null);
  const [checking, setChecking] = useState(true);
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
        const { data, error } = await supabase
          .from("teacher_requests")
          .select("status")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error("Error checking teacher status:", error);
          setTeacherStatus(null);
        } else {
          const s = (data?.status as TeacherStatus) ?? null;
          setTeacherStatus(s);
          hasCheckedRef.userId = user.id;
          hasCheckedRef.status = s;
        }
      } catch (err) {
        console.error("Exception checking teacher status:", err);
        setTeacherStatus(null);
      }

      setChecking(false);
    };

    // Only reset checking if we haven't verified this user yet
    if (hasCheckedRef.userId !== user?.id) {
      setChecking(true);
    }
    checkTeacherStatus();
  }, [effectiveRole, isAuthReady, user]);

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

import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { isOfficialTenantHost } from "@/lib/tenant";

type Role = "student" | "teacher" | "admin" | "support";


interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: Role[];
  requireAuth?: boolean;
}

const ProtectedRoute = ({
  children,
  allowedRoles,
  requireAuth = true,
}: ProtectedRouteProps) => {
  const { user, role, isLoading, isHydrated, isRoleResolved, isAuthReady, isBanned, session } = useAuth();
  const location = useLocation();
  const effectiveRole = role;

  console.info("[auth-guard] route_check", {
    path: location.pathname,
    isLoading,
    isHydrated,
    isRoleResolved,
    isAuthReady,
    hasUser: Boolean(user),
    hasSession: Boolean(session),
    role: effectiveRole,
    requireAuth,
    allowedRoles: allowedRoles ?? [],
    isBanned,
  });

  // Routing isolation: the global Modrek Plus admin console never renders on a
  // teacher-platform host.
  if (allowedRoles?.includes("admin") && !isOfficialTenantHost()) {
    return <Navigate to="/" replace />;
  }

  const consumePostOAuthRedirect = () => {
    if (typeof window === "undefined") return null;
    const next = window.sessionStorage.getItem("post_oauth_redirect");
    if (!next) return null;
    window.sessionStorage.removeItem("post_oauth_redirect");
    return next;
  };

  /* ===================== */
  /* ⏳ Loading */
  /* ===================== */
  if (!isAuthReady) {
    console.info("[auth-guard] waiting_for_auth_resolution", {
      path: location.pathname,
      isLoading,
      isHydrated,
      isRoleResolved,
      isAuthReady,
      hasUser: Boolean(user),
      hasSession: Boolean(session),
      redirectReason: "auth_not_ready",
    });
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">جاري التحقق من الحساب...</p>
        </div>
      </div>
    );
  }

  /* ===================== */
  /* 🔐 Not authenticated */
  /* ===================== */
  if (requireAuth && !user) {
    console.info("[auth-guard] unauthenticated_redirect", {
      path: location.pathname,
      isLoading,
      isHydrated,
      isRoleResolved,
      isAuthReady,
      hasSession: Boolean(session),
      redirectReason: "missing_user_after_hydration",
    });
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  /* ===================== */
  /* 🚫 Banned user */
  /* ===================== */
  if (user && isBanned) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
            <span className="text-3xl">🚫</span>
          </div>
          <h1 className="text-2xl font-bold text-destructive mb-2">
            حسابك موقوف
          </h1>
          <p className="text-muted-foreground mb-4">
            تم إيقاف حسابك مؤقتًا. يرجى التواصل مع الدعم.
          </p>
          <a
            href="https://wa.me/201223909712"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            تواصل مع الدعم
          </a>
        </div>
      </div>
    );
  }

  /* ===================== */
  /* 🧑‍🏫 Teacher pending approval */
  /* ===================== */
  // No role yet → user must complete profile (typically OAuth signups)
  if (user && !effectiveRole && !isRoleResolved) {
    console.info("[auth-guard] authenticated_without_role_waiting", {
      path: location.pathname,
      userId: user.id,
      isLoading,
      isHydrated,
      isRoleResolved,
      redirectReason: "role_not_resolved_yet",
    });
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">جارٍ تجهيز حسابك...</p>
        </div>
      </div>
    );
  }

  if (user && !effectiveRole && isRoleResolved) {
    console.info("[auth-guard] authenticated_without_role_redirect", {
      path: location.pathname,
      userId: user.id,
      redirectReason: "no_role_fallback_to_select_education",
    });
    if (location.pathname !== "/select-education-type") {
      return <Navigate to="/select-education-type" replace />;
    }
  }

  /* ===================== */
  /* 🎯 Role-based access */
  /* ===================== */
  if (allowedRoles && allowedRoles.length > 0) {
    if (!effectiveRole || !allowedRoles.includes(effectiveRole)) {
      const postOAuthRedirect = consumePostOAuthRedirect();
      if (postOAuthRedirect && user) {
        console.info("[auth-guard] honoring_post_oauth_redirect", {
          currentPath: location.pathname,
          redirectTo: postOAuthRedirect,
          role: effectiveRole,
        });
        return <Navigate to={postOAuthRedirect} replace />;
      }

      console.info("[auth-guard] role_redirect", {
        currentPath: location.pathname,
        role: effectiveRole,
        allowedRoles,
      });
      switch (effectiveRole) {
        case "admin":
          return <Navigate to="/admin" replace />;
        case "teacher":
          return <Navigate to="/teacher" replace />;
        case "student":
          return <Navigate to="/dashboard" replace />;
        default:
          return <Navigate to="/" replace />;
      }
    }
  }

  /* ===================== */
  /* ✅ Allowed */
  /* ===================== */
  return <>{children}</>;
};

export default ProtectedRoute;
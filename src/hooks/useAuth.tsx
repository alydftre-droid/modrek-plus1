import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { signInWithOAuthNative } from "@/lib/nativeOAuth";
import { initPushNotifications, teardownPushNotifications } from "@/lib/pushNotifications";
import { finalizeGoogleOAuthAttempt, parseGoogleOAuthCallbackUrl, recordGoogleOAuthEvent } from "@/lib/googleOAuthDiagnostics";
import { buildCanonicalAppUrl } from "@/lib/authUrls";
import { useRef } from "react";

const mapGoogleAuthError = (value: unknown) => {
  const message = value instanceof Error ? value.message : String(value || "");
  const normalized = message.toLowerCase();

  if (normalized.includes("failed to exchange authorization code")) {
    return "تعذر إكمال تسجيل Google حالياً. تم إصلاح مسار التبادل داخل التطبيق، جرّب مرة أخرى الآن.";
  }

  if (normalized.includes("cancel") || normalized.includes("closed") || normalized.includes("إلغاء")) {
    return "تم إلغاء تسجيل الدخول بـ Google قبل اكتماله";
  }

  return message || "تعذر تسجيل الدخول بـ Google";
};

const logAuthDebug = (message: string, details?: Record<string, unknown>) => {
  console.info(`[auth] ${message}`, details || {});
};

type AppRole = "student" | "teacher" | "admin" | "support";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  isLoading: boolean;
  isBanned: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (data: SignUpData) => Promise<{ error: string | null }>;
  signUpTeacher: (data: TeacherSignUpData) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  // OTP flows
  sendEmailOtp: (email: string, shouldCreateUser?: boolean) => Promise<{ error: string | null }>;
  verifyEmailOtp: (email: string, token: string, type?: "email" | "recovery") => Promise<{ error: string | null }>;
  setPasswordAfterOtp: (password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: (options?: { correlationId?: string; redirectUri?: string; source?: string }) => Promise<{ error: string | null }>;
}

interface SignUpData {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  stage?: string;
  grade?: string;
  section?: string;
}

interface TeacherSignUpData {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  schoolName?: string;
  employeeId?: string;
  stages: ("preparatory" | "secondary")[];
  grades: string[];
  subject: string;
  educationType?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBanned, setIsBanned] = useState(false);
  const authBootstrappedRef = useRef(false);

  const fetchUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        console.error("Error fetching role:", error);
        return null;
      }
      return data ? (data.role as AppRole) : null;
    } catch (e) {
      console.error("fetchUserRole error", e);
      return null;
    }
  };

  const checkIfBanned = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("is_banned")
        .eq("id", userId)
        .maybeSingle();
      if (error) return false;
      return data?.is_banned || false;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    let isMounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      logAuthDebug("onAuthStateChange", {
        event: _event,
        hasSession: Boolean(session),
        userId: session?.user?.id ?? null,
        pathname: typeof window !== "undefined" ? window.location.pathname : null,
      });
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        const uid = session.user.id;
        setTimeout(async () => {
          if (!isMounted) return;
          const userRole = await fetchUserRole(uid);
          if (!isMounted) return;
          setRole(userRole);
          const banned = await checkIfBanned(uid);
          if (!isMounted) return;
          setIsBanned(banned);
          if (authBootstrappedRef.current) setIsLoading(false);
          // Initialize push notifications (non-blocking)
          initPushNotifications(uid).catch((e) => console.warn("push init", e));
        }, 0);
      } else {
        setRole(null);
        setIsBanned(false);
        if (authBootstrappedRef.current) setIsLoading(false);
        teardownPushNotifications().catch(() => {});
      }
    });

    const initializeAuth = async () => {
      logAuthDebug("bootstrap_started", {
        pathname: typeof window !== "undefined" ? window.location.pathname : null,
        hasHash: typeof window !== "undefined" ? Boolean(window.location.hash) : false,
      });

      const callbackSnapshot = parseGoogleOAuthCallbackUrl();
      if (callbackSnapshot.accessToken && callbackSnapshot.refreshToken) {
        logAuthDebug("oauth_hash_detected", {
          pathname: callbackSnapshot.pathname,
          hasAccessToken: true,
          hasRefreshToken: true,
          correlationId: callbackSnapshot.correlationId ?? null,
        });

        recordGoogleOAuthEvent({
          correlationId: callbackSnapshot.correlationId,
          source: "auth_provider_bootstrap",
          type: "hash_tokens_detected",
          status: "callback",
          details: {
            pathname: callbackSnapshot.pathname,
            has_access_token: true,
            has_refresh_token: true,
          },
        });

        const { data: sessionData, error: hashSessionError } = await supabase.auth.setSession({
          access_token: callbackSnapshot.accessToken,
          refresh_token: callbackSnapshot.refreshToken,
        });

        if (hashSessionError) {
          logAuthDebug("oauth_hash_session_failed", {
            error: hashSessionError.message,
            pathname: callbackSnapshot.pathname,
          });

          finalizeGoogleOAuthAttempt({
            correlationId: callbackSnapshot.correlationId,
            source: "auth_provider_bootstrap",
            type: "hash_session_failed",
            status: "failed",
            error: hashSessionError.message,
          });
        } else {
          logAuthDebug("oauth_hash_session_created", {
            userId: sessionData.session?.user?.id ?? null,
            pathname: callbackSnapshot.pathname,
          });

          finalizeGoogleOAuthAttempt({
            correlationId: callbackSnapshot.correlationId,
            source: "auth_provider_bootstrap",
            type: "hash_session_created",
            status: "success",
            details: {
              user_id: sessionData.session?.user?.id,
            },
          });

          if (typeof window !== "undefined") {
            window.sessionStorage.setItem("post_oauth_redirect", "/dashboard");
            const cleanPath = `${window.location.pathname}${window.location.search}`;
            window.history.replaceState(window.history.state, "", cleanPath);
            logAuthDebug("oauth_tokens_removed_from_url", { cleanPath });
          }
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!isMounted) return;

      authBootstrappedRef.current = true;
      logAuthDebug("bootstrap_session_resolved", {
        hasSession: Boolean(session),
        userId: session?.user?.id ?? null,
      });

      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        const [userRole, banned] = await Promise.all([
          fetchUserRole(session.user.id),
          checkIfBanned(session.user.id),
        ]);
        if (!isMounted) return;
        setRole(userRole);
        setIsBanned(banned);
        initPushNotifications(session.user.id).catch((e) => console.warn("push init", e));
      }
      setIsLoading(false);
    };

    void initializeAuth();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          return { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" };
        }
        if (error.message.includes("Email not confirmed")) {
          return { error: "يرجى تأكيد بريدك الإلكتروني أولاً عبر رمز التحقق" };
        }
        return { error: error.message };
      }
      if (data.user) {
        const banned = await checkIfBanned(data.user.id);
        if (banned) {
          await supabase.auth.signOut();
          return { error: "حسابك موقوف – تواصل مع الدعم" };
        }
      }
      return { error: null };
    } catch (e: any) {
      console.error("Sign in error:", e);
      return { error: "حدث خطأ أثناء تسجيل الدخول" };
    }
  };

  // Student signup — creates user (unconfirmed) and immediately sends OTP code
  const signUp = async (data: SignUpData): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase.auth.signUp({
        email: data.email.trim(),
        password: data.password,
        options: {
          emailRedirectTo: buildCanonicalAppUrl("/"),
          data: {
            full_name: data.fullName,
            phone: data.phone,
            stage: data.stage,
            grade: data.grade,
            section: data.section,
            role: "student",
          },
        },
      });
      if (error) {
        if (error.message.includes("already registered") || error.message.includes("already been registered")) {
          return { error: "هذا البريد الإلكتروني مسجل بالفعل" };
        }
        if (error.message.toLowerCase().includes("password")) {
          return { error: "كلمة المرور لا تستوفي المتطلبات (8 أحرف، حرف كبير، رقم)" };
        }
        return { error: error.message };
      }
      return { error: null };
    } catch (e: any) {
      console.error("Sign up error:", e);
      return { error: "حدث خطأ أثناء إنشاء الحساب" };
    }
  };

  const signUpTeacher = async (data: TeacherSignUpData): Promise<{ error: string | null }> => {
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email.trim(),
        password: data.password,
        options: {
          emailRedirectTo: buildCanonicalAppUrl("/"),
          data: {
            full_name: data.fullName,
            phone: data.phone,
            school_name: data.schoolName,
            employee_id: data.employeeId,
            role: "teacher",
          },
        },
      });
      if (authError) {
        if (authError.message.includes("already registered") || authError.message.includes("already been registered")) {
          return { error: "هذا البريد الإلكتروني مسجل بالفعل" };
        }
        return { error: authError.message };
      }
      if (authData.user) {
        const { error: requestError } = await supabase.from("teacher_requests").insert({
          user_id: authData.user.id,
          full_name: data.fullName,
          email: data.email.trim(),
          phone: data.phone || null,
          school_name: data.schoolName || null,
          employee_id: data.employeeId || null,
          status: "pending",
          assigned_stages: data.stages,
          assigned_grades: data.grades,
          assigned_category: data.subject,
          education_type: data.educationType || null,
        } as any);
        if (requestError) console.error("Error creating teacher request:", requestError);
      }
      return { error: null };
    } catch (e: any) {
      console.error("Teacher sign up error:", e);
      return { error: "حدث خطأ أثناء إنشاء الحساب" };
    }
  };

  // Send OTP via email (works for both new signup confirmation and password recovery)
  const sendEmailOtp = async (email: string, shouldCreateUser = false): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser,
          emailRedirectTo: buildCanonicalAppUrl("/"),
        },
      });
      if (error) {
        if (error.message.toLowerCase().includes("rate")) {
          return { error: "تم إرسال الكود مؤخراً. انتظر 60 ثانية قبل المحاولة مرة أخرى." };
        }
        return { error: error.message };
      }
      return { error: null };
    } catch (e: any) {
      return { error: "تعذر إرسال رمز التحقق" };
    }
  };

  // Verify OTP — after this the user has an active session
  const verifyEmailOtp = async (
    email: string,
    token: string,
    type: "email" | "recovery" = "email",
  ): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: token.trim(),
        type,
      });
      if (error) {
        if (error.message.toLowerCase().includes("expired")) {
          return { error: "انتهت صلاحية الرمز. اطلب رمزاً جديداً." };
        }
        if (error.message.toLowerCase().includes("invalid")) {
          return { error: "الرمز غير صحيح" };
        }
        return { error: error.message };
      }
      return { error: null };
    } catch {
      return { error: "تعذر التحقق من الرمز" };
    }
  };

  // After OTP verification, set/update password (used in password reset flow)
  const setPasswordAfterOtp = async (password: string): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return { error: error.message };
      // Invalidate all other sessions for security
      await supabase.auth.signOut({ scope: "others" }).catch(() => {});
      return { error: null };
    } catch {
      return { error: "تعذر تحديث كلمة المرور" };
    }
  };

  const signInWithGoogle = async (options?: { correlationId?: string; redirectUri?: string; source?: string }): Promise<{ error: string | null }> => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      const nativeRedirectUri = buildCanonicalAppUrl(`/oauth/native-callback${options?.correlationId ? `?cid=${encodeURIComponent(options.correlationId)}` : ""}`);
      const webRedirectUri = buildCanonicalAppUrl(`/auth/callback${options?.correlationId ? `?cid=${encodeURIComponent(options.correlationId)}` : ""}`);
      const redirectUri = options?.redirectUri || (Capacitor.isNativePlatform() ? nativeRedirectUri : webRedirectUri);
      const source = options?.source || (Capacitor.isNativePlatform() ? "native-app" : "web");

      logAuthDebug("oauth_signin_requested", {
        source,
        redirectUri,
        isNative: Capacitor.isNativePlatform(),
      });

      recordGoogleOAuthEvent({
        correlationId: options?.correlationId,
        source,
        type: "oauth_request_started",
        status: "redirecting",
        redirectUri,
      });

      if (Capacitor.isNativePlatform()) {
        const nativeResult = await signInWithOAuthNative("google", {
          redirect_uri: redirectUri,
          extraParams: {
            prompt: "select_account",
          },
        });

        if (nativeResult.error || !nativeResult.tokens) {
          const msg = mapGoogleAuthError(nativeResult.error);
          finalizeGoogleOAuthAttempt({
            correlationId: options?.correlationId,
            source,
            type: "native_flow_failed",
            status: normalizedCancelMessage(msg) ? "cancelled" : "failed",
            redirectUri,
            error: msg,
          });
          return { error: msg };
        }

        const { error: sessionError } = await supabase.auth.setSession(nativeResult.tokens);
        if (sessionError) {
          const message = mapGoogleAuthError(sessionError);
          finalizeGoogleOAuthAttempt({
            correlationId: options?.correlationId,
            source,
            type: "native_set_session_failed",
            status: "failed",
            redirectUri,
            error: message,
          });
          return { error: message };
        }

        finalizeGoogleOAuthAttempt({
          correlationId: options?.correlationId,
          source,
          type: "native_flow_succeeded",
          status: "success",
          redirectUri,
        });

        return { error: null };
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUri,
          queryParams: {
            prompt: "select_account",
          },
        },
      });

      const normalizedError = error ? mapGoogleAuthError(error) : null;

      if (normalizedError) {
        logAuthDebug("oauth_redirect_failed_before_provider", {
          error: normalizedError,
          redirectUri,
        });
        finalizeGoogleOAuthAttempt({
          correlationId: options?.correlationId,
          source,
          type: "web_flow_failed_before_redirect",
          status: normalizedCancelMessage(normalizedError) ? "cancelled" : "failed",
          redirectUri,
          error: normalizedError,
        });
        return { error: normalizedError || "تعذر تسجيل الدخول بـ Google" };
      }

      logAuthDebug("oauth_redirect_started", {
        redirectUri,
        source,
      });
      recordGoogleOAuthEvent({
        correlationId: options?.correlationId,
        source,
        type: "web_redirected_to_provider",
        status: "redirecting",
        redirectUri,
      });
      return { error: null };
    } catch (e: any) {
      const message = mapGoogleAuthError(e);
      logAuthDebug("oauth_exception", {
        error: message,
        redirectUri: options?.redirectUri,
      });
      finalizeGoogleOAuthAttempt({
        correlationId: options?.correlationId,
        source: options?.source || "web",
        type: "oauth_exception",
        status: normalizedCancelMessage(message) ? "cancelled" : "failed",
        redirectUri: options?.redirectUri,
        error: message,
      });
      return { error: message };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setIsBanned(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        isLoading,
        isBanned,
        signIn,
        signUp,
        signUpTeacher,
        signOut,
        sendEmailOtp,
        verifyEmailOtp,
        setPasswordAfterOtp,
        signInWithGoogle,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

function normalizedCancelMessage(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("cancel") || normalized.includes("closed") || normalized.includes("إلغاء");
}

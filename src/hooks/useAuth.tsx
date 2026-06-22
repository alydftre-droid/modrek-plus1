import { useState, useEffect, createContext, useContext, ReactNode, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { initPushNotifications, teardownPushNotifications } from "@/lib/pushNotifications";
import { finalizeGoogleOAuthAttempt, recordGoogleOAuthEvent } from "@/lib/googleOAuthDiagnostics";
import { buildCanonicalAppUrl } from "@/lib/authUrls";
import { processSupabaseOAuthCallback } from "@/lib/processSupabaseOAuthCallback";
import { queueExternalSync } from "@/lib/externalSync";

const mapGoogleAuthError = (value: unknown) => {
  const message = value instanceof Error ? value.message : String(value || "");
  const normalized = message.toLowerCase();

  if (normalized.includes("browser") && normalized.includes("not implemented") && normalized.includes("android")) {
    return "تعذر فتح نافذة Google داخل تطبيق أندرويد لأن نسخة التطبيق المثبتة لا تحتوي إضافة المتصفح الأصلية. تم إصلاح التسجيل الأصلي للإضافة، حدّث التطبيق ثم جرّب مرة أخرى.";
  }

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
  isHydrated: boolean;
  isRoleResolved: boolean;
  isAuthReady: boolean;
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
  teachesIntegratedScience?: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type BootstrapAuthResult = {
  session: Session | null;
  source: string;
  callbackHandled: boolean;
  callbackError: string | null;
};

const DEVELOPER_EMAIL = "aliana200713@gmail.com";
const NATIVE_OAUTH_URL_EVENT = "modrek:native-oauth-url";
const NATIVE_OAUTH_PENDING_KEY = "modrek:native-oauth-pending-url";
const GOOGLE_WEB_CLIENT_ID = "233651659157-rt9khk04uo1enfpbmfs5b1c787q7jj5n.apps.googleusercontent.com";

const isNativeOAuthRuntime = async () => {
  if (typeof window === "undefined") return false;

  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    // Fallback checks below cover early WebView startup.
  }

  const isLocalNativeOrigin = window.location.protocol === "capacitor:"
    || window.location.hostname === "localhost";
  const isMobileWebView = /Android|iPhone|iPad|; wv\)/i.test(navigator.userAgent || "");
  return document.documentElement.getAttribute("data-native-app") === "true"
    || (isLocalNativeOrigin && isMobileWebView);
};

const createOAuthNonce = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const isDeveloperEmail = (email?: string | null) => email?.trim().toLowerCase() === DEVELOPER_EMAIL;

let initialAuthBootstrapPromise: Promise<BootstrapAuthResult> | null = null;

const getInitialAuthBootstrap = () => {
  if (!initialAuthBootstrapPromise) {
    initialAuthBootstrapPromise = (async () => {
      let restoredSession: Session | null = null;
      let sessionSource = "bootstrap_getSession";

      const processedCallback = await processSupabaseOAuthCallback("auth_provider_bootstrap");
      if (processedCallback.handled) {
        restoredSession = processedCallback.session;
        sessionSource = processedCallback.session ? "bootstrap_oauth_callback" : "bootstrap_oauth_callback_failed";
        logAuthDebug("oauth_callback_processed", {
          hasSession: Boolean(processedCallback.session),
          error: processedCallback.error,
        });
      }

      if (!restoredSession) {
        const { data: sessionData, error: getSessionError } = await supabase.auth.getSession();

        if (getSessionError) {
          logAuthDebug("bootstrap_get_session_failed", {
            error: getSessionError.message,
          });
        }

        restoredSession = sessionData.session;
      }

      logAuthDebug("bootstrap_promise_resolved", {
        source: sessionSource,
        hasSession: Boolean(restoredSession),
        userId: restoredSession?.user?.id ?? null,
      });

      return {
        session: restoredSession,
        source: sessionSource,
        callbackHandled: processedCallback.handled,
        callbackError: processedCallback.error,
      };
    })().catch((error) => {
      initialAuthBootstrapPromise = null;
      throw error;
    });
  }

  return initialAuthBootstrapPromise;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isRoleResolved, setIsRoleResolved] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const authBootstrappedRef = useRef(false);
  const isMountedRef = useRef(false);
  const authResolutionIdRef = useRef(0);
  const stableAuthStateRef = useRef<{ userId: string | null; role: AppRole | null; isRoleResolved: boolean }>({
    userId: null,
    role: null,
    isRoleResolved: false,
  });

  const fetchUserRole = async (userId: string) => {
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (isDeveloperEmail(authUser?.email)) {
        return "admin" as AppRole;
      }

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        console.error("Error fetching role:", error);
        return null;
      }
      if (data?.role) {
        return data.role as AppRole;
      }

      return isDeveloperEmail(authUser?.email) ? "admin" : null;
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

  const resolveSessionState = useCallback(async (
    nextSession: Session | null,
    source: string,
    options?: { keepLoadingUntilBootstrap?: boolean },
  ) => {
    const resolutionId = ++authResolutionIdRef.current;
    const nextUserId = nextSession?.user?.id ?? null;

    logAuthDebug("session_resolution_started", {
      source,
      hasSession: Boolean(nextSession),
      userId: nextUserId,
      pathname: typeof window !== "undefined" ? window.location.pathname : null,
    });

    setSession(nextSession);
    setUser(nextSession?.user ?? null);

    const stableState = stableAuthStateRef.current;
    const canRefreshSilently =
      authBootstrappedRef.current &&
      nextSession?.user?.id &&
      stableState.userId === nextSession.user.id &&
      stableState.isRoleResolved;

    if (canRefreshSilently) {
      setIsLoading(false);
      setIsHydrated(true);
      logAuthDebug("session_resolution_silent_refresh", {
        source,
        userId: nextUserId,
        role: stableState.role,
        pathname: typeof window !== "undefined" ? window.location.pathname : null,
      });

      Promise.all([
        fetchUserRole(nextSession.user.id),
        checkIfBanned(nextSession.user.id),
      ]).then(([freshRole, freshBanned]) => {
        if (!isMountedRef.current || authResolutionIdRef.current !== resolutionId) return;
        setRole(freshRole);
        setIsRoleResolved(true);
        setIsBanned(freshBanned);
        stableAuthStateRef.current = { userId: nextSession.user.id, role: freshRole, isRoleResolved: true };
      }).catch(() => {});
      return;
    }

    if (!nextSession?.user) {
      if (!isMountedRef.current || resolutionId !== authResolutionIdRef.current) return;

      setRole(null);
      setIsRoleResolved(true);
      setIsBanned(false);
      stableAuthStateRef.current = { userId: null, role: null, isRoleResolved: true };
      if (!options?.keepLoadingUntilBootstrap) {
        setIsLoading(false);
      }
      if (authBootstrappedRef.current) {
        setIsHydrated(true);
      }
      logAuthDebug("session_resolution_completed", {
        source,
        hasSession: false,
        waitingForBootstrap: Boolean(options?.keepLoadingUntilBootstrap),
        pathname: typeof window !== "undefined" ? window.location.pathname : null,
      });
      teardownPushNotifications().catch(() => {});
      return;
    }

    setRole(null);
    setIsRoleResolved(false);
    setIsBanned(false);
    if (!options?.keepLoadingUntilBootstrap) {
      setIsLoading(true);
    }

    const [userRole, banned] = await Promise.all([
      fetchUserRole(nextSession.user.id),
      checkIfBanned(nextSession.user.id),
    ]);

    if (!isMountedRef.current || resolutionId !== authResolutionIdRef.current) {
      logAuthDebug("session_resolution_discarded", {
        source,
        userId: nextUserId,
      });
      return;
    }

    setRole(userRole);
    setIsRoleResolved(true);
    setIsBanned(banned);
    stableAuthStateRef.current = { userId: nextSession.user.id, role: userRole, isRoleResolved: true };
    if (!options?.keepLoadingUntilBootstrap) {
      setIsLoading(false);
    }
    if (authBootstrappedRef.current) {
      setIsHydrated(true);
    }
    logAuthDebug("session_resolution_completed", {
      source,
      hasSession: true,
      userId: nextUserId,
      role: userRole,
      isBanned: banned,
      waitingForBootstrap: Boolean(options?.keepLoadingUntilBootstrap),
      pathname: typeof window !== "undefined" ? window.location.pathname : null,
    });
    initPushNotifications(nextSession.user.id).catch((e) => console.warn("push init", e));
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    setIsLoading(true);
    setIsHydrated(false);
    setIsRoleResolved(false);

    logAuthDebug("auth_subscription_ready", {
      pathname: typeof window !== "undefined" ? window.location.pathname : null,
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMountedRef.current) return;

      logAuthDebug("onAuthStateChange", {
        event,
        hasSession: Boolean(nextSession),
        userId: nextSession?.user?.id ?? null,
        pathname: typeof window !== "undefined" ? window.location.pathname : null,
      });

      if (!authBootstrappedRef.current && event === "INITIAL_SESSION") {
        logAuthDebug("initial_session_event_received", {
          hasSession: Boolean(nextSession),
          userId: nextSession?.user?.id ?? null,
        });
      }

      if (!authBootstrappedRef.current && event !== "INITIAL_SESSION") {
        logAuthDebug("auth_event_received_before_bootstrap_completed", {
          event,
          hasSession: Boolean(nextSession),
          userId: nextSession?.user?.id ?? null,
        });
      }

      void resolveSessionState(nextSession, `onAuthStateChange:${event}`, {
        keepLoadingUntilBootstrap: !authBootstrappedRef.current,
      });
    });

    const initializeAuth = async () => {
      logAuthDebug("bootstrap_started", {
        pathname: typeof window !== "undefined" ? window.location.pathname : null,
        hasHash: typeof window !== "undefined" ? Boolean(window.location.hash) : false,
      });

      const bootstrapResult = await getInitialAuthBootstrap();

      if (!isMountedRef.current) return;

      authBootstrappedRef.current = true;
      logAuthDebug("bootstrap_session_resolved", {
        source: bootstrapResult.source,
        hasSession: Boolean(bootstrapResult.session),
        userId: bootstrapResult.session?.user?.id ?? null,
        callbackHandled: bootstrapResult.callbackHandled,
        callbackError: bootstrapResult.callbackError,
      });

      await resolveSessionState(bootstrapResult.session, bootstrapResult.source);

      if (!isMountedRef.current) return;

      setIsHydrated(true);
      setIsLoading(false);
      logAuthDebug("bootstrap_completed", {
        hasSession: Boolean(bootstrapResult.session),
        userId: bootstrapResult.session?.user?.id ?? null,
        pathname: typeof window !== "undefined" ? window.location.pathname : null,
      });
    };

    void initializeAuth();

    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [resolveSessionState]);

  useEffect(() => {
    const handleNativeOAuthUrl = (event?: Event) => {
      const callbackUrl = (event as CustomEvent<{ url?: string }> | undefined)?.detail?.url
        || window.sessionStorage.getItem(NATIVE_OAUTH_PENDING_KEY);
      if (!callbackUrl) return;
      window.sessionStorage.removeItem(NATIVE_OAUTH_PENDING_KEY);

      logAuthDebug("native_oauth_callback_url_opened", { callbackUrl });
      void import("@capacitor/browser")
        .then(({ Browser }) => Browser.close())
        .catch(() => {});

      void processSupabaseOAuthCallback("native_app_url_open", callbackUrl).then((result) => {
        if (result.session) {
          void resolveSessionState(result.session, "native_app_url_open");
        }
      });
    };

    window.addEventListener(NATIVE_OAUTH_URL_EVENT, handleNativeOAuthUrl);
    handleNativeOAuthUrl();
    return () => window.removeEventListener(NATIVE_OAUTH_URL_EVENT, handleNativeOAuthUrl);
  }, [resolveSessionState]);

  useEffect(() => {
    logAuthDebug("loading_state_changed", {
      isLoading,
      isHydrated,
      isRoleResolved,
      isAuthReady: isHydrated && !isLoading && (!user || isRoleResolved),
      userId: user?.id ?? null,
      role,
      pathname: typeof window !== "undefined" ? window.location.pathname : null,
    });
  }, [isHydrated, isLoading, isRoleResolved, role, user]);

  const isAuthReady = isHydrated && !isLoading && (!user || isRoleResolved);

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
      queueExternalSync(["auth", "tables"], true);
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
          teaches_integrated_science: !!data.teachesIntegratedScience,
        } as any);
        if (requestError) console.error("Error creating teacher request:", requestError);
      }
      queueExternalSync(["auth", "tables"], true);
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
      queueExternalSync(["auth"], true);
      return { error: null };
    } catch {
      return { error: "تعذر تحديث كلمة المرور" };
    }
  };

  const signInWithGoogle = async (options?: { correlationId?: string; redirectUri?: string; source?: string }): Promise<{ error: string | null }> => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      const nativeRuntime = await isNativeOAuthRuntime();
      const nativeRedirectUri = `com.modrek.plus://oauth-callback${options?.correlationId ? `?cid=${encodeURIComponent(options.correlationId)}` : ""}`;
      const webRedirectUri = typeof window !== "undefined"
        ? new URL(
            `/auth/callback${options?.correlationId ? `?cid=${encodeURIComponent(options.correlationId)}` : ""}`,
            window.location.origin,
          ).toString()
        : buildCanonicalAppUrl(`/auth/callback${options?.correlationId ? `?cid=${encodeURIComponent(options.correlationId)}` : ""}`);
      const redirectUri = nativeRuntime ? nativeRedirectUri : (options?.redirectUri || webRedirectUri);
      const source = options?.source || (nativeRuntime ? "native-app" : "web");

      logAuthDebug("oauth_signin_requested", {
        source,
        redirectUri,
        isNative: nativeRuntime,
      });

      recordGoogleOAuthEvent({
        correlationId: options?.correlationId,
        source,
        type: "oauth_request_started",
        status: "redirecting",
        redirectUri,
      });

      if (nativeRuntime) {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: redirectUri,
            skipBrowserRedirect: true,
            queryParams: {
              prompt: "select_account",
            },
          },
        });

        if (error || !data?.url) {
          const message = mapGoogleAuthError(error || "تعذر تجهيز رابط تسجيل Google داخل التطبيق");
          finalizeGoogleOAuthAttempt({
            correlationId: options?.correlationId,
            source,
            type: "native_oauth_url_failed",
            status: "failed",
            redirectUri,
            error: message,
          });
          return { error: message };
        }

        const { Browser } = await import("@capacitor/browser");
        const browserAvailable = Capacitor.isPluginAvailable("Browser");
        if (browserAvailable) {
          await Browser.open({ url: data.url, presentationStyle: "fullscreen" });
        } else {
          throw new Error("Browser plugin is not implemented on android");
        }
        recordGoogleOAuthEvent({
          correlationId: options?.correlationId,
          source,
          type: "native_browser_opened",
          status: "redirecting",
          redirectUri,
        });

        return { error: null };
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
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

      if (data?.url && typeof window !== "undefined") {
        logAuthDebug("oauth_redirect_started", {
          redirectUri,
          source,
          authorizeUrl: data.url,
        });
        recordGoogleOAuthEvent({
          correlationId: options?.correlationId,
          source,
          type: "web_redirected_to_provider",
          status: "redirecting",
          redirectUri,
          details: {
            authorize_url_present: true,
          },
        });
        window.location.assign(data.url);
        return { error: null };
      }

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
        isHydrated,
        isRoleResolved,
        isAuthReady,
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

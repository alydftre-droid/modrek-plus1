import { useState, useEffect, createContext, useContext, ReactNode, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { initPushNotifications, teardownPushNotifications } from "@/lib/pushNotifications";
import { finalizeGoogleOAuthAttempt, recordGoogleOAuthEvent } from "@/lib/googleOAuthDiagnostics";
import { buildCanonicalAppUrl } from "@/lib/authUrls";
import {
  GOOGLE_AUTH_WEB_CLIENT_ID,
  createGoogleOAuthNoncePair,
  getGoogleAuthRuntimeHealth,
  logGoogleAuthRuntimeHealth,
  validateGoogleIdTokenForConfiguredClient,
} from "@/lib/googleAuthRuntime";
import { clearNativeGoogleCredentialState, signInNativeGoogleIdToken } from "@/lib/nativeGoogleAuth";
import { processSupabaseOAuthCallback } from "@/lib/processSupabaseOAuthCallback";
import { clearImpersonationState, endImpersonation, isImpersonating } from "@/lib/devImpersonation";
import { queueExternalSync } from "@/lib/externalSync";

const mapGoogleAuthError = (value: unknown) => {
  const message = value instanceof Error ? value.message : String(value || "");
  const sha1Match = message.match(/sha1=([A-F0-9:]+)/i);
  const diagInfo = sha1Match ? `\n(SHA-1: ${sha1Match[1]})` : "";
  const normalized = message.toLowerCase();

  if (normalized.includes("account reauth failed") || normalized.includes("[16]") || normalized.includes("reauth_required")) {
    return "تعذر Google Credential Manager إنشاء رمز Google صالح. تأكد أن Android OAuth Client في Google Cloud مضبوط على package com.modrek.plus وبصمات SHA الخاصة بمفتاح الإصدار الحالي، ثم حدّث التطبيق." + diagInfo;
  }

  if (normalized.includes("nocredentialexception") || normalized.includes("no credentials available")) {
    return "تعذر Google Credential Manager عرض حسابات Google على هذا الجهاز. السبب المرجح: Android OAuth Client لحزمة com.modrek.plus لا يحتوي SHA-1 لمفتاح الإصدار، أو حسابات Google تحتاج تفعيل Sign in with Google." + diagInfo;
  }

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
  // Sensitive-action OTP flows for logged-in users
  sendReauthOtp: () => Promise<{ error: string | null }>;
  updatePasswordWithOtp: (password: string, code: string) => Promise<{ error: string | null }>;
  sendEmailChangeOtp: (newEmail: string) => Promise<{ error: string | null }>;
  verifyEmailChangeOtp: (newEmail: string, code: string) => Promise<{ error: string | null }>;
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

const DEVELOPER_EMAILS = new Set(["aliana200713@gmail.com", "alyedaft@gmail.com"]);

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

// Google Credential Manager error 16 = "Account reauth failed". In the native
// ID-token flow this usually means the Android OAuth client/signing certificate
// is not accepted by Google Play services, or the device account needs reauth.
const isGoogleReauthError = (value: unknown) => {
  const msg = (value instanceof Error ? value.message : String(value || "")).toLowerCase();
  return msg.includes("account reauth failed")
    || msg.includes("[16]")
    || msg.includes("reauth_required")
    || msg.includes("idtoken_parsing_failure");
};

const isAndroidGoogleOAuthClientConfigError = (value: unknown) => {
  const msg = (value instanceof Error ? value.message : String(value || "")).toLowerCase();
  return msg.includes("check_google_cloud_android_oauth_client_and_sha1")
    || msg.includes("nocredentialexception")
    || msg.includes("no credentials available")
    || (msg.includes("android oauth client") && msg.includes("sha-1"))
    || (msg.includes("client") && msg.includes("developer"));
};

const startNativeBrowserGoogleFallback = async (correlationId?: string) => {
  const query = correlationId ? `?cid=${encodeURIComponent(correlationId)}` : "";
  const redirectTo = buildCanonicalAppUrl(`/oauth/native-callback${query}`);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: {
        prompt: "select_account",
      },
    },
  });

  if (error) throw error;
  if (!data?.url) throw new Error("GOOGLE_BROWSER_FALLBACK_URL_MISSING");

  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url: data.url, windowName: "_self" });
  return redirectTo;
};

const tryNativeGoogleSignIn = async (retryAttempt = 0): Promise<Session | null> => {
  const { rawNonce, nonceDigest } = await createGoogleOAuthNoncePair();

  // On retries we forcibly clear the cached Google credential so Credential
  // Manager re-asks the user to pick the account instead of replaying the
  // stale token that triggered "[16] Account reauth failed".
  if (retryAttempt > 0) {
    await clearNativeGoogleCredentialState();
  }

  let response;
  try {
    response = await signInNativeGoogleIdToken(GOOGLE_AUTH_WEB_CLIENT_ID, nonceDigest);
  } catch (loginError) {
    if (retryAttempt < 1 && isGoogleReauthError(loginError)) {
      await clearNativeGoogleCredentialState();
      return tryNativeGoogleSignIn(retryAttempt + 1);
    }
    throw loginError;
  }

  const result = response;
  if (result.responseType !== "id_token" || !result.idToken) {
    if (retryAttempt < 1) return tryNativeGoogleSignIn(retryAttempt + 1);
    throw new Error("لم يرجع Google رمز دخول أصلي صالح");
  }

  const tokenCheck = validateGoogleIdTokenForConfiguredClient(result.idToken, nonceDigest);
  if (!tokenCheck.ok) {
    if (retryAttempt < 1) return tryNativeGoogleSignIn(retryAttempt + 1);
    throw new Error(tokenCheck.error || "GOOGLE_ID_TOKEN_INVALID");
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: result.idToken,
    nonce: rawNonce,
  });

  if (error) {
    if (retryAttempt < 1 && (error.message.toLowerCase().includes("nonce") || isGoogleReauthError(error))) {
      return tryNativeGoogleSignIn(retryAttempt + 1);
    }
    throw error;
  }
  return data.session ?? (await supabase.auth.getSession()).data.session ?? null;
};

const isDeveloperEmail = (email?: string | null) => DEVELOPER_EMAILS.has(email?.trim().toLowerCase() ?? "");

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
        .order("role", { ascending: true });
      if (error) {
        console.error("Error fetching role:", error);
        return null;
      }
      const roles = (data ?? []).map((row: { role: string }) => row.role as AppRole);
      if (roles.includes("admin")) return "admin";
      if (roles.includes("teacher")) return "teacher";
      if (roles.includes("support")) return "support";
      if (roles.includes("student")) {
        return "student" as AppRole;
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

    // CRITICAL: propagate the fresh access token to the Realtime socket on every
    // session change (initial hydrate, SIGNED_IN, TOKEN_REFRESHED, SIGNED_OUT).
    // Without this, RLS-filtered postgres_changes channels stop delivering
    // events silently as soon as the original token expires (~1h), which forced
    // users to refresh the page to see new support messages / notifications.
    try {
      const rt: any = (supabase as any).realtime;
      if (rt && typeof rt.setAuth === "function") {
        rt.setAuth(nextSession?.access_token ?? null);
      }
    } catch (e) {
      console.warn("[auth] realtime.setAuth failed", e);
    }


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
      initPushNotifications(nextSession.user.id).catch((e) => console.warn("push init", e));
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

      if (event === "SIGNED_IN" && nextSession?.user?.id) {
        void import("@/lib/activityLogger").then(({ logStudentActivity }) => {
          void logStudentActivity({ action_type: "login", action_label: "تسجيل دخول" });
        }).catch(() => {});
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
          return { error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" };
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

  // Send a reauthentication OTP to the currently logged-in user's email.
  // Used before sensitive changes like password update from inside the account.
  const sendReauthOtp = async (): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase.auth.reauthenticate();
      if (error) {
        if (error.message.toLowerCase().includes("rate")) {
          return { error: "تم إرسال الكود مؤخراً. انتظر قليلاً قبل المحاولة." };
        }
        return { error: error.message };
      }
      return { error: null };
    } catch {
      return { error: "تعذر إرسال رمز التحقق" };
    }
  };

  // Update the password after reauthentication OTP verification.
  const updatePasswordWithOtp = async (
    password: string,
    code: string,
  ): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase.auth.updateUser({
        password,
        nonce: code.trim(),
      } as any);
      if (error) {
        const m = error.message.toLowerCase();
        if (m.includes("invalid") || m.includes("nonce")) return { error: "الرمز غير صحيح" };
        if (m.includes("expired")) return { error: "انتهت صلاحية الرمز. اطلب رمزاً جديداً." };
        return { error: error.message };
      }
      queueExternalSync(["auth"], true);
      return { error: null };
    } catch {
      return { error: "تعذر تحديث كلمة المرور" };
    }
  };

  // Request a change of email. Supabase sends a confirmation code to the NEW address.
  const sendEmailChangeOtp = async (newEmail: string): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) {
        if (error.message.toLowerCase().includes("rate")) {
          return { error: "تم إرسال الكود مؤخراً. انتظر قليلاً قبل المحاولة." };
        }
        return { error: error.message };
      }
      return { error: null };
    } catch {
      return { error: "تعذر إرسال رمز التحقق" };
    }
  };

  // Verify the OTP sent to the new email to complete the email change.
  const verifyEmailChangeOtp = async (
    newEmail: string,
    code: string,
  ): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: newEmail.trim(),
        token: code.trim(),
        type: "email_change" as any,
      });
      if (error) {
        const m = error.message.toLowerCase();
        if (m.includes("expired")) return { error: "انتهت صلاحية الرمز. اطلب رمزاً جديداً." };
        if (m.includes("invalid")) return { error: "الرمز غير صحيح" };
        return { error: error.message };
      }
      queueExternalSync(["auth", "tables"], true);
      return { error: null };
    } catch {
      return { error: "تعذر التحقق من الرمز" };
    }
  };

  const signInWithGoogle = async (options?: { correlationId?: string; redirectUri?: string; source?: string }): Promise<{ error: string | null }> => {
    try {
      const nativeRuntime = await isNativeOAuthRuntime();
      const webRedirectUri = typeof window !== "undefined"
        ? new URL(
            `/auth/callback${options?.correlationId ? `?cid=${encodeURIComponent(options.correlationId)}` : ""}`,
            window.location.origin,
          ).toString()
        : buildCanonicalAppUrl(`/auth/callback${options?.correlationId ? `?cid=${encodeURIComponent(options.correlationId)}` : ""}`);
      const redirectUri = nativeRuntime ? "native-google-id-token" : (options?.redirectUri || webRedirectUri);
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
        const health = await getGoogleAuthRuntimeHealth();
        logGoogleAuthRuntimeHealth(health, "signInWithGoogle");

        if (!health.canAttemptNative) {
          const message = `تعذر تشغيل تسجيل Google الأصلي داخل نسخة Android الحالية. تفاصيل الفحص: ${health.errors.join(", ") || "UNKNOWN_GOOGLE_AUTH_RUNTIME_ERROR"}`;
          finalizeGoogleOAuthAttempt({
            correlationId: options?.correlationId,
            source,
            type: "native_google_unavailable",
            status: "failed",
            redirectUri,
            error: message,
          });
          return { error: message };
        }

        try {
          const nativeSession = await tryNativeGoogleSignIn();
          if (nativeSession) {
            finalizeGoogleOAuthAttempt({
              correlationId: options?.correlationId,
              source,
              type: "native_google_session_created",
              status: "success",
              redirectUri,
              details: {
                user_id: nativeSession.user?.id,
                flow: "native_google_id_token_only_no_browser",
              },
            });
            await resolveSessionState(nativeSession, "native_google_id_token");
            return { error: null };
          }
        } catch (nativeError) {
          if (isAndroidGoogleOAuthClientConfigError(nativeError)) {
            try {
              const fallbackRedirectUri = await startNativeBrowserGoogleFallback(options?.correlationId);
              recordGoogleOAuthEvent({
                correlationId: options?.correlationId,
                source,
                type: "native_google_browser_fallback_started",
                status: "redirecting",
                redirectUri: fallbackRedirectUri,
                details: {
                  reason: "android_oauth_client_sha1_not_accepted",
                },
              });
              return { error: null };
            } catch (fallbackError) {
              const fallbackMessage = mapGoogleAuthError(fallbackError);
              logAuthDebug("native_google_browser_fallback_failed", {
                nativeError: nativeError instanceof Error ? nativeError.message : String(nativeError),
                fallbackError: fallbackMessage,
              });
              finalizeGoogleOAuthAttempt({
                correlationId: options?.correlationId,
                source,
                type: "native_google_browser_fallback_failed",
                status: "failed",
                redirectUri,
                error: fallbackMessage,
              });
              return { error: fallbackMessage };
            }
          }

          const message = mapGoogleAuthError(nativeError);
          logAuthDebug("native_google_plugin_failed", {
            error: nativeError instanceof Error ? nativeError.message : String(nativeError),
          });

          finalizeGoogleOAuthAttempt({
            correlationId: options?.correlationId,
            source,
            type: "native_google_plugin_failed",
            status: normalizedCancelMessage(message) ? "cancelled" : "failed",
            redirectUri,
            error: message,
          });
          return { error: message };
        }

        const message = "لم يتم إنشاء جلسة تسجيل دخول من Google داخل التطبيق";
        finalizeGoogleOAuthAttempt({
          correlationId: options?.correlationId,
          source,
          type: "native_google_empty_session",
          status: "failed",
          redirectUri,
          error: message,
        });
        return { error: message };
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
    if (isImpersonating()) {
      try {
        const { logStudentActivity } = await import("@/lib/activityLogger");
        await logStudentActivity({ action_type: "developer_return", action_label: "رجوع للمطور" });
      } catch { /* ignore */ }
      await endImpersonation();
      const { data: restored } = await supabase.auth.getSession();
      await resolveSessionState(restored.session, "developer_impersonation_return");
      return;
    }

    try {
      const { logStudentActivity } = await import("@/lib/activityLogger");
      await logStudentActivity({ action_type: "logout", action_label: "تسجيل خروج" });
    } catch { /* ignore */ }
    await supabase.auth.signOut();
    clearImpersonationState();
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

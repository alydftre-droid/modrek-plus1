import { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import OtpVerificationDialog from "@/components/auth/OtpVerificationDialog";
import mudrikLogo from "@/assets/mudrik-logo.png";
import { CURRENT_TEACHER_TERMS_VERSION } from "@/lib/teacherTerms";
import {
  buildGoogleOAuthWebRedirectUri,
  finalizeGoogleOAuthAttempt,
  getPendingGoogleOAuthAttempt,
  recordGoogleOAuthCallbackSnapshot,
  recordGoogleOAuthEvent,
  startGoogleOAuthAttempt,
} from "@/lib/googleOAuthDiagnostics";
import {
  Mail,
  Lock,
  User,
  Phone,
  Eye,
  EyeOff,
  ChevronLeft,
  Loader2,
} from "lucide-react";
import { z } from "zod";

type AuthMode = "login" | "register" | "register-teacher";

const PUBLISHED_APP_URL = "https://modrekplus.com";
const DEVELOPER_EMAILS = new Set(["aliana200713@gmail.com", "alyedaft@gmail.com"]);

type NativeCapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
  };
};

type StudentProfileRouteState = {
  education_type?: string | null;
  stage?: string | null;
  grade?: string | null;
  section?: string | null;
};

// Validation schemas — simplified: no uppercase/number/symbol requirement
const emailSchema = z.string().email("البريد الإلكتروني غير صالح").max(255);
const passwordSchema = z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل").max(72);
const nameSchema = z.string().min(3, "الاسم يجب أن يكون 3 أحرف على الأقل").max(100);
const phoneSchema = z.string().regex(/^[0-9+\-\s]{8,20}$/, "رقم الهاتف غير صالح");

// بيانات المراحل والصفوف والمواد
const PREPARATORY_GRADES = [
  "الصف الأول الإعدادي",
  "الصف الثاني الإعدادي",
  "الصف الثالث الإعدادي",
];

const SECONDARY_GRADES = [
  "الصف الأول الثانوي",
  "الصف الثاني الثانوي",
  "الصف الثالث الثانوي",
];

const PREPARATORY_SUBJECTS = [
  "المواد العربية",
  "المواد الشرعية",
  "رياضيات",
  "لغة إنجليزية",
  "العلوم",
  "الدراسات",
  "العلوم المتكاملة",
];

const SECONDARY_SUBJECTS = [
  "المواد العربية",
  "المواد الشرعية",
  "أحياء",
  "فيزياء",
  "كيمياء",
  "جيولوجيا",
  "تاريخ",
  "جغرافيا",
  "فلسفة",
  "علم نفس",
  "رياضيات",
  "لغة إنجليزية",
  "لغة فرنسية",
  "العلوم المتكاملة",
];

const isPreviewGoogleFlowContext = () => {
  if (typeof window === "undefined") return false;

  // Inside the native Capacitor app — NEVER redirect to external browser.
  // The native OAuth flow handles everything internally.
  try {
    const nativeWindow = window as NativeCapacitorWindow;
    if (typeof nativeWindow.Capacitor !== "undefined" && nativeWindow.Capacitor?.isNativePlatform?.()) {
      return false;
    }
  } catch (error) {
    console.warn("native preview context detection failed", error);
  }

  if (window.location.origin === PUBLISHED_APP_URL) return false;

  const hostname = window.location.hostname;
  return (
    hostname.startsWith("id-preview--") ||
    document.referrer.includes("lovable.dev/projects")
  );
};

const isNativeAppContext = () => {
  if (typeof window === "undefined") return false;
  try {
    const nativeWindow = window as NativeCapacitorWindow;
    if (document.documentElement.getAttribute("data-native-app") === "true") return true;
    if (typeof nativeWindow.Capacitor !== "undefined" && nativeWindow.Capacitor?.isNativePlatform?.() === true) return true;

    // Android Capacitor runs bundled app pages on https://localhost inside a WebView.
    // If Capacitor injection is delayed, still treat that runtime as native so
    // Google OAuth uses the custom-scheme callback, not https://localhost/auth/callback.
    const isLocalNativeOrigin = window.location.protocol === "capacitor:"
      || window.location.hostname === "localhost";
    const isMobileWebView = /Android|iPhone|iPad|; wv\)/i.test(navigator.userAgent || "");
    return isLocalNativeOrigin && isMobileWebView;
  } catch {
    return false;
  }
};

const buildGoogleOAuthRedirectUri = (correlationId?: string) => {
  if (isNativeAppContext()) {
    return `native-google-id-token${correlationId ? `:${encodeURIComponent(correlationId)}` : ""}`;
  }

  return buildGoogleOAuthWebRedirectUri(correlationId);
};

const consumePostOAuthRedirect = () => {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem("post_oauth_redirect");
  if (!value) return null;
  window.sessionStorage.removeItem("post_oauth_redirect");
  return value;
};

const consumeGoogleOAuthTrigger = () => {
  if (typeof window === "undefined") return false;

  const url = new URL(window.location.href);
  const shouldStart = url.searchParams.get("google") === "1";
  if (!shouldStart) return false;

  url.searchParams.delete("google");
  window.history.replaceState(window.history.state, "", url.toString());
  return true;
};

const isStudentProfileComplete = (profile?: StudentProfileRouteState | null) => {
  // Only require education_type. Stage/grade/section are picked from the dashboard.
  if (!profile?.education_type) return false;

  // If stage/grade are already chosen and we're secondary, also require section.
  if (profile.stage && profile.grade) {
    const isSecondary = profile.stage === "secondary" || profile.grade.includes("ثانوي");
    if (isSecondary && !profile.section) return false;
    if (profile.education_type === "عام" && profile.section === "علمي") return false;
  }
  return true;
};

const isDeveloperAccount = (email?: string | null) => DEVELOPER_EMAILS.has(email?.trim().toLowerCase() ?? "");

const resolveAuthenticatedRoute = async (userId: string, role: ReturnType<typeof useAuth>["role"]) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (role === "admin" || isDeveloperAccount(user?.email)) return "/admin";

  if (role === "student") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, education_type, stage, grade, section")
      .eq("id", userId)
      .maybeSingle();

    // No name or no education type yet → go pick education/stage
    if (!profile?.full_name) return "/select-education-type";

    return isStudentProfileComplete(profile as StudentProfileRouteState | null)
      ? "/dashboard"
      : "/select-education-type";
  }

  if (role === "teacher") {
    const { data } = await supabase
      .from("teacher_requests")
      .select("status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return data?.status === "approved" ? "/teacher" : "/pending-approval";
  }

  // No role assigned yet → default to student education-type selection
  return "/select-education-type";
};

const Auth = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, role, isLoading: authLoading, isAuthReady, signIn, signUp, signUpTeacher, signInWithGoogle } = useAuth();
  const modeParam = searchParams.get("mode");
  const initialMode: AuthMode = modeParam === "register" || modeParam === "register-teacher" ? modeParam : "login";
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const nativeApp = isNativeAppContext();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpEmail, setOtpEmail] = useState("");
  const [pendingMode, setPendingMode] = useState<AuthMode>("register");
  const [loginMethod, setLoginMethod] = useState<"email" | "phone">("email");
  const [loginPhone, setLoginPhone] = useState("");

  // حالة النموذج
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    name: "",
    username: "",
    school: "",
    employeeId: "",
    phone: "",
    stage: "" as "preparatory" | "secondary" | "",
    stages: [] as ("preparatory" | "secondary")[],
    grades: [] as string[],
    subject: "",
    educationType: "" as "عام" | "أزهر" | "",
    teachesIntegratedScience: false,
    acceptedTerms: false,
  });

  // Redirect if already logged in
  useEffect(() => {
    console.info("[auth-page] auth_state_observed", {
      authLoading,
      isAuthReady,
      hasUser: Boolean(user),
      role,
      pathname: typeof window !== "undefined" ? window.location.pathname : null,
    });

    if (!isAuthReady || !user) return;

    let cancelled = false;

    (async () => {
      // Preserve consent-route or other `next=` redirects across sign-in.
      const nextParam = searchParams.get("next");
      if (nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")) {
        if (!cancelled) {
          window.location.href = nextParam;
        }
        return;
      }

      const postOAuthRedirect = consumePostOAuthRedirect();
      if (postOAuthRedirect) {
        console.info("[auth-page] post_oauth_redirect", {
          redirectTo: postOAuthRedirect,
          userId: user.id,
          role,
        });
        if (!cancelled) navigate(postOAuthRedirect, { replace: true });
        return;
      }

      const nextRoute = await resolveAuthenticatedRoute(user.id, role);
      console.info("[auth-page] authenticated_redirect", {
        userId: user.id,
        role,
        nextRoute,
      });
      if (!cancelled) navigate(nextRoute, { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [user, role, authLoading, isAuthReady, navigate]);

  useEffect(() => {
    const snapshot = recordGoogleOAuthCallbackSnapshot("auth_page");
    if (!snapshot.isGoogleReturn) return;

    if (snapshot.error || snapshot.errorDescription) {
      finalizeGoogleOAuthAttempt({
        correlationId: snapshot.correlationId,
        source: "auth_page",
        type: "callback_failed",
        status: "failed",
        error: snapshot.errorDescription || snapshot.error,
      });
      return;
    }

    recordGoogleOAuthEvent({
      correlationId: snapshot.correlationId,
      source: "auth_page",
      type: "callback_detected_without_error",
      status: "callback",
      details: {
        has_code: Boolean(snapshot.code),
        has_access_token: Boolean(snapshot.accessToken),
        has_refresh_token: Boolean(snapshot.refreshToken),
      },
    });
  }, []);

  useEffect(() => {
    console.info("[auth-page] google_autostart_check", {
      authLoading,
      isAuthReady,
      hasUser: Boolean(user),
      googleLoading,
    });

    if (nativeApp) return;
    if (!isAuthReady || user || googleLoading) return;
    if (!consumeGoogleOAuthTrigger()) return;

    const run = async () => {
      const attempt = startGoogleOAuthAttempt({
        source: isPreviewGoogleFlowContext() ? "preview_redirect" : "auth_button",
        redirectUri: buildGoogleOAuthRedirectUri(),
      });

      if (isPreviewGoogleFlowContext()) {
        recordGoogleOAuthEvent({
          correlationId: attempt.correlationId,
          source: "preview_redirect",
          type: "preview_redirect_to_published",
          status: "redirecting",
          redirectUri: buildGoogleOAuthRedirectUri(attempt.correlationId),
        });
        const target = new URL("/auth", PUBLISHED_APP_URL);
        if (mode !== "login") {
          target.searchParams.set("mode", mode);
        }
        if (attempt.correlationId) {
          target.searchParams.set("cid", attempt.correlationId);
        }
        target.searchParams.set("google", "1");
        window.location.replace(target.toString());
        return;
      }

      setGoogleLoading(true);
      const { error } = await signInWithGoogle({
        correlationId: attempt.correlationId,
        redirectUri: buildGoogleOAuthRedirectUri(attempt.correlationId),
        source: "auth_button",
      });
      if (error) {
        setGoogleLoading(false);
        const lower = error.toLowerCase();
        const isDomainIssue =
          lower.includes("redirect_uri") ||
          lower.includes("redirect uri") ||
          lower.includes("mismatch") ||
          lower.includes("unauthorized") ||
          lower.includes("invalid_request") ||
          lower.includes("origin");
        toast({
          title: "تعذر تسجيل الدخول بـ Google",
          description: isDomainIssue
            ? `يوجد اختلاف في بيئة تسجيل Google. تم اعتماد النطاق الرسمي فقط للتطبيق والموقع: modrekplus.com. جرّب مرة أخرى من النسخة الرسمية. التفاصيل: ${error}`
            : error,
          variant: "destructive",
        });
      }
    };

    void run();
  }, [authLoading, isAuthReady, user, googleLoading, mode, signInWithGoogle, nativeApp]);

  useEffect(() => {
    if (!user) return;

    const pending = getPendingGoogleOAuthAttempt();
    if (!pending) return;

    finalizeGoogleOAuthAttempt({
      correlationId: pending.correlationId,
      source: "auth_page",
      type: "session_available_after_google",
      status: "success",
    });
  }, [user]);




  const normalizeEmail = (value: string) => value.trim().replace(/\s+/g, "").toLowerCase();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name } = e.target;
    const value = e.target.value;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (mode === "login") {
      if (loginMethod === "email") {
        const emailResult = emailSchema.safeParse(formData.email);
        if (!emailResult.success) newErrors.email = emailResult.error.errors[0].message;
      } else {
        const phoneResult = phoneSchema.safeParse(loginPhone);
        if (!phoneResult.success) newErrors.loginPhone = phoneResult.error.errors[0].message;
      }
      if (!formData.password) newErrors.password = "كلمة المرور مطلوبة";
    } else {
      // Register (student or teacher) — email is required
      const emailResult = emailSchema.safeParse(formData.email);
      if (!emailResult.success) newErrors.email = emailResult.error.errors[0].message;

      const passwordResult = passwordSchema.safeParse(formData.password);
      if (!passwordResult.success) newErrors.password = passwordResult.error.errors[0].message;

      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = "كلمات المرور غير متطابقة";
      }

      const nameResult = nameSchema.safeParse(formData.name);
      if (!nameResult.success) newErrors.name = nameResult.error.errors[0].message;

      // Phone for student register is required (replaces username field)
      if (mode === "register") {
        const phoneResult = phoneSchema.safeParse(formData.phone);
        if (!phoneResult.success) newErrors.phone = phoneResult.error.errors[0].message;
      }
    }

    // Validate teacher-specific fields
    if (mode === "register-teacher") {
      if (!formData.school.trim()) newErrors.school = "جهة العمل مطلوبة";
      if (!formData.employeeId.trim()) newErrors.employeeId = "الرقم الوظيفي مطلوب";
      const phoneResult = phoneSchema.safeParse(formData.phone);
      if (!phoneResult.success) newErrors.phone = phoneResult.error.errors[0].message;
      if (formData.stages.length === 0) newErrors.stages = "اختر مرحلة واحدة على الأقل";
      if (formData.grades.length === 0) newErrors.grades = "اختر صف واحد على الأقل";
      if (!formData.subject) newErrors.subject = "اختر المادة التي تدرّسها";
      if (formData.subject === "المواد العربية" && !formData.educationType) {
        newErrors.educationType = "حدد نوع التعليم (عام أو أزهر)";
      }
      if (!formData.acceptedTerms) {
        newErrors.acceptedTerms = "يجب الموافقة على اتفاقية استخدام المعلمين للمتابعة";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Toggle grade selection
  const toggleGrade = (grade: string) => {
    setFormData((prev) => ({
      ...prev,
      grades: prev.grades.includes(grade)
        ? prev.grades.filter((g) => g !== grade)
        : [...prev.grades, grade],
    }));
    if (errors.grades) {
      setErrors((prev) => ({ ...prev, grades: "" }));
    }
  };

  // Get available grades based on selected stages
  const availableGrades: string[] = [];
  if (formData.stages.includes("preparatory")) availableGrades.push(...PREPARATORY_GRADES);
  if (formData.stages.includes("secondary")) availableGrades.push(...SECONDARY_GRADES);

  // Get available subjects based on selected stages
  const subjectsSet = new Set<string>();
  if (formData.stages.includes("preparatory")) PREPARATORY_SUBJECTS.forEach(s => subjectsSet.add(s));
  if (formData.stages.includes("secondary")) SECONDARY_SUBJECTS.forEach(s => subjectsSet.add(s));
  const availableSubjects = Array.from(subjectsSet);
  const canOfferIntegratedScience = ["أحياء", "فيزياء", "كيمياء"].includes(formData.subject)
    && formData.grades.includes("الصف الأول الثانوي");

  const toggleStage = (stage: "preparatory" | "secondary") => {
    setFormData((prev) => {
      const newStages = prev.stages.includes(stage)
        ? prev.stages.filter(s => s !== stage)
        : [...prev.stages, stage];
      return { ...prev, stages: newStages, grades: [], subject: "", educationType: "", teachesIntegratedScience: false };
    });
    if (errors.stages) setErrors((prev) => ({ ...prev, stages: "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const normalizedEmail = normalizeEmail(formData.email);

      if (mode === "login") {
        let loginEmail = normalizedEmail;

        if (loginMethod === "phone") {
          const digits = loginPhone.replace(/\D/g, "");
          const { data: resolvedEmail, error: rpcError } = await supabase.rpc(
            "get_email_by_phone",
            { _phone: digits },
          );
          if (rpcError || !resolvedEmail) {
            toast({
              title: "فشل تسجيل الدخول",
              description: "لا يوجد حساب مرتبط بهذا الرقم",
              variant: "destructive",
            });
            setIsLoading(false);
            return;
          }
          loginEmail = String(resolvedEmail).trim().toLowerCase();
        }

        const { error } = await signIn(loginEmail, formData.password);
        
        if (error) {
          toast({
            title: "فشل تسجيل الدخول",
            description: error,
            variant: "destructive",
          });
        } else {
          if (isDeveloperAccount(loginEmail)) {
            window.sessionStorage.setItem("post_oauth_redirect", "/admin");
          }
          toast({
            title: "تم تسجيل الدخول بنجاح",
            description: "جاري تحويلك...",
          });
          // Navigation will be handled by useEffect watching user/role
        }
      } else if (mode === "register") {
        const { error } = await signUp({
          email: normalizedEmail,
          password: formData.password,
          fullName: formData.name,
          phone: formData.phone || undefined,
        });
        if (error) {
          toast({ title: "فشل إنشاء الحساب", description: error, variant: "destructive" });
        } else {
          toast({ title: "تم إنشاء الحساب ✓", description: "أرسلنا رمز تحقق إلى بريدك" });
          setOtpEmail(normalizedEmail);
          setPendingMode("register");
          setOtpOpen(true);
        }
      } else if (mode === "register-teacher") {
        const { error } = await signUpTeacher({
          email: normalizedEmail,
          password: formData.password,
          fullName: formData.name,
          phone: formData.phone || undefined,
          schoolName: formData.school,
          employeeId: formData.employeeId,
          stages: formData.stages,
          grades: formData.grades,
          subject: formData.subject,
          educationType: formData.subject === "المواد الشرعية"
            ? "أزهر"
            : formData.educationType || undefined,
          teachesIntegratedScience: formData.teachesIntegratedScience,
        });
        if (error) {
          toast({ title: "فشل إرسال الطلب", description: error, variant: "destructive" });
        } else {
          toast({ title: "تم إرسال طلبك ✓", description: "أرسلنا رمز تحقق إلى بريدك" });
          setOtpEmail(normalizedEmail);
          setPendingMode("register-teacher");
          setOtpOpen(true);
        }
      }
    } catch {
      toast({
        title: "حدث خطأ",
        description: "يرجى المحاولة مرة أخرى",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading ONLY if a user is already signed in (we're about to redirect).
  // For unauthenticated users, always render the form so the Google button is visible.
  const authFormDisabled = !isAuthReady;

  if (user) {
    return (
      <div className="auth2026-loading safe-area-top safe-area-x min-h-screen flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="auth2026-page safe-area-top safe-area-x min-h-screen flex items-start md:items-center justify-center px-4 pt-10 pb-8 md:py-10 relative overflow-hidden">
      <div className="auth2026-panel-wrap w-full max-w-md relative z-10">
        {/* الشعار */}
        <Link to="/" className="auth2026-brand-link group">
          <span className="auth2026-logo-mark">
            <img src={mudrikLogo} alt="مدرك Plus" />
          </span>
          <span className="auth2026-brand-name">
            <span className="auth2026-brand-ar">مدرك</span>{" "}
            <span className="auth2026-brand-plus">Plus</span>
          </span>
        </Link>


        <Card className="auth2026-card animate-scale-in">
          <CardHeader className="text-center pb-2">
            <CardTitle className="auth2026-title text-2xl font-extrabold">
              {mode === "login" && "تسجيل الدخول"}
              {mode === "register" && "إنشاء حساب طالب"}
              {mode === "register-teacher" && "تسجيل معلم"}
            </CardTitle>
            <CardDescription className="auth2026-desc">
              {mode === "login" && "أدخل بياناتك للوصول لحسابك"}
              {mode === "register" && "أنشئ حسابك وابدأ رحلتك التعليمية"}
              {mode === "register-teacher" && "قدم طلبك للانضمام كمعلم"}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* حقول التسجيل */}
              {mode !== "login" && (
                <div className="space-y-2">
                  <Label htmlFor="name">الاسم الكامل</Label>
                  <div className="relative">
                    <User className="auth2026-field-icon absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5" />
                    <Input
                      id="name"
                      name="name"
                      placeholder="أدخل اسمك الكامل"
                      className={`pr-10 ${errors.name ? "border-destructive" : ""}`}
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                </div>
              )}

              {mode === "register" && (
                <div className="space-y-2">
                  <Label htmlFor="phone">رقم الهاتف</Label>
                  <div className="relative">
                    <Phone className="auth2026-field-icon absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5" />
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      dir="ltr"
                      placeholder="01xxxxxxxxx"
                      className={`pr-10 text-left ${errors.phone ? "border-destructive" : ""}`}
                      value={formData.phone}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
                </div>
              )}

              {mode === "register-teacher" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="school">جهة العمل / المدرسة</Label>
                    <Input
                      id="school"
                      name="school"
                      placeholder="أدخل اسم المدرسة أو الجهة"
                      className={errors.school ? "border-destructive" : ""}
                      value={formData.school}
                      onChange={handleInputChange}
                      required
                    />
                    {errors.school && <p className="text-xs text-destructive">{errors.school}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="employeeId">الرقم الوظيفي</Label>
                    <Input
                      id="employeeId"
                      name="employeeId"
                      placeholder="أدخل رقمك الوظيفي"
                      className={errors.employeeId ? "border-destructive" : ""}
                      value={formData.employeeId}
                      onChange={handleInputChange}
                      required
                    />
                    {errors.employeeId && <p className="text-xs text-destructive">{errors.employeeId}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">رقم الهاتف</Label>
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      placeholder="أدخل رقم هاتفك"
                      className={errors.phone ? "border-destructive" : ""}
                      value={formData.phone}
                      onChange={handleInputChange}
                      required
                    />
                    {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
                  </div>

                  {/* اختيار المرحلة - Checkboxes for multi-select */}
                  <div className="space-y-2">
                    <Label>المرحلة التعليمية (يمكنك اختيار أكثر من مرحلة)</Label>
                    <div className="flex gap-4" dir="rtl">
                      <label
                        className={`auth2026-choice ${
                          formData.stages.includes("preparatory")
                            ? "is-selected"
                            : ""
                        }`}
                      >
                        <Checkbox
                          checked={formData.stages.includes("preparatory")}
                          onCheckedChange={() => toggleStage("preparatory")}
                        />
                        إعدادي
                      </label>
                      <label
                        className={`auth2026-choice ${
                          formData.stages.includes("secondary")
                            ? "is-selected"
                            : ""
                        }`}
                      >
                        <Checkbox
                          checked={formData.stages.includes("secondary")}
                          onCheckedChange={() => toggleStage("secondary")}
                        />
                        ثانوي
                      </label>
                    </div>
                    {errors.stages && <p className="text-xs text-destructive">{errors.stages}</p>}
                  </div>

                  {/* اختيار الصفوف - Checkboxes */}
                  {formData.stages.length > 0 && (
                    <div className="space-y-2">
                      <Label>الصفوف التي تدرّسها</Label>
                      <div className="flex flex-wrap gap-2">
                        {availableGrades.map((grade) => (
                          <label
                            key={grade}
                            className={`auth2026-choice text-sm ${
                              formData.grades.includes(grade)
                                ? "is-selected"
                                : ""
                            }`}
                          >
                            <Checkbox
                              checked={formData.grades.includes(grade)}
                              onCheckedChange={() => toggleGrade(grade)}
                            />
                            {grade}
                          </label>
                        ))}
                      </div>
                      {errors.grades && <p className="text-xs text-destructive">{errors.grades}</p>}
                    </div>
                  )}

                  {/* اختيار المادة */}
                  {formData.grades.length > 0 && (
                    <div className="space-y-2">
                      <Label>المادة التي تدرّسها</Label>
                      <Select
                        value={formData.subject}
                        onValueChange={(value) => {
                          setFormData((prev) => ({
                            ...prev,
                            subject: value,
                            educationType: value === "المواد الشرعية" ? "أزهر" : "",
                            teachesIntegratedScience: value === "العلوم المتكاملة" ? false : prev.teachesIntegratedScience,
                          }));
                          if (errors.subject) {
                            setErrors((prev) => ({ ...prev, subject: "" }));
                          }
                        }}
                      >
                        <SelectTrigger className={errors.subject ? "border-destructive" : ""}>
                          <SelectValue placeholder="اختر المادة" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableSubjects.map((subject) => (
                            <SelectItem key={subject} value={subject}>
                              {subject}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.subject && <p className="text-xs text-destructive">{errors.subject}</p>}
                    </div>
                  )}

                  {/* نوع التعليم - يظهر عند اختيار المواد العربية */}
                  {formData.subject === "المواد العربية" && (
                    <div className="space-y-2">
                      <Label>أنت مدرّس مواد عربية لـ:</Label>
                      <RadioGroup
                        value={formData.educationType}
                        onValueChange={(value) =>
                          setFormData((prev) => ({ ...prev, educationType: value as "عام" | "أزهر" }))
                        }
                        className="flex gap-6"
                        dir="rtl"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="عام" id="edu-gen-auth" />
                          <Label htmlFor="edu-gen-auth" className="cursor-pointer font-normal">
                            تعليم عام
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="أزهر" id="edu-azh-auth" />
                          <Label htmlFor="edu-azh-auth" className="cursor-pointer font-normal">
                            تعليم أزهري
                          </Label>
                        </div>
                      </RadioGroup>
                      {errors.educationType && <p className="text-xs text-destructive">{errors.educationType}</p>}
                    </div>
                  )}

                  {/* إشعار المواد الشرعية */}
                  {formData.subject === "المواد الشرعية" && (
                    <div className="auth2026-soft-note p-3 text-sm font-semibold">
                      ℹ️ المواد الشرعية مخصصة لطلاب التعليم الأزهري فقط
                    </div>
                  )}

                  {canOfferIntegratedScience && (
                    <div className="auth2026-integrated-card p-4 space-y-2">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <Checkbox
                          checked={!!formData.teachesIntegratedScience}
                          onCheckedChange={(checked) =>
                            setFormData((prev) => ({ ...prev, teachesIntegratedScience: !!checked }))
                          }
                          className="mt-0.5"
                        />
                        <div className="space-y-1">
                          <div className="font-semibold text-sm">إضافة مادة "العلوم المتكاملة" مع مادتك الأساسية</div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            إذا كنت معلم أحياء أو فيزياء أو كيمياء وتدرّس الصف الأول الثانوي، يمكنك تفعيل هذا الخيار
                            لتظهر لك مادة العلوم المتكاملة كمادة إضافية مستقلة بجانب مادتك الأساسية.
                          </p>
                        </div>
                      </label>
                    </div>
                  )}
                </>
              )}

              {/* البريد الإلكتروني أو رقم الهاتف */}
              {mode === "login" && (
                <div className="auth2026-method-toggle">
                  <button
                    type="button"
                    onClick={() => setLoginMethod("email")}
                    className={`auth2026-method-button ${
                      loginMethod === "email"
                        ? "is-active"
                        : ""
                    }`}
                  >
                    <Mail className="inline h-4 w-4 ml-1" /> البريد الإلكتروني
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoginMethod("phone")}
                    className={`auth2026-method-button ${
                      loginMethod === "phone"
                        ? "is-active"
                        : ""
                    }`}
                  >
                    <Phone className="inline h-4 w-4 ml-1" /> رقم الهاتف
                  </button>
                </div>
              )}

              {(mode !== "login" || loginMethod === "email") && (
                <div className="space-y-2">
                  <Label htmlFor="email">البريد الإلكتروني</Label>
                  <div className="relative">
                    <Mail className="auth2026-field-icon absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5" />
                    <Input
                      id="email"
                      name="email"
                      type="text"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      dir="ltr"
                      enterKeyHint="next"
                      placeholder="example@email.com"
                      className={`pr-10 text-left ${errors.email ? "border-destructive" : ""}`}
                      value={formData.email}
                      onChange={handleInputChange}
                      onBlur={(e) => {
                        const v = e.target.value;
                        if (v !== formData.email) {
                          setFormData((prev) => ({ ...prev, email: v }));
                        }
                      }}
                      required
                    />
                  </div>
                  {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                </div>
              )}

              {mode === "login" && loginMethod === "phone" && (
                <div className="space-y-2">
                  <Label htmlFor="loginPhone">رقم الهاتف</Label>
                  <div className="relative">
                    <Phone className="auth2026-field-icon absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5" />
                    <Input
                      id="loginPhone"
                      name="loginPhone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      dir="ltr"
                      placeholder="01xxxxxxxxx"
                      className={`pr-10 text-left ${errors.loginPhone ? "border-destructive" : ""}`}
                      value={loginPhone}
                      onChange={(e) => {
                        setLoginPhone(e.target.value);
                        if (errors.loginPhone) setErrors((p) => ({ ...p, loginPhone: "" }));
                      }}
                      required
                    />
                  </div>
                  {errors.loginPhone && <p className="text-xs text-destructive">{errors.loginPhone}</p>}
                </div>
              )}

              {/* كلمة المرور */}
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <div className="relative">
                  <Lock className="auth2026-field-icon absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="أدخل كلمة المرور"
                    className={`pr-10 pl-10 ${errors.password ? "border-destructive" : ""}`}
                    value={formData.password}
                    onChange={handleInputChange}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="auth2026-eye-button absolute left-3 top-1/2 -translate-y-1/2"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}

              </div>


              {/* تأكيد كلمة المرور */}
              {mode !== "login" && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">تأكيد كلمة المرور</Label>
                  <div className="relative">
                    <Lock className="auth2026-field-icon absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5" />
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      placeholder="أعد إدخال كلمة المرور"
                      className={`pr-10 ${errors.confirmPassword ? "border-destructive" : ""}`}
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
                </div>
              )}

              {/* رابط نسيت كلمة المرور */}
              {mode === "login" && (
                <div className="text-left">
                  <Link to={loginMethod === "phone" ? "/forgot-password?method=phone" : "/forgot-password"} className="auth2026-link text-sm hover:underline">
                    نسيت كلمة المرور؟
                  </Link>
                </div>
              )}

              {/* زر الإرسال */}
              <Button type="submit" className="auth2026-primary-button w-full" size="lg" disabled={isLoading || authFormDisabled}>
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    {mode === "login" && "تسجيل الدخول"}
                    {mode === "register" && "إنشاء الحساب"}
                    {mode === "register-teacher" && "إرسال الطلب"}
                    <ChevronLeft className="h-5 w-5 mr-1" />
                  </>
                )}
              </Button>

              {/* تسجيل الدخول بـ Google */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="auth2026-divider-line w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="auth2026-divider-label px-3">أو</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="auth2026-google-button w-full font-semibold"
                size="lg"
                disabled={googleLoading || authFormDisabled}

                onClick={async () => {
                  const attempt = startGoogleOAuthAttempt({
                    source: isPreviewGoogleFlowContext() ? "preview_redirect" : "auth_button",
                    redirectUri: buildGoogleOAuthRedirectUri(),
                  });

                  if (isPreviewGoogleFlowContext()) {
                    recordGoogleOAuthEvent({
                      correlationId: attempt.correlationId,
                      source: "preview_redirect",
                      type: "preview_redirect_to_published",
                      status: "redirecting",
                      redirectUri: buildGoogleOAuthRedirectUri(attempt.correlationId),
                    });
                    const target = new URL("/auth", PUBLISHED_APP_URL);
                    if (mode !== "login") {
                      target.searchParams.set("mode", mode);
                    }
                    if (attempt.correlationId) {
                      target.searchParams.set("cid", attempt.correlationId);
                    }
                    target.searchParams.set("google", "1");
                    window.location.replace(target.toString());
                    return;
                  }

                  setGoogleLoading(true);
                  const { error } = await signInWithGoogle({
                    correlationId: attempt.correlationId,
                    redirectUri: buildGoogleOAuthRedirectUri(attempt.correlationId),
                    source: "auth_button",
                  });
                  if (error) {
                    setGoogleLoading(false);
                    const lower = error.toLowerCase();
                    const isDomainIssue =
                      lower.includes("redirect_uri") ||
                      lower.includes("redirect uri") ||
                      lower.includes("mismatch") ||
                      lower.includes("unauthorized") ||
                      lower.includes("invalid_request") ||
                      lower.includes("origin");
                    toast({
                      title: "تعذر تسجيل الدخول بـ Google",
                      description: isDomainIssue
                        ? `يوجد اختلاف في بيئة تسجيل Google. تم اعتماد النطاق الرسمي فقط للتطبيق والموقع: modrekplus.com. جرّب مرة أخرى من النسخة الرسمية. التفاصيل: ${error}`
                        : error,
                      variant: "destructive",
                    });
                  }
                }}
              >
                {googleLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                  <>
                    <svg className="h-5 w-5 ml-2" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    التسجيل بواسطة Google
                  </>
                )}
              </Button>

            </form>

            {/* التبديل بين الأوضاع */}
            <div className="mt-6 space-y-3 text-center text-sm">
              {mode === "login" && (
                <>
                  <p className="text-muted-foreground">
                    ليس لديك حساب؟{" "}
                    <button
                      onClick={() => setMode("register")}
                      className="auth2026-link hover:underline"
                    >
                      سجّل كطالب
                    </button>
                  </p>
                  <p className="text-muted-foreground">
                    أنت معلم؟{" "}
                    <button
                      onClick={() => setMode("register-teacher")}
                      className="auth2026-link-alt hover:underline"
                    >
                      سجّل كمعلم
                    </button>
                  </p>
                </>
              )}

              {mode === "register" && (
                <>
                  <p className="text-muted-foreground">
                    لديك حساب بالفعل؟{" "}
                    <button
                      onClick={() => setMode("login")}
                      className="auth2026-link hover:underline"
                    >
                      تسجيل الدخول
                    </button>
                  </p>
                  <p className="text-muted-foreground">
                    أنت معلم؟{" "}
                    <button
                      onClick={() => setMode("register-teacher")}
                      className="auth2026-link-alt hover:underline"
                    >
                      سجّل كمعلم
                    </button>
                  </p>
                </>
              )}

              {mode === "register-teacher" && (
                <>
                  <p className="text-muted-foreground">
                    لديك حساب؟{" "}
                    <button
                      onClick={() => setMode("login")}
                      className="auth2026-link hover:underline"
                    >
                      تسجيل الدخول
                    </button>
                  </p>
                  <p className="text-muted-foreground">
                    أنت طالب؟{" "}
                    <button
                      onClick={() => setMode("register")}
                      className="auth2026-link hover:underline"
                    >
                      سجّل كطالب
                    </button>
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* رابط العودة */}
        <div className="mt-6 text-center">
          <Link to="/" className="auth2026-back-link text-sm transition-colors">
            ← العودة للصفحة الرئيسية
          </Link>
        </div>
      </div>

      <OtpVerificationDialog
        open={otpOpen}
        email={otpEmail}
        type="email"
        title="تأكيد بريدك الإلكتروني"
        onVerified={() => {
          setOtpOpen(false);
          if (pendingMode === "register-teacher") {
            navigate("/pending-approval", { replace: true });
          }
        }}
        onClose={() => setOtpOpen(false)}
        onChangeEmail={() => setOtpOpen(false)}
      />

    </div>
  );
};

export default Auth;

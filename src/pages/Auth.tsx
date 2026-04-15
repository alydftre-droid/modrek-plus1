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
import mudrikLogo from "@/assets/mudrik-logo.png";
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ChevronLeft,
  Loader2,
} from "lucide-react";
import { z } from "zod";

type AuthMode = "login" | "register" | "register-teacher";

// Validation schemas
const emailSchema = z.string().email("البريد الإلكتروني غير صالح").max(255);
const passwordSchema = z.string()
  .min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل")
  .regex(/[A-Z]/, "يجب أن تحتوي على حرف كبير")
  .regex(/[0-9]/, "يجب أن تحتوي على رقم")
  .regex(/[^A-Za-z0-9]/, "يجب أن تحتوي على رمز خاص");
const nameSchema = z.string().min(3, "الاسم يجب أن يكون 3 أحرف على الأقل").max(100);
const phoneSchema = z.string().regex(/^[0-9]{10,15}$/, "رقم الهاتف غير صالح").optional().or(z.literal(""));

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
];

const Auth = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, role, isLoading: authLoading, signIn, signUp, signUpTeacher } = useAuth();
  const initialMode = searchParams.get("mode") === "register" ? "register" : "login";

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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
  });

  // Redirect if already logged in
  useEffect(() => {
    if (authLoading || !user) return;

    if (role === "admin") {
      navigate("/admin", { replace: true });
      return;
    }

    if (role === "student") {
      // Check if student has selected education type
      let cancelled = false;
      (async () => {
        const { data } = await supabase
          .from("profiles")
          .select("education_type")
          .eq("id", user.id)
          .single();
        if (cancelled) return;
        if (!data?.education_type) {
          navigate("/select-education-type", { replace: true });
        } else {
          navigate("/dashboard", { replace: true });
        }
      })();
      return () => { cancelled = true; };
    }

    if (role === "teacher") {
      let cancelled = false;
      (async () => {
        const { data, error } = await supabase
          .from("teacher_requests")
          .select("status")
          .eq("user_id", user.id)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          console.error("Error checking teacher approval status:", error);
          navigate("/pending-approval", { replace: true });
          return;
        }

        if (data?.status === "approved") {
          navigate("/teacher", { replace: true });
        } else {
          navigate("/pending-approval", { replace: true });
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    // User exists but no role yet (or unknown)
    navigate("/pending-approval", { replace: true });
  }, [user, role, authLoading, navigate]);

  // التحقق من قوة كلمة المرور
  const getPasswordStrength = (password: string) => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    return strength;
  };

  const passwordStrength = getPasswordStrength(formData.password);
  const passwordStrengthLabels = ["ضعيفة جداً", "ضعيفة", "متوسطة", "قوية", "ممتازة"];
  const passwordStrengthColors = ["bg-destructive", "bg-orange-500", "bg-yellow-500", "bg-primary", "bg-green-500"];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Validate email
    const emailResult = emailSchema.safeParse(formData.email);
    if (!emailResult.success) {
      newErrors.email = emailResult.error.errors[0].message;
    }

    // Validate password
    if (mode === "login") {
      if (!formData.password) {
        newErrors.password = "كلمة المرور مطلوبة";
      }
    } else {
      const passwordResult = passwordSchema.safeParse(formData.password);
      if (!passwordResult.success) {
        newErrors.password = passwordResult.error.errors[0].message;
      }

      // Confirm password match
      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = "كلمات المرور غير متطابقة";
      }

      // Validate name
      const nameResult = nameSchema.safeParse(formData.name);
      if (!nameResult.success) {
        newErrors.name = nameResult.error.errors[0].message;
      }
    }

    // Validate teacher-specific fields
    if (mode === "register-teacher") {
      if (!formData.school.trim()) {
        newErrors.school = "جهة العمل مطلوبة";
      }
      if (!formData.employeeId.trim()) {
        newErrors.employeeId = "الرقم الوظيفي مطلوب";
      }
      if (formData.phone) {
        const phoneResult = phoneSchema.safeParse(formData.phone);
        if (!phoneResult.success) {
          newErrors.phone = phoneResult.error.errors[0].message;
        }
      }
      if (!formData.stage) {
        newErrors.stage = "اختر المرحلة التعليمية";
      }
      if (formData.grades.length === 0) {
        newErrors.grades = "اختر صف واحد على الأقل";
      }
      if (!formData.subject) {
        newErrors.subject = "اختر المادة التي تدرّسها";
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

  // Get available grades based on stage
  const availableGrades = formData.stage === "preparatory" 
    ? PREPARATORY_GRADES 
    : formData.stage === "secondary" 
    ? SECONDARY_GRADES 
    : [];

  // Get available subjects based on stage
  const availableSubjects = formData.stage === "preparatory"
    ? PREPARATORY_SUBJECTS
    : formData.stage === "secondary"
    ? SECONDARY_SUBJECTS
    : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      if (mode === "login") {
        const { error } = await signIn(formData.email, formData.password);
        
        if (error) {
          toast({
            title: "فشل تسجيل الدخول",
            description: error,
            variant: "destructive",
          });
        } else {
          toast({
            title: "تم تسجيل الدخول بنجاح",
            description: "جاري تحويلك...",
          });
          // Navigation will be handled by useEffect watching user/role
        }
      } else if (mode === "register") {
        const { error } = await signUp({
          email: formData.email,
          password: formData.password,
          fullName: formData.name,
          phone: formData.phone || undefined,
        });
        
        if (error) {
          toast({
            title: "فشل إنشاء الحساب",
            description: error,
            variant: "destructive",
          });
        } else {
          toast({
            title: "تم إنشاء الحساب بنجاح",
            description: "يمكنك الآن تسجيل الدخول والبدء في التعلم",
          });
          setMode("login");
          setFormData((prev) => ({ ...prev, password: "", confirmPassword: "" }));
        }
      } else if (mode === "register-teacher") {
        const { error } = await signUpTeacher({
          email: formData.email,
          password: formData.password,
          fullName: formData.name,
          phone: formData.phone || undefined,
          schoolName: formData.school,
          employeeId: formData.employeeId,
          stages: formData.stages.length > 0 ? formData.stages : (formData.stage ? [formData.stage as "preparatory" | "secondary"] : []),
          grades: formData.grades,
          subject: formData.subject,
        });
        
        if (error) {
          toast({
            title: "فشل إرسال الطلب",
            description: error,
            variant: "destructive",
          });
        } else {
          toast({
            title: "تم إرسال طلبك",
            description: "سيتم مراجعة طلبك وإشعارك عند القبول",
          });
          navigate("/pending-approval");
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

  // Show loading if checking auth state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 pattern-islamic p-4">
      <div className="w-full max-w-md">
        {/* الشعار */}
        <Link to="/" className="flex items-center justify-center gap-3 mb-8 group">
          <img src={mudrikLogo} alt="مدرك Plus" className="h-12 w-12 rounded-xl shadow-mudrik transition-transform duration-300 group-hover:scale-105" />
          <span className="text-2xl font-bold text-gradient-mudrik">مدرك Plus</span>
        </Link>

        <Card className="shadow-lg animate-scale-in">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl">
              {mode === "login" && "تسجيل الدخول"}
              {mode === "register" && "إنشاء حساب طالب"}
              {mode === "register-teacher" && "تسجيل معلم"}
            </CardTitle>
            <CardDescription>
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
                    <User className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
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
                  <Label htmlFor="username">اسم المستخدم (اختياري)</Label>
                  <div className="relative">
                    <User className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="username"
                      name="username"
                      placeholder="اختر اسم مستخدم"
                      className="pr-10"
                      value={formData.username}
                      onChange={handleInputChange}
                    />
                  </div>
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

                  {/* اختيار المرحلة - Radio buttons */}
                  <div className="space-y-2">
                    <Label>المرحلة التعليمية</Label>
                    <RadioGroup
                      value={formData.stage}
                      onValueChange={(value) => {
                        setFormData((prev) => ({
                          ...prev,
                          stage: value as "preparatory" | "secondary",
                          grades: [],
                          subject: "",
                        }));
                        if (errors.stage) {
                          setErrors((prev) => ({ ...prev, stage: "" }));
                        }
                      }}
                      className="flex gap-6"
                      dir="rtl"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="preparatory" id="stage-prep" />
                        <Label htmlFor="stage-prep" className="cursor-pointer font-normal">
                          إعدادي
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="secondary" id="stage-sec" />
                        <Label htmlFor="stage-sec" className="cursor-pointer font-normal">
                          ثانوي
                        </Label>
                      </div>
                    </RadioGroup>
                    {errors.stage && <p className="text-xs text-destructive">{errors.stage}</p>}
                  </div>

                  {/* اختيار الصفوف - Checkboxes */}
                  {formData.stage && (
                    <div className="space-y-2">
                      <Label>الصفوف التي تدرّسها</Label>
                      <div className="flex flex-wrap gap-2">
                        {availableGrades.map((grade) => (
                          <label
                            key={grade}
                            className={`flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer text-sm transition-colors ${
                              formData.grades.includes(grade)
                                ? "border-primary bg-primary/10"
                                : "border-border hover:border-primary/50"
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

                  {/* اختيار المادة - Select واحد */}
                  {formData.grades.length > 0 && (
                    <div className="space-y-2">
                      <Label>المادة التي تدرّسها</Label>
                      <Select
                        value={formData.subject}
                        onValueChange={(value) => {
                          setFormData((prev) => ({ ...prev, subject: value }));
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
                </>
              )}

              {/* البريد الإلكتروني */}
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="example@email.com"
                    className={`pr-10 ${errors.email ? "border-destructive" : ""}`}
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>

              {/* كلمة المرور */}
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
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
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}

                {/* مؤشر قوة كلمة المرور */}
                {mode !== "login" && formData.password && (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={`h-1.5 flex-1 rounded-full transition-colors ${
                            i < passwordStrength ? passwordStrengthColors[passwordStrength] : "bg-muted"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      قوة كلمة المرور: {passwordStrengthLabels[passwordStrength]}
                    </p>
                  </div>
                )}
              </div>

              {/* تأكيد كلمة المرور */}
              {mode !== "login" && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">تأكيد كلمة المرور</Label>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
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
                  <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                    نسيت كلمة المرور؟
                  </Link>
                </div>
              )}

              {/* زر الإرسال */}
              <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
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
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-2 text-muted-foreground">أو</span>
                </div>
              </div>

              <Button type="button" variant="outline" className="w-full" size="lg" disabled>
                <svg className="h-5 w-5 ml-2" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                التسجيل بواسطة Google (قريباً)
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
                      className="text-primary hover:underline font-medium"
                    >
                      سجّل كطالب
                    </button>
                  </p>
                  <p className="text-muted-foreground">
                    أنت معلم؟{" "}
                    <button
                      onClick={() => setMode("register-teacher")}
                      className="text-gold hover:underline font-medium"
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
                      className="text-primary hover:underline font-medium"
                    >
                      تسجيل الدخول
                    </button>
                  </p>
                  <p className="text-muted-foreground">
                    أنت معلم؟{" "}
                    <button
                      onClick={() => setMode("register-teacher")}
                      className="text-gold hover:underline font-medium"
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
                      className="text-primary hover:underline font-medium"
                    >
                      تسجيل الدخول
                    </button>
                  </p>
                  <p className="text-muted-foreground">
                    أنت طالب؟{" "}
                    <button
                      onClick={() => setMode("register")}
                      className="text-primary hover:underline font-medium"
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
          <Link to="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">
            ← العودة للصفحة الرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Auth;

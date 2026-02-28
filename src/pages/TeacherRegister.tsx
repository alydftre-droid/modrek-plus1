// src/pages/TeacherRegister.tsx

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import TeacherRegistrationForm, {
  TeacherFormData,
} from "@/components/auth/TeacherRegistrationForm";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, ArrowRight, UserPlus } from "lucide-react";

const initialForm: TeacherFormData = {
  school: "",
  employeeId: "",
  phone: "",
  stage: "",
  grades: [],
  subject: "",
};

const TeacherRegister = () => {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState<TeacherFormData>(initialForm);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [existingRequest, setExistingRequest] = useState<{
    status: string;
    rejection_reason?: string;
  } | null>(null);
  const [checkingRequest, setCheckingRequest] = useState(true);

  // تحقق من وجود طلب سابق
  useEffect(() => {
    const checkExistingRequest = async () => {
      if (!user) {
        setCheckingRequest(false);
        return;
      }

      const { data, error } = await supabase
        .from("teacher_requests")
        .select("status, rejection_reason")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        setExistingRequest(data);

        // إذا تمت الموافقة، انتقل للوحة المعلم
        if (data.status === "approved") {
          navigate("/teacher");
          return;
        }

        // إذا في انتظار الموافقة
        if (data.status === "pending") {
          navigate("/pending-approval");
          return;
        }
      }

      setCheckingRequest(false);
    };

    checkExistingRequest();
  }, [user, navigate]);

  const validate = () => {
    const e: Record<string, string> = {};

    if (!user) {
      if (!fullName.trim()) e.fullName = "الاسم مطلوب";
      if (!email.trim()) e.email = "البريد الإلكتروني مطلوب";
      if (!password || password.length < 6) e.password = "كلمة المرور يجب أن تكون 6 أحرف على الأقل";
    }

    if (!formData.school) e.school = "جهة العمل مطلوبة";
    if (!formData.employeeId) e.employeeId = "الرقم الوظيفي مطلوب";
    if (!formData.phone) e.phone = "رقم الهاتف مطلوب";
    if (!formData.stage) e.stage = "اختر المرحلة";
    if (formData.grades.length === 0) e.grades = "اختر صف واحد على الأقل";
    if (!formData.subject) e.subject = "اختر المادة";

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);

    try {
      let userId = user?.id;
      let userEmail = user?.email || email;
      let userName = fullName;

      // إذا لم يكن المستخدم مسجلاً، قم بإنشاء حساب جديد
      if (!user) {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName,
              phone: formData.phone,
              role: "teacher",
            },
          },
        });

        if (signUpError) {
          toast({
            title: "خطأ في إنشاء الحساب",
            description: signUpError.message.includes("User already registered")
              ? "هذا البريد الإلكتروني مسجل بالفعل"
              : signUpError.message,
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        userId = signUpData.user?.id;
        userEmail = email;
      } else {
        // جلب اسم المستخدم من الملف الشخصي
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle();

        userName = profile?.full_name || "";
      }

      if (!userId) {
        toast({
          title: "خطأ",
          description: "فشل في إنشاء الحساب",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // إنشاء طلب المعلم
      const { error: requestError } = await supabase.from("teacher_requests").insert({
        user_id: userId,
        full_name: userName || fullName,
        email: userEmail,
        phone: formData.phone,
        school_name: formData.school,
        employee_id: formData.employeeId,
        status: "pending",
        assigned_stages: [formData.stage],
        assigned_grades: formData.grades,
        assigned_category: formData.subject,
      });

      if (requestError) {
        console.error("Error creating teacher request:", requestError);
        toast({
          title: "خطأ",
          description: "فشل إرسال الطلب. حاول مرة أخرى.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      toast({
        title: "تم إرسال طلبك بنجاح",
        description: "سيتم مراجعته من الإدارة وإعلامك بالنتيجة",
      });

      navigate("/pending-approval");
    } catch (error) {
      console.error("Error:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ غير متوقع",
        variant: "destructive",
      });
    }

    setLoading(false);
  };

  if (authLoading || checkingRequest) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  // عرض رسالة الرفض مع إمكانية إعادة التقديم
  if (existingRequest?.status === "rejected") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
              <span className="text-3xl">❌</span>
            </div>
            <CardTitle className="text-destructive">تم رفض طلبك</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {existingRequest.rejection_reason && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-1">سبب الرفض:</p>
                <p className="text-sm text-muted-foreground">
                  {existingRequest.rejection_reason}
                </p>
              </div>
            )}
            <Button
              className="w-full"
              onClick={() => setExistingRequest(null)}
            >
              تقديم طلب جديد
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate("/")}
            >
              العودة للرئيسية
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
              <UserPlus className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">تسجيل معلم جديد</h1>
              <p className="text-sm text-muted-foreground">
                أكمل البيانات التالية لتقديم طلبك
              </p>
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="p-6 space-y-6">
            {/* إذا لم يكن مسجلاً، اعرض حقول إنشاء الحساب */}
            {!user && (
              <div className="space-y-4 pb-4 border-b">
                <h3 className="font-semibold">بيانات الحساب</h3>

                <div>
                  <Label>الاسم الكامل</Label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="أدخل اسمك الكامل"
                  />
                  {errors.fullName && (
                    <p className="text-sm text-destructive mt-1">{errors.fullName}</p>
                  )}
                </div>

                <div>
                  <Label>البريد الإلكتروني</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@email.com"
                    dir="ltr"
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive mt-1">{errors.email}</p>
                  )}
                </div>

                <div>
                  <Label>كلمة المرور</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  {errors.password && (
                    <p className="text-sm text-destructive mt-1">{errors.password}</p>
                  )}
                </div>
              </div>
            )}

            {/* بيانات المعلم */}
            <div>
              <h3 className="font-semibold mb-4">البيانات المهنية والتعليمية</h3>
              <TeacherRegistrationForm
                formData={formData}
                onChange={(data) =>
                  setFormData((prev) => ({ ...prev, ...data }))
                }
                errors={errors}
              />
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  جارٍ الإرسال...
                </>
              ) : (
                "إرسال الطلب"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TeacherRegister;

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  User, 
  Lock, 
  Phone, 
  Mail, 
  Hash, 
  GraduationCap, 
  Save, 
  Loader2, 
  ChevronLeft,
  ShieldCheck,
  UserCircle,
  LogOut,
  Info
} from "lucide-react";

/**
 * ملف إعدادات الحساب الموحد - أزهاريون 2026
 * تم تصميمه ليكون مرناً وحديثاً مع حماية البيانات الحساسة
 */

const ProfileSettings = () => {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  
  // حالات البيانات الشخصية
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [profileData, setProfileData] = useState<any>(null);
  
  // حالات تغيير كلمة المرور
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPass, setChangingPass] = useState(false);

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user?.id)
        .single();

      if (error) throw error;

      if (data) {
        setProfileData(data);
        setFullName(data.full_name || "");
        setPhone(data.phone || "");
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      toast.error("حدث خطأ أثناء تحميل بيانات الحساب");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!fullName.trim()) {
      toast.error("يرجى إدخال الاسم بالكامل");
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          phone: phone,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user?.id);

      if (error) throw error;
      toast.success("تم حفظ التعديلات بنجاح");
    } catch (error) {
      console.error("Update error:", error);
      toast.error("فشل التحديث، يرجى المحاولة لاحقاً");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast.error("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("كلمات المرور غير متطابقة");
      return;
    }

    try {
      setChangingPass(true);
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;
      
      toast.success("تم تحديث كلمة المرور بنجاح");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      console.error("Password change error:", error);
      toast.error("حدث خطأ، تأكد من تسجيل الدخول حديثاً");
    } finally {
      setChangingPass(false);
    }
  };

  // مساعدات العرض للنصوص العربية
  const getStageName = (stage: string) => {
    if (stage === 'preparatory') return 'المرحلة الإعدادية';
    if (stage === 'secondary') return 'المرحلة الثانوية';
    return stage;
  };

  const getGradeName = (grade: string) => {
    const grades: Record<string, string> = {
      'first': 'الصف الأول',
      'second': 'الصف الثاني',
      'third': 'الصف الثالث'
    };
    return grades[grade] || grade;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground animate-pulse">جاري تحميل إعداداتك...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 pb-20" dir="rtl">
      {/* شريط التنقل العلوي */}
      <nav className="bg-background border-b sticky top-0 z-30 shadow-sm">
        <div className="container h-16 flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <h1 className="text-lg font-bold text-primary">إعدادات الحساب</h1>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} className="text-destructive hover:bg-destructive/10">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </nav>

      <main className="container max-w-3xl pt-8 px-4 space-y-8">
        {/* بطاقة العرض الرئيسية */}
        <div className="relative group">
          <Card className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 text-white border-none shadow-2xl overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full pattern-islamic opacity-10 pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 opacity-10 rotate-12 transition-transform group-hover:scale-110 duration-700">
              <UserCircle size={200} />
            </div>
            
            <CardContent className="p-8 flex flex-col md:flex-row items-center gap-8 relative z-10">
              <div className="h-28 w-28 rounded-full bg-white/20 backdrop-blur-xl flex items-center justify-center border-4 border-white/40 shadow-inner">
                <User size={56} className="text-white drop-shadow-md" />
              </div>
              
              <div className="text-center md:text-right space-y-4">
                <div>
                  <h2 className="text-3xl font-black tracking-tight">{fullName || 'مستخدم جديد'}</h2>
                  <p className="text-emerald-100/70 text-sm mt-1 flex items-center justify-center md:justify-start gap-2">
                    <Mail size={14} /> {user?.email}
                  </p>
                </div>
                
                <div className="flex flex-wrap justify-center md:justify-start gap-2">
                  <span className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-medium border border-white/10 flex items-center gap-2">
                    <Hash size={14} /> كود: {profileData?.student_code || '---'}
                  </span>
                  <span className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-medium border border-white/10 flex items-center gap-2">
                    <GraduationCap size={14} /> {getStageName(profileData?.stage)} - {getGradeName(profileData?.grade)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* أقسام الإعدادات */}
        <Tabs defaultValue="account" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto mb-8 bg-background border shadow-inner p-1">
            <TabsTrigger value="account" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-white transition-all">
              <User size={16} /> البيانات الشخصية
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-white transition-all">
              <ShieldCheck size={16} /> الأمان والحماية
            </TabsTrigger>
          </TabsList>

          {/* تبويب الحساب */}
          <TabsContent value="account" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle>تعديل الملف الشخصي</CardTitle>
                <CardDescription>قم بتحديث بياناتك لتسهيل التواصل معك من قبل المعلمين</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="fullname" className="text-xs font-bold text-muted-foreground mr-1">الاسم بالكامل</Label>
                    <div className="relative">
                      <User className="absolute right-3 top-3 h-4 w-4 text-primary/50" />
                      <Input 
                        id="fullname" 
                        value={fullName} 
                        onChange={(e) => setFullName(e.target.value)}
                        className="pr-10 focus-visible:ring-emerald-500"
                        placeholder="الاسم الثلاثي"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-xs font-bold text-muted-foreground mr-1">رقم الهاتف (واتساب)</Label>
                    <div className="relative">
                      <Phone className="absolute right-3 top-3 h-4 w-4 text-primary/50" />
                      <Input 
                        id="phone" 
                        value={phone} 
                        onChange={(e) => setPhone(e.target.value)}
                        className="pr-10 focus-visible:ring-emerald-500"
                        placeholder="01xxxxxxxxx"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-2xl flex gap-4 text-blue-900 leading-relaxed shadow-sm">
                  <Info className="h-6 w-6 text-blue-600 shrink-0" />
                  <div className="text-sm">
                    <p className="font-bold mb-1">بيانات الدراسة</p>
                    <p className="opacity-80">
                      يتم ضبط المرحلة والصف الدراسي عند التسجيل الأول وربطهما بالاشتراكات. لتعديلهما، يرجى التواصل مع الدعم الفني لضمان عدم فقدان صلاحيات الوصول لموادك.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button onClick={handleUpdateProfile} disabled={saving} className="w-full md:w-auto px-10 gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    حفظ التغييرات
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* تبويب الأمان */}
          <TabsContent value="security" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle>تغيير كلمة المرور</CardTitle>
                <CardDescription>تأكد من اختيار كلمة مرور قوية وغير مكررة في مواقع أخرى</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="newpass" className="text-xs font-bold text-muted-foreground mr-1">كلمة المرور الجديدة</Label>
                    <div className="relative">
                      <Lock className="absolute right-3 top-3 h-4 w-4 text-primary/50" />
                      <Input 
                        id="newpass" 
                        type="password" 
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="pr-10 focus-visible:ring-emerald-500"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmpass" className="text-xs font-bold text-muted-foreground mr-1">تأكيد كلمة المرور</Label>
                    <div className="relative">
                      <Lock className="absolute right-3 top-3 h-4 w-4 text-primary/50" />
                      <Input 
                        id="confirmpass" 
                        type="password" 
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pr-10 focus-visible:ring-emerald-500"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-2xl text-amber-900 text-sm flex gap-3 shadow-sm">
                  <ShieldCheck className="h-5 w-5 text-amber-600 shrink-0" />
                  <p>عند تغيير كلمة المرور، ستحتاج إلى تسجيل الدخول مرة أخرى من جميع أجهزتك لضمان حماية حسابك.</p>
                </div>

                <div className="flex justify-end pt-2">
                  <Button onClick={handleChangePassword} disabled={changingPass} variant="default" className="w-full md:w-auto px-10 gap-2">
                    {changingPass ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    تحديث كلمة المرور
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        <div className="text-center">
          <p className="text-xs text-muted-foreground">منصة أزهاريون التعليمية - كافة الحقوق محفوظة © 2026</p>
        </div>
      </main>
    </div>
  );
};

export default ProfileSettings;


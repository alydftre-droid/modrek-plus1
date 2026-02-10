import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { 
  User, Lock, Phone, Mail, Hash, GraduationCap, 
  Save, Loader2, ChevronLeft, ShieldCheck, 
  Bell, Smartphone, Globe, LogOut, CheckCircle2
} from "lucide-react";

const ProfileSettings = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [profile, setProfile] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user?.id)
        .single();
      if (data) {
        setProfile(data);
        setFullName(data.full_name || "");
        setPhone(data.phone || "");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, phone: phone })
      .eq("id", user?.id);
    
    if (!error) toast.success("تم تحديث البيانات بنجاح");
    else toast.error("حدث خطأ أثناء التحديث");
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) return toast.error("كلمات المرور غير متطابقة");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error) {
      toast.success("تم تغيير كلمة المرور");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30 pb-12" dir="rtl">
      <div className="bg-background border-b sticky top-0 z-10 shadow-sm">
        <div className="container h-16 flex items-center gap-4 px-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold text-primary">إعدادات الحساب</h1>
        </div>
      </div>

      <main className="container max-w-4xl pt-8 px-4 space-y-6">
        <Tabs defaultValue="account" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8 bg-background border">
            <TabsTrigger value="account" className="gap-2"><User size={16} /> الحساب</TabsTrigger>
            <TabsTrigger value="security" className="gap-2"><ShieldCheck size={16} /> الأمان</TabsTrigger>
            <TabsTrigger value="academic" className="gap-2"><GraduationCap size={16} /> الدراسة</TabsTrigger>
          </TabsList>

          <TabsContent value="account" className="space-y-6 animate-in fade-in duration-500">
            <Card className="border-none shadow-md">
              <CardHeader>
                <CardTitle>المعلومات الشخصية</CardTitle>
                <CardDescription>تحكم في بياناتك الأساسية التي تظهر في المنصة</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>الاسم بالكامل</Label>
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>رقم الهاتف</Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>البريد الإلكتروني</Label>
                  <Input value={user?.email} disabled className="bg-muted" />
                </div>
                <Button onClick={handleUpdate} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} />}
                  حفظ التعديلات
                </Button>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md">
              <CardHeader><CardTitle>تفضيلات الإشعارات</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>إشعارات الدروس الجديدة</Label>
                    <p className="text-xs text-muted-foreground">تنبيهك عند رفع محتوى جديد للمواد المشترك بها</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>إشعارات الدعم الفني</Label>
                    <p className="text-xs text-muted-foreground">تنبيهك عند الرد على استفساراتك</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-6 animate-in fade-in duration-500">
            <Card className="border-none shadow-md">
              <CardHeader><CardTitle>تغيير كلمة المرور</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>كلمة المرور الجديدة</Label>
                  <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>تأكيد كلمة المرور</Label>
                  <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                </div>
                <Button onClick={handleChangePassword} className="gap-2">تحديث الأمان</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="academic" className="animate-in fade-in duration-500">
            <Card className="border-none shadow-md bg-emerald-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CheckCircle2 className="text-emerald-600" /> الحالة الأكاديمية</CardTitle>
                <CardDescription>بياناتك الدراسية المسجلة حالياً في النظام</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="p-4 bg-background rounded-xl border">
                  <p className="text-xs text-muted-foreground mb-1">كود الطالب الخاص</p>
                  <p className="text-xl font-black text-primary">{profile?.student_code || "---"}</p>
                </div>
                <div className="p-4 bg-background rounded-xl border">
                  <p className="text-xs text-muted-foreground mb-1">المرحلة الدراسية</p>
                  <p className="font-bold">{profile?.stage === 'preparatory' ? 'الإعدادية' : 'الثانوية'}</p>
                </div>
                <div className="p-4 bg-background rounded-xl border">
                  <p className="text-xs text-muted-foreground mb-1">الصف الدراسي</p>
                  <p className="font-bold">{profile?.grade === 'first' ? 'الأول' : profile?.grade === 'second' ? 'الثاني' : 'الثالث'}</p>
                </div>
                {profile?.section && (
                  <div className="p-4 bg-background rounded-xl border">
                    <p className="text-xs text-muted-foreground mb-1">القسم / الشعبة</p>
                    <p className="font-bold">{profile.section === 'scientific' ? 'العلمي' : 'الأدبي'}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-center mt-12">
          <Button variant="outline" onClick={signOut} className="text-destructive gap-2 border-destructive/20 hover:bg-destructive/10">
            <LogOut size={16} /> تسجيل الخروج من كافة الأجهزة
          </Button>
        </div>
      </main>
    </div>
  );
};

export default ProfileSettings;



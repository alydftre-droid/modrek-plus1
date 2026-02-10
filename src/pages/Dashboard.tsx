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
  Bell, Smartphone, Globe, LogOut, CheckCircle2, UserCircle
} from "lucide-react";

/**
 * صفحة إعدادات الحساب الشاملة 2026
 * مصممة لتكون مركز تحكم كامل للطالب بأسلوب عصري
 */

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
  const [updatingPass, setUpdatingPass] = useState(false);

  useEffect(() => {
    if (user) fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    setLoading(true);
    const { data } = await supabase.from("profiles").select("*").eq("id", user?.id).single();
    if (data) {
      setProfile(data);
      setFullName(data.full_name || "");
      setPhone(data.phone || "");
    }
    setLoading(false);
  };

  const handleUpdateInfo = async () => {
    if (!fullName.trim()) return toast.error("الاسم مطلوب");
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName, phone }).eq("id", user?.id);
    if (!error) toast.success("تم تحديث البيانات");
    setSaving(false);
  };

  const handleUpdatePassword = async () => {
    if (newPassword !== confirmPassword) return toast.error("كلمات المرور غير متطابقة");
    setUpdatingPass(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error) {
      toast.success("تم تغيير كلمة المرور");
      setNewPassword("");
      setConfirmPassword("");
    }
    setUpdatingPass(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary h-12 w-12" /></div>;

  return (
    <div className="min-h-screen bg-muted/30 pb-12" dir="rtl">
      {/* Navbar الإعدادات */}
      <div className="bg-background border-b sticky top-0 z-50">
        <div className="container h-16 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <h1 className="text-xl font-bold text-primary">إعدادات الحساب</h1>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} className="text-destructive"><LogOut size={20} /></Button>
        </div>
      </div>

      <main className="container max-w-4xl pt-8 px-4 space-y-6">
        {/* بطاقة المستخدم العلوية */}
        <Card className="bg-gradient-to-r from-emerald-600 to-emerald-800 text-white border-none shadow-xl">
          <CardContent className="p-8 flex flex-col md:flex-row items-center gap-6">
            <div className="h-24 w-24 rounded-full bg-white/20 backdrop-blur flex items-center justify-center border-4 border-white/30">
               <UserCircle size={60} />
            </div>
            <div className="text-center md:text-right space-y-2">
              <h2 className="text-3xl font-bold">{profile?.full_name}</h2>
              <div className="flex flex-wrap justify-center md:justify-start gap-2">
                <span className="bg-white/10 px-3 py-1 rounded-full text-xs">كود: {profile?.student_code}</span>
                <span className="bg-white/10 px-3 py-1 rounded-full text-xs">
                  {profile?.stage === 'preparatory' ? 'إعدادي' : 'ثانوي'} - {profile?.grade === 'first' ? 'الأول' : profile?.grade === 'second' ? 'الثاني' : 'الثالث'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-background border mb-8 h-12">
            <TabsTrigger value="profile" className="gap-2"><User size={16} /> الملف الشخصي</TabsTrigger>
            <TabsTrigger value="security" className="gap-2"><Lock size={16} /> الأمان</TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2"><Bell size={16} /> الإشعارات</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <Card className="border-none shadow-md">
              <CardHeader><CardTitle>البيانات الأساسية</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>الاسم بالكامل</Label>
                    <Input value={fullName} onChange={e => setFullName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>رقم الهاتف</Label>
                    <Input value={phone} onChange={e => setPhone(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>البريد الإلكتروني (ثابت)</Label>
                  <Input value={user?.email} disabled className="bg-muted opacity-60" />
                </div>
                <Button onClick={handleUpdateInfo} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} />}
                  حفظ التعديلات
                </Button>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md bg-blue-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Globe size={18} className="text-blue-600" /> المنطقة الزمنية واللغة</CardTitle>
              </CardHeader>
              <CardContent className="flex justify-between items-center text-sm">
                 <p>اللغة الحالية: العربية</p>
                 <p>توقيت القاهرة (GMT +2)</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <Card className="border-none shadow-md">
              <CardHeader><CardTitle>تغيير كلمة المرور</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>كلمة المرور الجديدة</Label>
                  <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>تأكيد كلمة المرور</Label>
                  <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                </div>
                <Button onClick={handleUpdatePassword} disabled={updatingPass} className="gap-2">
                  {updatingPass ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck size={16} />}
                  تحديث كلمة المرور
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <Card className="border-none shadow-md">
              <CardHeader><CardTitle>تفضيلات الإشعارات</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>إشعارات الدروس الجديدة</Label>
                    <p className="text-xs text-muted-foreground">تنبيهك فور رفع محتوى جديد للمواد المشترك بها</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>إشعارات الدعم الفني</Label>
                    <p className="text-xs text-muted-foreground">تنبيهك عند الرد على استفسارك في صفحة الدعم</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default ProfileSettings;



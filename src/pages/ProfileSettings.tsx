import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  User, Lock, Phone, Save, Loader2, ChevronLeft, ShieldCheck, LogOut, UserCircle
} from "lucide-react";

/**
 * صفحة إعدادات الحساب - نسخة آمنة لا تسبب أخطاء
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

  useEffect(() => {
    if (user) fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    const { data } = await supabase.from("profiles").select("*").eq("id", user?.id).single();
    if (data) {
      setProfile(data);
      setFullName(data.full_name || "");
      setPhone(data.phone || "");
    }
    setLoading(false);
  };

  const handleUpdate = async () => {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName, phone }).eq("id", user?.id);
    if (!error) toast.success("تم تحديث البيانات");
    setSaving(false);
  };

  const handlePass = async () => {
    if (newPassword !== confirmPassword) return toast.error("كلمات المرور غير متطابقة");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error) {
      toast.success("تم تغيير كلمة المرور");
      setNewPassword(""); setConfirmPassword("");
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary h-10 w-10" /></div>;

  return (
    <div className="min-h-screen bg-muted/30 pb-12" dir="rtl">
      <div className="bg-background border-b sticky top-0 z-50">
        <div className="container h-16 flex items-center gap-4 px-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ChevronLeft className="h-6 w-6" /></Button>
          <h1 className="text-xl font-bold text-primary">إعدادات الحساب</h1>
        </div>
      </div>

      <main className="container max-w-4xl pt-8 px-4 space-y-6">
        <Card className="bg-emerald-700 text-white border-none shadow-xl">
          <CardContent className="p-8 flex items-center gap-6">
            <div className="h-20 w-20 rounded-full bg-white/20 flex items-center justify-center border-4 border-white/30"><UserCircle size={50} /></div>
            <div>
              <h2 className="text-2xl font-bold">{profile?.full_name}</h2>
              <p className="opacity-80 text-sm">كود الطالب: {profile?.student_code}</p>
              <p className="text-xs opacity-60">
                {profile?.stage === 'preparatory' ? 'إعدادي' : 'ثانوي'} - {profile?.grade === 'first' ? 'الأول' : profile?.grade === 'second' ? 'الثاني' : 'الثالث'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="info" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-background border mb-6">
            <TabsTrigger value="info">البيانات</TabsTrigger>
            <TabsTrigger value="pass">الأمان</TabsTrigger>
          </TabsList>

          <TabsContent value="info">
            <Card className="border-none shadow-md">
              <CardContent className="p-6 space-y-4">
                <div className="space-y-2">
                  <Label>الاسم بالكامل</Label>
                  <Input value={fullName} onChange={e => setFullName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>رقم الهاتف</Label>
                  <Input value={phone} onChange={e => setPhone(e.target.value)} />
                </div>
                <Button onClick={handleUpdate} disabled={saving} className="w-full md:w-auto">حفظ التغييرات</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pass">
            <Card className="border-none shadow-md">
              <CardContent className="p-6 space-y-4">
                <div className="space-y-2">
                  <Label>كلمة المرور الجديدة</Label>
                  <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>تأكيد كلمة المرور</Label>
                  <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                </div>
                <Button onClick={handlePass} className="w-full md:w-auto">تحديث كلمة المرور</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Button variant="outline" onClick={signOut} className="w-full text-destructive">تسجيل الخروج</Button>
      </main>
    </div>
  );
};

export default ProfileSettings;



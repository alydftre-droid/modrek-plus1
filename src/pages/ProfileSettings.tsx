// src/pages/ProfileSettings.tsx

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Loader2, User, Lock, LogOut, Moon, Bell, Save } from "lucide-react";
import { toast } from "sonner";

const ProfileSettings = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState(true);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!user) return;
    loadProfile();
  }, [user]);

  const loadProfile = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user?.id)
        .single();

      if (error) throw error;

      setFullName(data.full_name || "");
      setPhone(data.phone || "");
      setDarkMode(data.dark_mode || false);
      setNotifications(data.notifications_enabled ?? true);
    } catch (err) {
      console.error(err);
      toast.error("فشل تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!fullName.trim()) {
      toast.error("الاسم مطلوب");
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          phone: phone,
          dark_mode: darkMode,
          notifications_enabled: notifications,
        })
        .eq("id", user?.id);

      if (error) throw error;

      toast.success("تم حفظ التعديلات");
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء الحفظ");
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
      toast.error("كلمة المرور غير متطابقة");
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast.success("تم تغيير كلمة المرور بنجاح");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      console.error(err);
      toast.error("فشل تغيير كلمة المرور");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-10 px-4" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-8">

        <h1 className="text-2xl font-bold text-center">إعدادات الحساب</h1>

        <Tabs defaultValue="account" className="w-full">

          <TabsList className="grid grid-cols-2 mb-6">
            <TabsTrigger value="account">البيانات</TabsTrigger>
            <TabsTrigger value="security">الأمان</TabsTrigger>
          </TabsList>

          {/* بيانات الحساب */}
          <TabsContent value="account">
            <Card>
              <CardHeader>
                <CardTitle>الملف الشخصي</CardTitle>
                <CardDescription>
                  يمكنك تعديل بياناتك من هنا
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6">

                <div>
                  <Label>الاسم بالكامل</Label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>

                <div>
                  <Label>رقم الهاتف</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Moon size={18} /> الوضع الليلي
                  </span>
                  <Switch
                    checked={darkMode}
                    onCheckedChange={setDarkMode}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Bell size={18} /> تفعيل الإشعارات
                  </span>
                  <Switch
                    checked={notifications}
                    onCheckedChange={setNotifications}
                  />
                </div>

                <Button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="w-full"
                >
                  {saving ? <Loader2 className="animate-spin" /> : <Save />}
                  حفظ التعديلات
                </Button>

              </CardContent>
            </Card>
          </TabsContent>

          {/* الأمان */}
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>تغيير كلمة المرور</CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">

                <div>
                  <Label>كلمة المرور الجديدة</Label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>

                <div>
                  <Label>تأكيد كلمة المرور</Label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>

                <Button onClick={handleChangePassword} className="w-full">
                  تغيير كلمة المرور
                </Button>

                <Separator />

                <Button
                  variant="destructive"
                  onClick={() => {
                    signOut();
                    navigate("/");
                  }}
                  className="w-full"
                >
                  <LogOut size={16} />
                  تسجيل الخروج
                </Button>

              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>

      </div>
    </div>
  );
};

export default ProfileSettings;

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRight, Ban, Calendar, GraduationCap, Mail, Pencil, Phone, ShieldCheck } from "lucide-react";
import { TeacherOverviewTab } from "@/components/admin/developer/teacher/TeacherOverviewTab";
import { TeacherLogsTab } from "@/components/admin/developer/teacher/TeacherLogsTab";
import { TeacherCoursesTab } from "@/components/admin/developer/teacher/TeacherCoursesTab";
import { TeacherWalletTab } from "@/components/admin/developer/teacher/TeacherWalletTab";
import { TeacherWithdrawalsTab } from "@/components/admin/developer/teacher/TeacherWithdrawalsTab";
import { TeacherSecurityTab } from "@/components/admin/developer/teacher/TeacherSecurityTab";
import { TeacherEditProfileDialog } from "@/components/admin/developer/teacher/TeacherEditProfileDialog";
import { TeacherBanDialog } from "@/components/admin/developer/teacher/TeacherBanDialog";

const TABS = [
  { key: "overview",    label: "نظرة عامة" },
  { key: "wallet",      label: "المحفظة" },
  { key: "withdrawals", label: "السحوبات" },
  { key: "courses",     label: "الكورسات" },
  { key: "logs",        label: "السجلات" },
  { key: "security",    label: "الأمان" },
];

interface TeacherProfile {
  id: string;
  full_name: string | null;
  teacher_code: string | null;
  avatar_url: string | null;
  photo_url?: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
  is_banned: boolean | null;
  professional_title?: string | null;
  is_approved?: boolean | null;
}

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return "—";
  }
};

export default function DeveloperTeacherDetailPage() {
  const { teacherId } = useParams<{ teacherId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<string>("overview");
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    if (!teacherId) return;
    (async () => {
      setProfileLoading(true);
      const { data, error } = await supabase.rpc("get_developer_teacher_profile", { _teacher_id: teacherId });
      if (!error && data && typeof data === "object") {
        setProfile(data as unknown as TeacherProfile);
      } else {
        const fallback = await supabase
          .from("profiles")
          .select("id, full_name, teacher_code, avatar_url, email, phone, created_at, is_banned")
          .eq("id", teacherId)
          .maybeSingle();
        if (fallback.data) setProfile(fallback.data as TeacherProfile);
      }
      setProfileLoading(false);
    })();
  }, [teacherId]);

  if (!teacherId) return null;

  return (
    <div dir="rtl" className="tm-root min-h-screen">
      <div className="tm-container py-4 space-y-5">
        <button type="button" onClick={() => navigate(-1)} className="tm-back-btn">
          <ArrowRight className="h-4 w-4 rotate-180" /> رجوع
        </button>

        <div className="tm-profile-shell">
          <div className="tm-profile-banner" />
          <div className="tm-profile-body">
            <div className="tm-profile-avatar">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
              ) : (
                <GraduationCap className="h-10 w-10" />
              )}
            </div>

            <h1 className="tm-profile-name">{profileLoading ? "جاري التحميل..." : profile?.full_name || "معلم"}</h1>
            <p className="tm-profile-subtitle">{profile?.professional_title || "معلم في منصة مدرك Plus"}</p>

            <div className="tm-profile-meta">
              {profile?.teacher_code && <span className="tm-chip tm-chip--blue"># {profile.teacher_code}</span>}
              <span className={`tm-chip ${profile?.is_banned ? "tm-chip--red" : "tm-chip--green"}`}>
                {profile?.is_banned ? "محظور" : profile?.is_approved === false ? "بانتظار الاعتماد" : "نشط"}
              </span>
              <span className="tm-chip tm-chip--mint">
                <Calendar className="h-3 w-3" /> انضم في {formatDate(profile?.created_at)}
              </span>
            </div>

            <div className="tm-profile-contact">
              {profile?.email && <span><Mail className="h-3.5 w-3.5" /> {profile.email}</span>}
              {profile?.phone && <span><Phone className="h-3.5 w-3.5" /> {profile.phone}</span>}
            </div>

            <div className="tm-profile-actions">
              <button type="button" onClick={() => setTab("students")} className="tm-action-btn tm-action-btn--blue">
                <Users className="h-4 w-4" /> الطلاب
              </button>
              <button type="button" onClick={() => setTab("courses")} className="tm-action-btn tm-action-btn--purple">
                <BookOpen className="h-4 w-4" /> الكورسات
              </button>
              <button type="button" onClick={() => setTab("wallet")} className="tm-action-btn tm-action-btn--center tm-action-btn--green">
                <Wallet className="h-4 w-4" /> المحفظة
              </button>
            </div>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="w-full" dir="rtl">
          <TabsList className="tm-tabs-list">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="tm-tab">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <TeacherOverviewTab
              teacherId={teacherId}
              onOpenStudents={() => setTab("students")}
              onOpenSubs={() => setTab("subs")}
              onOpenCourses={() => setTab("courses")}
              onOpenWallet={() => setTab("wallet")}
            />
          </TabsContent>
          <TabsContent value="students" className="mt-4"><TeacherStudentsTab teacherId={teacherId} /></TabsContent>
          <TabsContent value="subs" className="mt-4"><TeacherSubscriptionsTab teacherId={teacherId} /></TabsContent>
          <TabsContent value="courses" className="mt-4"><TeacherCoursesTab teacherId={teacherId} /></TabsContent>
          <TabsContent value="wallet" className="mt-4"><TeacherWalletTab teacherId={teacherId} /></TabsContent>
          <TabsContent value="withdrawals" className="mt-4"><TeacherWithdrawalsTab teacherId={teacherId} /></TabsContent>
          <TabsContent value="logs" className="mt-4"><TeacherLogsTab teacherId={teacherId} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

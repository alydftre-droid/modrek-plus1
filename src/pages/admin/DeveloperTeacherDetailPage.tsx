import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRight, Ban, BookOpen, Calendar, GraduationCap, Mail, Pencil, Phone, ShieldCheck } from "lucide-react";
import { TeacherOverviewTab } from "@/components/admin/developer/teacher/TeacherOverviewTab";
import { TeacherLogsTab } from "@/components/admin/developer/teacher/TeacherLogsTab";
import { TeacherCoursesTab } from "@/components/admin/developer/teacher/TeacherCoursesTab";
import { TeacherWalletTab } from "@/components/admin/developer/teacher/TeacherWalletTab";
import { TeacherWithdrawalsTab } from "@/components/admin/developer/teacher/TeacherWithdrawalsTab";
import { TeacherSecurityTab } from "@/components/admin/developer/teacher/TeacherSecurityTab";
import { TeacherEditProfileDialog } from "@/components/admin/developer/teacher/TeacherEditProfileDialog";
import { TeacherBanDialog } from "@/components/admin/developer/teacher/TeacherBanDialog";
import { TeacherScopeDialog } from "@/components/admin/developer/teacher/TeacherScopeDialog";

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
  const [editOpen, setEditOpen] = useState(false);
  const [banOpen, setBanOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!teacherId) return;
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
  }, [teacherId]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  if (!teacherId) return null;
  const isBanned = !!profile?.is_banned;

  return (
    <div dir="rtl" className="tm-root min-h-screen">
      <div className="tm-container py-4 space-y-5">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => navigate(-1)} className="tm-back-btn">
            <ArrowRight className="h-4 w-4 rotate-180" /> رجوع
          </button>
          <button
            type="button"
            onClick={() => setScopeOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
          >
            <BookOpen className="h-3.5 w-3.5" /> إدارة المواد والصفوف
          </button>
        </div>

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
              <span className={`tm-chip ${isBanned ? "tm-chip--red" : "tm-chip--green"}`}>
                {isBanned ? "محظور" : profile?.is_approved === false ? "بانتظار الاعتماد" : "نشط"}
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
              <button type="button" onClick={() => setEditOpen(true)} className="tm-action-btn tm-action-btn--blue">
                <Pencil className="h-4 w-4" /> تعديل البيانات
              </button>
              <button type="button" onClick={() => setTab("security")} className="tm-action-btn tm-action-btn--purple">
                <ShieldCheck className="h-4 w-4" /> الأمان
              </button>
              <button
                type="button"
                onClick={() => setBanOpen(true)}
                className={`tm-action-btn tm-action-btn--center ${isBanned ? "tm-action-btn--green" : "tm-action-btn--red"}`}
              >
                {isBanned ? <ShieldCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                {isBanned ? "رفع الحظر عن المعلم" : "حظر المعلم"}
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
              onOpenStudents={() => setTab("overview")}
              onOpenSubs={() => setTab("overview")}
              onOpenCourses={() => setTab("courses")}
              onOpenWallet={() => setTab("wallet")}
            />
          </TabsContent>
          <TabsContent value="wallet" className="mt-4"><TeacherWalletTab teacherId={teacherId} /></TabsContent>
          <TabsContent value="withdrawals" className="mt-4"><TeacherWithdrawalsTab teacherId={teacherId} /></TabsContent>
          <TabsContent value="courses" className="mt-4"><TeacherCoursesTab teacherId={teacherId} /></TabsContent>
          <TabsContent value="logs" className="mt-4"><TeacherLogsTab teacherId={teacherId} /></TabsContent>
          <TabsContent value="security" className="mt-4"><TeacherSecurityTab teacherId={teacherId} /></TabsContent>
        </Tabs>

        <TeacherEditProfileDialog
          teacherId={teacherId}
          open={editOpen}
          onOpenChange={setEditOpen}
          onUpdated={loadProfile}
        />
        <TeacherScopeDialog
          teacherId={teacherId}
          teacherName={profile?.full_name}
          open={scopeOpen}
          onOpenChange={setScopeOpen}
          onSaved={loadProfile}
        />
        <TeacherBanDialog
          teacherId={teacherId}
          currentlyBanned={isBanned}
          open={banOpen}
          onOpenChange={setBanOpen}
          onDone={loadProfile}
        />
      </div>
    </div>
  );
}

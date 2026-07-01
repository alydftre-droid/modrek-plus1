import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowRight, GraduationCap, ExternalLink } from "lucide-react";
import { TeacherOverviewTab } from "@/components/admin/developer/teacher/TeacherOverviewTab";
import { TeacherStudentsTab } from "@/components/admin/developer/teacher/TeacherStudentsTab";
import { TeacherSubscriptionsTab } from "@/components/admin/developer/teacher/TeacherSubscriptionsTab";
import { TeacherLogsTab } from "@/components/admin/developer/teacher/TeacherLogsTab";
import { TeacherCoursesTab } from "@/components/admin/developer/teacher/TeacherCoursesTab";
import { TeacherWalletTab } from "@/components/admin/developer/teacher/TeacherWalletTab";
import { TeacherWithdrawalsTab } from "@/components/admin/developer/teacher/TeacherWithdrawalsTab";

const TABS = [
  { key: "overview",    label: "نظرة عامة" },
  { key: "students",    label: "الطلاب" },
  { key: "subs",        label: "الاشتراكات" },
  { key: "courses",     label: "الكورسات" },
  { key: "wallet",      label: "المحفظة" },
  { key: "withdrawals", label: "السحوبات" },
  { key: "logs",        label: "السجلات" },
];

export default function DeveloperTeacherDetailPage() {
  const { teacherId } = useParams<{ teacherId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<string>("overview");
  const [profile, setProfile] = useState<{ full_name: string; teacher_code: string | null; avatar_url: string | null; email: string | null } | null>(null);

  useEffect(() => {
    if (!teacherId) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, teacher_code, avatar_url, email")
        .eq("id", teacherId)
        .maybeSingle();
      if (data) setProfile(data as any);
    })();
  }, [teacherId]);

  if (!teacherId) return null;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="gap-1 h-9 border-slate-200">
              <ArrowRight className="h-4 w-4 rotate-180" /> رجوع
            </Button>
          </div>
        </div>

        {/* Teacher card */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="h-16 bg-gradient-to-l from-emerald-50 via-white to-slate-50" />
          <div className="px-4 pb-4 -mt-8">
            <div className="flex items-end gap-3">
              <div className="h-16 w-16 rounded-2xl bg-white ring-4 ring-white overflow-hidden shadow-sm flex items-center justify-center text-slate-500 shrink-0">
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                  : <GraduationCap className="h-7 w-7 text-emerald-600" />}
              </div>
              <div className="flex-1 min-w-0 pb-1">
                <h1 className="text-base font-bold text-slate-900 truncate">{profile?.full_name || "معلم"}</h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {profile?.teacher_code && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">#{profile.teacher_code}</span>
                  )}
                  {profile?.email && <span className="text-[11px] text-slate-500 truncate">{profile.email}</span>}
                </div>
              </div>
              <Button
                size="sm" variant="outline"
                className="h-8 gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                onClick={() => navigate(`/admin/developer/teacher/${teacherId}/students`)}
              >
                <ExternalLink className="h-3 w-3" /> قائمة الطلاب
              </Button>
            </div>
          </div>
        </div>

        {/* Underline tabs */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <div className="flex items-center min-w-max px-2">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`relative px-4 py-3 text-sm font-semibold transition ${active ? "text-emerald-700" : "text-slate-500 hover:text-slate-800"}`}
                >
                  {t.label}
                  {active && <span className="absolute bottom-0 right-2 left-2 h-0.5 rounded-full bg-emerald-600" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <div>
          {tab === "overview" && (
            <TeacherOverviewTab
              teacherId={teacherId}
              onOpenStudents={() => navigate(`/admin/developer/teacher/${teacherId}/students`)}
              onOpenSubs={() => setTab("subs")}
              onOpenCourses={() => setTab("courses")}
              onOpenWallet={() => setTab("wallet")}
            />
          )}
          {tab === "students"    && <TeacherStudentsTab teacherId={teacherId} />}
          {tab === "subs"        && <TeacherSubscriptionsTab teacherId={teacherId} />}
          {tab === "courses"     && <TeacherCoursesTab teacherId={teacherId} />}
          {tab === "wallet"      && <TeacherWalletTab teacherId={teacherId} />}
          {tab === "withdrawals" && <TeacherWithdrawalsTab teacherId={teacherId} />}
          {tab === "logs"        && <TeacherLogsTab teacherId={teacherId} />}
        </div>
      </div>
    </div>
  );
}

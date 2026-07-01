import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Eye, FileText, RefreshCw, Users, Video, Wallet, TrendingUp } from "lucide-react";

interface Props {
  teacherId: string;
  onOpenStudents: () => void;
  onOpenSubs?: () => void;
  onOpenCourses?: () => void;
  onOpenWallet?: () => void;
}

interface Overview {
  total_students: number;
  active_students_30d: number;
  active_subscriptions: number;
  courses_count: number;
  videos_count: number;
  pdfs_count: number;
  total_views: number;
  watch_hours: number;
  wallet: { balance: number; total_earned: number; frozen_balance: number };
}

export function TeacherOverviewTab({ teacherId, onOpenStudents, onOpenSubs, onOpenCourses, onOpenWallet }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dev-teacher-overview-v3", teacherId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_developer_teacher_overview", { _teacher_id: teacherId });
      if (error) throw error;
      return data as unknown as Overview;
    },
    refetchInterval: 30_000,
  });

  if (isError) {
    return (
      <div className="tm-panel">
        <div className="tm-panel-content text-center space-y-3">
          <h3 className="tm-section-title justify-center">تعذر تحميل نظرة عامة</h3>
          <button type="button" onClick={() => refetch()} className="tm-submit-btn px-6 inline-flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4" /> إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="tm-stats-grid">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-[18px] bg-white" />)}
      </div>
    );
  }

  const fmt = (v: number) => Number(v || 0).toLocaleString("ar-EG");
  const money = (v: number) => `${fmt(v)} ج`;

  return (
    <div className="space-y-4">
      <div className="tm-stats-grid">
        <Metric tone="blue" label="إجمالي الطلاب" value={fmt(data.total_students)} icon={<Users />} onClick={onOpenStudents} />
        <Metric tone="green" label="مشتركين فعّالين" value={fmt(data.active_subscriptions)} icon={<TrendingUp />} onClick={onOpenSubs} />
        <Metric tone="red" label="إجمالي المشاهدات" value={fmt(data.total_views)} icon={<Eye />} />
        <Metric tone="amber" label="عدد الكورسات" value={fmt(data.courses_count)} icon={<BookOpen />} onClick={onOpenCourses} />
        <Metric tone="purple" label="فيديوهات" value={fmt(data.videos_count)} icon={<Video />} onClick={onOpenCourses} />
        <Metric tone="orange" label="ملفات PDF" value={fmt(data.pdfs_count)} icon={<FileText />} onClick={onOpenCourses} />
      </div>

      <div className="tm-panel">
        <div className="tm-panel-content">
          <h4 className="tm-section-title">
            <Wallet className="h-4 w-4" /> ملخص المحفظة
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={onOpenWallet} className="tm-wallet-mini tm-wallet-mini--green text-right">
              <p>الرصيد الحالي</p>
              <strong>{money(data.wallet?.balance ?? 0)}</strong>
            </button>
            <button type="button" onClick={onOpenWallet} className="tm-wallet-mini tm-wallet-mini--blue text-right">
              <p>إجمالي الأرباح</p>
              <strong>{money(data.wallet?.total_earned ?? 0)}</strong>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({
  tone,
  label,
  value,
  icon,
  onClick,
}: {
  tone: "blue" | "green" | "red" | "amber" | "purple" | "orange";
  label: string;
  value: string;
  icon: ReactNode;
  onClick?: () => void;
}) {
  const Wrapper: any = onClick ? "button" : "div";
  return (
    <Wrapper type={onClick ? "button" : undefined} onClick={onClick} className="tm-stat-card text-right w-full" data-tone={tone}>
      <div className="tm-stat-content">
        <div className="tm-stat-icon">{icon}</div>
        <p className="tm-stat-label">{label}</p>
        <strong className="tm-stat-value tabular-nums">{value}</strong>
      </div>
    </Wrapper>
  );
}

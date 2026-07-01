import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "../shared/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, DollarSign, FileText, GraduationCap, PlayCircle, Users, Video, Wallet } from "lucide-react";

interface Props {
  teacherId: string;
  onOpenStudents: () => void;
}

interface Overview {
  total_students: number;
  active_students_30d: number;
  courses_count: number;
  videos_count: number;
  pdfs_count: number;
  total_views: number;
  wallet: { balance: number; total_earned: number; frozen_balance: number };
}

export function TeacherOverviewTab({ teacherId, onOpenStudents }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["dev-teacher-overview", teacherId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_developer_teacher_overview", { _teacher_id: teacherId });
      if (error) throw error;
      return data as unknown as Overview;
    },
    refetchInterval: 30_000,
  });

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
    );
  }

  const fmt = (v: number) => Number(v || 0).toLocaleString("ar-EG");
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      <StatCard
        label="إجمالي الطلاب"
        value={fmt(data.total_students)}
        icon={Users}
        accent="blue"
        hint="اضغط للتفاصيل"
        onClick={onOpenStudents}
      />
      <StatCard label="نشطون (30 يوم)" value={fmt(data.active_students_30d)} icon={GraduationCap} accent="green" />
      <StatCard label="عدد الكورسات" value={fmt(data.courses_count)} icon={BookOpen} accent="purple" />
      <StatCard label="عدد الفيديوهات" value={fmt(data.videos_count)} icon={Video} accent="amber" />
      <StatCard label="ملفات PDF" value={fmt(data.pdfs_count)} icon={FileText} accent="slate" />
      <StatCard label="إجمالي المشاهدات" value={fmt(data.total_views)} icon={PlayCircle} accent="blue" />
      <StatCard label="رصيد المحفظة" value={`${fmt(data.wallet?.balance ?? 0)} ج`} icon={Wallet} accent="green" />
      <StatCard label="إجمالي الأرباح" value={`${fmt(data.wallet?.total_earned ?? 0)} ج`} icon={DollarSign} accent="amber" hint={`مجمد: ${fmt(data.wallet?.frozen_balance ?? 0)}`} />
    </div>
  );
}

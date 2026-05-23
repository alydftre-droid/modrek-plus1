import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  GraduationCap,
  BookOpen,
  Video,
  FileText,
  Clock,
  TrendingUp,
  Bell,
} from "lucide-react";

interface Stats {
  totalStudents: number;
  totalTeachers: number;
  totalSubjects: number;
  totalVideos: number;
  totalBooks: number;
  pendingRequests: number;
}

interface AdminOverviewProps {
  stats: Stats;
  onNavigate: (tab: string) => void;
}

const AdminOverview = ({ stats, onNavigate }: AdminOverviewProps) => {
  const statCards = [
    {
      title: "الطلاب",
      value: stats.totalStudents,
      icon: Users,
      color: "bg-blue-500",
      tab: "students",
    },
    {
      title: "المعلمين",
      value: stats.totalTeachers,
      icon: GraduationCap,
      color: "bg-green-500",
      tab: "teacher-affairs",
      badge: stats.pendingRequests > 0 ? `${stats.pendingRequests} طلب جديد` : undefined,
    },
    {
      title: "المواد",
      value: stats.totalSubjects,
      icon: BookOpen,
      color: "bg-purple-500",
      tab: "subjects",
    },
    {
      title: "الفيديوهات",
      value: stats.totalVideos,
      icon: Video,
      color: "bg-orange-500",
      tab: "content",
    },
    {
      title: "الكتب",
      value: stats.totalBooks,
      icon: FileText,
      color: "bg-pink-500",
      tab: "content",
    },
    {
      title: "طلبات المعلمين",
      value: stats.pendingRequests,
      icon: Clock,
      color: "bg-yellow-500",
      tab: "teacher-affairs",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="gradient-mudrik rounded-2xl p-8 text-primary-foreground">
        <h1 className="text-3xl font-bold mb-2">مرحباً بك في لوحة التحكم</h1>
        <p className="text-primary-foreground/80">
          إدارة منصة مدرك Plus التعليمية - متابعة الطلاب والمحتوى والإعدادات
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat, index) => (
          <Card
            key={index}
            className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all group"
            onClick={() => onNavigate(stat.tab)}
          >
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{stat.title}</p>
                  <p className="text-4xl font-bold text-foreground">{stat.value}</p>
                  {stat.badge && (
                    <span className="inline-block mt-2 px-2 py-1 text-xs font-medium bg-destructive/10 text-destructive rounded-full">
                      {stat.badge}
                    </span>
                  )}
                </div>
                <div
                  className={`p-3 rounded-xl ${stat.color} group-hover:scale-110 transition-transform`}
                >
                  <stat.icon className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            إجراءات سريعة
          </CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <button
            onClick={() => onNavigate("content")}
            className="p-4 rounded-xl bg-accent hover:bg-accent/80 transition-colors text-right"
          >
            <Video className="h-8 w-8 text-primary mb-2" />
            <p className="font-medium text-foreground">رفع فيديو جديد</p>
            <p className="text-sm text-muted-foreground">إضافة محتوى تعليمي</p>
          </button>
          <button
            onClick={() => onNavigate("notifications")}
            className="p-4 rounded-xl bg-accent hover:bg-accent/80 transition-colors text-right"
          >
            <Bell className="h-8 w-8 text-primary mb-2" />
            <p className="font-medium text-foreground">إرسال إشعار</p>
            <p className="text-sm text-muted-foreground">تنبيه الطلاب</p>
          </button>
          <button
            onClick={() => onNavigate("subjects")}
            className="p-4 rounded-xl bg-accent hover:bg-accent/80 transition-colors text-right"
          >
            <BookOpen className="h-8 w-8 text-primary mb-2" />
            <p className="font-medium text-foreground">إضافة مادة</p>
            <p className="text-sm text-muted-foreground">مادة دراسية جديدة</p>
          </button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminOverview;

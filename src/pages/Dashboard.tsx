import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import NotificationsDropdown from "@/components/student/NotificationsDropdown";
import { toast } from "@/hooks/use-toast";
import {
  BookOpen,
  GraduationCap,
  User,
  Settings,
  LogOut,
  Clock,
  Video,
  Loader2,
  MessageSquare,
  Info,
  Bot,
} from "lucide-react";

interface ProfileData {
  full_name: string;
  student_code: string | null;
  stage: string | null;
  grade: string | null;
  section: string | null;
}

interface UsageStats {
  totalMinutes: number;
  lessonsWatched: number;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats>({
    totalMinutes: 0,
    lessonsWatched: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, student_code, stage, grade, section")
          .eq("id", user.id)
          .maybeSingle();

        if (profile) {
          setProfileData(profile);
        }

        const { data: usageLogs } = await supabase
          .from("usage_logs")
          .select("duration_minutes, action")
          .eq("user_id", user.id);

        if (usageLogs) {
          const totalMinutes = usageLogs.reduce(
            (sum, log) => sum + (log.duration_minutes || 0),
            0
          );
          const lessonsWatched = usageLogs.filter(
            (log) => log.action === "watch_video"
          ).length;

          setUsageStats({ totalMinutes, lessonsWatched });
        }
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const formatTime = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return { hours, minutes };
  };

  const time = formatTime(usageStats.totalMinutes);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <span className="font-bold">أزهاريون</span>
          </Link>

          <div className="flex items-center gap-2">
            <NotificationsDropdown />

            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/about-platform")}
            >
              <Info className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/support")}
            >
              <MessageSquare className="h-5 w-5" />
            </Button>

            {/* ✅ زر الإعدادات بعد الإصلاح */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/profile-settings")}
            >
              <Settings className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              className="hover:text-destructive"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold">
            أهلاً {profileData?.full_name || user?.email}
          </h1>
          <p className="text-muted-foreground">
            مرحبًا بك في لوحة الطالب
          </p>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6 flex items-center gap-4">
              <User className="h-6 w-6 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">
                  كود الطالب
                </p>
                <p className="font-bold">
                  {profileData?.student_code || "---"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 flex items-center gap-4">
              <Clock className="h-6 w-6 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">
                  وقت التعلم
                </p>
                <p className="font-bold">
                  {time.hours > 0 && `${time.hours} س `}
                  {time.minutes} د
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 flex items-center gap-4">
              <Video className="h-6 w-6 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">
                  الدروس المشاهدة
                </p>
                <p className="font-bold">
                  {usageStats.lessonsWatched} درس
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* AI Assistant */}
        <Card
          className="cursor-pointer hover:shadow-md transition"
          onClick={() => navigate("/ai-chat")}
        >
          <CardContent className="p-6 flex items-center gap-4">
            <Bot className="h-6 w-6 text-primary" />
            <div>
              <p className="font-semibold">المساعد الذكي</p>
              <p className="text-sm text-muted-foreground">
                اسأل عن أي درس أو مسألة
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Dashboard;

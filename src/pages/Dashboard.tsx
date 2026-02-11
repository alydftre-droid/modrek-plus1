import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import NotificationsDropdown from "@/components/student/NotificationsDropdown";
import {
  BookOpen,
  ChevronLeft,
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
  BookMarked,
  Beaker,
  Languages,
  BookText,
  Globe,
  Atom,
  Palette,
} from "lucide-react";

interface ProfileData {
  full_name: string;
  student_code: string | null;
  stage: string | null;
  grade: string | null;
  section: string | null;
}

const getCategoryButtons = (stage: string, section: string | null) => {
  if (stage === "preparatory") {
    return [
      { id: "arabic", name: "المواد العربية", icon: BookText, gradient: "from-emerald-500 via-emerald-600 to-teal-700", shadow: "shadow-emerald-500/30" },
      { id: "religious", name: "المواد الشرعية", icon: BookMarked, gradient: "from-amber-500 via-amber-600 to-orange-700", shadow: "shadow-amber-500/30" },
      { id: "science", name: "العلوم", icon: Beaker, gradient: "from-blue-500 via-blue-600 to-indigo-700", shadow: "shadow-blue-500/30" },
      { id: "social", name: "الدراسات", icon: Globe, gradient: "from-purple-500 via-purple-600 to-violet-700", shadow: "shadow-purple-500/30" },
      { id: "english", name: "الإنجليزية", icon: Languages, gradient: "from-rose-500 via-rose-600 to-pink-700", shadow: "shadow-rose-500/30" },
    ];
  }
  if (stage === "secondary") {
    const base = [
      { id: "arabic", name: "المواد العربية", icon: BookText, gradient: "from-emerald-500 via-emerald-600 to-teal-700", shadow: "shadow-emerald-500/30" },
      { id: "religious", name: "المواد الشرعية", icon: BookMarked, gradient: "from-amber-500 via-amber-600 to-orange-700", shadow: "shadow-amber-500/30" },
      { id: "english", name: "الإنجليزية", icon: Languages, gradient: "from-rose-500 via-rose-600 to-pink-700", shadow: "shadow-rose-500/30" },
    ];
    if (section === "scientific") {
      base.push({ id: "scientific", name: "المواد العلمية", icon: Atom, gradient: "from-cyan-500 via-cyan-600 to-blue-700", shadow: "shadow-cyan-500/30" });
    } else {
      base.push({ id: "literary", name: "المواد الأدبية", icon: Palette, gradient: "from-indigo-500 via-indigo-600 to-purple-700", shadow: "shadow-indigo-500/30" });
    }
    return base;
  }
  return [];
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState({ minutes: 0, lessons: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchAllData();
  }, [user]);

  const fetchAllData = async () => {
    try {
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user?.id).single();
      setProfile(prof);
      const { data: logs } = await supabase.from("usage_logs").select("*").eq("user_id", user?.id);
      if (logs) {
        setStats({
          minutes: logs.reduce((acc, curr) => acc + (curr.duration_minutes || 0), 0),
          lessons: logs.filter(l => l.action === "watch_video").length
        });
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary h-12 w-12" /></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20" dir="rtl">
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl px-4">
        <div className="container flex h-16 items-center justify-between max-w-full">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20"><BookOpen className="h-5 w-5 text-white" /></div>
            <span className="text-xl font-bold text-primary">أزهاريون</span>
          </Link>
          <div className="flex items-center gap-2">
            <NotificationsDropdown />
            <Button variant="ghost" size="icon" onClick={() => navigate("/profile-settings")}><Settings className="h-5 w-5" /></Button>
            <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-accent/50 border border-border/50">
              <User className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{profile?.full_name}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => signOut()} className="text-destructive"><LogOut className="h-5 w-5" /></Button>
          </div>
        </div>
      </header>

      <main className="container px-4 py-8 space-y-8">
        {/* شريط الإحصائيات الأصلي */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <Card className="border-0 bg-gradient-to-br from-primary to-primary/80 text-white shadow-xl shadow-primary/20">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-white/20"><User size={24} /></div>
              <div><p className="text-xs opacity-80">كود الطالب</p><p className="text-2xl font-bold">{profile?.student_code || "---"}</p></div>
            </CardContent>
          </Card>
          <Card className="border-0 bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-xl">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-white/20"><Clock size={24} /></div>
              <div><p className="text-xs opacity-80">وقت التعلم</p><p className="text-2xl font-bold">{Math.floor(stats.minutes/60)}س {stats.minutes%60}د</p></div>
            </CardContent>
          </Card>
          <Card className="border-0 bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-xl">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-white/20"><Video size={24} /></div>
              <div><p className="text-xs opacity-80">الدروس المنجزة</p><p className="text-2xl font-bold">{stats.lessons} درس</p></div>
            </CardContent>
          </Card>
        </div>

        {/* شبكة الأكشن */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
           <Card className="hover:border-primary transition-all cursor-pointer" onClick={() => navigate("/profile-settings")}>
              <CardContent className="p-4 flex flex-col items-center gap-2">
                 <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-600"><User size={24} /></div>
                 <span className="text-sm font-bold">الملف الشخصي</span>
              </CardContent>
           </Card>
           <Card className="hover:border-primary transition-all cursor-pointer" onClick={() => navigate("/ai-chat")}>
              <CardContent className="p-4 flex flex-col items-center gap-2">
                 <div className="p-3 rounded-2xl bg-violet-100 text-violet-600"><Bot size={24} /></div>
                 <span className="text-sm font-bold">المساعد الذكي</span>
              </CardContent>
           </Card>
           <Card className="hover:border-primary transition-all cursor-pointer" onClick={() => navigate("/support")}>
              <CardContent className="p-4 flex flex-col items-center gap-2">
                 <div className="p-3 rounded-2xl bg-blue-100 text-blue-600"><MessageSquare size={24} /></div>
                 <span className="text-sm font-bold">الدعم الفني</span>
              </CardContent>
           </Card>
           <Card className="hover:border-primary transition-all cursor-pointer" onClick={() => navigate("/about-platform")}>
              <CardContent className="p-4 flex flex-col items-center gap-2">
                 <div className="p-3 rounded-2xl bg-amber-100 text-amber-600"><Info size={24} /></div>
                 <span className="text-sm font-bold">عن أزهاريون</span>
              </CardContent>
           </Card>
        </div>

        {/* أقسام المواد */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold flex items-center gap-2 text-primary"><BookOpen /> أقسام المواد الدراسية</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {profile?.stage && getCategoryButtons(profile.stage, profile.section).map((cat) => (
              <Card 
                key={cat.id} 
                className={`cursor-pointer border-none bg-gradient-to-br ${cat.gradient} text-white shadow-lg hover:scale-105 transition-all group overflow-hidden`}
                onClick={() => navigate(`/subjects?category=${cat.id}&stage=${profile.stage}&grade=${profile.grade}${profile.section ? `&section=${profile.section}` : ""}`)}
              >
                <CardContent className="p-6 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center"><cat.icon size={32} /></div>
                  <h3 className="font-bold">{cat.name}</h3>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;



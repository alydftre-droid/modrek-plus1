import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen,
  Video,
  Bot,
  Users,
  GraduationCap,
  ChevronLeft,
  Sparkles,
  Shield,
  Zap,
  PlayCircle,
  ArrowLeft,
  Send,
  Trophy,
  Brain,
  Atom,
  CheckCircle2,
} from "lucide-react";

type StudentProfileRouteState = {
  education_type?: string | null;
  stage?: string | null;
  grade?: string | null;
  section?: string | null;
};

const DEVELOPER_EMAILS = new Set(["aliana200713@gmail.com", "alyedaft@gmail.com"]);
const isDeveloperAccount = (email?: string | null) => DEVELOPER_EMAILS.has(email?.trim().toLowerCase() ?? "");

const isStudentProfileComplete = (profile?: StudentProfileRouteState | null) => {
  if (!profile?.education_type || !profile?.stage || !profile?.grade) return false;
  const isSecondary = profile.stage === "secondary" || profile.grade.includes("ثانوي");
  if (!isSecondary) return true;
  if (!profile.section) return false;
  if (profile.education_type === "عام" && profile.section === "علمي") return false;
  return true;
};

const consumePostOAuthRedirect = () => {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem("post_oauth_redirect");
  if (!value) return null;
  window.sessionStorage.removeItem("post_oauth_redirect");
  return value;
};

const Index = () => {
  const navigate = useNavigate();
  const { user, role, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading || !user) return;
    const postOAuthRedirect = consumePostOAuthRedirect();
    if (postOAuthRedirect) { navigate(postOAuthRedirect, { replace: true }); return; }
    if (role === "admin" || isDeveloperAccount(user.email)) { navigate("/admin", { replace: true }); return; }
    if (role === "teacher") { navigate("/teacher", { replace: true }); return; }
    if (role === "student") {
      let cancelled = false;
      (async () => {
        const { data } = await supabase
          .from("profiles")
          .select("education_type, stage, grade, section")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;
        navigate(isStudentProfileComplete(data as StudentProfileRouteState | null) ? "/dashboard" : "/select-education-type", { replace: true });
      })();
      return () => { cancelled = true; };
    }
  }, [isLoading, navigate, role, user]);

  const features = [
    { icon: BookOpen, title: "كتب المناهج", description: "جميع كتب المناهج الأزهرية بصيغة PDF جاهزة للتحميل والمراجعة في أي وقت", tone: "emerald" },
    { icon: Video, title: "شروحات فيديو", description: "دروس مصورة عالية الجودة من أفضل المعلمين لشرح المناهج بطريقة مبسطة", tone: "sky" },
    { icon: Bot, title: "المساعد الذكي", description: "مساعد ذكي يجيب على أسئلتك من الكتب المرفوعة ويساعدك في فهم الدروس", tone: "gold" },
    { icon: Users, title: "دعم فني متواصل", description: "فريق دعم متخصص للرد على استفساراتك ومساعدتك في حل أي مشكلة", tone: "emerald" },
  ];

  const stages = [
    { title: "المرحلة الإعدادية", grades: ["الصف الأول", "الصف الثاني", "الصف الثالث"] },
    { title: "المرحلة الثانوية", grades: ["الصف الأول", "الصف الثاني", "الصف الثالث"], sections: ["علمي", "أدبي"] },
  ];

  const stats = [
    { value: "1000+", label: "طالب مسجل" },
    { value: "50+", label: "معلم متميز" },
    { value: "200+", label: "درس فيديو" },
    { value: "100+", label: "كتاب PDF" },
  ];

  const toneMap: Record<string, { bg: string; ring: string; text: string; grad: string }> = {
    emerald: { bg: "bg-emerald-50", ring: "ring-emerald-200/60", text: "text-emerald-700", grad: "from-emerald-500 to-emerald-600" },
    sky: { bg: "bg-sky-50", ring: "ring-sky-200/60", text: "text-sky-700", grad: "from-sky-500 to-sky-600" },
    gold: { bg: "bg-amber-50", ring: "ring-amber-200/60", text: "text-amber-700", grad: "from-amber-500 to-amber-600" },
  };

  return (
    <div dir="rtl" className="min-h-screen flex flex-col overflow-x-hidden bg-[#FBFAF6] text-slate-900">
      <Header />

      <main className="flex-1">
        {/* ============ HERO — Cinematic Ivory ============ */}
        <section className="relative overflow-hidden">
          {/* Ambient background */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-40 -right-40 h-[520px] w-[520px] rounded-full bg-emerald-300/25 blur-3xl" />
            <div className="absolute -top-24 -left-24 h-[420px] w-[420px] rounded-full bg-sky-300/25 blur-3xl" />
            <svg className="absolute inset-0 h-full w-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="42" height="42" patternUnits="userSpaceOnUse">
                  <path d="M42 0H0V42" fill="none" stroke="currentColor" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>

          <div className="container relative mx-auto px-4 pt-16 pb-24 lg:pt-24 lg:pb-32 max-w-7xl">
            <div className="grid lg:grid-cols-12 gap-10 items-center">
              {/* Text */}
              <div className="lg:col-span-7 text-center lg:text-right animate-fade-in">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/70 px-4 py-1.5 text-xs lg:text-sm text-emerald-800 backdrop-blur shadow-sm">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  <span>منصة تعليمية متكاملة · تعليم عام وأزهري · 2026</span>
                </div>

                <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black leading-[1.1] tracking-tight">
                  تعلّم بطريقة
                  <span className="block mt-2 bg-gradient-to-l from-emerald-600 via-teal-500 to-sky-600 bg-clip-text text-transparent">
                    أسهل وأذكى وأعمق
                  </span>
                </h1>

                <p className="mt-6 text-base lg:text-xl text-slate-600 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                  مدرك <span className="font-bold text-slate-900">Plus</span> يمنحك كل ما تحتاجه — مناهج، كتب، فيديوهات شرح، ومساعد ذكي يجيب من مصادرك مباشرة.
                </p>

                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3">
                  <Button
                    asChild
                    size="lg"
                    className="w-full sm:w-auto h-14 px-8 text-base font-bold rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-700 text-white border-b-4 border-emerald-800 hover:translate-y-[-1px] hover:shadow-xl hover:shadow-emerald-500/30 transition-all"
                  >
                    <Link to="/auth?mode=register" className="gap-2">
                      ابدأ رحلتك التعليمية
                      <ArrowLeft className="h-5 w-5" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="w-full sm:w-auto h-14 px-8 text-base font-semibold rounded-2xl bg-white/80 backdrop-blur border-2 border-slate-200 text-slate-800 hover:bg-white hover:border-slate-300"
                  >
                    <Link to="/about" className="gap-2">
                      <PlayCircle className="h-5 w-5 text-emerald-600" />
                      شاهد الجولة
                    </Link>
                  </Button>
                </div>

                {/* Trust row */}
                <div className="mt-10 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-3 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> بدون إعلانات</span>
                  <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> محتوى مراجَع</span>
                  <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> يعمل على كل الأجهزة</span>
                </div>
              </div>

              {/* Visual: floating glass cards + SVG */}
              <div className="lg:col-span-5 relative h-[420px] lg:h-[520px] animate-fade-in">
                <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-white to-emerald-50/60 border border-white shadow-2xl shadow-emerald-500/10 overflow-hidden">
                  {/* Decorative SVG */}
                  <svg viewBox="0 0 400 500" className="absolute inset-0 h-full w-full">
                    <defs>
                      <linearGradient id="g1" x1="0" x2="1">
                        <stop offset="0" stopColor="#10b981" stopOpacity="0.9" />
                        <stop offset="1" stopColor="#0ea5e9" stopOpacity="0.9" />
                      </linearGradient>
                    </defs>
                    <circle cx="320" cy="80" r="46" fill="url(#g1)" opacity="0.15" />
                    <circle cx="70" cy="420" r="70" fill="url(#g1)" opacity="0.12" />
                    <path d="M40 260 Q 200 180 380 300" stroke="url(#g1)" strokeWidth="2" fill="none" opacity="0.4" strokeDasharray="4 6" />
                  </svg>

                  {/* Floating cards */}
                  <div className="absolute top-8 right-8 w-56 rounded-2xl bg-white shadow-xl border border-slate-100 p-4 animate-float">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                        <Brain className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-slate-500">المساعد الذكي</div>
                        <div className="text-sm font-bold text-slate-900 truncate">اشرح لي درس الجاذبية</div>
                      </div>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full w-3/4 bg-gradient-to-l from-emerald-500 to-sky-500" />
                    </div>
                  </div>

                  <div className="absolute bottom-10 left-6 w-60 rounded-2xl bg-white shadow-xl border border-slate-100 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-slate-500">تقدمك اليوم</div>
                        <div className="text-2xl font-black text-slate-900 mt-1">87<span className="text-sm text-slate-400">%</span></div>
                      </div>
                      <div className="relative h-14 w-14">
                        <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#10b981" strokeWidth="3" strokeDasharray="87 100" strokeLinecap="round" />
                        </svg>
                        <Trophy className="absolute inset-0 m-auto h-5 w-5 text-amber-500" />
                      </div>
                    </div>
                  </div>

                  <div className="absolute top-1/2 -translate-y-1/2 left-8 w-16 h-16 rounded-2xl bg-white shadow-lg border border-slate-100 flex items-center justify-center animate-float" style={{ animationDelay: "0.6s" }}>
                    <Atom className="h-8 w-8 text-sky-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Stats bar */}
            <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6">
              {stats.map((s, i) => (
                <div key={i} className="rounded-2xl bg-white/80 backdrop-blur border border-white shadow-lg shadow-emerald-500/5 p-5 text-center hover:shadow-xl hover:shadow-emerald-500/10 transition-all">
                  <div className="text-2xl lg:text-4xl font-black bg-gradient-to-l from-emerald-600 to-sky-600 bg-clip-text text-transparent">{s.value}</div>
                  <div className="mt-1 text-xs lg:text-sm text-slate-600 font-medium">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ FEATURES — alternating tones ============ */}
        <section className="relative py-24 bg-white">
          <div className="container mx-auto px-4 max-w-7xl">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                المميزات
              </div>
              <h2 className="mt-4 text-3xl lg:text-5xl font-black tracking-tight">
                كل ما تحتاجه <span className="bg-gradient-to-l from-emerald-600 to-sky-600 bg-clip-text text-transparent">في مكان واحد</span>
              </h2>
              <p className="mt-4 text-slate-600 lg:text-lg">تجربة تعليمية متكاملة تجمع بين التقنية الحديثة والمنهج العريق.</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((f, i) => {
                const t = toneMap[f.tone];
                return (
                  <div
                    key={i}
                    className={`group relative rounded-3xl ${t.bg} p-7 ring-1 ${t.ring} hover:-translate-y-1 hover:shadow-xl transition-all duration-300 animate-scale-in`}
                    style={{ animationDelay: `${i * 0.08}s` }}
                  >
                    <div className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${t.grad} text-white shadow-lg group-hover:scale-110 transition-transform`}>
                      <f.icon className="h-7 w-7" />
                    </div>
                    <h3 className="mt-5 text-lg font-bold text-slate-900">{f.title}</h3>
                    <p className="mt-2 text-sm text-slate-600 leading-relaxed">{f.description}</p>
                    <div className={`mt-5 inline-flex items-center gap-1 text-xs font-semibold ${t.text} opacity-0 group-hover:opacity-100 transition-opacity`}>
                      اعرف المزيد <ChevronLeft className="h-3.5 w-3.5" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ============ STAGES ============ */}
        <section className="py-24 bg-[#FBFAF6]">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="text-center mb-14">
              <h2 className="text-3xl lg:text-5xl font-black tracking-tight">المراحل الدراسية</h2>
              <p className="mt-3 text-slate-600 lg:text-lg">اختر مرحلتك واستمتع بمحتوى غني ومتكامل.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              {stages.map((stage, i) => (
                <div
                  key={i}
                  className="group relative overflow-hidden rounded-3xl bg-white border border-slate-100 shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all"
                >
                  <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l from-emerald-500 via-teal-500 to-sky-500" />
                  <div className="p-8">
                    <div className="flex items-center gap-4">
                      <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-sky-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                        <GraduationCap className="h-7 w-7 text-white" />
                      </div>
                      <h3 className="text-2xl font-black text-slate-900">{stage.title}</h3>
                    </div>

                    <div className="mt-6 grid grid-cols-3 gap-2">
                      {stage.grades.map((g, k) => (
                        <div key={k} className="rounded-xl bg-slate-50 border border-slate-100 py-3 px-2 text-center text-sm font-semibold text-slate-700 hover:bg-emerald-50 hover:border-emerald-200 transition-colors">
                          {g}
                        </div>
                      ))}
                    </div>

                    {stage.sections && (
                      <div className="mt-4 flex gap-2">
                        {stage.sections.map((s, k) => (
                          <span key={k} className="px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}

                    <Button asChild className="mt-6 w-full h-12 rounded-xl bg-slate-900 text-white hover:bg-slate-800 border-b-4 border-slate-950">
                      <Link to="/auth?mode=register" className="gap-2 font-bold">
                        استكشف المحتوى <ArrowLeft className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ AI CHAT — Dark cinematic ============ */}
        <section className="relative py-24 bg-slate-950 text-white overflow-hidden">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute top-0 right-1/4 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="absolute bottom-0 left-1/4 h-80 w-80 rounded-full bg-sky-500/20 blur-3xl" />
          </div>

          <div className="container relative mx-auto px-4 max-w-6xl">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                  <Sparkles className="h-3.5 w-3.5" /> المساعد الذكي · مدعوم بـ Gemini
                </div>
                <h2 className="mt-5 text-3xl lg:text-5xl font-black leading-tight">
                  اسأل أي سؤال —
                  <span className="block bg-gradient-to-l from-emerald-400 to-sky-400 bg-clip-text text-transparent">تحصل على شرح فوري</span>
                </h2>
                <p className="mt-4 text-slate-300 lg:text-lg leading-relaxed">
                  مساعد ذكي يجيب من كتبك ومصادرك مباشرة، يشرح الدروس الصعبة، ويولّد أسئلة تدريبية على أي درس.
                </p>

                <div className="mt-8 space-y-3">
                  {["إجابات مبنية على مصادر معتمدة", "شرح صوتي بالعربية الفصحى", "توليد أسئلة تدريبية فورية"].map((t, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm text-slate-200">
                      <div className="h-6 w-6 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                      </div>
                      {t}
                    </div>
                  ))}
                </div>
              </div>

              {/* Chat card */}
              <div className="relative">
                <div className="rounded-3xl bg-white/[0.04] backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden">
                  <div className="flex items-center gap-2 px-5 py-4 border-b border-white/10">
                    <div className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                    <div className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                    <div className="mr-auto text-xs text-slate-400">مساعد مدرك · متصل</div>
                  </div>

                  <div className="p-5 space-y-4">
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-emerald-500/90 text-white px-4 py-3 text-sm shadow-lg">
                        اشرح لي قانون نيوتن الثاني بمثال بسيط 📚
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white/[0.06] border border-white/10 text-slate-100 px-4 py-3 text-sm leading-relaxed">
                        القانون الثاني لنيوتن: <span className="font-bold text-emerald-300">F = m × a</span>. مثال: عربة كتلتها 2 كجم ودُفعت بقوة 10 نيوتن → التسارع = 5 م/ث². هل تريد تمرين سريع؟
                        <div className="mt-3 flex gap-2 flex-wrap">
                          <span className="text-[11px] px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-400/20 text-emerald-300">درس 3 · فيزياء</span>
                          <span className="text-[11px] px-2 py-1 rounded-lg bg-sky-500/10 border border-sky-400/20 text-sky-300">مصدر: كتاب الوزارة</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-4 rounded-2xl bg-white/[0.06] border border-white/10 px-3 py-2">
                      <input readOnly placeholder="اكتب سؤالك هنا..." className="flex-1 bg-transparent text-sm placeholder:text-slate-500 focus:outline-none" />
                      <button className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-sky-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                        <Send className="h-4 w-4 text-white rotate-180" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="absolute -top-4 -left-4 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 p-3 shadow-xl rotate-[-6deg]">
                  <Sparkles className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ VIDEO / TRUST ============ */}
        <section className="py-24 bg-white">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="grid lg:grid-cols-2 gap-14 items-center">
              <div className="order-2 lg:order-1">
                <div className="relative rounded-3xl overflow-hidden aspect-video bg-gradient-to-br from-slate-900 to-slate-700 shadow-2xl ring-1 ring-slate-200">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.35),transparent_60%)]" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <button className="group relative h-20 w-20 rounded-full bg-white/95 flex items-center justify-center shadow-2xl hover:scale-110 transition-transform">
                      <span className="absolute inset-0 rounded-full bg-white/40 animate-ping" />
                      <PlayCircle className="h-10 w-10 text-emerald-600" />
                    </button>
                  </div>
                  <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 rounded-full bg-white/20 overflow-hidden">
                        <div className="h-full w-1/3 bg-emerald-400 rounded-full" />
                      </div>
                      <span className="text-xs text-white/80 font-mono">02:14 / 06:32</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="order-1 lg:order-2">
                <h2 className="text-3xl lg:text-5xl font-black tracking-tight">
                  منصة <span className="bg-gradient-to-l from-amber-500 to-amber-700 bg-clip-text text-transparent">آمنة</span> وموثوقة
                </h2>
                <p className="mt-4 text-slate-600 lg:text-lg leading-relaxed">
                  بيئة تعليمية آمنة. محتوى مراجَع من معلمين معتمدين، وأداء سريع على كل الأجهزة.
                </p>

                <div className="mt-8 space-y-4">
                  {[
                    { icon: Shield, title: "حماية البيانات", desc: "بياناتك محمية بأعلى معايير الأمان" },
                    { icon: Users, title: "معلمون معتمدون", desc: "جميع المعلمين يمرّون بمراجعة وموافقة" },
                    { icon: Zap, title: "أداء سريع", desc: "تجربة سلسة وسريعة على كل جهاز" },
                  ].map((it, i) => (
                    <div key={i} className="flex items-start gap-4 rounded-2xl bg-slate-50 border border-slate-100 p-4 hover:bg-white hover:border-emerald-100 hover:shadow-md transition-all">
                      <div className="h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md">
                        <it.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900">{it.title}</h4>
                        <p className="text-sm text-slate-600 mt-0.5">{it.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ CTA — Dark premium ============ */}
        <section className="relative py-24 bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900 overflow-hidden">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.35),transparent_50%)]" />
            <svg className="absolute inset-0 h-full w-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
                  <circle cx="1.5" cy="1.5" r="1.5" fill="white" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#dots)" />
            </svg>
          </div>

          <div className="container relative mx-auto px-4 max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs font-semibold text-emerald-300">
              <Trophy className="h-3.5 w-3.5" /> انضم لآلاف الطلاب المتفوقين
            </div>
            <h2 className="mt-6 text-4xl lg:text-6xl font-black text-white leading-tight">
              جاهز لبدء رحلتك <span className="bg-gradient-to-l from-emerald-400 to-sky-400 bg-clip-text text-transparent">التعليمية؟</span>
            </h2>
            <p className="mt-5 text-slate-300 lg:text-lg max-w-2xl mx-auto">
              ابدأ اليوم مجانًا. لا بطاقة ائتمان مطلوبة، إلغاء في أي وقت.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button asChild size="lg" className="h-14 px-8 rounded-2xl bg-gradient-to-b from-emerald-400 to-emerald-600 text-white text-base font-bold border-b-4 border-emerald-800 hover:shadow-2xl hover:shadow-emerald-500/40 transition-all">
                <Link to="/auth?mode=register" className="gap-2">
                  سجّل الآن مجانًا <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost" className="h-14 px-8 rounded-2xl text-white hover:bg-white/10">
                <Link to="/about" className="gap-2">تعرّف على المنصة</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Index;

import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen, Video, Bot, Headphones, GraduationCap, ChevronLeft, Sparkles,
  Shield, Zap, PlayCircle, ArrowLeft, Send, Trophy, Brain, Atom,
  CheckCircle2, Rocket, Star, Target, Award, Globe, Lightbulb, MessageCircle,
  Users, BookMarked, FileText, MousePointer2,
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

/* ---------- Animated counter ---------- */
function useCountUp(target: number, duration = 1600, start = true) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start]);
  return n;
}

function StatMini({ icon: Icon, value, label, tone }: { icon: any; value: number; label: string; tone: "emerald" | "sky" | "violet" | "amber" }) {
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(el); return () => io.disconnect();
  }, []);
  const n = useCountUp(value, 1500, inView);
  const tones: Record<string, string> = {
    emerald: "text-emerald-600 bg-emerald-50",
    sky: "text-sky-600 bg-sky-50",
    violet: "text-violet-600 bg-violet-50",
    amber: "text-amber-600 bg-amber-50",
  };
  return (
    <div ref={ref} className="rounded-2xl bg-white/70 backdrop-blur-md border border-white shadow-[0_8px_30px_-12px_rgba(15,23,42,0.15)] p-4 flex items-center gap-3">
      <div className={`h-11 w-11 rounded-xl ${tones[tone]} flex items-center justify-center shrink-0`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-black text-slate-900 tabular-nums leading-none">+{n.toLocaleString("en")}</div>
        <div className="text-[11px] text-slate-500 mt-1 font-semibold">{label}</div>
      </div>
    </div>
  );
}

/* ---------- Hero visual: laptop + robot (matches reference) ---------- */
function HeroLaptopScene() {
  return (
    <div className="relative w-full h-full">
      {/* soft glow */}
      <div className="absolute inset-0 bg-gradient-radial from-emerald-200/40 via-sky-100/30 to-transparent blur-2xl" />
      {/* decorative molecules / DNA */}
      <svg viewBox="0 0 500 500" className="absolute inset-0 w-full h-full opacity-40" aria-hidden>
        <g stroke="#94a3b8" strokeWidth="1" fill="none">
          <circle cx="70" cy="90" r="4" fill="#cbd5e1" />
          <circle cx="120" cy="60" r="3" fill="#cbd5e1" />
          <line x1="70" y1="90" x2="120" y2="60" />
          <circle cx="430" cy="120" r="5" fill="#a7f3d0" />
          <circle cx="470" cy="180" r="3" fill="#bae6fd" />
          <line x1="430" y1="120" x2="470" y2="180" />
          <path d="M60,220 Q80,240 60,260 Q40,280 60,300 Q80,320 60,340" />
          <path d="M90,220 Q70,240 90,260 Q110,280 90,300 Q70,320 90,340" />
        </g>
      </svg>

      {/* Laptop */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-[92%] max-w-[520px] animate-float-y" style={{ animationDuration: "6s" }}>
          {/* screen */}
          <div className="relative rounded-t-2xl bg-slate-900 p-3 pb-4 shadow-2xl border-4 border-slate-800">
            <div className="rounded-lg bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950/60 aspect-[16/10] p-4 overflow-hidden">
              {/* mock UI */}
              <div className="flex items-center gap-1.5 mb-3">
                <span className="h-2 w-2 rounded-full bg-rose-400" />
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="mr-auto text-[9px] text-white/40 font-mono">مدرك Plus</span>
              </div>
              <div className="text-[10px] text-emerald-300 font-bold mb-2">مرحبا بك في مدرك Plus</div>
              <div className="h-1.5 w-2/3 rounded-full bg-emerald-500/70 mb-3" />
              <div className="grid grid-cols-3 gap-1.5">
                {[0,1,2].map(i => (
                  <div key={i} className="rounded-md bg-white/5 border border-white/10 p-1.5">
                    <div className="h-4 w-4 rounded bg-gradient-to-br from-emerald-400 to-sky-400 mb-1" />
                    <div className="h-1 w-full bg-white/20 rounded" />
                    <div className="h-1 w-3/4 bg-white/10 rounded mt-1" />
                  </div>
                ))}
              </div>
              <div className="mt-2 inline-flex text-[8px] rounded bg-emerald-500 text-white px-2 py-0.5 font-bold">استكشف</div>
            </div>
          </div>
          {/* base */}
          <div className="h-3 rounded-b-2xl bg-gradient-to-b from-slate-300 to-slate-400 shadow-lg" />
          <div className="mx-auto h-1 w-1/3 rounded-b-lg bg-slate-400/70" />
        </div>
      </div>

      {/* Cute robot mascot floating out of laptop */}
      <div className="absolute top-4 right-6 sm:right-10 w-[130px] sm:w-[170px] animate-float-y" style={{ animationDuration: "4.5s", animationDelay: "0.3s" }}>
        <svg viewBox="0 0 200 220" className="w-full h-full drop-shadow-2xl">
          <defs>
            <linearGradient id="botBody" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#e2e8f0" /><stop offset="1" stopColor="#94a3b8" />
            </linearGradient>
            <linearGradient id="botFace" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#0f172a" /><stop offset="1" stopColor="#1e293b" />
            </linearGradient>
          </defs>
          {/* antenna */}
          <line x1="100" y1="40" x2="100" y2="18" stroke="#64748b" strokeWidth="3" />
          <circle cx="100" cy="14" r="6" fill="#10b981">
            <animate attributeName="opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite" />
          </circle>
          {/* head */}
          <rect x="40" y="40" width="120" height="110" rx="30" fill="url(#botBody)" stroke="#cbd5e1" strokeWidth="2" />
          {/* face screen */}
          <rect x="55" y="60" width="90" height="70" rx="18" fill="url(#botFace)" />
          {/* eyes */}
          <circle cx="80" cy="92" r="8" fill="#22d3ee" />
          <circle cx="120" cy="92" r="8" fill="#22d3ee" />
          <circle cx="82" cy="90" r="2.5" fill="#fff" />
          <circle cx="122" cy="90" r="2.5" fill="#fff" />
          {/* smile */}
          <path d="M82 110 Q100 122 118 110" stroke="#22d3ee" strokeWidth="3" fill="none" strokeLinecap="round" />
          {/* body/collar */}
          <rect x="60" y="150" width="80" height="30" rx="14" fill="#cbd5e1" />
          <circle cx="85" cy="165" r="4" fill="#10b981" />
          <circle cx="115" cy="165" r="4" fill="#0ea5e9" />
        </svg>
      </div>

      {/* Floating small decorations */}
      <div className="absolute bottom-8 left-4 h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-400 to-fuchsia-500 shadow-xl rotate-12 animate-float-y flex items-center justify-center" style={{ animationDelay: "1s" }}>
        <BookOpen className="h-8 w-8 text-white" />
      </div>
      <div className="absolute top-1/2 left-2 h-10 w-10 rounded-full bg-emerald-500 shadow-lg animate-float-y opacity-80" style={{ animationDelay: "2s" }} />
      <div className="absolute -bottom-2 right-10 text-3xl animate-float-y" style={{ animationDelay: "0.6s" }}>⚛️</div>
    </div>
  );
}

/* ---------- Page ---------- */
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
        const { data } = await supabase.from("profiles").select("education_type, stage, grade, section").eq("id", user.id).maybeSingle();
        if (cancelled) return;
        navigate(isStudentProfileComplete(data as StudentProfileRouteState | null) ? "/dashboard" : "/select-education-type", { replace: true });
      })();
      return () => { cancelled = true; };
    }
  }, [isLoading, navigate, role, user]);

  // Same data content as previous
  const features = [
    { icon: BookMarked, title: "كتب المناهج", description: "جميع كتب المناهج الأزهرية والعامة بصيغة PDF جاهزة للتحميل والمراجعة في أي وقت.", accent: "text-emerald-400 bg-emerald-500/10" },
    { icon: Video, title: "شروحات فيديو", description: "دروس مصورة عالية الجودة من أفضل المعلمين لشرح المناهج بطريقة مبسطة.", accent: "text-sky-400 bg-sky-500/10" },
    { icon: Bot, title: "المساعد الذكي", description: "مساعد ذكي يجيب على أسئلتك من الكتب والمناهج ويساعدك في فهم الدروس.", accent: "text-violet-400 bg-violet-500/10" },
    { icon: Headphones, title: "دعم فني متواصل", description: "فريق دعم متخصص للرد على استفساراتك ومساعدتك في حل أي مشكلة.", accent: "text-amber-400 bg-amber-500/10" },
  ];

  const stages = [
    { title: "المرحلة الإعدادية", grades: ["الصف الأول الإعدادي", "الصف الثاني الإعدادي", "الصف الثالث الإعدادي"], grad: "from-violet-500 to-fuchsia-600", cta: "from-violet-600 to-fuchsia-600" },
    { title: "المرحلة الثانوية", grades: ["الصف الأول الثانوي", "الصف الثاني الثانوي", "الصف الثالث الثانوي"], sections: ["علمي", "أدبي"], grad: "from-emerald-500 to-teal-600", cta: "from-emerald-600 to-teal-600" },
  ];

  const aiFeatures = [
    { icon: Zap, title: "إجابات فورية", text: "يجيب على أسئلتك في أي وقت" },
    { icon: FileText, title: "حل الواجبات", text: "يساعدك في حل الواجبات بخطوات مفصلة" },
    { icon: Lightbulb, title: "شرح مبسط", text: "يشرح الدروس بطرق مختلفة" },
    { icon: Target, title: "اختبارات ذكية", text: "يولّد اختبارات تفاعلية لك" },
  ];

  return (
    <div dir="rtl" className="min-h-screen flex flex-col overflow-x-hidden bg-[#F7F9FC] text-slate-900 selection:bg-emerald-200 selection:text-emerald-950">
      <Header />

      <main className="flex-1">
        {/* ============ HERO (light) ============ */}
        <section className="relative overflow-hidden pt-8 pb-16 lg:pt-16 lg:pb-24 bg-gradient-to-b from-white via-[#FAFCFF] to-[#F1F5FB]">
          {/* soft ambient blobs */}
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-40 -right-40 h-[520px] w-[520px] rounded-full bg-emerald-200/40 blur-3xl" />
            <div className="absolute -bottom-40 -left-40 h-[520px] w-[520px] rounded-full bg-sky-200/40 blur-3xl" />
            <svg className="absolute inset-0 h-full w-full opacity-[0.05] text-slate-900">
              <defs>
                <pattern id="hg" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M40 0H0V40" fill="none" stroke="currentColor" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#hg)" />
            </svg>
          </div>

          <div className="container relative mx-auto px-4 max-w-7xl">
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">
              {/* Visual (left on RTL desktop = laptop scene) */}
              <div className="order-2 lg:order-1 relative h-[380px] sm:h-[440px] lg:h-[520px]">
                <HeroLaptopScene />
              </div>

              {/* Text side */}
              <div className="order-1 lg:order-2 text-center lg:text-right">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-xs lg:text-sm text-emerald-800 backdrop-blur-xl shadow-sm">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
                  </span>
                  الجيل الجديد من التعليم الرقمي · إصدار 2026
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                </div>

                <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.1] tracking-tight text-slate-900">
                  منصة تعليمية
                  <span className="mx-2 bg-gradient-to-l from-emerald-500 to-teal-600 bg-clip-text text-transparent">متكاملة</span>
                  <br />
                  للتعليم العام والأزهري
                </h1>

                <p className="mt-6 text-base lg:text-lg text-slate-600 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                  <span className="font-bold text-slate-900">مدرك Plus</span> — نوفر لك كل ما تحتاج من كتب ومناهج وشروحات فيديو ومساعد ذكي يجيب على أسئلتك ويساعدك على فهم دروسك.
                </p>

                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3">
                  <Button asChild size="lg" className="group w-full sm:w-auto h-14 px-8 text-base font-bold rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 text-white border-b-4 border-emerald-800 hover:translate-y-[-2px] hover:shadow-2xl hover:shadow-emerald-500/40 transition-all">
                    <Link to="/auth?mode=register" className="gap-2">
                      ابدأ رحلتك التعليمية
                      <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="w-full sm:w-auto h-14 px-8 text-base font-semibold rounded-2xl bg-white border-2 border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300">
                    <Link to="/about" className="gap-2">
                      <PlayCircle className="h-5 w-5 text-emerald-600" />
                      اعرف المزيد
                    </Link>
                  </Button>
                </div>

                <div className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> بدون إعلانات</span>
                  <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> محتوى مراجَع</span>
                  <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> دعم 24/7</span>
                </div>
              </div>
            </div>

            {/* Stats mini bar */}
            <div className="mt-12 lg:mt-16 grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4">
              <StatMini icon={Users} value={1000} label="طالب مسجل" tone="emerald" />
              <StatMini icon={GraduationCap} value={50} label="معلم متخصص" tone="sky" />
              <StatMini icon={PlayCircle} value={200} label="درس متاح" tone="violet" />
              <StatMini icon={FileText} value={1000} label="ملف تعليمي" tone="amber" />
            </div>

            {/* Scroll hint */}
            <div className="mt-10 flex justify-center">
              <div className="inline-flex items-center gap-2 text-xs text-slate-400">
                <MousePointer2 className="h-3.5 w-3.5" />
                اسحب للأسفل
              </div>
            </div>
          </div>
        </section>

        {/* ============ WHY MUDRIK (dark) ============ */}
        <section className="relative py-20 lg:py-24 bg-slate-950 text-white overflow-hidden">
          <div aria-hidden className="absolute inset-0">
            <div className="absolute inset-0 opacity-[0.08]" style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,1) 1px, transparent 0)",
              backgroundSize: "22px 22px",
            }} />
            <div className="absolute top-10 right-10 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="absolute bottom-10 left-10 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" />
          </div>

          <div className="container relative mx-auto px-4 max-w-7xl">
            <div className="text-center mb-14">
              <h2 className="text-3xl lg:text-5xl font-black tracking-tight">
                لماذا <span className="bg-gradient-to-l from-emerald-400 to-teal-300 bg-clip-text text-transparent">مدرك Plus</span> ؟
              </h2>
              <p className="mt-4 text-white/60 lg:text-lg max-w-2xl mx-auto">
                نقدم لك تجربة تعليمية متكاملة تجمع بين التقنية الحديثة والمنهج الأزهري والعام
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {features.map((f, i) => (
                <div key={i} className="group relative rounded-3xl bg-white p-6 text-slate-900 hover:-translate-y-2 transition-all duration-500 shadow-xl">
                  <div className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl ${f.accent} group-hover:scale-110 transition-transform`}>
                    <f.icon className="h-7 w-7" />
                  </div>
                  <h3 className="mt-5 text-lg font-extrabold text-slate-900">{f.title}</h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">{f.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ STAGES (dark) ============ */}
        <section className="relative py-20 lg:py-24 bg-gradient-to-b from-slate-950 to-slate-900 text-white overflow-hidden">
          <div aria-hidden className="absolute inset-0 opacity-[0.05]" style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,1) 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }} />

          <div className="container relative mx-auto px-4 max-w-6xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-5xl font-black tracking-tight">المراحل الدراسية</h2>
              <p className="mt-4 text-white/60 lg:text-lg">اختر مرحلتك الدراسية واستمتع بمحتوى تعليمي غني ومتكامل</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {stages.map((stage, i) => (
                <div key={i} className="group relative overflow-hidden rounded-3xl bg-white/[0.04] border border-white/10 backdrop-blur-xl p-7 hover:bg-white/[0.06] transition">
                  <div className={`absolute -top-24 -left-24 h-56 w-56 rounded-full bg-gradient-to-br ${stage.grad} opacity-20 blur-3xl`} />

                  <div className="relative flex items-center gap-3 mb-6">
                    <div className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${stage.grad} flex items-center justify-center shadow-lg`}>
                      <GraduationCap className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="text-2xl font-black">{stage.title}</h3>
                  </div>

                  <ul className="relative space-y-2.5">
                    {stage.grades.map((g, k) => (
                      <li key={k} className="flex items-center gap-2 rounded-xl bg-white/[0.03] border border-white/10 px-4 py-2.5 text-sm text-white/85 hover:bg-white/[0.07] transition">
                        <ArrowLeft className="h-4 w-4 text-emerald-400" />
                        {g}
                      </li>
                    ))}
                  </ul>

                  {stage.sections && (
                    <div className="relative mt-4 flex gap-2">
                      {stage.sections.map((s, k) => (
                        <span key={k} className="px-4 py-1.5 rounded-full bg-white/5 border border-white/15 text-white/90 text-xs font-bold">{s}</span>
                      ))}
                    </div>
                  )}

                  <Button asChild className={`relative mt-6 w-full h-12 rounded-xl bg-gradient-to-l ${stage.cta} text-white border-0 hover:opacity-95 shadow-lg font-bold`}>
                    <Link to="/auth?mode=register" className="gap-2">
                      استكشف المحتوى
                      <ArrowLeft className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ AI ASSISTANT (dark hero) ============ */}
        <section className="relative py-20 lg:py-24 bg-gradient-to-br from-[#0b1220] via-[#0e1730] to-[#1a0f2e] text-white overflow-hidden">
          <div aria-hidden className="absolute inset-0">
            <div className="absolute top-10 right-10 h-96 w-96 rounded-full bg-violet-500/25 blur-3xl animate-blob" />
            <div className="absolute bottom-10 left-10 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl animate-blob" style={{ animationDelay: "3s" }} />
          </div>

          <div className="container relative mx-auto px-4 max-w-7xl">
            <div className="text-center mb-10">
              <div className="mx-auto h-20 w-20 rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-2xl shadow-violet-500/30 mb-4">
                <Brain className="h-10 w-10 text-white" />
              </div>
              <h2 className="text-3xl lg:text-5xl font-black">
                <span className="bg-gradient-to-l from-violet-300 via-fuchsia-300 to-sky-300 bg-clip-text text-transparent">المساعد الذكي</span>
              </h2>
              <p className="mt-3 text-white/70 lg:text-lg">رفيقك الذكي في رحلة التعلم</p>
            </div>

            <div className="grid lg:grid-cols-2 gap-8 items-center">
              {/* Features grid */}
              <div className="grid grid-cols-2 gap-4">
                {aiFeatures.map((f, i) => (
                  <div key={i} className="rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur p-5 text-center hover:bg-white/[0.08] transition">
                    <div className="mx-auto h-11 w-11 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-white/10 flex items-center justify-center mb-3">
                      <f.icon className="h-5 w-5 text-violet-300" />
                    </div>
                    <div className="font-bold text-sm">{f.title}</div>
                    <div className="mt-1 text-[11px] text-white/60 leading-relaxed">{f.text}</div>
                  </div>
                ))}
                <div className="col-span-2">
                  <Button asChild size="lg" className="w-full h-13 rounded-2xl bg-gradient-to-l from-violet-600 to-fuchsia-600 border-b-4 border-violet-900 hover:-translate-y-0.5 transition font-bold">
                    <Link to="/auth?mode=register" className="gap-2">
                      <Sparkles className="h-4 w-4" />
                      جرّب المساعد الآن
                    </Link>
                  </Button>
                </div>
              </div>

              {/* Chat mock */}
              <div className="relative">
                <div className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-violet-500/20 via-fuchsia-500/20 to-sky-500/20 blur-2xl" />
                <div className="relative rounded-[1.8rem] bg-slate-900/70 backdrop-blur-xl border border-white/10 shadow-2xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
                      <Bot className="h-5 w-5 text-white" />
                    </div>
                    <div className="text-sm font-bold">المساعد الذكي</div>
                    <span className="mr-auto text-[10px] text-emerald-300 inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> متصل
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-white/10 border border-white/10 px-4 py-2.5 text-sm">
                        مرحباً! أنا هنا لمساعدتك
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-white/10 border border-white/10 px-4 py-2.5 text-sm">
                        كيف يمكنني مساعدتك اليوم؟
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2 rounded-2xl bg-white/5 border border-white/10 px-3 py-2.5">
                      <div className="flex-1 text-sm text-white/50">اكتب سؤالك هنا...</div>
                      <button className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg">
                        <Send className="h-4 w-4 text-white -rotate-45" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ NUMBERS (dark with white cards) ============ */}
        <section className="relative py-20 bg-slate-950 text-white overflow-hidden">
          <div aria-hidden className="absolute inset-0 opacity-[0.05]" style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,1) 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }} />
          <div className="container relative mx-auto px-4 max-w-7xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-5xl font-black">
                مدرك <span className="bg-gradient-to-l from-emerald-400 to-teal-300 bg-clip-text text-transparent">Plus</span> في أرقام
              </h2>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
              <StatMini icon={Users} value={1000} label="طالب مسجل" tone="emerald" />
              <StatMini icon={GraduationCap} value={50} label="معلم متخصص" tone="sky" />
              <StatMini icon={PlayCircle} value={200} label="درس متاح" tone="violet" />
              <StatMini icon={BookOpen} value={100} label="كتاب PDF" tone="amber" />
            </div>
          </div>
        </section>

        {/* ============ FINAL CTA (dark with illustration) ============ */}
        <section className="relative py-20 bg-slate-950 overflow-hidden">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#0b1220] via-[#122036] to-[#0b1220] text-white shadow-[0_40px_100px_-40px_rgba(16,185,129,0.4)] border border-white/10">
              <div aria-hidden className="absolute inset-0">
                <div className="absolute -top-20 -right-20 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl" />
                <div className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-sky-500/20 blur-3xl" />
                <div className="absolute inset-0 opacity-[0.06]" style={{
                  backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,1) 1px, transparent 0)",
                  backgroundSize: "22px 22px",
                }} />
              </div>

              <div className="relative grid lg:grid-cols-2 items-center gap-8 p-8 lg:p-14">
                {/* text */}
                <div className="text-center lg:text-right">
                  <h2 className="text-3xl lg:text-5xl font-black leading-tight">
                    جاهز لبدء <span className="bg-gradient-to-l from-emerald-300 to-teal-200 bg-clip-text text-transparent">رحلتك التعليمية</span>؟
                  </h2>
                  <p className="mt-4 text-white/70 lg:text-lg max-w-xl mx-auto lg:mx-0">
                    انضم الآن وابدأ رحلتك نحو التفوّق والنجاح مع مدرك Plus.
                  </p>
                  <div className="mt-7 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3">
                    <Button asChild size="lg" className="h-14 px-8 text-base font-bold rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 text-white border-b-4 border-emerald-800 hover:-translate-y-0.5 transition-all shadow-2xl">
                      <Link to="/auth?mode=register" className="gap-2">
                        إنشاء حساب
                        <ArrowLeft className="h-5 w-5" />
                      </Link>
                    </Button>
                    <Button asChild size="lg" variant="outline" className="h-14 px-8 text-base font-semibold rounded-2xl bg-white/5 border-2 border-white/20 text-white hover:bg-white/10 hover:text-white">
                      <Link to="/auth">تسجيل الدخول</Link>
                    </Button>
                  </div>
                </div>

                {/* illustration side */}
                <div className="relative h-56 lg:h-72">
                  {/* graduation cap */}
                  <div className="absolute top-2 right-4 text-6xl lg:text-7xl animate-float-y">🎓</div>
                  {/* globe */}
                  <div className="absolute top-14 left-8 h-20 w-20 rounded-full bg-gradient-to-br from-sky-400 to-indigo-600 shadow-2xl flex items-center justify-center animate-float-y" style={{ animationDelay: "0.8s" }}>
                    <Globe className="h-10 w-10 text-white" />
                  </div>
                  {/* books stack */}
                  <div className="absolute bottom-4 right-16 flex flex-col items-end gap-1 animate-float-y" style={{ animationDelay: "1.3s" }}>
                    <div className="h-3 w-24 rounded bg-emerald-500 shadow" />
                    <div className="h-3 w-20 rounded bg-violet-500 shadow" />
                    <div className="h-3 w-28 rounded bg-amber-500 shadow" />
                  </div>
                  {/* laptop mini with play */}
                  <div className="absolute bottom-6 left-4 w-32 rounded-lg bg-slate-800 border-4 border-slate-700 shadow-2xl animate-float-y" style={{ animationDelay: "0.4s" }}>
                    <div className="aspect-video bg-gradient-to-br from-slate-900 to-emerald-950 flex items-center justify-center rounded">
                      <div className="h-8 w-8 rounded-full bg-white/90 flex items-center justify-center">
                        <PlayCircle className="h-6 w-6 text-emerald-600" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Index;

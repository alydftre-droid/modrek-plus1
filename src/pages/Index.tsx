import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen, Video, Bot, Users, GraduationCap, ChevronLeft, Sparkles,
  Shield, Zap, PlayCircle, ArrowLeft, Send, Trophy, Brain, Atom,
  CheckCircle2, Rocket, Star, Flame, Target, Award, Globe, Lightbulb,
  MessageCircle, TrendingUp, Palette, Calculator, FlaskConical, Music,
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

function StatCounter({ value, suffix = "+", label, color }: { value: number; suffix?: string; label: string; color: string }) {
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(el); return () => io.disconnect();
  }, []);
  const n = useCountUp(value, 1800, inView);
  return (
    <div ref={ref} className="group relative rounded-3xl bg-white/70 backdrop-blur-xl border border-white shadow-[0_10px_40px_-15px_rgba(15,23,42,0.15)] p-6 text-center overflow-hidden hover:-translate-y-1 transition-transform duration-500">
      <div className={`absolute -inset-px rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br ${color} blur-xl -z-10`} />
      <div className={`text-4xl lg:text-5xl font-black bg-gradient-to-br ${color} bg-clip-text text-transparent tabular-nums`}>
        {n.toLocaleString("en")}{suffix}
      </div>
      <div className="mt-2 text-sm text-slate-600 font-semibold">{label}</div>
    </div>
  );
}

/* ---------- Mascot / illustration components ---------- */
function StudentMascot() {
  return (
    <svg viewBox="0 0 320 320" className="w-full h-full drop-shadow-2xl">
      <defs>
        <linearGradient id="skin" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#fde3c9" /><stop offset="1" stopColor="#f6c99e" />
        </linearGradient>
        <linearGradient id="shirt" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#10b981" /><stop offset="1" stopColor="#0d9488" />
        </linearGradient>
        <linearGradient id="cap" x1="0" x2="1"><stop offset="0" stopColor="#0f172a"/><stop offset="1" stopColor="#334155"/></linearGradient>
      </defs>
      {/* halo */}
      <circle cx="160" cy="160" r="140" fill="url(#shirt)" opacity="0.08" />
      {/* body */}
      <path d="M80 300 Q80 210 160 210 Q240 210 240 300 Z" fill="url(#shirt)" />
      {/* neck */}
      <rect x="146" y="180" width="28" height="30" rx="8" fill="url(#skin)" />
      {/* head */}
      <circle cx="160" cy="150" r="50" fill="url(#skin)" />
      {/* hair */}
      <path d="M112 148 Q108 100 160 96 Q212 100 208 148 Q198 118 160 120 Q122 118 112 148 Z" fill="#1e293b" />
      {/* eyes */}
      <circle cx="142" cy="152" r="4.5" fill="#0f172a" />
      <circle cx="178" cy="152" r="4.5" fill="#0f172a" />
      <circle cx="143.5" cy="150.5" r="1.5" fill="#fff" />
      <circle cx="179.5" cy="150.5" r="1.5" fill="#fff" />
      {/* smile */}
      <path d="M145 170 Q160 182 175 170" stroke="#7c2d12" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* cheeks */}
      <circle cx="128" cy="166" r="6" fill="#fca5a5" opacity="0.6" />
      <circle cx="192" cy="166" r="6" fill="#fca5a5" opacity="0.6" />
      {/* grad cap */}
      <rect x="108" y="94" width="104" height="10" rx="2" fill="url(#cap)" />
      <polygon points="160,68 232,92 160,116 88,92" fill="url(#cap)" />
      <circle cx="230" cy="92" r="4" fill="#f59e0b" />
      <path d="M230 92 L246 118 L238 118 Z" fill="#f59e0b" />
      {/* book in hand */}
      <g transform="translate(70 235) rotate(-14)">
        <rect width="70" height="52" rx="4" fill="#0ea5e9" />
        <rect x="4" y="4" width="62" height="44" rx="2" fill="#fff" />
        <line x1="35" y1="4" x2="35" y2="48" stroke="#0ea5e9" strokeWidth="1.5" />
        <line x1="10" y1="16" x2="30" y2="16" stroke="#94a3b8" strokeWidth="1.5" />
        <line x1="10" y1="24" x2="28" y2="24" stroke="#94a3b8" strokeWidth="1.5" />
        <line x1="40" y1="16" x2="60" y2="16" stroke="#94a3b8" strokeWidth="1.5" />
        <line x1="40" y1="24" x2="58" y2="24" stroke="#94a3b8" strokeWidth="1.5" />
      </g>
    </svg>
  );
}

function FloatingBook({ className = "", color = "#0ea5e9" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 100 80" className={className}>
      <defs>
        <linearGradient id={`b-${color}`} x1="0" x2="1"><stop offset="0" stopColor={color}/><stop offset="1" stopColor="#fff" stopOpacity="0.6"/></linearGradient>
      </defs>
      <path d="M10 15 L50 25 L90 15 L90 65 L50 75 L10 65 Z" fill={`url(#b-${color})`} stroke={color} strokeWidth="2" />
      <line x1="50" y1="25" x2="50" y2="75" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function AtomIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className}>
      <circle cx="50" cy="50" r="8" fill="#10b981" />
      <ellipse cx="50" cy="50" rx="42" ry="16" fill="none" stroke="#0ea5e9" strokeWidth="2.5" />
      <ellipse cx="50" cy="50" rx="42" ry="16" fill="none" stroke="#8b5cf6" strokeWidth="2.5" transform="rotate(60 50 50)" />
      <ellipse cx="50" cy="50" rx="42" ry="16" fill="none" stroke="#f59e0b" strokeWidth="2.5" transform="rotate(-60 50 50)" />
      <circle cx="92" cy="50" r="4" fill="#0ea5e9" />
      <circle cx="29" cy="14" r="4" fill="#8b5cf6" />
      <circle cx="29" cy="86" r="4" fill="#f59e0b" />
    </svg>
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

  const features = [
    { icon: BookOpen, title: "مكتبة رقمية ضخمة", description: "آلاف الكتب والمناهج بصيغة PDF محدّثة باستمرار.", tone: "emerald", tag: "PDF" },
    { icon: Video, title: "شروحات فيديو 4K", description: "دروس بجودة سينمائية من نخبة المعلمين.", tone: "sky", tag: "HD" },
    { icon: Bot, title: "مساعد ذكاء اصطناعي", description: "يفهم سؤالك ويجيبك من مصادرك مباشرة.", tone: "violet", tag: "AI" },
    { icon: Trophy, title: "امتحانات وتحديات", description: "اختبر نفسك واحصل على تحليل فوري وتقارير.", tone: "amber", tag: "LIVE" },
  ];

  const stages = [
    { title: "المرحلة الإعدادية", grades: ["الصف الأول", "الصف الثاني", "الصف الثالث"], emoji: "📘", grad: "from-sky-500 to-indigo-600" },
    { title: "المرحلة الثانوية", grades: ["الصف الأول", "الصف الثاني", "الصف الثالث"], sections: ["علمي", "أدبي"], emoji: "🎓", grad: "from-emerald-500 to-teal-600" },
  ];

  const stats = [
    { value: 12500, label: "طالب نشط", color: "from-emerald-500 to-teal-600" },
    { value: 320, label: "معلم متميز", color: "from-sky-500 to-indigo-600" },
    { value: 4800, label: "درس فيديو", color: "from-violet-500 to-fuchsia-600" },
    { value: 950, label: "كتاب ومرجع", color: "from-amber-500 to-orange-600" },
  ];

  const toneMap: Record<string, { bg: string; ring: string; text: string; grad: string; glow: string }> = {
    emerald: { bg: "bg-emerald-50", ring: "ring-emerald-200/60", text: "text-emerald-700", grad: "from-emerald-500 to-teal-600", glow: "shadow-emerald-500/25" },
    sky: { bg: "bg-sky-50", ring: "ring-sky-200/60", text: "text-sky-700", grad: "from-sky-500 to-indigo-600", glow: "shadow-sky-500/25" },
    violet: { bg: "bg-violet-50", ring: "ring-violet-200/60", text: "text-violet-700", grad: "from-violet-500 to-fuchsia-600", glow: "shadow-violet-500/25" },
    amber: { bg: "bg-amber-50", ring: "ring-amber-200/60", text: "text-amber-800", grad: "from-amber-500 to-orange-600", glow: "shadow-amber-500/25" },
  };

  const subjects = [
    { icon: Calculator, name: "رياضيات", color: "text-emerald-600 bg-emerald-50" },
    { icon: FlaskConical, name: "كيمياء", color: "text-violet-600 bg-violet-50" },
    { icon: Atom, name: "فيزياء", color: "text-sky-600 bg-sky-50" },
    { icon: BookOpen, name: "لغة عربية", color: "text-amber-700 bg-amber-50" },
    { icon: Globe, name: "لغة إنجليزية", color: "text-rose-600 bg-rose-50" },
    { icon: Brain, name: "أحياء", color: "text-teal-600 bg-teal-50" },
    { icon: Palette, name: "فنون", color: "text-fuchsia-600 bg-fuchsia-50" },
    { icon: Music, name: "دراسات", color: "text-indigo-600 bg-indigo-50" },
  ];

  return (
    <div dir="rtl" className="min-h-screen flex flex-col overflow-x-hidden bg-[#F7F9FC] text-slate-900 selection:bg-emerald-200 selection:text-emerald-950">
      <Header />

      <main className="flex-1">
        {/* ============ HERO ============ */}
        <section className="relative overflow-hidden pt-10 pb-20 lg:pt-20 lg:pb-32">
          {/* Animated aurora blobs */}
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute top-[-140px] right-[-100px] h-[520px] w-[520px] rounded-full bg-emerald-300/40 blur-3xl animate-blob" />
            <div className="absolute top-[80px] left-[-120px] h-[480px] w-[480px] rounded-full bg-sky-300/40 blur-3xl animate-blob" style={{ animationDelay: "3s" }} />
            <div className="absolute bottom-[-160px] right-[30%] h-[420px] w-[420px] rounded-full bg-violet-300/40 blur-3xl animate-blob" style={{ animationDelay: "6s" }} />
            {/* grid */}
            <svg className="absolute inset-0 h-full w-full opacity-[0.07] text-slate-900">
              <defs>
                <pattern id="hero-grid" width="44" height="44" patternUnits="userSpaceOnUse">
                  <path d="M44 0H0V44" fill="none" stroke="currentColor" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#hero-grid)" />
            </svg>
            {/* floating equations */}
            <div className="absolute top-24 right-[8%] text-4xl font-black text-emerald-600/25 animate-float-y hidden md:block">∑</div>
            <div className="absolute top-40 left-[10%] text-3xl font-black text-sky-600/25 animate-float-y hidden md:block" style={{ animationDelay: "1.5s" }}>π</div>
            <div className="absolute bottom-32 right-[14%] text-3xl font-black text-violet-600/25 animate-float-y hidden md:block" style={{ animationDelay: "2.8s" }}>√x</div>
            <div className="absolute bottom-40 left-[16%] text-3xl font-black text-amber-600/25 animate-float-y hidden md:block" style={{ animationDelay: "1s" }}>H₂O</div>
          </div>

          <div className="container relative mx-auto px-4 max-w-7xl">
            <div className="grid lg:grid-cols-12 gap-10 items-center">
              {/* Text side */}
              <div className="lg:col-span-7 text-center lg:text-right">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-xs lg:text-sm text-emerald-800 backdrop-blur-xl shadow-sm animate-fade-in">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
                  </span>
                  الجيل الجديد من التعليم الرقمي · إصدار 2026
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                </div>

                <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black leading-[1.05] tracking-tight animate-fade-in">
                  تعلّم كأنّك
                  <span
                    className="block mt-2 bg-[length:200%_auto] bg-clip-text text-transparent animate-gradient-x"
                    style={{ backgroundImage: "linear-gradient(90deg,#059669,#0ea5e9,#8b5cf6,#f59e0b,#059669)" }}
                  >
                    داخل الدرس نفسه
                  </span>
                </h1>

                <p className="mt-6 text-base lg:text-xl text-slate-600 max-w-2xl mx-auto lg:mx-0 leading-relaxed animate-fade-in" style={{ animationDelay: "0.15s" }}>
                  <span className="font-bold text-slate-900">مدرك Plus</span> — منصة تعليمية متطورة تجمع بين المناهج العريقة والذكاء الاصطناعي، مصمّمة لتصنع تجربة تعلّم لا تُنسى.
                </p>

                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 animate-fade-in" style={{ animationDelay: "0.3s" }}>
                  <Button asChild size="lg" className="group w-full sm:w-auto h-14 px-8 text-base font-bold rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-700 text-white border-b-4 border-emerald-800 hover:translate-y-[-2px] hover:shadow-2xl hover:shadow-emerald-500/40 transition-all">
                    <Link to="/auth?mode=register" className="gap-2">
                      ابدأ مجاناً الآن
                      <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="w-full sm:w-auto h-14 px-8 text-base font-semibold rounded-2xl bg-white/80 backdrop-blur-xl border-2 border-slate-200 text-slate-800 hover:bg-white hover:border-slate-300">
                    <Link to="/about" className="gap-2">
                      <PlayCircle className="h-5 w-5 text-emerald-600" />
                      شاهد المنصة
                    </Link>
                  </Button>
                </div>

                {/* Trust */}
                <div className="mt-10 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-3 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> بدون إعلانات</span>
                  <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> محتوى مراجَع</span>
                  <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> يعمل على كل الأجهزة</span>
                  <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> دعم 24/7</span>
                </div>

                {/* Avatar row */}
                <div className="mt-8 flex items-center justify-center lg:justify-start gap-4">
                  <div className="flex -space-x-3 space-x-reverse">
                    {["#10b981","#0ea5e9","#8b5cf6","#f59e0b","#f43f5e"].map((c,i)=>(
                      <div key={i} className="h-10 w-10 rounded-full ring-4 ring-white shadow-md flex items-center justify-center text-white font-bold text-sm" style={{ background: `linear-gradient(135deg, ${c}, ${c}cc)` }}>
                        {["م","أ","ن","س","ع"][i]}
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="flex items-center gap-0.5 text-amber-400">
                      {[...Array(5)].map((_,i)=><Star key={i} className="h-4 w-4 fill-current" />)}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5"><span className="font-bold text-slate-900">+12,000</span> طالب يثقون بنا</div>
                  </div>
                </div>
              </div>

              {/* Visual side */}
              <div className="lg:col-span-5 relative h-[460px] lg:h-[560px]">
                {/* Backdrop card */}
                <div className="absolute inset-0 rounded-[2.5rem] bg-gradient-to-br from-white via-emerald-50/50 to-sky-50/60 border border-white/80 shadow-[0_30px_80px_-30px_rgba(15,23,42,0.25)] overflow-hidden">
                  {/* soft grid */}
                  <div className="absolute inset-0 opacity-[0.5]" style={{
                    backgroundImage: "radial-gradient(circle at 1px 1px, rgba(15,23,42,0.08) 1px, transparent 0)",
                    backgroundSize: "22px 22px",
                  }} />

                  {/* Orbits behind mascot */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative h-[280px] w-[280px]">
                      <div className="absolute inset-0 rounded-full border-2 border-dashed border-emerald-300/50 animate-spin-slow" />
                      <div className="absolute inset-6 rounded-full border-2 border-dashed border-sky-300/50 animate-spin-slow" style={{ animationDirection: "reverse", animationDuration: "18s" }} />
                    </div>
                  </div>

                  {/* Mascot */}
                  <div className="absolute inset-0 flex items-end justify-center pb-4">
                    <div className="w-[280px] h-[280px] animate-float-y" style={{ animationDuration: "5s" }}>
                      <StudentMascot />
                    </div>
                  </div>

                  {/* Orbiting objects */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-0 w-0 hidden sm:block">
                    <div className="absolute animate-orbit">
                      <div className="h-14 w-14 rounded-2xl bg-white shadow-xl border border-slate-100 flex items-center justify-center"><AtomIcon className="h-9 w-9" /></div>
                    </div>
                    <div className="absolute animate-orbit" style={{ animationDelay: "-4s" }}>
                      <FloatingBook className="h-14 w-14" color="#8b5cf6" />
                    </div>
                    <div className="absolute animate-orbit" style={{ animationDelay: "-8s" }}>
                      <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-xl flex items-center justify-center text-white"><Rocket className="h-6 w-6" /></div>
                    </div>
                  </div>

                  {/* Floating chat card (top-right RTL) */}
                  <div className="absolute top-5 right-5 w-56 rounded-2xl bg-white shadow-2xl border border-slate-100 p-3.5 animate-float-y">
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-md">
                        <Brain className="h-4.5 w-4.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-slate-500 font-semibold">المساعد الذكي</div>
                        <div className="text-xs font-bold text-slate-900 truncate">اشرح لي الجاذبية 🌍</div>
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-typing-dot" />
                      <span className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-typing-dot" style={{ animationDelay: "0.2s" }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-typing-dot" style={{ animationDelay: "0.4s" }} />
                      <span className="text-[10px] text-slate-400 mr-1">يكتب الرد...</span>
                    </div>
                  </div>

                  {/* Floating progress card (bottom-left) */}
                  <div className="absolute bottom-6 left-5 w-60 rounded-2xl bg-white shadow-2xl border border-slate-100 p-4 animate-float-y" style={{ animationDelay: "0.9s" }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[10px] text-slate-500 font-semibold">تقدمك اليوم</div>
                        <div className="text-2xl font-black text-slate-900 mt-0.5 tabular-nums">87<span className="text-sm text-slate-400">%</span></div>
                        <div className="text-[10px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> +12% هذا الأسبوع</div>
                      </div>
                      <div className="relative h-14 w-14">
                        <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke="url(#grad1)" strokeWidth="3" strokeDasharray="87 100" strokeLinecap="round" />
                          <defs>
                            <linearGradient id="grad1"><stop offset="0" stopColor="#10b981" /><stop offset="1" stopColor="#0ea5e9" /></linearGradient>
                          </defs>
                        </svg>
                        <Trophy className="absolute inset-0 m-auto h-5 w-5 text-amber-500" />
                      </div>
                    </div>
                  </div>

                  {/* Badge */}
                  <div className="absolute top-5 left-5 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white px-3 py-1.5 text-[10px] font-bold shadow-lg animate-wiggle">
                    <Flame className="h-3.5 w-3.5" /> مباشر الآن
                  </div>
                </div>
              </div>
            </div>

            {/* Stats bar */}
            <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6">
              {stats.map((s, i) => (
                <StatCounter key={i} value={s.value} label={s.label} color={s.color} />
              ))}
            </div>
          </div>
        </section>

        {/* ============ SUBJECTS MARQUEE ============ */}
        <section className="py-10 bg-white border-y border-slate-100 overflow-hidden">
          <div className="container mx-auto px-4 max-w-7xl mb-6">
            <div className="text-center text-xs font-bold text-slate-500 uppercase tracking-widest">مواد تُدرَّس على المنصة</div>
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-white to-transparent z-10" />
            <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-white to-transparent z-10" />
            <div className="flex gap-4 animate-marquee-rtl" style={{ width: "max-content" }}>
              {[...subjects, ...subjects, ...subjects].map((s, i) => (
                <div key={i} className={`shrink-0 flex items-center gap-2.5 rounded-2xl px-5 py-3 ${s.color} font-bold text-sm shadow-sm ring-1 ring-black/5`}>
                  <s.icon className="h-5 w-5" />
                  {s.name}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ FEATURES BENTO ============ */}
        <section className="relative py-24">
          <div className="container mx-auto px-4 max-w-7xl">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                <Sparkles className="h-3 w-3" /> ما يميّزنا
              </div>
              <h2 className="mt-4 text-3xl lg:text-5xl font-black tracking-tight">
                كل ما يحتاجه الطالب <span className="bg-gradient-to-l from-emerald-600 via-sky-600 to-violet-600 bg-clip-text text-transparent">في منصة واحدة</span>
              </h2>
              <p className="mt-4 text-slate-600 lg:text-lg">تجربة تعليمية متكاملة صُمّمت بعناية بأحدث معايير 2026.</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((f, i) => {
                const t = toneMap[f.tone];
                return (
                  <div
                    key={i}
                    className={`group relative rounded-3xl bg-white p-7 ring-1 ring-slate-100 hover:ring-transparent hover:-translate-y-2 hover:shadow-2xl ${t.glow} transition-all duration-500 overflow-hidden`}
                    style={{ animationDelay: `${i * 0.08}s` }}
                  >
                    {/* corner glow */}
                    <div className={`absolute -top-16 -left-16 h-40 w-40 rounded-full bg-gradient-to-br ${t.grad} opacity-0 group-hover:opacity-20 blur-2xl transition-opacity`} />
                    <div className="absolute top-4 left-4 text-[10px] font-black tracking-wider text-slate-400 group-hover:text-slate-600 transition-colors">
                      {f.tag}
                    </div>
                    <div className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${t.grad} text-white shadow-lg ${t.glow} group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500`}>
                      <f.icon className="h-7 w-7" />
                    </div>
                    <h3 className="mt-5 text-lg font-extrabold text-slate-900">{f.title}</h3>
                    <p className="mt-2 text-sm text-slate-600 leading-relaxed">{f.description}</p>
                    <div className={`mt-5 inline-flex items-center gap-1 text-xs font-bold ${t.text} translate-x-2 group-hover:translate-x-0 opacity-0 group-hover:opacity-100 transition-all`}>
                      اكتشف <ChevronLeft className="h-3.5 w-3.5" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ============ AI CHAT SHOWCASE ============ */}
        <section className="relative py-24 overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
          <div aria-hidden className="absolute inset-0">
            <div className="absolute top-20 right-20 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl animate-blob" />
            <div className="absolute bottom-10 left-10 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl animate-blob" style={{ animationDelay: "4s" }} />
            <svg className="absolute inset-0 h-full w-full opacity-[0.06] text-white">
              <defs>
                <pattern id="dark-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M40 0H0V40" fill="none" stroke="currentColor" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#dark-grid)" />
            </svg>
          </div>

          <div className="container relative mx-auto px-4 max-w-7xl">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Copy */}
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs backdrop-blur">
                  <Brain className="h-3.5 w-3.5 text-violet-300" />
                  المساعد الذكي
                </div>
                <h2 className="mt-6 text-3xl lg:text-5xl font-black leading-tight">
                  اسأل بلغتك، وستحصل على إجابة
                  <span className="block mt-2 bg-gradient-to-l from-emerald-400 via-sky-400 to-violet-400 bg-clip-text text-transparent">
                    من داخل مصادرك أنت
                  </span>
                </h2>
                <p className="mt-5 text-white/70 text-base lg:text-lg leading-relaxed">
                  ذكاء اصطناعي مدرَّب على المناهج، يقرأ كتبك ويشرح لك بأسلوبك — بدون هلوسة، وبمصادر واضحة تستطيع مراجعتها.
                </p>
                <ul className="mt-8 space-y-3">
                  {[
                    { i: Zap, t: "استجابة فورية بأقل من ثانية" },
                    { i: Shield, t: "إجابات من مصادرك فقط — بدون تخمين" },
                    { i: Lightbulb, t: "يقترح تمارين وأسئلة إضافية" },
                    { i: Target, t: "يتذكر مستواك ويُخصّص الشرح" },
                  ].map((x, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="mt-0.5 h-8 w-8 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center">
                        <x.i className="h-4 w-4 text-emerald-300" />
                      </div>
                      <span className="text-white/85 text-sm lg:text-base">{x.t}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Chat mock */}
              <div className="relative">
                <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-emerald-500/20 via-sky-500/20 to-violet-500/20 blur-2xl" />
                <div className="relative rounded-[2rem] bg-slate-900/70 backdrop-blur-xl border border-white/10 shadow-2xl p-5 lg:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-rose-400" />
                      <span className="h-3 w-3 rounded-full bg-amber-400" />
                      <span className="h-3 w-3 rounded-full bg-emerald-400" />
                    </div>
                    <div className="text-xs text-white/50">مدرك · محادثة مباشرة</div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-gradient-to-br from-emerald-500 to-teal-600 text-white px-4 py-3 text-sm shadow-lg">
                        اشرح لي قانون نيوتن الثاني ببساطة مع مثال 🚀
                      </div>
                    </div>

                    <div className="flex justify-start">
                      <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-white/10 border border-white/10 backdrop-blur px-4 py-3 text-sm space-y-2">
                        <div className="text-white/90">
                          قانون نيوتن الثاني يقول:
                          <span className="mx-1 inline-block rounded-md bg-white/10 px-2 py-0.5 font-mono text-emerald-300">F = m × a</span>
                        </div>
                        <div className="text-white/70">
                          يعني: كل ما زادت الكتلة أو التسارع، تزيد القوة اللازمة لتحريك الجسم.
                        </div>
                        <div className="text-white/60 text-[13px]">
                          مثال: لو دفعت عربة كتلتها 10كجم بتسارع 2م/ث²، القوة = 20 نيوتن. ✨
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-2">
                          <span className="text-[10px] rounded-full bg-emerald-400/15 border border-emerald-400/30 text-emerald-200 px-2 py-0.5">فيزياء · الصف الأول ث</span>
                          <span className="text-[10px] rounded-full bg-sky-400/15 border border-sky-400/30 text-sky-200 px-2 py-0.5">كتاب المدرسة · ص 42</span>
                        </div>
                      </div>
                    </div>

                    {/* input */}
                    <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white/5 border border-white/10 px-3 py-2">
                      <div className="flex items-center gap-1 px-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-typing-dot" />
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-typing-dot" style={{ animationDelay: "0.2s" }} />
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-typing-dot" style={{ animationDelay: "0.4s" }} />
                      </div>
                      <div className="flex-1 text-sm text-white/50">اكتب سؤالك...</div>
                      <button className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                        <Send className="h-4 w-4 text-white -rotate-45" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ STAGES ============ */}
        <section className="py-24 bg-gradient-to-b from-white to-[#F7F9FC]">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="text-center mb-14">
              <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 border border-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                المراحل الدراسية
              </div>
              <h2 className="mt-4 text-3xl lg:text-5xl font-black tracking-tight">اختر مرحلتك وابدأ الرحلة</h2>
              <p className="mt-3 text-slate-600 lg:text-lg">محتوى غني ومنهج متكامل لكل صف دراسي.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
              {stages.map((stage, i) => (
                <div key={i} className={`group relative overflow-hidden rounded-3xl bg-white border border-slate-100 shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-500`}>
                  <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l ${stage.grad}`} />
                  <div className={`absolute -top-20 -left-20 h-52 w-52 rounded-full bg-gradient-to-br ${stage.grad} opacity-0 group-hover:opacity-15 blur-3xl transition-opacity`} />
                  <div className="absolute top-4 left-4 text-5xl select-none opacity-90 group-hover:scale-110 transition-transform" aria-hidden>{stage.emoji}</div>

                  <div className="p-8 pt-14">
                    <div className="flex items-center gap-4">
                      <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${stage.grad} flex items-center justify-center shadow-lg`}>
                        <GraduationCap className="h-7 w-7 text-white" />
                      </div>
                      <h3 className="text-2xl font-black text-slate-900">{stage.title}</h3>
                    </div>

                    <div className="mt-6 grid grid-cols-3 gap-2">
                      {stage.grades.map((g, k) => (
                        <div key={k} className="rounded-xl bg-slate-50 border border-slate-100 py-3 px-2 text-center text-sm font-semibold text-slate-700 hover:bg-emerald-50 hover:border-emerald-200 hover:-translate-y-0.5 transition-all">
                          {g}
                        </div>
                      ))}
                    </div>

                    {stage.sections && (
                      <div className="mt-4 flex gap-2">
                        {stage.sections.map((s, k) => (
                          <span key={k} className="px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">{s}</span>
                        ))}
                      </div>
                    )}

                    <Button asChild className="mt-6 w-full h-12 rounded-xl bg-slate-900 text-white hover:bg-slate-800 border-b-4 border-slate-950 group/btn">
                      <Link to="/auth?mode=register" className="gap-2 font-bold">
                        استكشف المحتوى
                        <ArrowLeft className="h-4 w-4 group-hover/btn:-translate-x-1 transition-transform" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ TESTIMONIALS ============ */}
        <section className="py-24 bg-white">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="text-center mb-14">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                <MessageCircle className="h-3 w-3" /> آراء طلابنا
              </div>
              <h2 className="mt-4 text-3xl lg:text-5xl font-black tracking-tight">قصص نجاح حقيقية</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { name: "منار عبد الله", grade: "الثالث الثانوي", text: "المساعد الذكي قلب دراستي رأسًا على عقب — بقيت أفهم في نص الوقت!", color: "from-emerald-500 to-teal-600" },
                { name: "أحمد سيف", grade: "الأول الثانوي", text: "الشروحات بجودة ممتازة والامتحانات تحسّس بيكون فيه فرق كبير في مستواي.", color: "from-sky-500 to-indigo-600" },
                { name: "نور محمد", grade: "الثالث الإعدادي", text: "أول مرة أحس إن الدراسة ممتعة فعلاً. شكرًا مدرك Plus 💚", color: "from-violet-500 to-fuchsia-600" },
              ].map((t, i) => (
                <div key={i} className="group relative rounded-3xl bg-gradient-to-b from-white to-slate-50 border border-slate-100 p-6 hover:-translate-y-1 hover:shadow-xl transition-all">
                  <div className="flex items-center gap-0.5 text-amber-400 mb-3">
                    {[...Array(5)].map((_, k) => <Star key={k} className="h-4 w-4 fill-current" />)}
                  </div>
                  <p className="text-slate-700 leading-relaxed">"{t.text}"</p>
                  <div className="mt-5 flex items-center gap-3">
                    <div className={`h-11 w-11 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center text-white font-bold shadow-md`}>
                      {t.name[0]}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{t.name}</div>
                      <div className="text-xs text-slate-500">{t.grade}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ FINAL CTA ============ */}
        <section className="relative py-24 overflow-hidden">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900 text-white shadow-[0_40px_100px_-40px_rgba(16,185,129,0.5)]">
              {/* animated backdrop */}
              <div aria-hidden className="absolute inset-0">
                <div className="absolute -top-20 -right-20 h-96 w-96 rounded-full bg-emerald-500/30 blur-3xl animate-blob" />
                <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-sky-500/30 blur-3xl animate-blob" style={{ animationDelay: "5s" }} />
                <svg className="absolute inset-0 h-full w-full opacity-[0.07]">
                  <defs>
                    <pattern id="cta-dots" width="24" height="24" patternUnits="userSpaceOnUse">
                      <circle cx="1.5" cy="1.5" r="1.5" fill="white" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#cta-dots)" />
                </svg>
                {/* floating shapes */}
                <div className="absolute top-10 left-[15%] animate-float-y"><FloatingBook className="h-16 w-16 opacity-80" color="#34d399" /></div>
                <div className="absolute bottom-14 right-[18%] animate-float-y" style={{ animationDelay: "1.2s" }}><AtomIcon className="h-16 w-16 opacity-90" /></div>
                <div className="absolute top-20 right-[10%] animate-float-y" style={{ animationDelay: "2s" }}>
                  <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-xl flex items-center justify-center"><Rocket className="h-6 w-6 text-white" /></div>
                </div>
              </div>

              <div className="relative p-10 lg:p-16 text-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs backdrop-blur">
                  <Award className="h-3.5 w-3.5 text-amber-300" /> انطلق مع الآلاف
                </div>
                <h2 className="mt-6 text-3xl lg:text-6xl font-black tracking-tight leading-tight">
                  رحلة تفوّقك <span className="bg-gradient-to-l from-emerald-300 via-sky-300 to-violet-300 bg-clip-text text-transparent">تبدأ اليوم</span>
                </h2>
                <p className="mt-5 text-white/75 text-base lg:text-xl max-w-2xl mx-auto">
                  انضم إلى مجتمع مدرك Plus واستمتع بتجربة تعليمية لا مثيل لها. مجانًا للبدء، ومصمّم ليكبر معك.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Button asChild size="lg" className="h-14 px-10 text-base font-bold rounded-2xl bg-white text-slate-900 hover:bg-emerald-50 border-b-4 border-emerald-300 hover:-translate-y-0.5 transition-all shadow-2xl">
                    <Link to="/auth?mode=register" className="gap-2">
                      أنشئ حسابك الآن
                      <ArrowLeft className="h-5 w-5" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="h-14 px-10 text-base font-semibold rounded-2xl bg-white/5 border-2 border-white/25 text-white hover:bg-white/10 hover:text-white">
                    <Link to="/about">تعرّف علينا</Link>
                  </Button>
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

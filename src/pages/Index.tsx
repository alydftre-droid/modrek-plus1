import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen, Video, Bot, Headphones, GraduationCap, Sparkles,
  Zap, PlayCircle, ArrowLeft, Send, Brain,
  CheckCircle2, Target, Globe, Lightbulb,
  Users, BookMarked, FileText, MousePointer2,
} from "lucide-react";
import heroLaptopRobot from "@/assets/hero-laptop-robot.png";
import stagePrepImg from "@/assets/stage-prep.png";
import stageSecondaryImg from "@/assets/stage-secondary.png";
import aiBrainImg from "@/assets/ai-brain.png";
import ctaGroupImg from "@/assets/cta-group.png";

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

/* ---------- Educational background pattern (very subtle) ---------- */
function EduBackdrop({ dark = false }: { dark?: boolean }) {
  const stroke = dark ? "rgba(255,255,255,0.18)" : "rgba(15,23,42,0.14)";
  const fill = dark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.05)";
  return (
    <svg aria-hidden className="absolute inset-0 h-full w-full pointer-events-none" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="edu-grid" width="56" height="56" patternUnits="userSpaceOnUse">
          <path d="M56 0H0V56" fill="none" stroke={stroke} strokeWidth="0.6" opacity="0.35" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#edu-grid)" />
      {/* floating equations & science glyphs */}
      <g fill={fill} style={{ fontFamily: "serif", fontSize: 22, fontStyle: "italic" }}>
        <text x="8%" y="18%">E = mc²</text>
        <text x="82%" y="12%">∑ x²</text>
        <text x="70%" y="72%">π · r²</text>
        <text x="12%" y="78%">√ x + y</text>
        <text x="46%" y="24%">H₂O</text>
        <text x="90%" y="52%">∫ dx</text>
      </g>
      {/* atoms */}
      <g fill="none" stroke={stroke} strokeWidth="0.8">
        <g transform="translate(90 320)">
          <ellipse rx="34" ry="12" />
          <ellipse rx="34" ry="12" transform="rotate(60)" />
          <ellipse rx="34" ry="12" transform="rotate(-60)" />
          <circle r="3" fill={stroke} />
        </g>
        <g transform="translate(85% 65%)">
          <ellipse rx="28" ry="10" />
          <ellipse rx="28" ry="10" transform="rotate(60)" />
          <ellipse rx="28" ry="10" transform="rotate(-60)" />
          <circle r="2.5" fill={stroke} />
        </g>
      </g>
      {/* DNA */}
      <g stroke={stroke} strokeWidth="0.9" fill="none" transform="translate(50 60)">
        <path d="M0,0 Q20,20 0,40 Q-20,60 0,80 Q20,100 0,120" />
        <path d="M22,0 Q2,20 22,40 Q42,60 22,80 Q2,100 22,120" />
        <line x1="0" y1="10" x2="22" y2="10" />
        <line x1="0" y1="30" x2="22" y2="30" />
        <line x1="0" y1="50" x2="22" y2="50" />
        <line x1="0" y1="70" x2="22" y2="70" />
        <line x1="0" y1="90" x2="22" y2="90" />
      </g>
    </svg>
  );
}

/* ---------- Premium stat card ---------- */
function StatMini({ icon: Icon, value, label, tone }: { icon: any; value: number; label: string; tone: "emerald" | "sky" | "violet" | "amber" }) {
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(el); return () => io.disconnect();
  }, []);
  const n = useCountUp(value, 1600, inView);
  const tones: Record<string, { chip: string; ring: string }> = {
    emerald: { chip: "bg-gradient-to-br from-emerald-400 to-teal-500 text-white", ring: "ring-emerald-100" },
    sky: { chip: "bg-gradient-to-br from-sky-400 to-blue-500 text-white", ring: "ring-sky-100" },
    violet: { chip: "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white", ring: "ring-violet-100" },
    amber: { chip: "bg-gradient-to-br from-amber-400 to-orange-500 text-white", ring: "ring-amber-100" },
  };
  return (
    <div
      ref={ref}
      className="group relative rounded-2xl bg-white/80 backdrop-blur-xl border border-white p-4 lg:p-5 flex items-center gap-3 lg:gap-4 shadow-[0_8px_30px_-16px_rgba(15,23,42,0.20)] hover:shadow-[0_16px_50px_-16px_rgba(15,23,42,0.25)] hover:-translate-y-0.5 transition-all"
    >
      <div className={`h-12 w-12 lg:h-14 lg:w-14 rounded-2xl ${tones[tone].chip} flex items-center justify-center shadow-lg ring-4 ${tones[tone].ring} shrink-0 group-hover:scale-105 transition`}>
        <Icon className="h-5 w-5 lg:h-6 lg:w-6" />
      </div>
      <div className="min-w-0">
        <div className="text-xl lg:text-2xl font-black text-slate-900 tabular-nums leading-none tracking-tight">+{n.toLocaleString("en")}</div>
        <div className="text-[11px] lg:text-xs text-slate-500 mt-1.5 font-semibold">{label}</div>
      </div>
    </div>
  );
}

/* ---------- Hero: laptop + robot + floating 3D items ---------- */
function HeroLaptopScene() {
  return (
    <div className="relative w-full h-full">
      {/* Soft radial glow */}
      <div aria-hidden className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(closest-side,rgba(16,185,129,0.20),transparent_70%)]" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[90%] w-[90%] rounded-full bg-[radial-gradient(closest-side,rgba(56,189,248,0.14),transparent_70%)]" />
      </div>

      {/* Floating molecule / DNA behind */}
      <svg viewBox="0 0 500 500" className="absolute inset-0 w-full h-full opacity-70" aria-hidden>
        <g stroke="rgba(148,163,184,0.55)" strokeWidth="0.9" fill="none">
          {/* molecule cluster top-right */}
          <g transform="translate(400 90)">
            <circle cx="0" cy="0" r="6" fill="#a7f3d0" />
            <circle cx="40" cy="20" r="5" fill="#bae6fd" />
            <circle cx="-20" cy="35" r="4" fill="#e9d5ff" />
            <circle cx="30" cy="-25" r="4" fill="#fde68a" />
            <line x1="0" y1="0" x2="40" y2="20" />
            <line x1="0" y1="0" x2="-20" y2="35" />
            <line x1="0" y1="0" x2="30" y2="-25" />
          </g>
          {/* DNA left */}
          <g transform="translate(30 200)">
            <path d="M0,0 Q22,22 0,44 Q-22,66 0,88 Q22,110 0,132 Q-22,154 0,176" />
            <path d="M26,0 Q4,22 26,44 Q48,66 26,88 Q4,110 26,132 Q48,154 26,176" />
            <line x1="0" y1="10" x2="26" y2="10" />
            <line x1="0" y1="34" x2="26" y2="34" />
            <line x1="0" y1="58" x2="26" y2="58" />
            <line x1="0" y1="82" x2="26" y2="82" />
            <line x1="0" y1="106" x2="26" y2="106" />
            <line x1="0" y1="130" x2="26" y2="130" />
            <line x1="0" y1="154" x2="26" y2="154" />
          </g>
        </g>
      </svg>

      {/* Laptop */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-[92%] max-w-[560px] animate-float-y" style={{ animationDuration: "7s" }}>
          {/* screen bezel */}
          <div className="relative rounded-t-[18px] bg-gradient-to-b from-slate-800 to-slate-900 p-2.5 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.45)] border border-slate-700">
            <div className="rounded-[10px] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/40 aspect-[16/10] p-4 overflow-hidden relative">
              {/* dashboard mock */}
              <div className="flex items-center gap-1.5 mb-3">
                <span className="h-2 w-2 rounded-full bg-rose-400" />
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="mr-auto text-[9px] text-white/40 font-mono tracking-wide">مدرك · Plus</span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-6 w-6 rounded-md bg-gradient-to-br from-emerald-400 to-teal-500" />
                <div>
                  <div className="text-[10px] text-white font-bold">مرحبا بك في مدرك Plus</div>
                  <div className="h-1 w-24 mt-1 rounded-full bg-gradient-to-l from-emerald-500 to-teal-400/40" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {[
                  { c: "from-emerald-400 to-teal-500" },
                  { c: "from-sky-400 to-indigo-500" },
                  { c: "from-violet-400 to-fuchsia-500" },
                ].map((it, i) => (
                  <div key={i} className="rounded-md bg-white/[0.04] border border-white/10 p-1.5">
                    <div className={`h-4 w-4 rounded bg-gradient-to-br ${it.c} mb-1.5`} />
                    <div className="h-1 w-full bg-white/25 rounded" />
                    <div className="h-1 w-3/4 bg-white/10 rounded mt-1" />
                  </div>
                ))}
              </div>
              <div className="rounded-md bg-white/[0.03] border border-white/10 p-2">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[8px] text-white/70 font-bold">التقدم الأسبوعي</div>
                  <div className="text-[8px] text-emerald-300">+12%</div>
                </div>
                <div className="flex items-end gap-0.5 h-6">
                  {[35, 55, 45, 70, 60, 85, 75].map((h, i) => (
                    <div key={i} className="flex-1 rounded-sm bg-gradient-to-t from-emerald-500/80 to-emerald-300/80" style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
          {/* base */}
          <div className="h-2.5 rounded-b-2xl bg-gradient-to-b from-slate-300 to-slate-500 shadow-lg" />
          <div className="mx-auto h-1 w-1/4 rounded-b-lg bg-slate-500/70" />
          {/* soft floor shadow */}
          <div className="mx-auto mt-2 h-6 w-3/4 rounded-[50%] bg-slate-900/15 blur-md" />
        </div>
      </div>

      {/* Graduation cap top-left */}
      <div className="absolute -top-2 left-2 sm:left-6 w-16 sm:w-20 animate-float-y" style={{ animationDuration: "5s", animationDelay: "0.4s" }}>
        <svg viewBox="0 0 100 80" className="w-full drop-shadow-xl">
          <path d="M50 8 L92 26 L50 44 L8 26 Z" fill="#0f172a" />
          <path d="M50 8 L92 26 L50 44 L8 26 Z" fill="url(#capShine)" opacity="0.5" />
          <defs>
            <linearGradient id="capShine" x1="0" x2="1"><stop offset="0" stopColor="#334155"/><stop offset="1" stopColor="#0f172a"/></linearGradient>
          </defs>
          <path d="M22 32 L22 52 Q50 68 78 52 L78 32" fill="#1e293b" />
          <line x1="88" y1="26" x2="88" y2="52" stroke="#facc15" strokeWidth="2"/>
          <circle cx="88" cy="56" r="4" fill="#facc15"/>
        </svg>
      </div>

      {/* Robot mascot floating out */}
      <div className="absolute top-8 right-4 sm:right-10 w-[130px] sm:w-[170px] animate-float-y" style={{ animationDuration: "4.5s", animationDelay: "0.3s" }}>
        <svg viewBox="0 0 200 230" className="w-full h-full drop-shadow-[0_20px_30px_rgba(16,185,129,0.25)]">
          <defs>
            <linearGradient id="botBody2" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#f8fafc" /><stop offset="1" stopColor="#94a3b8" />
            </linearGradient>
            <linearGradient id="botFace2" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#0b1220" /><stop offset="1" stopColor="#1e293b" />
            </linearGradient>
            <radialGradient id="eyeGlow" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#67e8f9"/><stop offset="1" stopColor="#0ea5e9"/>
            </radialGradient>
          </defs>
          <line x1="100" y1="42" x2="100" y2="18" stroke="#64748b" strokeWidth="3" />
          <circle cx="100" cy="14" r="6" fill="#10b981">
            <animate attributeName="opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite" />
          </circle>
          {/* head */}
          <rect x="36" y="42" width="128" height="118" rx="34" fill="url(#botBody2)" stroke="#e2e8f0" strokeWidth="2" />
          <rect x="36" y="42" width="128" height="34" rx="34" fill="#fff" opacity="0.35"/>
          {/* face */}
          <rect x="52" y="62" width="96" height="76" rx="20" fill="url(#botFace2)" />
          <circle cx="80" cy="96" r="10" fill="url(#eyeGlow)" />
          <circle cx="120" cy="96" r="10" fill="url(#eyeGlow)" />
          <circle cx="83" cy="93" r="3" fill="#fff" />
          <circle cx="123" cy="93" r="3" fill="#fff" />
          <path d="M80 116 Q100 130 120 116" stroke="#67e8f9" strokeWidth="3" fill="none" strokeLinecap="round" />
          {/* collar */}
          <rect x="60" y="160" width="80" height="30" rx="14" fill="#e2e8f0" />
          <circle cx="82" cy="175" r="4" fill="#10b981" />
          <circle cx="100" cy="175" r="4" fill="#0ea5e9" />
          <circle cx="118" cy="175" r="4" fill="#a855f7" />
        </svg>
      </div>

      {/* Floating book bottom-left */}
      <div className="absolute bottom-6 left-4 animate-float-y" style={{ animationDelay: "1s" }}>
        <svg viewBox="0 0 90 80" className="w-16 sm:w-20 drop-shadow-xl">
          <defs>
            <linearGradient id="bookG" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8b5cf6"/><stop offset="1" stopColor="#6d28d9"/></linearGradient>
          </defs>
          <rect x="8" y="10" width="74" height="60" rx="6" fill="url(#bookG)" />
          <rect x="8" y="10" width="74" height="10" fill="#fff" opacity="0.2"/>
          <line x1="45" y1="10" x2="45" y2="70" stroke="#fff" strokeOpacity="0.3" strokeWidth="1" />
          <rect x="14" y="24" width="24" height="2" rx="1" fill="#fff" opacity="0.5"/>
          <rect x="14" y="30" width="20" height="2" rx="1" fill="#fff" opacity="0.4"/>
          <rect x="52" y="24" width="24" height="2" rx="1" fill="#fff" opacity="0.5"/>
        </svg>
      </div>

      {/* Floating atom bottom-right */}
      <div className="absolute -bottom-2 right-6 animate-float-y" style={{ animationDelay: "0.6s" }}>
        <svg viewBox="0 0 80 80" className="w-14 sm:w-16">
          <g fill="none" stroke="#0ea5e9" strokeWidth="2" transform="translate(40 40)">
            <ellipse rx="30" ry="12" />
            <ellipse rx="30" ry="12" transform="rotate(60)" />
            <ellipse rx="30" ry="12" transform="rotate(-60)" />
            <circle r="5" fill="#0ea5e9"/>
          </g>
        </svg>
      </div>

      {/* Small pencil */}
      <div className="absolute top-1/3 left-6 animate-float-y" style={{ animationDelay: "1.8s" }}>
        <svg viewBox="0 0 60 12" className="w-14 rotate-[-20deg] drop-shadow-md">
          <rect x="0" y="2" width="10" height="8" fill="#111827" />
          <polygon points="10,2 10,10 4,6" fill="#f8fafc"/>
          <rect x="10" y="2" width="30" height="8" fill="#fbbf24" />
          <rect x="40" y="2" width="14" height="8" fill="#f43f5e" />
          <rect x="54" y="2" width="6" height="8" fill="#e5e7eb" />
        </svg>
      </div>
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

  const features = [
    { icon: BookMarked, title: "كتب المناهج", description: "جميع كتب المناهج الأزهرية والعامة بصيغة PDF جاهزة للتحميل والمراجعة في أي وقت.", tone: "sky" },
    { icon: Video, title: "شروحات فيديو", description: "دروس مصورة عالية الجودة من أفضل المعلمين لشرح المناهج بطريقة مبسطة.", tone: "violet" },
    { icon: Bot, title: "المساعد الذكي", description: "مساعد ذكي يجيب على أسئلتك من الكتب والمناهج ويساعدك في فهم الدروس.", tone: "rose" },
    { icon: Headphones, title: "دعم فني متواصل", description: "فريق دعم متخصص للرد على استفساراتك ومساعدتك في حل أي مشكلة.", tone: "amber" },
  ] as const;

  const toneMap: Record<string, string> = {
    sky: "from-sky-400 to-blue-500 shadow-sky-500/30",
    violet: "from-violet-500 to-fuchsia-500 shadow-violet-500/30",
    rose: "from-rose-400 to-pink-500 shadow-rose-500/30",
    amber: "from-amber-400 to-orange-500 shadow-amber-500/30",
  };

  const stages = [
    { title: "المرحلة الإعدادية", grades: ["الصف الأول الإعدادي", "الصف الثاني الإعدادي", "الصف الثالث الإعدادي"], grad: "from-violet-500 to-fuchsia-600", cta: "from-violet-600 to-fuchsia-600", illust: "backpack" as const },
    { title: "المرحلة الثانوية", grades: ["الصف الأول الثانوي", "الصف الثاني الثانوي", "الصف الثالث الثانوي"], sections: ["علمي", "أدبي"], grad: "from-emerald-500 to-teal-600", cta: "from-emerald-600 to-teal-600", illust: "microscope" as const },
  ];

  const aiFeatures = [
    { icon: Zap, title: "إجابات فورية", text: "يجيب على أسئلتك في أي وقت" },
    { icon: FileText, title: "حل الواجبات", text: "يساعدك في حل الواجبات بخطوات مفصلة" },
    { icon: Lightbulb, title: "شرح مبسط", text: "يشرح الدروس بطرق مختلفة" },
    { icon: Target, title: "اختبارات ذكية", text: "يولّد اختبارات تفاعلية لك" },
  ];

  return (
    <div dir="rtl" className="min-h-screen flex flex-col overflow-x-hidden bg-[#FAFBFC] text-slate-900 selection:bg-emerald-200 selection:text-emerald-950 font-cairo">
      <Header />

      <main className="flex-1">
        {/* ============ HERO ============ */}
        <section className="relative overflow-hidden pt-10 pb-20 lg:pt-20 lg:pb-28 bg-gradient-to-b from-white via-[#FAFBFC] to-[#F3F6FB]">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-48 -right-40 h-[560px] w-[560px] rounded-full bg-emerald-200/35 blur-[100px]" />
            <div className="absolute -bottom-48 -left-40 h-[560px] w-[560px] rounded-full bg-sky-200/40 blur-[100px]" />
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 h-[300px] w-[600px] rounded-full bg-violet-200/25 blur-[100px]" />
            <EduBackdrop />
          </div>

          <div className="container relative mx-auto px-4 max-w-7xl">
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
              {/* Visual */}
              <div className="order-2 lg:order-1 relative h-[400px] sm:h-[480px] lg:h-[560px]">
                <HeroLaptopScene />
              </div>

              {/* Text side */}
              <div className="order-1 lg:order-2 text-center lg:text-right">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/60 bg-white/80 px-4 py-2 text-xs lg:text-sm text-emerald-800 backdrop-blur-xl shadow-[0_4px_20px_-8px_rgba(16,185,129,0.35)]">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
                  </span>
                  الجيل الجديد من التعليم الرقمي · إصدار 2026
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                </div>

                <h1 className="mt-6 text-4xl sm:text-5xl lg:text-[64px] font-black leading-[1.08] tracking-tight text-slate-900">
                  منصة تعليمية
                  <span className="mx-2 bg-gradient-to-l from-emerald-500 via-teal-500 to-emerald-600 bg-clip-text text-transparent">متكاملة</span>
                  <br />
                  للتعليم العام والأزهري
                </h1>

                <p className="mt-6 text-base lg:text-lg text-slate-600 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                  <span className="font-bold text-slate-900">مدرك Plus</span> — نوفر لك كل ما تحتاج من كتب ومناهج وشروحات فيديو ومساعد ذكي يجيب على أسئلتك ويساعدك على فهم دروسك.
                </p>

                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3">
                  <Button asChild size="lg" className="group w-full sm:w-auto h-14 px-8 text-base font-bold rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 text-white border-b-[3px] border-emerald-700 hover:translate-y-[-2px] hover:shadow-[0_20px_50px_-15px_rgba(16,185,129,0.6)] shadow-[0_10px_30px_-10px_rgba(16,185,129,0.5)] transition-all">
                    <Link to="/auth?mode=register" className="gap-2">
                      ابدأ رحلتك التعليمية
                      <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="w-full sm:w-auto h-14 px-8 text-base font-semibold rounded-2xl bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300 shadow-[0_6px_20px_-8px_rgba(15,23,42,0.15)]">
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
            <div className="mt-14 lg:mt-20 grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-5">
              <StatMini icon={Users} value={1000} label="طالب مسجل" tone="emerald" />
              <StatMini icon={GraduationCap} value={50} label="معلم متخصص" tone="sky" />
              <StatMini icon={PlayCircle} value={200} label="درس متاح" tone="violet" />
              <StatMini icon={FileText} value={1000} label="ملف تعليمي" tone="amber" />
            </div>

            <div className="mt-10 flex justify-center">
              <div className="inline-flex items-center gap-2 text-xs text-slate-400">
                <MousePointer2 className="h-3.5 w-3.5" />
                اسحب للأسفل
              </div>
            </div>
          </div>
        </section>

        {/* ============ WHY MUDRIK (dark) ============ */}
        <section className="relative py-20 lg:py-28 bg-[#0B1220] text-white overflow-hidden">
          <div aria-hidden className="absolute inset-0">
            <EduBackdrop dark />
            <div className="absolute top-10 right-10 h-72 w-72 rounded-full bg-emerald-500/15 blur-[100px]" />
            <div className="absolute bottom-10 left-10 h-72 w-72 rounded-full bg-violet-500/15 blur-[100px]" />
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
                <div
                  key={i}
                  className="group relative rounded-3xl bg-white p-6 lg:p-7 text-slate-900 hover:-translate-y-2 transition-all duration-500 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)] border border-white/60"
                >
                  <div className={`inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${toneMap[f.tone]} shadow-xl group-hover:scale-110 group-hover:-rotate-6 transition-all duration-300`}>
                    <f.icon className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="mt-5 text-lg font-extrabold text-slate-900">{f.title}</h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">{f.description}</p>
                  <div className="absolute inset-x-6 bottom-0 h-1 rounded-full bg-gradient-to-l from-transparent via-slate-200 to-transparent opacity-0 group-hover:opacity-100 transition" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ STAGES (dark) ============ */}
        <section className="relative py-20 lg:py-28 bg-gradient-to-b from-[#0B1220] to-[#0E1730] text-white overflow-hidden">
          <div aria-hidden className="absolute inset-0"><EduBackdrop dark /></div>

          <div className="container relative mx-auto px-4 max-w-6xl">
            <div className="text-center mb-14">
              <h2 className="text-3xl lg:text-5xl font-black tracking-tight">المراحل الدراسية</h2>
              <p className="mt-4 text-white/60 lg:text-lg">اختر مرحلتك الدراسية واستمتع بمحتوى تعليمي غني ومتكامل</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 lg:gap-7">
              {stages.map((stage, i) => (
                <div key={i} className="group relative overflow-hidden rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl p-7 lg:p-8 hover:bg-white/[0.06] transition shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]">
                  <div className={`absolute -top-32 -left-32 h-64 w-64 rounded-full bg-gradient-to-br ${stage.grad} opacity-25 blur-3xl`} />

                  <div className="relative grid grid-cols-[1fr_auto] items-start gap-4 mb-6">
                    <div>
                      <div className={`inline-flex h-11 w-11 rounded-2xl bg-gradient-to-br ${stage.grad} items-center justify-center shadow-lg mb-3`}>
                        <GraduationCap className="h-5 w-5 text-white" />
                      </div>
                      <h3 className="text-2xl lg:text-3xl font-black">{stage.title}</h3>
                    </div>
                    {/* Illustration */}
                    <div className="w-24 sm:w-28 opacity-95 group-hover:scale-110 transition-transform duration-500">
                      {stage.illust === "backpack" ? (
                        <svg viewBox="0 0 120 120" className="drop-shadow-2xl">
                          <defs>
                            <linearGradient id="bp" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8b5cf6"/><stop offset="1" stopColor="#5b21b6"/></linearGradient>
                          </defs>
                          <path d="M35 30 Q60 10 85 30" stroke="#7c3aed" strokeWidth="4" fill="none" strokeLinecap="round"/>
                          <rect x="22" y="30" width="76" height="80" rx="18" fill="url(#bp)"/>
                          <rect x="30" y="52" width="60" height="28" rx="8" fill="#f5f3ff" opacity="0.9"/>
                          <rect x="30" y="52" width="60" height="6" fill="#c4b5fd"/>
                          <circle cx="60" cy="66" r="3" fill="#7c3aed"/>
                        </svg>
                      ) : (
                        <svg viewBox="0 0 120 120" className="drop-shadow-2xl">
                          <defs>
                            <linearGradient id="mic" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#34d399"/><stop offset="1" stopColor="#059669"/></linearGradient>
                          </defs>
                          {/* stacked books */}
                          <rect x="12" y="90" width="60" height="10" rx="2" fill="#f59e0b"/>
                          <rect x="18" y="80" width="54" height="10" rx="2" fill="#ef4444"/>
                          <rect x="14" y="70" width="58" height="10" rx="2" fill="#3b82f6"/>
                          {/* microscope */}
                          <rect x="70" y="98" width="40" height="6" rx="3" fill="#1e293b"/>
                          <rect x="82" y="70" width="16" height="30" fill="url(#mic)"/>
                          <circle cx="90" cy="60" r="14" fill="#0f172a"/>
                          <rect x="86" y="30" width="8" height="30" rx="4" fill="url(#mic)"/>
                          <circle cx="90" cy="26" r="6" fill="#a7f3d0"/>
                        </svg>
                      )}
                    </div>
                  </div>

                  <ul className="relative space-y-2.5">
                    {stage.grades.map((g, k) => (
                      <li key={k} className="flex items-center gap-2 rounded-xl bg-white/[0.04] border border-white/10 px-4 py-2.5 text-sm text-white/85 hover:bg-white/[0.08] hover:border-white/20 transition">
                        <ArrowLeft className="h-4 w-4 text-emerald-400" />
                        {g}
                      </li>
                    ))}
                  </ul>

                  {stage.sections && (
                    <div className="relative mt-4 flex gap-2">
                      {stage.sections.map((s, k) => (
                        <span key={k} className="px-4 py-1.5 rounded-full bg-white/[0.05] border border-white/15 text-white/90 text-xs font-bold">{s}</span>
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

        {/* ============ AI ASSISTANT ============ */}
        <section className="relative py-20 lg:py-28 bg-gradient-to-br from-[#0b1220] via-[#0e1730] to-[#1a0f2e] text-white overflow-hidden">
          <div aria-hidden className="absolute inset-0">
            <EduBackdrop dark />
            <div className="absolute top-10 right-10 h-96 w-96 rounded-full bg-violet-500/25 blur-[100px] animate-blob" />
            <div className="absolute bottom-10 left-10 h-96 w-96 rounded-full bg-emerald-500/20 blur-[100px] animate-blob" style={{ animationDelay: "3s" }} />
          </div>

          <div className="container relative mx-auto px-4 max-w-7xl">
            <div className="text-center mb-12">
              <div className="mx-auto h-20 w-20 rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-2xl shadow-violet-500/40 mb-4 relative">
                <Brain className="h-10 w-10 text-white" />
                <div className="absolute -inset-2 rounded-3xl border border-violet-400/40 animate-pulse" />
              </div>
              <h2 className="text-3xl lg:text-5xl font-black">
                <span className="bg-gradient-to-l from-violet-300 via-fuchsia-300 to-sky-300 bg-clip-text text-transparent">المساعد الذكي</span>
              </h2>
              <p className="mt-3 text-white/70 lg:text-lg">رفيقك الذكي في رحلة التعلم</p>
            </div>

            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div className="grid grid-cols-2 gap-4">
                {aiFeatures.map((f, i) => (
                  <div key={i} className="rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur p-5 text-center hover:bg-white/[0.08] hover:-translate-y-0.5 transition">
                    <div className="mx-auto h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 border border-white/10 flex items-center justify-center mb-3 shadow-inner">
                      <f.icon className="h-5 w-5 text-violet-200" />
                    </div>
                    <div className="font-bold text-sm">{f.title}</div>
                    <div className="mt-1 text-[11px] text-white/60 leading-relaxed">{f.text}</div>
                  </div>
                ))}
                <div className="col-span-2">
                  <Button asChild size="lg" className="w-full h-13 rounded-2xl bg-gradient-to-l from-violet-600 to-fuchsia-600 border-b-[3px] border-violet-900 hover:-translate-y-0.5 transition font-bold shadow-[0_15px_40px_-10px_rgba(139,92,246,0.5)]">
                    <Link to="/auth?mode=register" className="gap-2">
                      <Sparkles className="h-4 w-4" />
                      جرّب المساعد الآن
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="relative">
                <div className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-violet-500/25 via-fuchsia-500/20 to-sky-500/25 blur-2xl" />
                <div className="relative rounded-[1.8rem] bg-slate-900/70 backdrop-blur-xl border border-white/10 shadow-2xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
                      <Bot className="h-5 w-5 text-white" />
                    </div>
                    <div className="text-sm font-bold">المساعد الذكي</div>
                    <span className="mr-auto text-[10px] text-emerald-300 inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> متصل
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

        {/* ============ NUMBERS ============ */}
        <section className="relative py-20 bg-[#0B1220] text-white overflow-hidden">
          <div aria-hidden className="absolute inset-0"><EduBackdrop dark /></div>
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

        {/* ============ FINAL CTA ============ */}
        <section className="relative py-20 bg-[#0B1220] overflow-hidden">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#0b1220] via-[#122036] to-[#0b1220] text-white shadow-[0_40px_100px_-40px_rgba(16,185,129,0.45)] border border-white/10">
              <div aria-hidden className="absolute inset-0">
                <div className="absolute -top-20 -right-20 h-80 w-80 rounded-full bg-emerald-500/25 blur-[100px]" />
                <div className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-sky-500/20 blur-[100px]" />
                <EduBackdrop dark />
              </div>

              <div className="relative grid lg:grid-cols-2 items-center gap-8 p-8 lg:p-14">
                <div className="text-center lg:text-right">
                  <h2 className="text-3xl lg:text-5xl font-black leading-tight">
                    جاهز لبدء <span className="bg-gradient-to-l from-emerald-300 to-teal-200 bg-clip-text text-transparent">رحلتك التعليمية</span>؟
                  </h2>
                  <p className="mt-4 text-white/70 lg:text-lg max-w-xl mx-auto lg:mx-0">
                    انضم الآن وابدأ رحلتك نحو التفوّق والنجاح مع مدرك Plus.
                  </p>
                  <div className="mt-7 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3">
                    <Button asChild size="lg" className="h-14 px-8 text-base font-bold rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 text-white border-b-[3px] border-emerald-800 hover:-translate-y-0.5 transition-all shadow-[0_15px_40px_-10px_rgba(16,185,129,0.5)]">
                      <Link to="/auth?mode=register" className="gap-2">
                        إنشاء حساب
                        <ArrowLeft className="h-5 w-5" />
                      </Link>
                    </Button>
                    <Button asChild size="lg" variant="outline" className="h-14 px-8 text-base font-semibold rounded-2xl bg-white/5 border border-white/20 text-white hover:bg-white/10 hover:text-white">
                      <Link to="/auth">تسجيل الدخول</Link>
                    </Button>
                  </div>
                </div>

                <div className="relative h-56 lg:h-72">
                  {/* graduation cap */}
                  <div className="absolute top-2 right-4 w-20 lg:w-24 animate-float-y">
                    <svg viewBox="0 0 100 80" className="w-full drop-shadow-2xl">
                      <path d="M50 8 L92 26 L50 44 L8 26 Z" fill="#0f172a" />
                      <path d="M22 32 L22 52 Q50 68 78 52 L78 32" fill="#1e293b" />
                      <line x1="88" y1="26" x2="88" y2="52" stroke="#facc15" strokeWidth="2"/>
                      <circle cx="88" cy="56" r="4" fill="#facc15"/>
                    </svg>
                  </div>
                  {/* globe */}
                  <div className="absolute top-14 left-8 h-20 w-20 rounded-full bg-gradient-to-br from-sky-400 to-indigo-600 shadow-2xl flex items-center justify-center animate-float-y" style={{ animationDelay: "0.8s" }}>
                    <Globe className="h-10 w-10 text-white" />
                  </div>
                  {/* books stack */}
                  <div className="absolute bottom-4 right-14 flex flex-col items-end gap-1.5 animate-float-y" style={{ animationDelay: "1.3s" }}>
                    <div className="h-4 w-24 rounded bg-emerald-500 shadow-lg" />
                    <div className="h-4 w-20 rounded bg-violet-500 shadow-lg" />
                    <div className="h-4 w-28 rounded bg-amber-500 shadow-lg" />
                  </div>
                  {/* laptop mini */}
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

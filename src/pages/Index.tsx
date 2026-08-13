import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import Seo from "@/components/seo/Seo";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AppDownloadSection from "@/components/AppDownloadSection";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen, Video, Bot, Headphones, GraduationCap, Sparkles,
  Zap, PlayCircle, ArrowLeft, Send,
  CheckCircle2, Target, Lightbulb,
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
  const stroke = dark ? "rgba(37,99,235,0.13)" : "rgba(37,99,235,0.12)";
  const fill = dark ? "rgba(5,150,105,0.08)" : "rgba(5,150,105,0.07)";
  return (
    <svg aria-hidden className="absolute inset-0 h-full w-full pointer-events-none" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="edu-grid" width="56" height="56" patternUnits="userSpaceOnUse">
          <path d="M56 0H0V56" fill="none" stroke={stroke} strokeWidth="0.6" opacity="0.35" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#edu-grid)" />
      {/* floating equations & school glyphs */}
      <g fill={fill} style={{ fontFamily: "Cairo, sans-serif", fontSize: 22, fontWeight: 800 }}>
        <text x="8%" y="18%">E = mc²</text>
        <text x="82%" y="12%">∑ x²</text>
        <text x="70%" y="72%">π · r²</text>
        <text x="12%" y="78%">√ x + y</text>
        <text x="46%" y="24%">H₂O</text>
        <text x="90%" y="52%">∫ dx</text>
      </g>
      {/* soft educational tools: ruler, pencil, notebook */}
      <g opacity="0.42" stroke={stroke} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <svg x="14%" y="42%" overflow="visible"><g transform="rotate(-18)">
          <rect x="0" y="0" width="126" height="24" rx="7" fill="rgba(255,255,255,0.46)" />
          <path d="M14 2v9M30 2v6M46 2v9M62 2v6M78 2v9M94 2v6M110 2v9" />
        </g></svg>
        <svg x="74%" y="31%" overflow="visible"><g transform="rotate(22)">
          <path d="M0 18 76 18 92 9 76 0 0 0z" fill="rgba(236,253,245,0.55)" />
          <path d="M76 0v18M10 3v12" />
        </g></svg>
        <svg x="76%" y="82%" overflow="visible"><g transform="rotate(-8)">
          <rect x="0" y="0" width="82" height="62" rx="10" fill="rgba(239,246,255,0.58)" />
          <path d="M18 14h46M18 28h40M18 42h32" />
        </g></svg>
      </g>
      {/* atoms */}
      <g fill="none" stroke={stroke} strokeWidth="0.8">
        <g transform="translate(90 320)">
          <ellipse rx="34" ry="12" />
          <ellipse rx="34" ry="12" transform="rotate(60)" />
          <ellipse rx="34" ry="12" transform="rotate(-60)" />
          <circle r="3" fill={stroke} />
        </g>
        <svg x="85%" y="65%" overflow="visible"><g>
          <ellipse rx="28" ry="10" />
          <ellipse rx="28" ry="10" transform="rotate(60)" />
          <ellipse rx="28" ry="10" transform="rotate(-60)" />
          <circle r="2.5" fill={stroke} />
        </g></svg>
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
    emerald: { chip: "landing-stat-emerald text-white", ring: "ring-emerald-100" },
    sky: { chip: "landing-stat-sky text-white", ring: "ring-sky-100" },
    violet: { chip: "landing-stat-violet text-white", ring: "ring-violet-100" },
    amber: { chip: "landing-stat-amber text-white", ring: "ring-amber-100" },
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

      {/* Real 3D laptop + robot render */}
      <div className="absolute inset-0 flex items-center justify-center">
        <img
          src={heroLaptopRobot}
          alt="مدرك Plus - منصة تعليمية متكاملة"
          width={1280}
          height={1024}
          className="relative z-10 w-[110%] max-w-none -mr-[5%] object-contain drop-shadow-[0_40px_60px_rgba(15,23,42,0.25)] animate-float-y"
          style={{ animationDuration: "7s" }}
        />
      </div>

      {/* Floating graduation cap top-left */}
      <div className="absolute top-2 left-2 sm:left-6 w-14 sm:w-20 animate-float-y z-20" style={{ animationDuration: "5s", animationDelay: "0.4s" }}>
        <svg viewBox="0 0 100 80" className="w-full drop-shadow-2xl">
          <path d="M50 8 L92 26 L50 44 L8 26 Z" fill="#2563eb" />
          <path d="M22 32 L22 52 Q50 68 78 52 L78 32" fill="#10b981" />
          <line x1="88" y1="26" x2="88" y2="52" stroke="#facc15" strokeWidth="3"/>
          <circle cx="88" cy="56" r="5" fill="#facc15"/>
        </svg>
      </div>

      {/* Floating atom bottom-right */}
      <div className="absolute bottom-4 right-4 animate-float-y z-20" style={{ animationDelay: "0.6s" }}>
        <svg viewBox="0 0 80 80" className="w-14 sm:w-16 drop-shadow-lg">
          <g fill="none" stroke="#8b5cf6" strokeWidth="2.5" transform="translate(40 40)">
            <ellipse rx="30" ry="12" />
            <ellipse rx="30" ry="12" transform="rotate(60)" />
            <ellipse rx="30" ry="12" transform="rotate(-60)" />
            <circle r="5" fill="#8b5cf6"/>
          </g>
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
    sky: "landing-icon-sky",
    violet: "landing-icon-violet",
    rose: "landing-icon-rose",
    amber: "landing-icon-amber",
  };

  const stages = [
    { title: "المرحلة الإعدادية", grades: ["الصف الأول الإعدادي", "الصف الثاني الإعدادي", "الصف الثالث الإعدادي"], grad: "landing-stage-violet", cta: "landing-cta-violet", illust: "backpack" as const },
    { title: "المرحلة الثانوية", grades: ["الصف الأول الثانوي", "الصف الثاني الثانوي", "الصف الثالث الثانوي"], sections: ["علمي", "أدبي"], grad: "landing-stage-emerald", cta: "landing-cta-emerald", illust: "microscope" as const },
  ];

  const aiFeatures = [
    { icon: Zap, title: "إجابات فورية", text: "يجيب على أسئلتك في أي وقت" },
    { icon: FileText, title: "حل الواجبات", text: "يساعدك في حل الواجبات بخطوات مفصلة" },
    { icon: Lightbulb, title: "شرح مبسط", text: "يشرح الدروس بطرق مختلفة" },
    { icon: Target, title: "اختبارات ذكية", text: "يولّد اختبارات تفاعلية لك" },
  ];

  return (
    <div dir="rtl" className="min-h-screen flex flex-col overflow-x-hidden bg-[#FAFBFC] text-slate-900 selection:bg-emerald-200 selection:text-emerald-950 font-cairo">
      <Seo
        title="مدرك Plus | منصة تعليمية للثانوية العامة والأزهرية في مصر"
        description="مدرك Plus منصة تعليمية مصرية للتعليم العام والأزهري: دروس فيديو، كتب ومناهج PDF، امتحانات إلكترونية بتصحيح فوري، مراجعات، ومساعد ذكي للطلاب في المرحلتين الإعدادية والثانوية."
        path="/"
        jsonLd={[{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "مدرك Plus — منصة تعليمية للثانوية العامة والأزهرية",
          url: "https://modrekplus.com/",
          inLanguage: "ar",
          isPartOf: { "@type": "WebSite", name: "مدرك Plus", url: "https://modrekplus.com/" },
          about: ["منصة تعليمية", "الثانوية العامة", "الثانوية الأزهرية", "التعليم الإلكتروني في مصر"],
        }]}
      />
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
                  <span className="mx-2 landing-text-emerald">متكاملة</span>
                  <br />
                  للتعليم العام والأزهري
                </h1>

                <p className="mt-6 text-base lg:text-lg text-slate-600 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                  <span className="font-bold text-slate-900">مدرك Plus</span> — نوفر لك كل ما تحتاج من كتب ومناهج وشروحات فيديو ومساعد ذكي يجيب على أسئلتك ويساعدك على فهم دروسك.
                </p>

                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3">
                  <Button asChild size="lg" className="landing-primary-btn group w-full sm:w-auto h-14 px-8 text-base font-bold rounded-2xl border-b-[3px] hover:translate-y-[-2px] transition-all">
                    <Link to="/auth?mode=register" className="gap-2">
                      ابدأ رحلتك التعليمية
                      <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="landing-outline-btn w-full sm:w-auto h-14 px-8 text-base font-semibold rounded-2xl">
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

        {/* ============ WHY MUDRIK ============ */}
        <section className="relative py-20 lg:py-28 bg-gradient-to-b from-[#F3F9FF] via-white to-[#F8FFFC] text-slate-900 overflow-hidden">
          <div aria-hidden className="absolute inset-0">
            <EduBackdrop />
            <div className="absolute top-10 right-10 h-72 w-72 rounded-full bg-emerald-200/45 blur-[100px]" />
            <div className="absolute bottom-10 left-10 h-72 w-72 rounded-full bg-sky-200/45 blur-[100px]" />
          </div>

          <div className="container relative mx-auto px-4 max-w-7xl">
            <div className="text-center mb-14">
              <h2 className="text-3xl lg:text-5xl font-black tracking-tight">
                لماذا <span className="landing-text-emerald">مدرك Plus</span> ؟
              </h2>
              <p className="mt-4 text-slate-600 lg:text-lg max-w-2xl mx-auto">
                نقدم لك تجربة تعليمية متكاملة تجمع بين التقنية الحديثة والمنهج الأزهري والعام
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {features.map((f, i) => (
                <div
                  key={i}
                  className="group relative rounded-3xl bg-white/90 backdrop-blur-xl p-6 lg:p-7 text-slate-900 hover:-translate-y-2 transition-all duration-500 shadow-[0_22px_55px_-22px_rgba(37,99,235,0.24)] border border-white/80"
                >
                  <div className={`inline-flex h-16 w-16 items-center justify-center rounded-2xl ${toneMap[f.tone]} shadow-xl group-hover:scale-110 group-hover:-rotate-6 transition-all duration-300`}>
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

        {/* ============ STAGES ============ */}
        <section className="relative py-20 lg:py-28 bg-gradient-to-b from-[#F8FFFC] via-[#F3F9FF] to-white text-slate-900 overflow-hidden">
          <div aria-hidden className="absolute inset-0"><EduBackdrop /></div>

          <div className="container relative mx-auto px-4 max-w-6xl">
            <div className="text-center mb-14">
              <h2 className="text-3xl lg:text-5xl font-black tracking-tight">المراحل الدراسية</h2>
              <p className="mt-4 text-slate-600 lg:text-lg">اختر مرحلتك الدراسية واستمتع بمحتوى تعليمي غني ومتكامل</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 lg:gap-7">
              {stages.map((stage, i) => (
                <div key={i} className="group relative overflow-hidden rounded-3xl bg-white/90 border border-white/80 backdrop-blur-xl p-7 lg:p-8 hover:bg-white transition shadow-[0_24px_70px_-28px_rgba(37,99,235,0.28)]">
                  <div className={`absolute -top-32 -left-32 h-64 w-64 rounded-full ${stage.grad} opacity-20 blur-3xl`} />

                  <div className="relative grid grid-cols-[1fr_auto] items-start gap-4 mb-6">
                    <div>
                      <div className={`inline-flex h-11 w-11 rounded-2xl ${stage.grad} items-center justify-center shadow-lg mb-3`}>
                        <GraduationCap className="h-5 w-5 text-white" />
                      </div>
                      <h3 className="text-2xl lg:text-3xl font-black text-slate-900">{stage.title}</h3>
                    </div>
                    {/* 3D Illustration */}
                    <div className="w-28 sm:w-36 lg:w-40 group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-500">
                      <img
                        src={stage.illust === "backpack" ? stagePrepImg : stageSecondaryImg}
                        alt={stage.title}
                        width={912}
                        height={912}
                        loading="lazy"
                        className="w-full h-auto object-contain drop-shadow-[0_20px_34px_rgba(37,99,235,0.22)]"
                      />
                    </div>
                  </div>

                  <ul className="relative space-y-2.5">
                    {stage.grades.map((g, k) => (
                      <li key={k} className="flex items-center gap-2 rounded-xl bg-[#F8FAFC]/90 border border-slate-200/70 px-4 py-2.5 text-sm text-slate-700 hover:bg-emerald-50 hover:border-emerald-200 transition">
                        <ArrowLeft className="h-4 w-4 text-emerald-600" />
                        {g}
                      </li>
                    ))}
                  </ul>

                  {stage.sections && (
                    <div className="relative mt-4 flex gap-2">
                      {stage.sections.map((s, k) => (
                        <span key={k} className="px-4 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">{s}</span>
                      ))}
                    </div>
                  )}

                  <Button asChild className={`relative mt-6 w-full h-12 rounded-xl ${stage.cta} text-white border-0 hover:opacity-95 shadow-lg font-bold`}>
                    <Link to="/auth?mode=register" className="gap-2">
                      استكشف المحتوى
                      <ArrowLeft className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>

            {/* Crawlable internal links to the stage / feature hub pages */}
            <nav aria-label="أقسام المنصة" className="relative mt-10 rounded-3xl bg-white/85 border border-white/80 backdrop-blur-xl p-6 shadow-[0_18px_60px_-32px_rgba(37,99,235,0.28)]">
              <h3 className="text-base font-black text-slate-900">تعرّف على أقسام المنصة</h3>
              <ul className="mt-4 flex flex-wrap gap-2.5">
                {[
                  { label: "المراحل والمواد الدراسية", path: "/education" },
                  { label: "منصة تعليمية للثانوية العامة", path: "/education/secondary-general" },
                  { label: "منصة تعليمية للثانوية الأزهرية", path: "/education/secondary-azhari" },
                  { label: "المرحلة الإعدادية", path: "/education/preparatory" },
                  { label: "المساعد الذكي Modrek AI", path: "/features/ai-assistant" },
                  { label: "الكتب والمناهج", path: "/features/books" },
                  { label: "الامتحانات والمراجعات", path: "/features/exams" },
                  { label: "المعلمون على المنصة", path: "/teachers" },
                ].map((l) => (
                  <li key={l.path}>
                    <Link
                      to={l.path}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-[#F8FAFC] px-4 py-2 text-[13px] font-bold text-slate-700 hover:border-emerald-300 hover:text-emerald-700 transition-colors"
                    >
                      {l.label}
                      <ArrowLeft className="h-3.5 w-3.5 opacity-60" />
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </section>

        {/* ============ AI ASSISTANT ============ */}
        <section className="relative py-20 lg:py-28 bg-gradient-to-br from-white via-[#F5F8FF] to-[#F7FFF9] text-slate-900 overflow-hidden">
          <div aria-hidden className="absolute inset-0">
            <EduBackdrop />
            <div className="absolute top-10 right-10 h-96 w-96 rounded-full bg-violet-200/45 blur-[100px] animate-blob" />
            <div className="absolute bottom-10 left-10 h-96 w-96 rounded-full bg-emerald-200/45 blur-[100px] animate-blob" style={{ animationDelay: "3s" }} />
          </div>

          <div className="container relative mx-auto px-4 max-w-7xl">
            <div className="text-center mb-12">
              <div className="mx-auto mb-4 relative w-40 h-40 lg:w-52 lg:h-52">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-200/70 via-fuchsia-200/45 to-sky-200/60 blur-3xl animate-pulse" />
                <img
                  src={aiBrainImg}
                  alt="المساعد الذكي"
                  width={912}
                  height={912}
                  loading="lazy"
                  className="relative w-full h-full object-contain drop-shadow-[0_20px_40px_rgba(124,58,237,0.24)] animate-float-y"
                  style={{ animationDuration: "5s" }}
                />
              </div>
              <h2 className="text-3xl lg:text-5xl font-black">
                <span className="landing-text-violet">المساعد الذكي</span>
              </h2>
              <p className="mt-3 text-slate-600 lg:text-lg">رفيقك الذكي في رحلة التعلم</p>
            </div>

            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div className="grid grid-cols-2 gap-4">
                {aiFeatures.map((f, i) => (
                  <div key={i} className="rounded-2xl bg-white/90 border border-white/80 backdrop-blur p-5 text-center hover:bg-white hover:-translate-y-0.5 transition shadow-[0_18px_45px_-28px_rgba(124,58,237,0.35)]">
                    <div className="mx-auto h-12 w-12 rounded-xl bg-gradient-to-br from-violet-100 to-fuchsia-100 border border-violet-100 flex items-center justify-center mb-3 shadow-inner">
                      <f.icon className="h-5 w-5 text-violet-700" />
                    </div>
                    <div className="font-bold text-sm text-slate-900">{f.title}</div>
                    <div className="mt-1 text-[11px] text-slate-500 leading-relaxed">{f.text}</div>
                  </div>
                ))}
                <div className="col-span-2">
                  <Button asChild size="lg" className="landing-ai-btn w-full h-14 rounded-2xl border-b-[3px] hover:-translate-y-0.5 transition font-bold">
                    <Link to="/auth?mode=register" className="gap-2">
                      <Sparkles className="h-4 w-4" />
                      جرّب المساعد الآن
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="relative">
                <div className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-violet-200/65 via-fuchsia-200/40 to-sky-200/65 blur-2xl" />
                <div className="relative rounded-[1.8rem] bg-white/90 backdrop-blur-xl border border-white/80 shadow-[0_24px_80px_-30px_rgba(37,99,235,0.35)] p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
                      <Bot className="h-5 w-5 text-white" />
                    </div>
                    <div className="text-sm font-bold text-slate-900">المساعد الذكي</div>
                    <span className="mr-auto text-[10px] text-emerald-600 inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> متصل
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-emerald-50 border border-emerald-100 px-4 py-2.5 text-sm text-slate-700">
                        مرحباً! أنا هنا لمساعدتك
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-sky-50 border border-sky-100 px-4 py-2.5 text-sm text-slate-700">
                        كيف يمكنني مساعدتك اليوم؟
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2 rounded-2xl bg-slate-50 border border-slate-200 px-3 py-2.5">
                      <div className="flex-1 text-sm text-slate-400">اكتب سؤالك هنا...</div>
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
        <section className="relative py-20 bg-gradient-to-b from-[#F7FFF9] via-white to-[#F3F9FF] text-slate-900 overflow-hidden">
          <div aria-hidden className="absolute inset-0"><EduBackdrop /></div>
          <div className="container relative mx-auto px-4 max-w-7xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-5xl font-black">
                مدرك <span className="landing-text-emerald">Plus</span> في أرقام
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
        <section className="relative py-20 bg-gradient-to-b from-[#F3F9FF] via-white to-[#FAFBFC] overflow-hidden">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="relative overflow-hidden rounded-[2rem] bg-white/90 text-slate-900 shadow-[0_34px_90px_-38px_rgba(37,99,235,0.36)] border border-white/80 backdrop-blur-xl">
              <div aria-hidden className="absolute inset-0">
                <div className="absolute -top-20 -right-20 h-80 w-80 rounded-full bg-emerald-200/55 blur-[100px]" />
                <div className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-sky-200/55 blur-[100px]" />
                <EduBackdrop />
              </div>

              <div className="relative grid lg:grid-cols-2 items-center gap-8 p-8 lg:p-14">
                <div className="text-center lg:text-right">
                  <h2 className="text-3xl lg:text-5xl font-black leading-tight">
                    جاهز لبدء <span className="landing-text-emerald">رحلتك التعليمية</span>؟
                  </h2>
                  <p className="mt-4 text-slate-600 lg:text-lg max-w-xl mx-auto lg:mx-0">
                    انضم الآن وابدأ رحلتك نحو التفوّق والنجاح مع مدرك Plus.
                  </p>
                  <div className="mt-7 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3">
                    <Button asChild size="lg" className="landing-primary-btn h-14 px-8 text-base font-bold rounded-2xl border-b-[3px] hover:-translate-y-0.5 transition-all">
                      <Link to="/auth?mode=register" className="gap-2">
                        إنشاء حساب
                        <ArrowLeft className="h-5 w-5" />
                      </Link>
                    </Button>
                    <Button asChild size="lg" variant="outline" className="landing-outline-btn h-14 px-8 text-base font-semibold rounded-2xl">
                      <Link to="/auth">تسجيل الدخول</Link>
                    </Button>
                  </div>
                </div>

                <div className="relative h-56 sm:h-64 lg:h-80 flex items-center justify-center">
                  <div aria-hidden className="absolute inset-0 bg-[radial-gradient(closest-side,rgba(16,185,129,0.18),transparent_70%)]" />
                  <img
                    src={ctaGroupImg}
                    alt="ابدأ رحلتك التعليمية"
                    width={1280}
                    height={912}
                    loading="lazy"
                    className="relative w-[92%] max-w-md object-contain drop-shadow-[0_25px_40px_rgba(37,99,235,0.25)] animate-float-y"
                    style={{ animationDuration: "6s" }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      <AppDownloadSection />
      </main>

      <Footer />
    </div>
  );
};

export default Index;

import Seo from "@/components/seo/Seo";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import mudrikLogo from "@/assets/mudrik-logo.png";
import {
  BookOpen,
  GraduationCap,
  Users,
  Target,
  Heart,
  Award,
  Sparkles,
  ShieldCheck,
  Rocket,
} from "lucide-react";

const About = () => {
  const values = [
    {
      icon: Target,
      title: "الرسالة",
      description: "توفير تعليم عالي الجودة للتعليم العام والأزهري، متاح للجميع بأحدث التقنيات.",
      color: "#2563EB",
      bg: "linear-gradient(135deg, #EFF6FF, #DBEAFE)",
    },
    {
      icon: GraduationCap,
      title: "الرؤية",
      description: "أن نكون المنصة التعليمية الرائدة في العالم العربي للتعليم العام والأزهري.",
      color: "#16A34A",
      bg: "linear-gradient(135deg, #F0FDF4, #DCFCE7)",
    },
    {
      icon: Heart,
      title: "القيم",
      description: "الإتقان، الأمانة العلمية، سهولة الوصول، والتطوير المستمر.",
      color: "#7C3AED",
      bg: "linear-gradient(135deg, #F5F3FF, #EDE9FE)",
    },
  ];

  const stats = [
    { icon: BookOpen, title: "كتب رقمية", value: "100+", color: "#2563EB", bg: "#EFF6FF" },
    { icon: Users, title: "طالب مسجل", value: "1000+", color: "#16A34A", bg: "#F0FDF4" },
    { icon: Award, title: "معلم معتمد", value: "50+", color: "#EA580C", bg: "#FFF7ED" },
  ];

  const highlights = [
    { icon: Sparkles, text: "محتوى تفاعلي بالذكاء الاصطناعي" },
    { icon: ShieldCheck, text: "بيئة تعلم آمنة وموثوقة" },
    { icon: Rocket, text: "متابعة مستمرة لأداء الطالب" },
  ];

  return (
      <Seo title="عن منصة مدرك Plus | منصة تعليمية مصرية للثانوية العامة والأزهرية" description="تعرّف على منصة مدرك Plus التعليمية: فكرة المنصة، المراحل والمواد التي تغطيها، أدوات المذاكرة من دروس وكتب وامتحانات ومساعد ذكي لطلاب التعليم العام والأزهري في مصر." path="/about" />
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1" style={{ background: "#FFFFFF" }}>
        {/* Hero */}
        <section
          className="relative overflow-hidden px-4 pt-10 pb-12"
          style={{ background: "linear-gradient(160deg, #F0FDF4 0%, #FFFFFF 45%, #EFF6FF 100%)" }}
        >
          <div
            className="absolute -top-16 -right-16 w-56 h-56 rounded-full blur-3xl opacity-40 pointer-events-none"
            style={{ background: "#BBF7D0" }}
          />
          <div
            className="absolute -bottom-20 -left-16 w-64 h-64 rounded-full blur-3xl opacity-40 pointer-events-none"
            style={{ background: "#BFDBFE" }}
          />

          <div className="relative container flex flex-col items-center text-center gap-4">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center"
              style={{
                background: "#FFFFFF",
                border: "1px solid #E2E8F0",
                boxShadow: "0 12px 30px -12px rgba(22,163,74,0.25)",
              }}
            >
              <img src={mudrikLogo} alt="منصة مدرك Plus" className="w-14 h-14 object-contain" />
            </div>

            <h1 className="text-2xl md:text-4xl font-extrabold" style={{ color: "#1E293B" }}>
              عن منصة مدرك <span style={{ color: "#16A34A" }}>Plus</span>
            </h1>
            <p className="text-sm md:text-base max-w-xl leading-relaxed" style={{ color: "#475569" }}>
              منصة تعليمية متكاملة تجمع بين التعليم العام والأزهري، وتقدّم تجربة تعلم حديثة وذكية
              مصمّمة خصيصًا للطالب العربي.
            </p>

            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {highlights.map((h, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 text-[11px] md:text-xs font-medium rounded-full px-3 py-1.5"
                  style={{
                    background: "rgba(255,255,255,0.85)",
                    border: "1px solid #E2E8F0",
                    color: "#0F172A",
                    backdropFilter: "blur(6px)",
                  }}
                >
                  <h.icon className="w-3.5 h-3.5" style={{ color: "#16A34A" }} />
                  {h.text}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="px-4 -mt-5 relative z-10">
          <div className="container grid grid-cols-3 gap-2.5 md:gap-4 max-w-3xl">
            {stats.map((s, i) => (
              <div
                key={i}
                className="rounded-2xl p-3 md:p-5 text-center animate-scale-in"
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #E2E8F0",
                  boxShadow: "0 8px 20px -14px rgba(15,23,42,0.15)",
                  animationDelay: `${i * 0.08}s`,
                }}
              >
                <div
                  className="mx-auto mb-1.5 flex h-9 w-9 md:h-11 md:w-11 items-center justify-center rounded-xl"
                  style={{ background: s.bg }}
                >
                  <s.icon className="h-4 w-4 md:h-5 md:w-5" style={{ color: s.color }} />
                </div>
                <div className="text-lg md:text-2xl font-extrabold leading-tight" style={{ color: s.color }}>
                  {s.value}
                </div>
                <div className="text-[10px] md:text-xs font-medium" style={{ color: "#64748B" }}>
                  {s.title}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Values */}
        <section className="px-4 py-10">
          <div className="container max-w-3xl">
            <h2 className="text-lg md:text-xl font-bold mb-4 flex items-center gap-2" style={{ color: "#1E293B" }}>
              <span className="inline-block w-1.5 h-5 rounded-full" style={{ background: "#16A34A" }} />
              رسالتنا وقيمنا
            </h2>
            <div className="grid gap-3">
              {values.map((value, index) => (
                <Card
                  key={index}
                  className="overflow-hidden animate-slide-up"
                  style={{
                    background: "#FFFFFF",
                    border: "1px solid #E2E8F0",
                    animationDelay: `${index * 0.08}s`,
                    boxShadow: "0 6px 18px -14px rgba(15,23,42,0.18)",
                  }}
                >
                  <CardContent className="p-4 flex items-start gap-3">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                      style={{ background: value.bg }}
                    >
                      <value.icon className="h-6 w-6" style={{ color: value.color }} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-bold mb-1" style={{ color: "#1E293B" }}>
                        {value.title}
                      </h3>
                      <p className="text-xs md:text-sm leading-relaxed" style={{ color: "#64748B" }}>
                        {value.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default About;

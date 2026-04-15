import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  BookOpen,
  Video,
  Bot,
  Users,
  GraduationCap,
  ChevronLeft,
  Star,
  Shield,
  Zap,
} from "lucide-react";

const Index = () => {
  const features = [
    {
      icon: BookOpen,
      title: "كتب المناهج",
      description: "جميع كتب المناهج الأزهرية بصيغة PDF جاهزة للتحميل والمراجعة في أي وقت",
    },
    {
      icon: Video,
      title: "شروحات فيديو",
      description: "دروس مصورة عالية الجودة من أفضل المعلمين لشرح المناهج بطريقة مبسطة",
    },
    {
      icon: Bot,
      title: "المساعد الذكي",
      description: "مساعد ذكي يجيب على أسئلتك من الكتب المرفوعة ويساعدك في فهم الدروس",
    },
    {
      icon: Users,
      title: "دعم فني متواصل",
      description: "فريق دعم متخصص للرد على استفساراتك ومساعدتك في حل أي مشكلة",
    },
  ];

  const stages = [
    {
      title: "المرحلة الإعدادية",
      grades: ["الصف الأول", "الصف الثاني", "الصف الثالث"],
      color: "from-primary to-azhari-light",
    },
    {
      title: "المرحلة الثانوية",
      grades: ["الصف الأول", "الصف الثاني", "الصف الثالث"],
      sections: ["علمي", "أدبي"],
      color: "from-gold to-gold-dark",
    },
  ];

  const stats = [
    { value: "1000+", label: "طالب مسجل" },
    { value: "50+", label: "معلم متميز" },
    { value: "200+", label: "درس فيديو" },
    { value: "100+", label: "كتاب PDF" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background overflow-x-hidden">
      <Header />

      <main className="flex-1">
        {/* قسم البطل */}
        <section className="relative overflow-hidden gradient-mudrik py-12 lg:py-20 xl:py-32">
          <div className="absolute inset-0 pattern-islamic opacity-10" />
          <div className="container relative px-4 max-w-full">
            <div className="mx-auto max-w-4xl text-center">
              <div className="mb-4 lg:mb-6 inline-flex items-center gap-2 rounded-full bg-primary-foreground/10 px-3 lg:px-4 py-1.5 lg:py-2 text-xs lg:text-sm text-primary-foreground backdrop-blur animate-fade-in">
                <Star className="h-3 w-3 lg:h-4 lg:w-4 text-gold" />
                <span>منصة تعليمية متكاملة للتعليم العام والأزهري</span>
              </div>

              <h1 className="mb-4 lg:mb-6 text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold leading-tight text-primary-foreground animate-slide-up">
                تعلّم بطريقة
                <span className="block text-gold mt-1 lg:mt-2">أسهل وأذكى</span>
              </h1>

              <p className="mb-6 lg:mb-10 text-sm lg:text-lg xl:text-xl text-primary-foreground/80 max-w-2xl mx-auto animate-slide-up delay-100 px-2">
                منصة مدرك Plus توفر لك كل ما تحتاجه من مناهج وكتب وفيديوهات شرح مع مساعد ذكي يجيب على أسئلتك من الكتب مباشرة
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 lg:gap-4 animate-slide-up delay-200">
                <Button variant="gold" size="lg" asChild className="w-full sm:w-auto">
                  <Link to="/auth?mode=register" className="gap-2">
                    ابدأ رحلتك التعليمية
                    <ChevronLeft className="h-4 w-4 lg:h-5 lg:w-5" />
                  </Link>
                </Button>
                <Button variant="heroOutline" size="lg" asChild className="w-full sm:w-auto">
                  <Link to="/about">اعرف المزيد</Link>
                </Button>
              </div>
            </div>

            {/* الإحصائيات */}
            <div className="mt-10 lg:mt-16 grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-6 animate-slide-up delay-300">
              {stats.map((stat, index) => (
                <div
                  key={index}
                  className="text-center p-3 lg:p-6 rounded-xl bg-primary-foreground/10 backdrop-blur"
                >
                  <div className="text-xl lg:text-3xl font-bold text-gold mb-0.5 lg:mb-1">{stat.value}</div>
                  <div className="text-xs lg:text-sm text-primary-foreground/70">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* قسم المميزات */}
        <section className="py-20 bg-background">
          <div className="container px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-foreground mb-4">
                لماذا <span className="text-gradient-mudrik">مدرك Plus</span>؟
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                نوفر لك تجربة تعليمية متكاملة تجمع بين التقنية الحديثة والمنهج الأزهري العريق
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature, index) => (
                <Card
                  key={index}
                  className="group hover:border-primary/50 animate-scale-in"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <CardContent className="p-6 text-center">
                    <div className="mb-4 mx-auto flex h-14 w-14 items-center justify-center rounded-xl gradient-mudrik text-primary-foreground transition-transform duration-300 group-hover:scale-110">
                      <feature.icon className="h-7 w-7" />
                    </div>
                    <h3 className="mb-2 font-bold text-foreground">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* قسم المراحل الدراسية */}
        <section className="py-20 bg-muted/30 pattern-islamic">
          <div className="container px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-foreground mb-4">المراحل الدراسية</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                اختر مرحلتك الدراسية واستمتع بمحتوى تعليمي غني ومتكامل
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {stages.map((stage, index) => (
                <Card
                  key={index}
                  className="overflow-hidden group hover:shadow-lg animate-slide-up"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className={`h-2 bg-gradient-to-l ${stage.color}`} />
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-bl ${stage.color}`}>
                        <GraduationCap className="h-6 w-6 text-primary-foreground" />
                      </div>
                      <h3 className="text-xl font-bold text-foreground">{stage.title}</h3>
                    </div>

                    <div className="space-y-2 mb-4">
                      {stage.grades.map((grade, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-sm text-muted-foreground"
                        >
                          <ChevronLeft className="h-4 w-4 text-primary" />
                          {grade}
                        </div>
                      ))}
                    </div>

                    {stage.sections && (
                      <div className="flex gap-2 mb-4">
                        {stage.sections.map((section, i) => (
                          <span
                            key={i}
                            className="px-3 py-1 rounded-full bg-accent text-accent-foreground text-xs font-medium"
                          >
                            {section}
                          </span>
                        ))}
                      </div>
                    )}

                    <Button variant="outline" className="w-full group-hover:bg-primary group-hover:text-primary-foreground">
                      استكشف المحتوى
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* قسم الأمان */}
        <section className="py-20 bg-background">
          <div className="container px-4">
            <div className="grid lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
              <div>
                <h2 className="text-3xl font-bold text-foreground mb-6">
                  منصة <span className="text-gradient-gold">آمنة</span> وموثوقة
                </h2>
                <p className="text-muted-foreground mb-8 leading-relaxed">
                  نحرص على توفير بيئة تعليمية آمنة لجميع الطلاب. يتم مراجعة المحتوى من قبل معلمين متخصصين ومعتمدين.
                </p>

                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <Shield className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground mb-1">حماية البيانات</h4>
                      <p className="text-sm text-muted-foreground">
                        بياناتك الشخصية محمية بأعلى معايير الأمان
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground mb-1">معلمون معتمدون</h4>
                      <p className="text-sm text-muted-foreground">
                        جميع المعلمين يخضعون لعملية موافقة ومراجعة
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <Zap className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground mb-1">أداء سريع</h4>
                      <p className="text-sm text-muted-foreground">
                        تجربة سلسة وسريعة على جميع الأجهزة
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative">
                <div className="aspect-square rounded-2xl gradient-mudrik p-8 flex items-center justify-center shadow-mudrik">
                  <div className="text-center text-primary-foreground">
                    <GraduationCap className="h-24 w-24 mx-auto mb-6 animate-float" />
                    <h3 className="text-2xl font-bold mb-2">تعلّم بثقة</h3>
                    <p className="text-primary-foreground/80">مع مدرك Plus</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 gradient-mudrik relative overflow-hidden">
          <div className="absolute inset-0 pattern-islamic opacity-10" />
          <div className="container relative px-4 text-center">
            <h2 className="text-3xl font-bold text-primary-foreground mb-4">
              جاهز لبدء رحلتك التعليمية؟
            </h2>
            <p className="text-primary-foreground/80 mb-8 max-w-xl mx-auto">
              انضم لآلاف الطلاب الذين يستخدمون مدرك Plus للتفوق في دراستهم
            </p>
            <Button variant="gold" size="xl" asChild>
              <Link to="/auth?mode=register" className="gap-2">
                سجّل الآن مجاناً
                <ChevronLeft className="h-5 w-5" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Index;

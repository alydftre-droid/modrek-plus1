import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { 
  BookOpen, 
  GraduationCap, 
  Users, 
  Target, 
  Heart, 
  Award,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";

const About = () => {
  const values = [
    {
      icon: Target,
      title: "الرسالة",
      description: "توفير تعليم أزهري عالي الجودة متاح للجميع، باستخدام أحدث التقنيات التعليمية.",
    },
    {
      icon: GraduationCap,
      title: "الرؤية",
      description: "أن نكون المنصة التعليمية الرائدة للتعليم العام والأزهري في العالم العربي.",
    },
    {
      icon: Heart,
      title: "القيم",
      description: "الإتقان، الأمانة العلمية، سهولة الوصول، والتطوير المستمر.",
    },
  ];

  const features = [
    { icon: BookOpen, title: "كتب رقمية", value: "100+" },
    { icon: Users, title: "طالب مسجل", value: "1000+" },
    { icon: Award, title: "معلم معتمد", value: "50+" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1">
        {/* قسم البطل */}
        <section className="relative py-20 gradient-mudrik overflow-hidden">
          <div className="absolute inset-0 pattern-islamic opacity-10" />
          <div className="container relative px-4 text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-primary-foreground mb-4 animate-slide-up">
              عن منصة <span className="text-gold">مدرك Plus</span>
            </h1>
            <p className="text-lg text-primary-foreground/80 max-w-2xl mx-auto animate-slide-up delay-100">
              منصة تعليمية متكاملة تهدف إلى تسهيل رحلة التعلم للتعليم العام والأزهري
            </p>
          </div>
        </section>

        {/* قسم القيم */}
        <section className="py-20 bg-background">
          <div className="container px-4">
            <div className="grid md:grid-cols-3 gap-8">
              {values.map((value, index) => (
                <Card key={index} className="text-center animate-scale-in" style={{ animationDelay: `${index * 0.1}s` }}>
                  <CardContent className="p-8">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full gradient-mudrik">
                      <value.icon className="h-8 w-8 text-primary-foreground" />
                    </div>
                    <h3 className="text-xl font-bold text-foreground mb-3">{value.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{value.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* قسم الإحصائيات */}
        <section className="py-16 bg-muted/30">
          <div className="container px-4">
            <div className="grid md:grid-cols-3 gap-8">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="text-center p-6 animate-slide-up"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-accent">
                    <feature.icon className="h-7 w-7 text-primary" />
                  </div>
                  <div className="text-3xl font-bold text-gradient-mudrik mb-1">{feature.value}</div>
                  <div className="text-muted-foreground">{feature.title}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* قسم المطور */}
        <section className="py-20 bg-background">
          <div className="container px-4">
            <div className="max-w-2xl mx-auto">
              <Card className="overflow-hidden">
                <div className="h-2 gradient-gold" />
                <CardContent className="p-8 text-center">
                  <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-bl from-primary to-azhari-dark">
                    <span className="text-4xl font-bold text-primary-foreground">ع</span>
                  </div>
                  
                  <h2 className="text-2xl font-bold text-foreground mb-2">علي محمد علي</h2>
                  <p className="text-gold font-medium mb-6">مطور ومؤسس منصة مدرك Plus</p>

                  <div className="space-y-3">
                    <a
                      href="mailto:alyedaft@gmail.com"
                      className="flex items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Mail className="h-5 w-5" />
                      alyedaft@gmail.com
                    </a>
                    <a
                      href="https://wa.me/201223909712"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Phone className="h-5 w-5" />
                      01223909712
                    </a>
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <MapPin className="h-5 w-5" />
                      بني سويف، مصر
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default About;

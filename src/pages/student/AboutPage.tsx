import { Card, CardContent } from "@/components/ui/card";
import StudentLayout from "@/components/student/StudentLayout";
import {
  BookOpen,
  Target,
  GraduationCap,
  Heart,
  Users,
  Award,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";

const StudentAboutPage = () => {
  const values = [
    { icon: Target, title: "الرسالة", description: "توفير تعليم أزهري عالي الجودة متاح للجميع، باستخدام أحدث التقنيات التعليمية." },
    { icon: GraduationCap, title: "الرؤية", description: "أن نكون المنصة التعليمية الرائدة للتعليم العام والأزهري في العالم العربي." },
    { icon: Heart, title: "القيم", description: "الإتقان، الأمانة العلمية، سهولة الوصول، والتطوير المستمر." },
  ];

  const features = [
    { icon: BookOpen, title: "كتب رقمية", value: "100+" },
    { icon: Users, title: "طالب مسجل", value: "1000+" },
    { icon: Award, title: "معلم معتمد", value: "50+" },
  ];

  return (
    <StudentLayout title="عن المنصة">
      <div>
        {/* Hero Section */}
        <section className="relative py-16 gradient-mudrik overflow-hidden">
          <div className="absolute inset-0 pattern-islamic opacity-10" />
          <div className="container relative px-4 text-center">
            <h1 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4 animate-slide-up">
              عن منصة <span className="text-gold">مدرك Plus</span>
            </h1>
            <p className="text-lg text-primary-foreground/80 max-w-2xl mx-auto animate-slide-up delay-100">
              منصة تعليمية متكاملة تهدف إلى تسهيل رحلة التعلم للتعليم العام والأزهري
            </p>
          </div>
        </section>

        {/* Values */}
        <section className="py-16 bg-background">
          <div className="container px-4">
            <div className="grid md:grid-cols-3 gap-6">
              {values.map((value, index) => (
                <Card key={index} className="text-center animate-scale-in" style={{ animationDelay: `${index * 0.1}s` }}>
                  <CardContent className="p-6">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full gradient-mudrik">
                      <value.icon className="h-7 w-7 text-primary-foreground" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground mb-2">{value.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{value.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="py-12 bg-muted/30">
          <div className="container px-4">
            <div className="grid md:grid-cols-3 gap-6">
              {features.map((feature, index) => (
                <div key={index} className="text-center p-6 animate-slide-up" style={{ animationDelay: `${index * 0.1}s` }}>
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="text-2xl font-bold text-gradient-mudrik mb-1">{feature.value}</div>
                  <div className="text-muted-foreground text-sm">{feature.title}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Developer */}
        <section className="py-16 bg-background">
          <div className="container px-4">
            <div className="max-w-lg mx-auto">
              <Card className="overflow-hidden">
                <div className="h-2 gradient-gold" />
                <CardContent className="p-8 text-center">
                  <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-bl from-primary to-mudrik-dark">
                    <span className="text-3xl font-bold text-primary-foreground">ع</span>
                  </div>
                  <h2 className="text-xl font-bold text-foreground mb-2">علي محمد علي</h2>
                  <p className="text-gold font-medium mb-6">مطور ومؤسس منصة مدرك Plus</p>
                  <div className="space-y-3">
                    <a href="mailto:alyedaft@gmail.com" className="flex items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-colors">
                      <Mail className="h-5 w-5" />alyedaft@gmail.com
                    </a>
                    <a href="https://wa.me/201223909712" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-colors">
                      <Phone className="h-5 w-5" />01223909712
                    </a>
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <MapPin className="h-5 w-5" />بني سويف، مصر
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </div>
    </StudentLayout>
  );
};

export default StudentAboutPage;

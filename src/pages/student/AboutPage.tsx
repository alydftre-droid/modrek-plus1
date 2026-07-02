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
    { icon: Target, title: "الرسالة", description: "توفير تعليم أزهري عالي الجودة متاح للجميع، باستخدام أحدث التقنيات التعليمية.", color: "#2563EB", bg: "#EFF6FF" },
    { icon: GraduationCap, title: "الرؤية", description: "أن نكون المنصة التعليمية الرائدة للتعليم العام والأزهري في العالم العربي.", color: "#16A34A", bg: "#F0FDF4" },
    { icon: Heart, title: "القيم", description: "الإتقان، الأمانة العلمية، سهولة الوصول، والتطوير المستمر.", color: "#7C3AED", bg: "#F5F3FF" },
  ];

  const features = [
    { icon: BookOpen, title: "كتب رقمية", value: "100+", color: "#EA580C", bg: "#FFF7ED" },
    { icon: Users, title: "طالب مسجل", value: "1000+", color: "#EA580C", bg: "#FFF7ED" },
    { icon: Award, title: "معلم معتمد", value: "50+", color: "#EA580C", bg: "#FFF7ED" },
  ];

  return (
    <StudentLayout title="عن المنصة">
      <div style={{ background: "#FFFFFF" }}>
        {/* Hero Section — white, no blue block */}
        <section className="relative py-16 overflow-hidden" style={{ background: "#FFFFFF" }}>
          <div className="container relative px-4 text-center">
            <h1 className="text-3xl md:text-4xl font-bold mb-4 animate-slide-up" style={{ color: "#1E293B" }}>
              عن منصة <span style={{ color: "#16A34A" }}>مدرك Plus</span>
            </h1>
            <p className="text-lg max-w-2xl mx-auto animate-slide-up delay-100" style={{ color: "#64748B" }}>
              منصة تعليمية متكاملة تهدف إلى تسهيل رحلة التعلم للتعليم العام والأزهري
            </p>
          </div>
        </section>

        {/* Values */}
        <section className="py-16" style={{ background: "#FFFFFF" }}>
          <div className="container px-4">
            <div className="grid md:grid-cols-3 gap-6">
              {values.map((value, index) => (
                <Card key={index} className="text-center animate-scale-in" style={{ animationDelay: `${index * 0.1}s`, background: "#FFFFFF", border: "1px solid #E2E8F0" }}>
                  <CardContent className="p-6">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: value.bg }}>
                      <value.icon className="h-7 w-7" style={{ color: value.color }} />
                    </div>
                    <h3 className="text-lg font-bold mb-2" style={{ color: "#1E293B" }}>{value.title}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: "#64748B" }}>{value.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="py-12" style={{ background: "#F8FAFC" }}>
          <div className="container px-4">
            <div className="grid md:grid-cols-3 gap-6">
              {features.map((feature, index) => (
                <div key={index} className="text-center p-6 animate-slide-up" style={{ animationDelay: `${index * 0.1}s` }}>
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: feature.bg }}>
                    <feature.icon className="h-6 w-6" style={{ color: feature.color }} />
                  </div>
                  <div className="text-2xl font-bold mb-1" style={{ color: "#16A34A" }}>{feature.value}</div>
                  <div className="text-sm" style={{ color: "#64748B" }}>{feature.title}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Developer */}
        <section className="py-16" style={{ background: "#FFFFFF" }}>
          <div className="container px-4">
            <div className="max-w-lg mx-auto">
              <Card className="overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0" }}>
                <div className="h-2" style={{ background: "#16A34A" }} />
                <CardContent className="p-8 text-center">
                  <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full" style={{ background: "#16A34A" }}>
                    <span className="text-3xl font-bold" style={{ color: "#FFFFFF" }}>ع</span>
                  </div>
                  <h2 className="text-xl font-bold mb-2" style={{ color: "#1E293B" }}>علي محمد علي</h2>
                  <p className="font-medium mb-6" style={{ color: "#16A34A" }}>مطور ومؤسس منصة مدرك Plus</p>
                  <div className="space-y-3">
                    <a href="mailto:alyedaft@gmail.com" className="flex items-center justify-center gap-2 transition-colors" style={{ color: "#64748B" }}>
                      <Mail className="h-5 w-5" />alyedaft@gmail.com
                    </a>
                    <a href="https://wa.me/201223909712" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 transition-colors" style={{ color: "#64748B" }}>
                      <Phone className="h-5 w-5" />01223909712
                    </a>
                    <div className="flex items-center justify-center gap-2" style={{ color: "#64748B" }}>
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

import Header from "@/components/Header";
import Footer from "@/components/Footer";

const sections = [
  {
    title: "المعلومات التي نجمعها",
    items: [
      "بيانات الحساب مثل الاسم والبريد الإلكتروني ورقم الهاتف عند التسجيل.",
      "بيانات تعليمية لازمة لتخصيص المحتوى مثل المرحلة الدراسية ونوع التعليم.",
      "بيانات استخدام أساسية لتحسين الأداء وحماية الحساب وتأمين المنصة.",
    ],
  },
  {
    title: "كيف نستخدم البيانات",
    items: [
      "إنشاء الحسابات وتسجيل الدخول وتأمين الجلسات.",
      "تخصيص المحتوى التعليمي والخدمات المناسبة لكل مستخدم.",
      "إرسال الإشعارات المهمة المتعلقة بالحساب أو الدراسة أو الأمان.",
    ],
  },
  {
    title: "حماية الخصوصية",
    items: [
      "نستخدم وسائل حماية تقنية وإدارية مناسبة للحفاظ على البيانات.",
      "لا نبيع بيانات المستخدمين لأي طرف خارجي.",
      "يتم الوصول إلى البيانات فقط عند الحاجة التشغيلية أو الأمنية المصرح بها.",
    ],
  },
  {
    title: "التواصل معنا",
    items: [
      "للاستفسار عن الخصوصية أو طلب تعديل البيانات يمكنك التواصل عبر البريد: modrekplus@gmail.com",
    ],
  },
];

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 md:px-6">
        <header className="space-y-3 text-right">
          <h1 className="text-3xl font-bold">سياسة الخصوصية</h1>
          <p className="text-sm leading-7 text-muted-foreground">
            توضح هذه الصفحة كيفية جمع واستخدام وحماية بيانات مستخدمي منصة مدرك Plus.
          </p>
        </header>

        <div className="space-y-6">
          {sections.map((section) => (
            <section key={section.title} className="rounded-lg border border-border bg-card p-5 md:p-6">
              <h2 className="mb-3 text-xl font-semibold">{section.title}</h2>
              <ul className="space-y-2 text-sm leading-7 text-muted-foreground">
                {section.items.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
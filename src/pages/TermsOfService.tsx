import Header from "@/components/Header";
import Footer from "@/components/Footer";

const sections = [
  {
    title: "استخدام المنصة",
    items: [
      "يجب استخدام منصة مدرك Plus للأغراض التعليمية المشروعة فقط.",
      "يلتزم المستخدم بتقديم بيانات صحيحة عند إنشاء الحساب أو استخدام خدمات المنصة.",
      "يمنع إساءة استخدام المنصة أو محاولة الوصول غير المصرح به إلى الحسابات أو المحتوى.",
    ],
  },
  {
    title: "الحسابات والأمان",
    items: [
      "المستخدم مسؤول عن الحفاظ على سرية بيانات تسجيل الدخول الخاصة به.",
      "يجوز للمنصة تعليق أو تقييد الحسابات المخالفة حفاظًا على الأمان وسلامة الخدمة.",
    ],
  },
  {
    title: "المحتوى والحقوق",
    items: [
      "المحتوى التعليمي المعروض على المنصة مخصص للاستخدام الشخصي والتعليمي فقط.",
      "لا يجوز نسخ أو إعادة نشر أو بيع محتوى المنصة دون إذن صريح.",
    ],
  },
  {
    title: "التعديلات والتواصل",
    items: [
      "قد يتم تحديث هذه الشروط عند الحاجة بما يتوافق مع تشغيل المنصة وخدماتها.",
      "للتواصل بخصوص الشروط أو الاستخدام: modrekplus@gmail.com",
    ],
  },
];

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 md:px-6">
        <header className="space-y-3 text-right">
          <h1 className="text-3xl font-bold">شروط الاستخدام</h1>
          <p className="text-sm leading-7 text-muted-foreground">
            باستخدام منصة مدرك Plus فإنك توافق على الالتزام بهذه الشروط المنظمة لاستخدام الخدمة.
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
import Seo from "@/components/seo/Seo";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Link } from "react-router-dom";

const steps = [
  "افتح تطبيق مدرك Plus وسجّل الدخول بحسابك (بالبريد الإلكتروني أو عبر Google).",
  "من القائمة السفلية اضغط على «حسابي».",
  "اختر «إدارة الحساب».",
  "انزل إلى آخر الصفحة واضغط على زر «🗑 حذف الحساب».",
  "اكتب كلمة «حذف» في مربع التأكيد ثم اضغط «حذف الحساب نهائياً».",
  "يتم حذف الحساب فوراً وتسجيل خروجك تلقائياً من جميع الأجهزة.",
];

const deleted = [
  "بيانات الحساب: الاسم، البريد الإلكتروني، رقم الهاتف، الصورة الشخصية.",
  "الملف الشخصي والمرحلة الدراسية ونوع التعليم والشعبة.",
  "الاشتراكات وسجل المحفظة وطلبات الشحن والإيداع الخاصة بك.",
  "محاولات الامتحانات وإجاباتك ونتائجك وتقدمك في المشاهدة.",
  "محادثات المساعد الذكي والمكتبة وملاحظاتها ورسائل الدعم الفني.",
  "الإشعارات ورموز الأجهزة (Push Tokens) وجميع جلسات تسجيل الدخول.",
];

const retained = [
  "سجلات مالية مجمّعة (بدون بيانات شخصية معرِّفة) يُلزمنا القانون بالاحتفاظ بها لأغراض المحاسبة والضرائب لمدة قد تصل إلى 5 سنوات.",
  "سجلات أمنية تقنية مجهولة الهوية تُستخدم لمنع الاحتيال، ولا يمكن ربطها بك بعد حذف الحساب.",
];

export default function DeleteAccount() {
  return (
      <Seo title="حذف حساب مدرك Plus" description="طريقة حذف حساب منصة مدرك Plus والبيانات المرتبطة به." path="/delete-account" noindex />
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 md:px-6" dir="rtl">
        <header className="space-y-3 text-right">
          <h1 className="text-3xl font-bold">حذف الحساب — منصة مدرك Plus</h1>
          <p className="text-sm leading-7 text-muted-foreground">
            توضح هذه الصفحة كيف يمكنك حذف حسابك في تطبيق «مدرك Plus» وحذف بياناتك الشخصية نهائياً،
            والبيانات التي يتم حذفها والبيانات التي قد نضطر للاحتفاظ بها لأسباب قانونية.
          </p>
        </header>

        <section className="rounded-lg border border-border bg-card p-5 md:p-6">
          <h2 className="mb-3 text-xl font-semibold">طريقة حذف الحساب من داخل التطبيق</h2>
          <ol className="space-y-2 text-sm leading-7 text-muted-foreground">
            {steps.map((step, i) => (
              <li key={step}>{i + 1}. {step}</li>
            ))}
          </ol>
          <p className="mt-4 text-sm leading-7 text-foreground">
            الحذف يتم فوراً وبشكل نهائي ولا يمكن التراجع عنه، ولا يحتاج إلى موافقة أو انتظار.
          </p>
        </section>

        <section className="rounded-lg border border-border bg-card p-5 md:p-6">
          <h2 className="mb-3 text-xl font-semibold">البيانات التي يتم حذفها</h2>
          <ul className="space-y-2 text-sm leading-7 text-muted-foreground">
            {deleted.map((item) => <li key={item}>• {item}</li>)}
          </ul>
        </section>

        <section className="rounded-lg border border-border bg-card p-5 md:p-6">
          <h2 className="mb-3 text-xl font-semibold">البيانات التي قد يتم الاحتفاظ بها</h2>
          <ul className="space-y-2 text-sm leading-7 text-muted-foreground">
            {retained.map((item) => <li key={item}>• {item}</li>)}
          </ul>
        </section>

        <section className="rounded-lg border border-border bg-card p-5 md:p-6">
          <h2 className="mb-3 text-xl font-semibold">لا تستطيع الوصول إلى التطبيق؟</h2>
          <p className="text-sm leading-7 text-muted-foreground">
            إذا لم تتمكن من تسجيل الدخول، أو كان حسابك حساب معلم، أرسل طلب حذف الحساب من البريد الإلكتروني
            المسجَّل في الحساب إلى:{" "}
            <a className="font-semibold text-primary" href="mailto:modrekplus@gmail.com" dir="ltr">modrekplus@gmail.com</a>{" "}
            وسنقوم بتنفيذ الحذف خلال 30 يوماً كحد أقصى.
          </p>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            للمزيد من التفاصيل راجع{" "}
            <Link to="/privacy-policy" className="font-semibold text-primary">سياسة الخصوصية</Link>.
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}

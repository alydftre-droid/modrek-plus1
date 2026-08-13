import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Seo from "@/components/seo/Seo";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, ChevronLeft } from "lucide-react";
import { SITE_URL, type SeoPage } from "@/content/seoPages";

const abs = (path: string) => new URL(path, SITE_URL).toString();

const buildJsonLd = (page: SeoPage) => {
  const blocks: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: page.breadcrumbs.map((b, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: b.name,
        item: abs(b.path),
      })),
    },
  ];
  if (page.faq?.length) {
    blocks.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: page.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }
  return blocks;
};

const SeoLandingPage = ({ page }: { page: SeoPage }) => {
  return (
    <div dir="rtl" className="min-h-screen flex flex-col overflow-x-hidden bg-[#FAFBFC] text-slate-900 font-cairo">
      <Seo
        title={page.title}
        description={page.description}
        path={page.slug}
        jsonLd={buildJsonLd(page)}
      />
      <Header />

      <main className="flex-1">
        {/* Breadcrumbs */}
        <nav aria-label="مسار التنقل" className="container mx-auto max-w-5xl px-4 pt-6">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
            {page.breadcrumbs.map((b, i) => {
              const isLast = i === page.breadcrumbs.length - 1;
              return (
                <li key={b.path} className="flex items-center gap-1">
                  {isLast ? (
                    <span aria-current="page" className="font-semibold text-slate-700">{b.name}</span>
                  ) : (
                    <>
                      <Link to={b.path} className="hover:text-primary transition-colors">{b.name}</Link>
                      <ChevronLeft className="h-3 w-3 opacity-60" aria-hidden />
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Hero */}
        <section className="container mx-auto max-w-5xl px-4 pt-5 pb-10">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight tracking-tight text-slate-900">
            {page.h1}
          </h1>
          <p className="mt-5 text-base sm:text-lg leading-relaxed text-slate-600 max-w-3xl">{page.intro}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth?mode=register">إنشاء حساب طالب</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/about">تعرّف على المنصة</Link>
            </Button>
          </div>
        </section>

        {/* Sections */}
        <div className="container mx-auto max-w-5xl px-4 pb-4 space-y-10">
          {page.sections.map((section) => (
            <section key={section.h2} className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-[0_10px_40px_-24px_rgba(15,23,42,0.18)]">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900">{section.h2}</h2>
              {section.body && (
                <p className="mt-4 text-sm sm:text-base leading-relaxed text-slate-600">{section.body}</p>
              )}
              {section.list && (
                <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                  {section.list.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm leading-relaxed text-slate-700">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
              {section.items && (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {section.items.map((item) => (
                    <article key={item.title} className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                      <h3 className="text-sm font-black text-slate-900">{item.title}</h3>
                      <p className="mt-2 text-[13px] leading-relaxed text-slate-600">{item.text}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ))}

          {/* FAQ */}
          {page.faq?.length ? (
            <section className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-[0_10px_40px_-24px_rgba(15,23,42,0.18)]">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900">أسئلة شائعة</h2>
              <div className="mt-5 divide-y divide-slate-100">
                {page.faq.map((f) => (
                  <div key={f.q} className="py-4">
                    <h3 className="text-sm font-black text-slate-900">{f.q}</h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-slate-600">{f.a}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Internal links */}
          {page.links?.length ? (
            <section className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-[0_10px_40px_-24px_rgba(15,23,42,0.18)]">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900">تصفّح أقسام المنصة</h2>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {page.links
                  .filter((l) => l.path !== page.slug)
                  .map((l) => (
                    <li key={l.path}>
                      <Link
                        to={l.path}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-primary/30 hover:text-primary transition-colors"
                      >
                        <span>{l.label}</span>
                        <ArrowLeft className="h-4 w-4 opacity-60" aria-hidden />
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default SeoLandingPage;

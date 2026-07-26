import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Printer, Search, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  CURRENT_TEACHER_TERMS_VERSION,
  TEACHER_TERMS_INTRO,
  TEACHER_TERMS_SECTIONS,
} from "@/lib/teacherTerms";

const TeacherTerms = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState<Record<string, boolean>>(
    () => Object.fromEntries(TEACHER_TERMS_SECTIONS.map((s) => [s.id, true])),
  );

  const required = new URLSearchParams(location.search).get("required") === "1";

  const q = query.trim();
  const matches = useMemo(() => {
    if (!q) return null;
    const needle = q.toLowerCase();
    const result: Record<string, boolean> = {};
    for (const s of TEACHER_TERMS_SECTIONS) {
      const haystack = [
        s.title,
        ...(s.items?.flatMap((it) => [it.heading ?? "", it.body ?? "", ...(it.list ?? [])]) ?? []),
      ]
        .join(" ")
        .toLowerCase();
      result[s.id] = haystack.includes(needle);
    }
    return result;
  }, [q]);

  useEffect(() => {
    if (matches) {
      const next = { ...openIds };
      for (const s of TEACHER_TERMS_SECTIONS) if (matches[s.id]) next[s.id] = true;
      setOpenIds(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const toggle = (id: string) => setOpenIds((p) => ({ ...p, [id]: !p[id] }));

  const scrollTo = (id: string) => {
    setOpenIds((p) => ({ ...p, [id]: true }));
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-4 print:bg-white print:py-2">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4 print:hidden">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowRight className="h-4 w-4 ml-1" />
            رجوع
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 ml-1" />
            طباعة
          </Button>
        </div>

        <Card className="print:shadow-none print:border-0">
          <CardContent className="p-6 md:p-8 space-y-6">
            <header className="text-center space-y-2 border-b pb-4">
              <h1 className="text-2xl md:text-3xl font-extrabold">
                اتفاقية استخدام المعلمين
              </h1>
              <p className="text-sm text-muted-foreground">
                منصة Modrek Plus — الإصدار {CURRENT_TEACHER_TERMS_VERSION}
              </p>
              {required && (
                <div className="mt-3 p-3 rounded-lg bg-amber-100 text-amber-900 text-sm print:hidden">
                  تم تحديث الاتفاقية. يرجى مراجعة الإصدار الجديد وقبوله للمتابعة.
                </div>
              )}
            </header>

            <div className="space-y-1 text-sm leading-7 text-muted-foreground">
              {TEACHER_TERMS_INTRO.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>

            {/* Search */}
            <div className="relative print:hidden">
              <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث داخل الاتفاقية..."
                className="pr-9"
              />
            </div>

            {/* TOC */}
            <nav className="rounded-lg border bg-card p-4 print:hidden">
              <p className="font-semibold mb-2">جدول المحتويات</p>
              <ol className="grid grid-cols-1 md:grid-cols-2 gap-1 text-sm">
                {TEACHER_TERMS_SECTIONS.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => scrollTo(s.id)}
                      className="text-primary hover:underline text-right w-full"
                    >
                      {s.title}
                    </button>
                  </li>
                ))}
              </ol>
            </nav>

            {/* Sections */}
            <div className="space-y-3">
              {TEACHER_TERMS_SECTIONS.map((s) => {
                const isOpen = openIds[s.id] ?? true;
                const isHidden = matches && !matches[s.id];
                if (isHidden) return null;
                return (
                  <section
                    key={s.id}
                    id={s.id}
                    className="rounded-lg border bg-card scroll-mt-20 print:border-0 print:bg-white"
                  >
                    <button
                      type="button"
                      onClick={() => toggle(s.id)}
                      className="w-full flex items-center justify-between p-4 text-right"
                    >
                      <h2 className="text-lg md:text-xl font-bold">{s.title}</h2>
                      <ChevronDown
                        className={`h-5 w-5 shrink-0 transition-transform print:hidden ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {(isOpen || typeof window !== "undefined" ? isOpen : true) && (
                      <div className={`px-4 pb-4 space-y-4 ${isOpen ? "" : "hidden print:block"}`}>
                        {s.items?.map((it, i) => (
                          <div key={i} className="space-y-1.5">
                            {it.heading && (
                              <h3 className="font-semibold text-[15px]">{it.heading}</h3>
                            )}
                            {it.body && (
                              <p className="text-sm leading-7 text-muted-foreground">
                                {it.body}
                              </p>
                            )}
                            {it.list && (
                              <ul className="space-y-1 text-sm leading-7 text-muted-foreground pr-4">
                                {it.list.map((li, j) => (
                                  <li key={j}>• {li}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>

            <footer className="pt-4 border-t text-xs text-muted-foreground text-center print:hidden">
              للتواصل بشأن الاتفاقية:{" "}
              <a className="text-primary" href="mailto:alyedaft@gmail.com">
                alyedaft@gmail.com
              </a>
              <div className="mt-2">
                <Link to="/teacher-register" className="text-primary hover:underline">
                  العودة إلى صفحة تسجيل المعلم
                </Link>
              </div>
            </footer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TeacherTerms;

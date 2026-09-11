import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import katex from "katex";
import "katex/contrib/mhchem";
import { KATEX_MACROS, normalizeScience } from "./mathPipeline";
import { DiagramBlock, SvgBlock } from "./DiagramBlock";
import {
  Lightbulb,
  Star,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  Info,
  Sigma,
  HelpCircle,
  ListChecks,
  Target,
  PenLine,
  XCircle,
  Table2,
} from "lucide-react";

// Touch katex so the mhchem side-effect import is never tree-shaken away.
void katex;


/**
 * Modrek AI — "Teacher's Notes" rendering engine.
 *
 * Purpose: render the SAME AI answer as a professionally designed PDF-style
 * study handout (مذكرة) instead of plain chat markdown.
 *
 * - Full RTL, Cairo typography scale, generous line-height & block spacing
 * - Auto-detected educational cards (تعريف / ملحوظة / تحذير / قانون / مثال /
 *   سؤال / ملخص / أهم النقاط / سؤال مراجعة / معلومة إضافية / خطأ شائع / نصيحة)
 * - Q&A rows (❓ السؤال / ✔ الإجابة / 📝 الشرح / 🎯 السبب) as labelled rows
 * - Professional, mobile-responsive tables
 * - Rich list markers, visual separators, highlighted keywords
 */

/* ------------------------------------------------------------------ */
/* Card definitions                                                    */
/* ------------------------------------------------------------------ */

type CardKind =
  | "definition"
  | "note"
  | "important"
  | "warning"
  | "law"
  | "example"
  | "question"
  | "summary"
  | "keypoints"
  | "review"
  | "extra"
  | "mistake"
  | "tip"
  | "table";

const CARD_STYLES: Record<
  CardKind,
  { ring: string; bg: string; head: string; headText: string; Icon: React.ElementType; label: string }
> = {
  definition: { ring: "border-sky-200",     bg: "bg-sky-50/70",     head: "bg-sky-100",     headText: "text-sky-900",     Icon: BookOpen,     label: "تعريف" },
  note:       { ring: "border-emerald-200", bg: "bg-emerald-50/70", head: "bg-emerald-100", headText: "text-emerald-900", Icon: CheckCircle2, label: "ملحوظة" },
  important:  { ring: "border-indigo-200",  bg: "bg-indigo-50/70",  head: "bg-indigo-100",  headText: "text-indigo-900",  Icon: Star,         label: "معلومة مهمة" },
  warning:    { ring: "border-rose-200",    bg: "bg-rose-50/70",    head: "bg-rose-100",    headText: "text-rose-900",    Icon: AlertTriangle,label: "احذر" },
  law:        { ring: "border-violet-200",  bg: "bg-violet-50/70",  head: "bg-violet-100",  headText: "text-violet-900",  Icon: Sigma,        label: "القانون" },
  example:    { ring: "border-amber-200",   bg: "bg-amber-50/70",   head: "bg-amber-100",   headText: "text-amber-900",   Icon: Lightbulb,    label: "مثال" },
  question:   { ring: "border-blue-200",    bg: "bg-blue-50/60",    head: "bg-blue-100",    headText: "text-blue-900",    Icon: HelpCircle,   label: "سؤال" },
  summary:    { ring: "border-teal-200",    bg: "bg-teal-50/70",    head: "bg-teal-100",    headText: "text-teal-900",    Icon: ListChecks,   label: "ملخص سريع" },
  keypoints:  { ring: "border-fuchsia-200", bg: "bg-fuchsia-50/60", head: "bg-fuchsia-100", headText: "text-fuchsia-900", Icon: Target,       label: "أهم النقاط للحفظ" },
  review:     { ring: "border-cyan-200",    bg: "bg-cyan-50/70",    head: "bg-cyan-100",    headText: "text-cyan-900",    Icon: PenLine,      label: "سؤال مراجعة" },
  extra:      { ring: "border-slate-200",   bg: "bg-slate-50",      head: "bg-slate-100",   headText: "text-slate-800",   Icon: Info,         label: "معلومة إضافية" },
  mistake:    { ring: "border-orange-200",  bg: "bg-orange-50/70",  head: "bg-orange-100",  headText: "text-orange-900",  Icon: XCircle,      label: "خطأ شائع" },
  tip:        { ring: "border-lime-200",    bg: "bg-lime-50/70",    head: "bg-lime-100",    headText: "text-lime-900",    Icon: Lightbulb,    label: "نصيحة" },
  table:      { ring: "border-slate-200",   bg: "bg-white",         head: "bg-slate-100",   headText: "text-slate-800",   Icon: Table2,       label: "جدول" },
};

/** [regex, kind] — matched against a cleaned single line. */
const CARD_PATTERNS: Array<[RegExp, CardKind]> = [
  [/^(📘|📖|تعريف|التعريف|المفهوم)\b/u, "definition"],
  [/^(⚠️|⚠|تحذير|احذر|انتبه|تنبيه)\b/u, "warning"],
  [/^(📐|📏|قانون|القانون|القاعدة|قاعدة)\b/u, "law"],
  [/^(❌|خطأ\s*شائع|أخطاء\s*شائعة)\b/u, "mistake"],
  [/^(✅|ملخص\s*سريع|الملخص|ملخص)\b/u, "summary"],
  [/^(🎯|أهم\s*النقاط.*|نقاط\s*للحفظ)\b/u, "keypoints"],
  [/^(📝|سؤال\s*مراجعة|سؤال\s*للمراجعة)\b/u, "review"],
  [/^(❓|❔|سؤال\s*(?:الأول|الثاني|الثالث|الرابع|الخامس|\d+)?|السؤال\s*.*)$/u, "question"],
  [/^(💡|معلومة\s*إضافية|هل\s*تعلم)\b/u, "extra"],
  [/^(⭐|معلومة\s*مهمة|مهم\b|تذكر)\b/u, "important"],
  [/^(🧠|🧪|مثال\s*(?:محلول)?\s*[\d١٢٣٤٥]*\s*$|مثال\b)/u, "example"],
  [/^(✔️|✔|ملحوظة|ملاحظة)\b/u, "note"],
  [/^(🌟|نصيحة|نصائح)\b/u, "tip"],
];

const SEPARATOR_RE = /^[━─—=*_\-–]{3,}$/u;

/** Strip markdown decorations so a heading line can be pattern-matched. */
function cleanLine(line: string) {
  return line
    .replace(/^\s*>+\s*/, "")
    .replace(/^\s*#{1,6}\s*/, "")
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/[:：]\s*$/, "")
    .replace(/[━─—]{2,}\s*$/u, "")
    .trim();
}

function matchCard(line: string): { kind: CardKind; title: string; inlineBody: string } | null {
  const cleaned = cleanLine(line);
  if (!cleaned || cleaned.length > 80) return null;
  for (const [re, kind] of CARD_PATTERNS) {
    if (re.test(cleaned)) {
      // Everything after a ":" on the header line becomes the first body line.
      const raw = line.replace(/^\s*#{1,6}\s*/, "").replace(/^\s*>+\s*/, "").trim();
      const colon = raw.search(/[:：]/);
      let inlineBody = "";
      let title = cleaned;
      if (colon > -1 && colon < 60) {
        inlineBody = raw.slice(colon + 1).trim();
        title = cleanLine(raw.slice(0, colon));
      }
      return { kind, title: title.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]+\s*/u, "").trim(), inlineBody };
    }
  }
  return null;
}

type Block =
  | { type: "md"; content: string }
  | { type: "card"; kind: CardKind; title: string; content: string }
  | { type: "hr" };

function parseBlocks(text: string): Block[] {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let buffer: string[] = [];
  let current: { kind: CardKind; title: string; body: string[] } | null = null;
  let inFence = false;

  const flushBuffer = () => {
    const content = buffer.join("\n").trim();
    if (content) blocks.push({ type: "md", content });
    buffer = [];
  };
  const flushCard = () => {
    if (current) {
      blocks.push({
        type: "card",
        kind: current.kind,
        title: current.title,
        content: current.body.join("\n").trim(),
      });
      current = null;
    }
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;

    if (!inFence) {
      const trimmed = line.trim();

      if (SEPARATOR_RE.test(trimmed)) {
        if (current) continue; // decorative separator inside a card
        flushBuffer();
        blocks.push({ type: "hr" });
        continue;
      }

      const card = !/^\s*\|/.test(line) ? matchCard(line) : null;
      if (card) {
        flushCard();
        flushBuffer();
        current = { kind: card.kind, title: card.title, body: card.inlineBody ? [card.inlineBody] : [] };
        continue;
      }

      // A markdown heading (non-card) ends the current card.
      if (current && /^\s*#{1,3}\s+/.test(line)) {
        flushCard();
        buffer.push(line);
        continue;
      }
    }

    if (current) current.body.push(line);
    else buffer.push(line);
  }

  flushCard();
  flushBuffer();
  return blocks;
}

/* ------------------------------------------------------------------ */
/* Q&A labelled rows                                                   */
/* ------------------------------------------------------------------ */

const QA_LABELS: Array<[RegExp, string, string]> = [
  [/^(❓|❔)\s*/u, "السؤال", "bg-blue-100 text-blue-900"],
  [/^(✔️|✔|✅)\s*/u, "الإجابة", "bg-emerald-100 text-emerald-900"],
  [/^(📝)\s*/u, "الشرح", "bg-amber-100 text-amber-900"],
  [/^(🎯)\s*/u, "السبب", "bg-fuchsia-100 text-fuchsia-900"],
  [/^(📌)\s*/u, "المعطيات", "bg-slate-200 text-slate-800"],
  [/^(🧮|✏️)\s*/u, "الحل", "bg-violet-100 text-violet-900"],
];

function QaRow({ label, tone, children }: { label: string; tone: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 my-2">
      <span className={`shrink-0 mt-0.5 rounded-lg px-2 py-0.5 text-[12px] font-extrabold ${tone}`}>{label}</span>
      <div className="min-w-0 flex-1 text-[15px] leading-8 text-slate-800 [&>p]:m-0">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Base markdown renderer                                              */
/* ------------------------------------------------------------------ */

const BULLET_LIST = "my-3 space-y-2 pr-6 list-none";

function MarkdownBody({ children, compact = false }: { children: string; compact?: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[
        [
          rehypeKatex,
          {
            throwOnError: false,
            errorColor: "#DC2626",
            strict: false,
            trust: (ctx: any) => ["\\htmlClass", "\\includegraphics"].includes(ctx.command) === false,
            macros: KATEX_MACROS,
          },
        ],
      ]}
      components={{
        h1: (props) => (
          <h1
            className="text-[23px] font-extrabold text-slate-900 mt-2 mb-4 pb-3 border-b-[3px] border-primary/40 tracking-tight"
            {...props}
          />
        ),
        h2: (props) => (
          <h2
            className="text-[19px] font-extrabold text-slate-900 mt-6 mb-3 flex items-center gap-2 before:content-[''] before:w-2 before:h-6 before:rounded-full before:bg-primary"
            {...props}
          />
        ),
        h3: (props) => (
          <h3 className="text-[17px] font-bold text-primary mt-5 mb-2 pr-1 border-r-[3px] border-primary/40" {...props} />
        ),
        h4: (props) => <h4 className="text-[15.5px] font-bold text-slate-800 mt-4 mb-1.5" {...props} />,
        p: ({ children, ...props }) => {
          const nodes = Array.isArray(children) ? children : [children];
          const firstText = typeof nodes[0] === "string" ? (nodes[0] as string).replace(/^\s+/, "") : "";
          for (const [re, label, tone] of QA_LABELS) {
            if (firstText && re.test(firstText)) {
              // Keep the already-parsed children (bold, KaTeX, links) intact and
              // only strip the leading emoji marker from the first text node.
              const rest = [firstText.replace(re, ""), ...nodes.slice(1)];
              return (
                <QaRow label={label} tone={tone}>
                  <span className="block">
                    {rest.map((n, i) => (
                      <React.Fragment key={i}>{n as React.ReactNode}</React.Fragment>
                    ))}
                  </span>
                </QaRow>
              );
            }
          }
          return (
            <p className={`text-[15.5px] text-slate-800 ${compact ? "leading-8 my-0" : "leading-[2.05] my-3"}`} {...props}>
              {children}
            </p>
          );
        },

        strong: (props) => (
          <strong
            className="font-extrabold text-primary bg-primary/10 rounded-md px-1 py-[1px] decoration-clone"
            {...props}
          />
        ),
        em: (props) => <em className="not-italic font-bold text-violet-700" {...props} />,
        ul: (props) => <ul className={BULLET_LIST} {...props} />,
        ol: (props) => <ol className="my-3 space-y-2 pr-6 list-decimal marker:text-primary marker:font-extrabold" {...props} />,
        li: ({ children, ...props }) => {
          const parentIsOrdered = false; // styled bullets for unordered lists
          return (
            <li className="relative text-[15.5px] leading-[2] text-slate-800 pr-1" {...props}>
              {!parentIsOrdered && null}
              {children}
            </li>
          );
        },
        blockquote: (props) => (
          <blockquote
            className="my-4 rounded-xl border-r-[5px] border-primary bg-primary/[0.06] px-4 py-3 text-[15px] leading-8 text-slate-700"
            {...props}
          />
        ),
        hr: () => (
          <div className="my-6 flex items-center gap-2" aria-hidden>
            <span className="h-[3px] flex-1 rounded-full bg-gradient-to-l from-primary/40 via-slate-200 to-transparent" />
            <span className="h-1.5 w-1.5 rounded-full bg-primary/50" />
          </div>
        ),
        code: ({ className, children, ...props }: any) => {
          const raw = String(children ?? "");
          const lang = /language-([\w-]+)/.exec(className || "")?.[1]?.toLowerCase();
          const looksLikeMermaid = /^\s*(?:graph\s+(?:TB|BT|RL|LR|TD)|flowchart\s+(?:TB|BT|RL|LR|TD)|sequenceDiagram\b|classDiagram\b|stateDiagram(?:-v2)?\b|mindmap\b|timeline\b|pie\b)/i.test(raw);
          if (lang === "mermaid" || looksLikeMermaid) return <DiagramBlock code={raw} />;
          if (lang === "svg" || /^\s*<svg[\s>]/i.test(raw)) return <SvgBlock code={raw} />;
          if (lang === "math" || lang === "latex" || lang === "tex") {
            return (
              <div dir="ltr" className="my-5 overflow-x-auto text-center">
                <MarkdownBody>{`$$${raw.trim()}$$`}</MarkdownBody>
              </div>
            );
          }
          const isBlock = !!lang || raw.includes("\n");
          const CODE_LANGS = /^(js|jsx|ts|tsx|json|html|css|scss|sql|py|python|bash|sh|shell|java|c|cpp|cs|php|go|rb|rust|yaml|yml|xml|diff)$/;
          const isRealCode = !!lang && CODE_LANGS.test(lang);
          if (isBlock && !isRealCode) {
            // The assistant often puts lesson content (summaries, questions, notes)
            // inside a plain fence — render it as a readable Arabic card, never a
            // black terminal box.
            const lines = raw.replace(/\s+$/, "").split("\n");
            const firstLine = (lines[0] || "").trim();
            const looksLikeTitle =
              firstLine.length > 0 && firstLine.length <= 60 && !/[.:؟]$/.test(firstLine) === false;
            const heading = looksLikeTitle ? firstLine.replace(/^#+\s*/, "") : "ملخص ونقاط مهمة";
            const body = (looksLikeTitle ? lines.slice(1) : lines).join("\n").trim();
            return (
              <section
                dir="rtl"
                className="my-5 overflow-hidden rounded-2xl border border-primary/20 bg-white shadow-sm"
              >
                <header className="flex items-center gap-2 border-b border-primary/15 bg-gradient-to-l from-primary/10 via-primary/5 to-transparent px-4 py-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-[13px] font-extrabold text-primary">
                    ✦
                  </span>
                  <h4 className="min-w-0 flex-1 truncate text-[14px] font-extrabold text-slate-900">{heading}</h4>
                </header>
                <div className="whitespace-pre-wrap break-words px-4 py-3 text-[15px] leading-[2] text-slate-800 [overflow-wrap:anywhere]">
                  {body || raw.trim()}
                </div>
              </section>
            );
          }
          return isBlock ? (
            <pre
              dir="ltr"
              className="my-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-[13.5px] leading-7 text-slate-800"
            >
              <code {...props}>{children}</code>
            </pre>
          ) : (
            <code className="mx-0.5 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[13.5px] text-violet-700" {...props}>
              {children}
            </code>
          );
        },

        table: (props) => (
          <div className="my-5 -mx-1 overflow-x-auto rounded-2xl border border-slate-200 shadow-sm bg-white">
            <table className="w-full min-w-[22rem] border-collapse text-right text-[14px]" {...props} />
          </div>
        ),
        thead: (props) => <thead className="bg-primary text-primary-foreground" {...props} />,
        tbody: (props) => <tbody className="divide-y divide-slate-100" {...props} />,
        tr: (props) => <tr className="even:bg-slate-50/70 align-top" {...props} />,
        th: (props) => (
          <th className="whitespace-nowrap px-3 py-2.5 text-[14px] font-extrabold border-b border-white/20" {...props} />
        ),
        td: (props) => <td className="px-3 py-2.5 text-[14px] leading-7 text-slate-800 break-words" {...props} />,
        a: (props) => (
          <a className="text-primary font-bold underline underline-offset-4" target="_blank" rel="noreferrer" {...props} />
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

/* ------------------------------------------------------------------ */
/* Card shell                                                          */
/* ------------------------------------------------------------------ */

function NoteCard({ kind, title, content }: { kind: CardKind; title: string; content: string }) {
  const s = CARD_STYLES[kind];
  const { Icon } = s;
  const heading = title && title.length > 1 ? title : s.label;
  return (
    <section className={`my-4 overflow-hidden rounded-2xl border-2 ${s.ring} ${s.bg} shadow-[0_1px_2px_rgba(15,23,42,0.04)]`}>
      <header className={`flex items-center gap-2 ${s.head} ${s.headText} px-4 py-2.5`}>
        <Icon className="h-[18px] w-[18px] shrink-0" />
        <h4 className="text-[15px] font-extrabold leading-6">{heading}</h4>
      </header>
      {content && (
        <div className="px-4 py-3 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
          <MarkdownBody>{content}</MarkdownBody>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Public component                                                    */
/* ------------------------------------------------------------------ */

export function RichMarkdown({ children }: { children: string }) {
  const blocks = React.useMemo(() => parseBlocks(normalizeScience(children)), [children]);

  return (
    <article
      dir="rtl"
      lang="ar"
      className="modrek-notes font-[Cairo,system-ui,sans-serif] text-[15.5px] text-slate-900 break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0
                 [&_ul>li]:before:content-['✓'] [&_ul>li]:before:absolute [&_ul>li]:before:right-[-1.25rem]
                 [&_ul>li]:before:text-primary [&_ul>li]:before:font-extrabold
                 [&_.katex]:!font-normal [&_.katex]:text-[1.06em] [&_.katex]:[direction:ltr]
                 [&_.katex]:[unicode-bidi:isolate] [&_.katex]:inline-block [&_.katex]:align-middle
                 [&_.katex-display]:!my-5 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden
                 [&_.katex-display]:rounded-2xl [&_.katex-display]:border [&_.katex-display]:border-primary/15
                 [&_.katex-display]:bg-primary/[0.04] [&_.katex-display]:px-3 [&_.katex-display]:py-4
                 [&_.katex-display]:text-[1.22em] [&_.katex-display]:[direction:ltr] [&_.katex-display]:block"

    >

      {blocks.map((b, i) => {
        if (b.type === "hr") {
          return (
            <div key={i} className="my-5 flex items-center gap-2" aria-hidden>
              <span className="h-[3px] flex-1 rounded-full bg-gradient-to-l from-primary/40 via-slate-200 to-transparent" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary/50" />
            </div>
          );
        }
        if (b.type === "card") {
          return <NoteCard key={i} kind={b.kind} title={b.title} content={b.content} />;
        }
        return (
          <div key={i} className="[&>*:first-child]:mt-0">
            <MarkdownBody>{b.content}</MarkdownBody>
          </div>
        );
      })}
    </article>
  );
}

export default RichMarkdown;

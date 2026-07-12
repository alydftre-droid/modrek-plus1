import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Lightbulb, Star, CheckCircle2, AlertTriangle, BookOpen, Info } from "lucide-react";

/**
 * Professional textbook-style markdown renderer for Modrek AI messages.
 * - Larger, weightier headings with clear hierarchy
 * - Callout boxes derived from leading emoji cues (💡 ⭐ ✅ 📘 ⚠️ / ملاحظة / تذكر / مثال / تحذير)
 * - Rich list, table, blockquote, and code styling with generous spacing
 * - Full RTL, Cairo-friendly, harmonized with the app's semantic tokens
 */

type CalloutKind = "tip" | "important" | "success" | "example" | "warning" | "info";

const CALLOUT_STYLES: Record<CalloutKind, { bg: string; border: string; text: string; Icon: any; label: string }> = {
  tip:       { bg: "bg-amber-50",   border: "border-amber-300",  text: "text-amber-900",   Icon: Lightbulb,     label: "معلومة مهمة" },
  important: { bg: "bg-indigo-50",  border: "border-indigo-300", text: "text-indigo-900",  Icon: Star,          label: "تذكر" },
  success:   { bg: "bg-emerald-50", border: "border-emerald-300",text: "text-emerald-900", Icon: CheckCircle2,  label: "ملاحظة" },
  example:   { bg: "bg-sky-50",     border: "border-sky-300",    text: "text-sky-900",     Icon: BookOpen,      label: "مثال" },
  warning:   { bg: "bg-rose-50",    border: "border-rose-300",   text: "text-rose-900",    Icon: AlertTriangle, label: "تحذير" },
  info:      { bg: "bg-slate-50",   border: "border-slate-300",  text: "text-slate-800",   Icon: Info,          label: "ملاحظة" },
};

function detectCallout(text: string): { kind: CalloutKind; body: string } | null {
  const t = text.trim();
  const patterns: Array<[RegExp, CalloutKind]> = [
    [/^(💡|معلومة\s*مهمة[:：]?)/, "tip"],
    [/^(⭐|تذكر[:：]?)/, "important"],
    [/^(✅|ملاحظة\s*مهمة[:：]?|ملاحظة[:：])/, "success"],
    [/^(📘|📖|مثال[:：]?)/, "example"],
    [/^(⚠️|تحذير[:：]?|انتبه[:：]?)/, "warning"],
    [/^(ℹ️|info[:：]?)/i, "info"],
  ];
  for (const [re, kind] of patterns) {
    if (re.test(t)) return { kind, body: t.replace(re, "").trim() };
  }
  return null;
}

function Callout({ kind, children }: { kind: CalloutKind; children: React.ReactNode }) {
  const s = CALLOUT_STYLES[kind];
  const { Icon } = s;
  return (
    <div className={`my-4 rounded-2xl border-2 ${s.border} ${s.bg} ${s.text} p-4 shadow-sm`}>
      <div className="flex items-center gap-2 mb-2 font-extrabold text-[15px]">
        <Icon className="h-5 w-5" />
        <span>{s.label}</span>
      </div>
      <div className="text-[15px] leading-8 [&>p]:m-0">{children}</div>
    </div>
  );
}

export function RichMarkdown({ children }: { children: string }) {
  return (
    <div dir="rtl" className="rich-markdown text-[15.5px] leading-8 text-slate-900 space-y-3 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => (
            <h1 className="text-[24px] font-extrabold text-slate-900 mt-5 mb-3 pb-2 border-b-2 border-primary/30" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-[20px] font-extrabold text-slate-900 mt-5 mb-2 flex items-center gap-2 before:content-[''] before:w-1.5 before:h-6 before:bg-primary before:rounded-full" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-[17px] font-bold text-primary mt-4 mb-2" {...props} />
          ),
          h4: ({ node, ...props }) => (
            <h4 className="text-[15px] font-bold text-slate-800 mt-3 mb-1" {...props} />
          ),
          p: ({ node, children, ...props }) => {
            const raw = String(Array.isArray(children) ? children.filter((c) => typeof c === "string").join("") : children || "");
            const cal = detectCallout(raw);
            if (cal) {
              return (
                <Callout kind={cal.kind}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{cal.body}</ReactMarkdown>
                </Callout>
              );
            }
            return <p className="text-[15.5px] leading-8 my-2 text-slate-800" {...props}>{children}</p>;
          },
          strong: ({ node, ...props }) => (
            <strong className="font-extrabold text-primary" {...props} />
          ),
          em: ({ node, ...props }) => <em className="text-slate-700 not-italic font-semibold" {...props} />,
          ul: ({ node, ...props }) => (
            <ul className="my-3 space-y-1.5 pr-5 marker:text-primary list-disc" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="my-3 space-y-1.5 pr-5 marker:text-primary marker:font-bold list-decimal" {...props} />
          ),
          li: ({ node, ...props }) => <li className="leading-8 text-[15.5px]" {...props} />,
          blockquote: ({ node, ...props }) => (
            <blockquote className="my-4 border-r-4 border-primary bg-primary/5 rounded-l-xl rounded-r-md px-4 py-3 text-slate-700 italic" {...props} />
          ),
          hr: () => <hr className="my-5 border-t-2 border-dashed border-slate-200" />,
          code: ({ inline, className, children, ...props }: any) =>
            inline ? (
              <code className="px-1.5 py-0.5 rounded-md bg-slate-100 text-primary font-mono text-[13.5px]" {...props}>{children}</code>
            ) : (
              <pre className="my-3 rounded-xl bg-slate-900 text-slate-100 p-4 overflow-x-auto text-[13.5px] leading-6 font-mono">
                <code {...props}>{children}</code>
              </pre>
            ),
          table: ({ node, ...props }) => (
            <div className="my-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm text-right border-collapse" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => <thead className="bg-primary/10 text-slate-900" {...props} />,
          th: ({ node, ...props }) => <th className="px-3 py-2 font-bold border-b border-slate-200 text-[14px]" {...props} />,
          td: ({ node, ...props }) => <td className="px-3 py-2 border-b border-slate-100 text-[14px] text-slate-800" {...props} />,
          a: ({ node, ...props }) => (
            <a className="text-primary underline underline-offset-2 hover:text-primary/80" target="_blank" rel="noreferrer" {...props} />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export default RichMarkdown;

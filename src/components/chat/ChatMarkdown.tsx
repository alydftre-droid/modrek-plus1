import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import type { ComponentProps } from "react";

/**
 * Markdown renderer for AI chat that turns internal links like
 * [افتح المحفظة](/wallet) into pill-shaped buttons that navigate
 * inside the SPA without a full reload. External links open in a new tab.
 *
 * Also renders GFM tables with a professional ChatGPT-like style
 * (borders, colored header, padding, rounded container, horizontal scroll).
 */
export function ChatMarkdown({ content }: { content: string }) {
  const navigate = useNavigate();

  return (
    <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none overflow-hidden break-words [&>p]:m-0 [&_p]:leading-relaxed [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-xl font-bold mb-3 mt-4 first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold mb-2 mt-3">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold mb-2 mt-2">{children}</h3>
          ),
          p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-2 space-y-1 mr-4">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-2 space-y-1 mr-4">{children}</ol>
          ),
          li: ({ children }) => <li className="mb-1">{children}</li>,
          strong: ({ children }) => <strong className="font-bold text-primary">{children}</strong>,
          code: ({ children }) => (
            <code className="bg-background/70 px-1.5 py-0.5 rounded text-sm font-mono">
              {children}
            </code>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-r-4 border-primary/50 pr-4 my-2 italic">
              {children}
            </blockquote>
          ),
          a: ({ href, children, ...props }: ComponentProps<"a">) => {
            if (!href) return <span>{children}</span>;
            const isInternal = href.startsWith("/") && !href.startsWith("//");
            if (isInternal) {
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(href);
                  }}
                  className="inline-flex items-center gap-1 my-0.5 px-2.5 py-1 rounded-full bg-primary text-primary-foreground text-[11px] font-bold no-underline hover:shadow-md hover:scale-[1.03] transition"
                >
                  {children}
                  <ExternalLink className="h-3 w-3" />
                </button>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline" {...props}>
                {children}
              </a>
            );
          },
          table: ({ children }) => (
            <div className="my-3 w-full max-w-full overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
              <table className="w-full min-w-[38rem] border-collapse text-[12px] leading-relaxed">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-primary text-primary-foreground">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-border/60">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="even:bg-muted/40 hover:bg-muted/70 transition-colors">
              {children}
            </tr>
          ),
          th: ({ children, style }) => (
            <th
              className="px-3 py-2 font-bold text-right border-b border-primary-foreground/20 whitespace-nowrap"
              style={style as React.CSSProperties}
            >
              {children}
            </th>
          ),
          td: ({ children, style }) => (
            <td
              className="px-3 py-2 text-right align-top border-t border-border/50 whitespace-normal break-words"
              style={style as React.CSSProperties}
            >
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

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
    <div className="prose prose-xs prose-neutral dark:prose-invert max-w-none [&>p]:m-0 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
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
                  className="inline-flex items-center gap-1 my-0.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 text-white text-[11px] font-bold no-underline hover:shadow-md hover:scale-[1.03] transition"
                >
                  {children}
                  <ExternalLink className="h-3 w-3" />
                </button>
              );
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
                {...props}
              >
                {children}
              </a>
            );
          },
          table: ({ children }) => (
            <div className="my-3 w-full overflow-x-auto rounded-xl border border-border/70 bg-background shadow-sm">
              <table className="w-full border-collapse text-[12px] leading-relaxed">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-gradient-to-r from-blue-500 to-purple-600 text-white">
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
              className="px-3 py-2 font-bold text-right border-b border-white/20 whitespace-nowrap"
              style={style as React.CSSProperties}
            >
              {children}
            </th>
          ),
          td: ({ children, style }) => (
            <td
              className="px-3 py-2 text-right align-top border-t border-border/50"
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

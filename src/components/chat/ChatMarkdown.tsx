import ReactMarkdown from "react-markdown";
import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import type { ComponentProps } from "react";

/**
 * Markdown renderer for AI chat that turns internal links like
 * [افتح المحفظة](/wallet) into pill-shaped buttons that navigate
 * inside the SPA without a full reload. External links open in a new tab.
 */
export function ChatMarkdown({ content }: { content: string }) {
  const navigate = useNavigate();

  return (
    <div className="prose prose-xs prose-neutral dark:prose-invert max-w-none [&>p]:m-0 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5">
      <ReactMarkdown
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
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

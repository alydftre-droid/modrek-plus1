/**
 * Detailed RPC / Supabase error reporter.
 *
 * Replaces generic "تعذر تحميل ..." toasts with a rich, copyable diagnostic
 * that includes the Postgres error code / message / hint / details, the RPC
 * or table name that failed, and the frontend source location (file + line)
 * derived from the caller stack trace. Also emits a structured console.error.
 */

import { toast } from "sonner";

export type RpcErrorLike = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  status?: number | null;
  name?: string | null;
} | null | undefined;

const parseCallerLocation = (): string => {
  try {
    const stack = new Error().stack || "";
    const lines = stack.split("\n").slice(1);
    // Find first line that is not from this file
    for (const line of lines) {
      if (line.includes("rpcErrorReporter")) continue;
      const m = line.match(/\(?([^\s()]+\.(?:tsx?|jsx?|mjs|js)):(\d+):(\d+)\)?$/);
      if (m) {
        const path = m[1].replace(/^.*\/src\//, "src/");
        return `${path}:${m[2]}:${m[3]}`;
      }
    }
  } catch {
    /* ignore */
  }
  return "unknown-source";
};

export interface ReportRpcErrorOptions {
  /** Short label describing what failed, in Arabic. */
  title: string;
  /** The Supabase / Postgres error object. */
  error: RpcErrorLike | unknown;
  /** RPC name, table name, or short logical operation identifier. */
  operation: string;
  /** Extra structured context for the console log. */
  context?: Record<string, unknown>;
  /** Extra source hint (e.g. component or hook name). */
  sourceHint?: string;
  /** Duration of the toast, ms. */
  duration?: number;
}

export function reportRpcError(opts: ReportRpcErrorOptions): void {
  const { title, error, operation, context, sourceHint, duration = 12000 } = opts;
  const err = (error || {}) as Record<string, any>;
  const code = err.code || err.status || null;
  const message = err.message || err.error_description || String(error ?? "unknown error");
  const hint = err.hint || null;
  const details = err.details || null;
  const location = parseCallerLocation();

  const payload = {
    title,
    operation,
    source: sourceHint ? `${sourceHint} @ ${location}` : location,
    code,
    message,
    hint,
    details,
    context: context || null,
    raw: err,
  };

  // Full diagnostic in the console (grouped for readability)
  try {
    console.groupCollapsed(`[rpc-error] ${operation} — ${title}`);
    console.error("message:", message);
    if (code) console.error("code:", code);
    if (hint) console.error("hint:", hint);
    if (details) console.error("details:", details);
    console.error("source:", payload.source);
    if (context) console.error("context:", context);
    console.error("raw:", err);
    console.groupEnd();
  } catch {
    console.error("[rpc-error]", payload);
  }

  // Rich toast — copyable summary
  const summary = [
    `العملية: ${operation}`,
    code ? `code: ${code}` : null,
    `message: ${message}`,
    hint ? `hint: ${hint}` : null,
    details ? `details: ${details}` : null,
    `source: ${payload.source}`,
  ]
    .filter(Boolean)
    .join("\n");

  toast.error(title, {
    duration,
    description: summary,
    action: {
      label: "نسخ التفاصيل",
      onClick: () => {
        try {
          navigator.clipboard?.writeText(summary);
          toast.success("تم نسخ تفاصيل الخطأ");
        } catch {
          /* ignore */
        }
      },
    },
  });
}

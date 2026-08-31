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

type BackendErrorDetails = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  status?: number | null;
  trace_id?: string | null;
  stage?: string | null;
  source?: string | null;
};

async function readFunctionResponse(error: unknown): Promise<BackendErrorDetails> {
  const err = (error || {}) as Record<string, any>;
  const response = err.context;
  if (!(response instanceof Response)) return {};

  let body: BackendErrorDetails = {};
  try {
    const text = await response.clone().text();
    if (text) {
      try {
        body = JSON.parse(text) as BackendErrorDetails;
      } catch {
        body = { details: text.slice(0, 1500) };
      }
    }
  } catch {
    // The response body may already be consumed; headers/status still help.
  }

  return {
    ...body,
    status: body.status || response.status,
    trace_id: body.trace_id || response.headers.get("x-trace-id"),
  };
}

/**
 * Edge Function equivalent of reportRpcError. It reads the actual non-2xx
 * response body instead of reducing every failure to "Edge Function returned...".
 */
export async function reportBackendError(
  opts: ReportRpcErrorOptions & { responseData?: unknown },
): Promise<void> {
  const responseBody = await readFunctionResponse(opts.error);
  const suppliedBody = opts.responseData && typeof opts.responseData === "object"
    ? opts.responseData as BackendErrorDetails
    : {};
  const original = (opts.error || {}) as Record<string, any>;
  const merged = { ...original, ...responseBody, ...suppliedBody };
  reportRpcError({
    ...opts,
    error: merged,
    context: {
      ...opts.context,
      trace_id: merged.trace_id || null,
      backend_stage: merged.stage || null,
      backend_source: merged.source || null,
      http_status: merged.status || null,
    },
  });
}

export function reportRpcError(opts: ReportRpcErrorOptions): void {
  const { title, error, operation, context, sourceHint, duration = 12000 } = opts;
  const err = (error || {}) as Record<string, any>;
  const code = err.code || err.status || null;
  const rawMessage = err.message ?? err.error ?? err.error_description ?? error;
  const message = typeof rawMessage === "string"
    ? rawMessage
    : rawMessage
      ? (() => { try { return JSON.stringify(rawMessage); } catch { return String(rawMessage); } })()
      : "unknown error";

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
    context?.backend_source ? `backend source: ${context.backend_source}` : null,
    context?.backend_stage ? `backend stage: ${context.backend_stage}` : null,
    context?.http_status ? `HTTP status: ${context.http_status}` : null,
    context?.trace_id ? `Trace ID: ${context.trace_id}` : null,
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

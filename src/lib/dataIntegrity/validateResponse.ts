// Runtime validator for Supabase rows.
// -----------------------------------------------------------------------------
// Wrap any critical Supabase read with `validated(rows, schema)`. If any row
// fails the schema, we drop the whole payload and return `[]` so the UI shows
// an empty state instead of crashing on a missing field. A structured warning
// is reported (Sentry if wired, otherwise console) so drift is visible.
import type { z } from "zod";

type Reporter = (event: string, detail: Record<string, unknown>) => void;

const report: Reporter = (event, detail) => {
  try {
    const sentry = (window as any)?.Sentry;
    if (sentry?.captureMessage) {
      sentry.captureMessage(`[data-integrity] ${event}`, {
        level: "warning",
        extra: detail,
      });
      return;
    }
  } catch {
    // ignore
  }
  console.warn(`[data-integrity] ${event}`, detail);
};

export function validated<T>(rows: unknown, schema: z.ZodType<T>, label: string): T[] {
  if (!Array.isArray(rows)) {
    if (rows == null) return [];
    const single = schema.safeParse(rows);
    if (!single.success) {
      report("row-shape-drift", { label, issues: single.error.issues });
      return [];
    }
    return [single.data];
  }
  const out: T[] = [];
  for (const row of rows) {
    const p = schema.safeParse(row);
    if (!p.success) {
      report("row-shape-drift", { label, issues: p.error.issues });
      return []; // fail closed — do not mix good and bad rows
    }
    out.push(p.data);
  }
  return out;
}

export function validatedOne<T>(row: unknown, schema: z.ZodType<T>, label: string): T | null {
  if (row == null) return null;
  const p = schema.safeParse(row);
  if (!p.success) {
    report("row-shape-drift", { label, issues: p.error.issues });
    return null;
  }
  return p.data;
}

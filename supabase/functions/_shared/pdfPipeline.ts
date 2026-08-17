// Single source of truth for the PDF pipeline helpers lives next to the worker
// that runs them (supabase/functions/modrek-worker/pdfPipeline.ts) because the
// edge bundler resolves the worker's own folder reliably. This module simply
// re-exports it so tests and other functions can keep importing from _shared.
export * from "../modrek-worker/pdfPipeline.ts";

// Ambient declaration for MCP tool files. The bundled Deno function polyfills
// `process.env`; this keeps TS happy for src-side typechecks without pulling in
// @types/node globally.
declare const process: { env: Record<string, string | undefined> };

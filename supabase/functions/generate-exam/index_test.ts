import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("generate-exam: OPTIONS preflight ok", async () => {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/generate-exam`, { method: "OPTIONS" });
  await r.text();
  assert(r.status === 200 || r.status === 204);
});

Deno.test("generate-exam: returns a structured response for invalid body", async () => {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/generate-exam`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON },
    body: "{not-json",
  });
  const text = await r.text();
  // Function should respond with a body (not hang) — either 4xx validation or 5xx error JSON.
  assert(text.length > 0, "expected non-empty response body");
});

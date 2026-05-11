import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("generate-exam: OPTIONS preflight ok", async () => {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/generate-exam`, { method: "OPTIONS" });
  await r.text();
  assert(r.status === 200 || r.status === 204);
});

Deno.test("generate-exam: handles invalid body without crashing", async () => {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/generate-exam`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON },
    body: "{not-json",
  });
  await r.text();
  // Should be a controlled response (4xx/200), not 5xx crash.
  assert(r.status < 500, `unexpected ${r.status}`);
});

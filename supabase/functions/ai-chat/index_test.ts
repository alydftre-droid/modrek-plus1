// Integration test: ensures the deployed function rejects unauthorized calls.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { detectAiFailureKind } from "../_shared/aiSettings.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("ai-chat: OPTIONS preflight returns CORS", async () => {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
    method: "OPTIONS",
    headers: { Origin: "https://example.com" },
  });
  await r.text();
  assert(r.status === 200 || r.status === 204);
});

Deno.test("ai-chat: rejects calls without auth", async () => {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });
  await r.text();
  assertEquals(r.status, 401);
});

Deno.test("ai-chat: maps timeout failures to timeout kind", () => {
  assertEquals(detectAiFailureKind(undefined, "timeout after 45000ms"), "timeout");
});

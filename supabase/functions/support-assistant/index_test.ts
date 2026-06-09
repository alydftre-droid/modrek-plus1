import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildAiFallbackMessage, detectAiFailureKind } from "../_shared/aiSettings.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("support-assistant: OPTIONS preflight ok", async () => {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/support-assistant`, { method: "OPTIONS" });
  await r.text();
  assert(r.status === 200 || r.status === 204);
});

Deno.test("support-assistant: 401 without Authorization header", async () => {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/support-assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON },
    body: JSON.stringify({ messages: [{ role: "user", content: "test" }] }),
  });
  await r.text();
  assertEquals(r.status, 401);
});

Deno.test("support-assistant: safety fallback message is returned as text", () => {
  const kind = detectAiFailureKind(400, "SAFETY blocked by content filter");
  assertEquals(kind, "safety");
  const msg = buildAiFallbackMessage("student", kind);
  assert(msg.includes("لا أستطيع") || msg.includes("لا استطيع"));
});

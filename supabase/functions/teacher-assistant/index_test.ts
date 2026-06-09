import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildAiFallbackMessage, detectAiFailureKind } from "../_shared/aiSettings.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("teacher-assistant: OPTIONS preflight ok", async () => {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/teacher-assistant`, { method: "OPTIONS" });
  await r.text();
  assert(r.status === 200 || r.status === 204);
});

Deno.test("teacher-assistant: 401 without auth", async () => {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/teacher-assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });
  await r.text();
  assertEquals(r.status, 401);
});

Deno.test("teacher-assistant: safety fallback remains non-crashing", () => {
  const kind = detectAiFailureKind(400, "content blocked by safety policy");
  assertEquals(kind, "safety");
  const msg = buildAiFallbackMessage("teacher", kind);
  assert(msg.includes("الاختراق") || msg.includes("الحماية"));
});

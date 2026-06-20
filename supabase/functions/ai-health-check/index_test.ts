import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("ai-health-check: OPTIONS preflight ok", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-health-check`, {
    method: "OPTIONS",
    headers: { Origin: "https://example.com" },
  });
  await response.text();
  assertEquals([200, 204].includes(response.status), true);
});

Deno.test("ai-health-check: rejects calls without auth", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-health-check`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON },
    body: JSON.stringify({}),
  });
  await response.text();
  assertEquals(response.status, 401);
});
// Unit tests for shared AI settings/fallback logic.
// Run via: deno test --allow-net --allow-env supabase/functions/_shared/aiSettings_test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callGeminiWithFallback, errorResponseFromStatus } from "./aiSettings.ts";

const cors = { "Access-Control-Allow-Origin": "*" };

Deno.test("errorResponseFromStatus maps 402", async () => {
  const r = errorResponseFromStatus(402, cors);
  assertEquals(r.status, 402);
  const j = await r.json();
  assert(typeof j.error === "string" && j.error.length > 0);
});

Deno.test("errorResponseFromStatus maps 429", async () => {
  const r = errorResponseFromStatus(429, cors);
  assertEquals(r.status, 429);
  const j = await r.json();
  assert(j.error.includes("الحد") || j.error.includes("دقيقة"));
});

Deno.test("errorResponseFromStatus maps 502/other", async () => {
  const r = errorResponseFromStatus(502, cors);
  assertEquals(r.status, 502);
  await r.json();
});

function withMockFetch(handler: (input: string, init: RequestInit) => Response | Promise<Response>) {
  const original = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).fetch = async (input: any, init: any) =>
    handler(typeof input === "string" ? input : input.url, init);
  return () => {
    globalThis.fetch = original;
  };
}

Deno.test("callGeminiWithFallback: returns ok on first model success", async () => {
  const restore = withMockFetch(() =>
    new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }), { status: 200 })
  );
  try {
    const r = await callGeminiWithFallback({
      apiKey: "k",
      models: ["a", "b"],
      body: { messages: [] },
    });
    assert(r.ok);
    if (r.ok) assertEquals(r.model, "a");
  } finally {
    restore();
  }
});

Deno.test("callGeminiWithFallback: 429 cycles to next model", async () => {
  let calls = 0;
  const restore = withMockFetch(() => {
    calls += 1;
    if (calls === 1) return new Response("rate", { status: 429 });
    return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
  });
  try {
    const r = await callGeminiWithFallback({
      apiKey: "k",
      models: ["m1", "m2"],
      body: {},
    });
    assert(r.ok);
    if (r.ok) assertEquals(r.model, "m2");
    assertEquals(calls, 2);
  } finally {
    restore();
  }
});

Deno.test("callGeminiWithFallback: 429 does not short-circuit to gateway logic", async () => {
  let calls = 0;
  const restore = withMockFetch(() => {
    calls += 1;
    return new Response("quota", { status: 429 });
  });
  try {
    const r = await callGeminiWithFallback({ apiKey: "k", models: ["a", "b"], body: {} });
    assert(!r.ok);
    if (!r.ok) assertEquals(r.status, 429);
    assertEquals(calls, 2);
  } finally {
    restore();
  }
});

Deno.test("callGeminiWithFallback: 402 short-circuits without retry", async () => {
  let calls = 0;
  const restore = withMockFetch(() => {
    calls += 1;
    return new Response("no credit", { status: 402 });
  });
  try {
    const r = await callGeminiWithFallback({ apiKey: "k", models: ["a", "b", "c"], body: {} });
    assert(!r.ok);
    if (!r.ok) assertEquals(r.status, 402);
    assertEquals(calls, 1);
  } finally {
    restore();
  }
});

Deno.test("callGeminiWithFallback: all models 502 → returns 502", async () => {
  const restore = withMockFetch(() => new Response("boom", { status: 502 }));
  try {
    const r = await callGeminiWithFallback({ apiKey: "k", models: ["a", "b"], body: {} });
    assert(!r.ok);
    if (!r.ok) assertEquals(r.status, 502);
  } finally {
    restore();
  }
});

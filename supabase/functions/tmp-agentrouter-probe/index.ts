// TEMPORARY diagnostic — verifies AgentRouter reachability from the edge runtime.
Deno.serve(async () => {
  const key = String(Deno.env.get("AGENTROUTER_API_KEY") || "").trim();
  const out: Record<string, unknown> = { has_key: !!key };
  for (const base of ["https://agentrouter.org/v1", "https://api.agentrouter.org/v1"]) {
    try {
      const r = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "say ready" }], max_tokens: 16 }),
      });
      const text = await r.text();
      out[base] = { status: r.status, body: text.slice(0, 400) };
    } catch (e) {
      out[base] = { error: String((e as Error).message) };
    }
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json" } });
});

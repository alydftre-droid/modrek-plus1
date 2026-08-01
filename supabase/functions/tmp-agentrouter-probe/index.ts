// TEMPORARY diagnostic — probes AgentRouter header variants from the edge runtime.
Deno.serve(async () => {
  const key = String(Deno.env.get("AGENTROUTER_API_KEY") || "").trim();
  const variants: Array<{ name: string; url: string; headers: Record<string, string>; method: string; body?: string }> = [
    {
      name: "chat_plain",
      url: "https://agentrouter.org/v1/chat/completions",
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, Accept: "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "say ready" }], max_tokens: 16 }),
    },
    {
      name: "chat_ua",
      url: "https://agentrouter.org/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "User-Agent": "OpenAI/NodeJS/4.0.0",
      },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "say ready" }], max_tokens: 16 }),
    },
    {
      name: "models",
      url: "https://agentrouter.org/v1/models",
      method: "GET",
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "User-Agent": "OpenAI/NodeJS/4.0.0" },
    },
    {
      name: "chat_curl_ua",
      url: "https://agentrouter.org/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "User-Agent": "curl/8.5.0",
      },
      body: JSON.stringify({ model: "claude-sonnet-4-5-20250929", messages: [{ role: "user", content: "say ready" }], max_tokens: 16 }),
    },
  ];
  const out: Record<string, unknown> = { has_key: !!key };
  for (const v of variants) {
    try {
      const r = await fetch(v.url, { method: v.method, headers: v.headers, body: v.body });
      const text = await r.text();
      out[v.name] = { status: r.status, ct: r.headers.get("content-type"), body: text.slice(0, 300) };
    } catch (e) {
      out[v.name] = { error: String((e as Error).message) };
    }
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json" } });
});

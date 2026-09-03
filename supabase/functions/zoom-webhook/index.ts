// Modrek Live — Zoom event webhook.
// Keeps live_sessions.status authoritative on the server side, including the
// Zoom Basic 40-minute cutoff (which arrives as a normal meeting.ended event).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-zm-signature, x-zm-request-timestamp",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

async function hmacHex(secret: string, message: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return Array.from(signature).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function patchSession(meetingId: string, patch: Record<string, unknown>) {
  const url = `${Deno.env.get("SUPABASE_URL")}/rest/v1/live_sessions?zoom_meeting_id=eq.${encodeURIComponent(meetingId)}&status=in.(live,starting,ending)`;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) console.error("[zoom-webhook] patch_failed", res.status, (await res.text()).slice(0, 200));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const secret = Deno.env.get("ZOOM_WEBHOOK_SECRET_TOKEN");
    const raw = await req.text();
    const payload = raw ? JSON.parse(raw) : {};

    // Zoom endpoint validation handshake
    if (payload?.event === "endpoint.url_validation") {
      if (!secret) return new Response(JSON.stringify({ error: "not_configured" }), { status: 503, headers: jsonHeaders });
      const plainToken = payload?.payload?.plainToken || "";
      return new Response(
        JSON.stringify({ plainToken, encryptedToken: await hmacHex(secret, plainToken) }),
        { headers: jsonHeaders },
      );
    }

    if (!secret) {
      return new Response(JSON.stringify({ error: "not_configured" }), { status: 503, headers: jsonHeaders });
    }

    const signature = req.headers.get("x-zm-signature") || "";
    const timestamp = req.headers.get("x-zm-request-timestamp") || "";
    const expected = `v0=${await hmacHex(secret, `v0:${timestamp}:${raw}`)}`;
    if (signature !== expected) {
      console.error("[zoom-webhook] signature_mismatch");
      return new Response(JSON.stringify({ error: "invalid_signature" }), { status: 401, headers: jsonHeaders });
    }

    const meetingId = String(payload?.payload?.object?.id ?? "");
    if (!meetingId) return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });

    const now = new Date().toISOString();

    switch (payload.event) {
      case "meeting.started":
        await patchSession(meetingId, { status: "live", updated_at: now });
        break;
      case "meeting.ended":
        await patchSession(meetingId, { status: "ended", ended_at: now, viewer_count: 0, updated_at: now });
        break;
      case "meeting.deleted":
        await patchSession(meetingId, { status: "cancelled", ended_at: now, viewer_count: 0, updated_at: now });
        break;
      default:
        break;
    }

    return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
  } catch (error) {
    console.error("[zoom-webhook] unhandled", error);
    return new Response(JSON.stringify({ error: "internal_error" }), { status: 500, headers: jsonHeaders });
  }
});

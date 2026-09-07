// Modrek Live — Zoom Event Notification endpoint.
//
// Responsibilities (deliberately narrow):
//  1. Answer Zoom's `endpoint.url_validation` challenge (HMAC SHA-256 of plainToken).
//  2. Verify every event with the `v0:{timestamp}:{body}` HMAC signature scheme
//     using ZOOM_WEBHOOK_SECRET_TOKEN (timing-safe comparison, replay window).
//  3. Persist the raw event once (idempotent on a deterministic dedupe key).
//  4. Keep live_sessions.status truthful for meeting.started / meeting.ended.
//  5. Return 200 fast and never fail loudly enough to affect the main app.
//
// It never links a Zoom participant to a Modrek student — participant events are
// stored raw only; identity mapping is a later, explicitly designed step.
// No secret value is ever logged.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "content-type, authorization, x-zm-signature, x-zm-request-timestamp",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const HANDLED_EVENTS = new Set([
  "meeting.started",
  "meeting.ended",
  "meeting.participant_joined",
  "meeting.participant_left",
]);

// Zoom retries within 5 minutes; anything older is treated as a replay.
const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

export async function hmacHex(secret: string, message: string): Promise<string> {
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

/** Constant-time string comparison — avoids leaking the secret through timing. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type ZoomEvent = {
  event?: string;
  event_ts?: number;
  payload?: {
    plainToken?: string;
    object?: {
      id?: string | number;
      uuid?: string;
      start_time?: string;
      end_time?: string;
      participant?: {
        user_id?: string;
        id?: string;
        participant_uuid?: string;
        user_name?: string;
        join_time?: string;
        leave_time?: string;
      };
    };
  };
};

function restHeaders() {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

/** Deterministic key so a retried delivery never creates a second row. */
export function buildDedupeKey(event: ZoomEvent): string {
  const object = event.payload?.object ?? {};
  const participant = object.participant ?? {};
  const parts = [
    event.event ?? "unknown",
    String(object.uuid ?? object.id ?? "-"),
    String(participant.participant_uuid ?? participant.user_id ?? participant.id ?? "-"),
    String(participant.join_time ?? participant.leave_time ?? object.start_time ?? object.end_time ?? ""),
    String(event.event_ts ?? ""),
  ];
  return parts.join("|");
}

async function insertEventRow(event: ZoomEvent, dedupeKey: string): Promise<"inserted" | "duplicate" | "error"> {
  const object = event.payload?.object ?? {};
  const participant = object.participant ?? {};
  const occurredAt =
    participant.leave_time ??
    participant.join_time ??
    object.end_time ??
    object.start_time ??
    (event.event_ts ? new Date(Number(event.event_ts)).toISOString() : new Date().toISOString());

  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/zoom_webhook_events`, {
    method: "POST",
    headers: { ...restHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify({
      event_type: event.event,
      zoom_event_ts: event.event_ts ?? null,
      meeting_id: object.id != null ? String(object.id) : null,
      meeting_uuid: object.uuid ?? null,
      // Zoom identifiers only — no Modrek student linkage at this stage.
      participant_user_id: participant.user_id ?? participant.id ?? null,
      participant_uuid: participant.participant_uuid ?? null,
      participant_display_name: participant.user_name ?? null,
      occurred_at: occurredAt,
      dedupe_key: dedupeKey,
      payload: event,
      processed: true,
    }),
  });

  if (res.ok) return "inserted";
  const text = await res.text();
  if (res.status === 409 || text.includes("zoom_webhook_events_dedupe_idx")) return "duplicate";
  console.error("[zoom-webhook] event_insert_failed", res.status, text.slice(0, 200));
  return "error";
}

async function patchSessionStatus(meetingId: string, patch: Record<string, unknown>) {
  const url = `${Deno.env.get("SUPABASE_URL")}/rest/v1/live_sessions?zoom_meeting_id=eq.${encodeURIComponent(meetingId)}&status=in.(starting,live,ending)`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...restHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    console.error("[zoom-webhook] session_patch_failed", res.status, (await res.text()).slice(0, 200));
  }
}

async function restGet(path: string): Promise<any[]> {
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/${path}`, { headers: restHeaders() });
  if (!res.ok) {
    console.error("[zoom-webhook] rest_get_failed", res.status, (await res.text()).slice(0, 200));
    return [];
  }
  return await res.json().catch(() => []);
}

async function restPatch(path: string, patch: Record<string, unknown>) {
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { ...restHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    console.error("[zoom-webhook] rest_patch_failed", res.status, (await res.text()).slice(0, 200));
  }
}

/** Most recent Modrek session for a Zoom meeting id (any status). */
async function findSession(meetingId: string) {
  const rows = await restGet(
    `live_sessions?zoom_meeting_id=eq.${encodeURIComponent(meetingId)}&select=id,started_at&order=started_at.desc&limit=1`,
  );
  return rows[0] ?? null;
}

/**
 * Zoom-verified attendance. The display name carries the per-attendance tag
 * minted by `zoom-live` (`الاسم #AB12C`), so a student cannot fake presence by
 * merely opening the page — the record is only confirmed once Zoom itself
 * reports the participant inside the meeting.
 */
async function applyParticipantEvent(event: ZoomEvent, meetingId: string) {
  const participant = event.payload?.object?.participant ?? {};
  const displayName = participant.user_name ?? "";
  const tag = displayName.match(/#([A-Z0-9]{3,8})\s*$/i)?.[1]?.toUpperCase();
  if (!tag) return "no_tag";

  const session = await findSession(meetingId);
  if (!session) return "no_session";

  const rows = await restGet(
    `live_attendance?live_session_id=eq.${session.id}&participant_tag=eq.${encodeURIComponent(tag)}&select=id,joined_at,duration_seconds&limit=1`,
  );
  const row = rows[0];
  if (!row) return "no_attendance";

  const now = new Date().toISOString();

  if (event.event === "meeting.participant_joined") {
    await restPatch(`live_attendance?id=eq.${row.id}`, {
      joined_at: participant.join_time ?? row.joined_at ?? now,
      left_at: null,
      status: "in_meeting",
      verified_by_zoom: true,
      zoom_participant_uuid: participant.participant_uuid ?? null,
      zoom_participant_user_id: participant.user_id ?? participant.id ?? null,
      updated_at: now,
    });
    return "joined";
  }

  const leftAt = participant.leave_time ?? now;
  const joinedMs = new Date(participant.join_time ?? row.joined_at ?? leftAt).getTime();
  const seconds = Math.max(0, Math.round((new Date(leftAt).getTime() - joinedMs) / 1000));
  await restPatch(`live_attendance?id=eq.${row.id}`, {
    left_at: leftAt,
    status: "left",
    verified_by_zoom: true,
    duration_seconds: Math.max(row.duration_seconds || 0, seconds),
    updated_at: now,
  });
  return "left";
}

/** Close any attendance still open when the meeting itself ends. */
async function finalizeAttendance(meetingId: string) {
  const session = await findSession(meetingId);
  if (!session) return;
  await restPatch(`live_attendance?live_session_id=eq.${session.id}&left_at=is.null`, {
    left_at: new Date().toISOString(),
    status: "left",
    updated_at: new Date().toISOString(),
  });
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("ZOOM_WEBHOOK_SECRET_TOKEN");
  let raw = "";
  let event: ZoomEvent = {};

  try {
    raw = await req.text();
    event = raw ? (JSON.parse(raw) as ZoomEvent) : {};
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // ---------------------------------------------------- URL validation handshake
  if (event.event === "endpoint.url_validation") {
    if (!secret) {
      console.error("[zoom-webhook] validation_without_secret");
      return json({ error: "webhook_secret_not_configured" }, 503);
    }
    const plainToken = event.payload?.plainToken ?? "";
    if (!plainToken) return json({ error: "missing_plain_token" }, 400);
    return json({ plainToken, encryptedToken: await hmacHex(secret, plainToken) });
  }

  if (!secret) {
    console.error("[zoom-webhook] event_without_secret", { event: event.event ?? null });
    return json({ error: "webhook_secret_not_configured" }, 503);
  }

  // --------------------------------------------------------- signature verification
  const signature = req.headers.get("x-zm-signature") ?? "";
  const timestamp = req.headers.get("x-zm-request-timestamp") ?? "";
  if (!signature || !timestamp) return json({ error: "missing_signature" }, 401);

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_TIMESTAMP_SKEW_MS) {
    console.error("[zoom-webhook] stale_timestamp", { event: event.event ?? null });
    return json({ error: "stale_request" }, 401);
  }

  const expected = `v0=${await hmacHex(secret, `v0:${timestamp}:${raw}`)}`;
  if (!timingSafeEqual(signature, expected)) {
    console.error("[zoom-webhook] signature_mismatch", { event: event.event ?? null });
    return json({ error: "invalid_signature" }, 401);
  }

  // ------------------------------------------------------------------- processing
  // Past this point every failure is swallowed: Zoom must get a 200 and the main
  // app must never be affected by a logging problem.
  try {
    if (!event.event || !HANDLED_EVENTS.has(event.event)) {
      console.log("[zoom-webhook] ignored_event", { event: event.event ?? null });
      return json({ ok: true, ignored: true });
    }

    const dedupeKey = buildDedupeKey(event);
    const result = await insertEventRow(event, dedupeKey);

    const meetingId = event.payload?.object?.id != null ? String(event.payload.object.id) : "";
    const now = new Date().toISOString();

    let attendance: string | null = null;
    if (result === "inserted" && meetingId) {
      if (event.event === "meeting.started") {
        await patchSessionStatus(meetingId, { status: "live", updated_at: now });
      } else if (event.event === "meeting.ended") {
        await patchSessionStatus(meetingId, {
          status: "ended",
          ended_at: now,
          viewer_count: 0,
          updated_at: now,
        });
        await finalizeAttendance(meetingId);
      } else {
        attendance = await applyParticipantEvent(event, meetingId);
      }
    }


    console.log("[zoom-webhook] handled", {
      event: event.event,
      meetingId: meetingId || null,
      result,
    });

    return json({ ok: true, event: event.event, duplicate: result === "duplicate" });
  } catch (error) {
    console.error("[zoom-webhook] processing_error", {
      event: event.event ?? null,
      message: error instanceof Error ? error.message : String(error),
    });
    // Acknowledge so Zoom does not disable the subscription for our internal issue.
    return json({ ok: true, deferred: true });
  }
});

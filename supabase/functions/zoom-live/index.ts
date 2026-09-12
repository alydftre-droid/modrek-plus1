// Modrek Live — Zoom Meeting SDK backend (Phase 1 PoC)
//
// Security model:
// - All Zoom credentials stay server-side. The client only ever receives a
//   short-lived Meeting SDK signature (JWT) scoped to one meeting number.
// - Host ZAK is returned ONLY to the teacher who owns the group, at start time,
//   and is never persisted anywhere.
// - Student access requires: authenticated + purchase of the exact group + an
//   active live session. Meeting IDs alone grant nothing through Modrek.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { isDemoUserId, DEMO_READ_ONLY_CODE, DEMO_READ_ONLY_MESSAGE } from "../_shared/demoGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

type ErrorCode =
  | "unauthorized"
  | "invalid_token"
  | "invalid_payload"
  | "zoom_credentials_missing"
  | "zoom_authorization_failed"
  | "teacher_not_authorized"
  | "group_not_found"
  | "group_inactive"
  | "student_not_subscribed"
  | "meeting_creation_failed"
  | "meeting_ended"
  | "session_not_found"
  | "sdk_signature_failed"
  | "internal_error";

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  unauthorized: "يجب تسجيل الدخول أولًا",
  invalid_token: "انتهت صلاحية الجلسة، أعد تسجيل الدخول",
  invalid_payload: "بيانات الطلب غير صحيحة",
  zoom_credentials_missing: "لم يتم ضبط مفاتيح Zoom في الخادم بعد",
  zoom_authorization_failed: "فشل التحقق من حساب Zoom",
  teacher_not_authorized: "غير مصرح لك ببدء بث في هذه المجموعة",
  group_not_found: "المجموعة غير موجودة",
  group_inactive: "هذه المجموعة غير نشطة",
  student_not_subscribed: "غير مشترك في هذه المجموعة",
  meeting_creation_failed: "فشل إنشاء اجتماع Zoom",
  meeting_ended: "انتهت هذه الحصة",
  session_not_found: "لم يتم العثور على البث",
  sdk_signature_failed: "فشل تهيئة Zoom SDK",
  internal_error: "حدث خطأ غير متوقع",
};

type SafeDiagnostic = {
  step: "oauth_token" | "zoom_user" | "meeting_lookup" | "create_meeting" | "zak" | "database" | "unknown";
  source: string;
  httpStatus?: number;
  zoomCode?: number | string;
  zoomMessage?: string;
  requestId?: string;
  fileLine?: string;
};

function fail(code: ErrorCode, status: number, detail?: string, diagnostic?: SafeDiagnostic) {
  if (detail || diagnostic) console.error(`[zoom-live] ${code}`, { detail, diagnostic });
  return new Response(JSON.stringify({
    error: diagnostic?.zoomMessage || ERROR_MESSAGES[code],
    errorCode: code,
    diagnostic: diagnostic || undefined,
  }), {
    status,
    headers: jsonHeaders,
  });
}

function ok(payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { headers: jsonHeaders });
}

function zoomConfig() {
  const accountId = Deno.env.get("ZOOM_ACCOUNT_ID");
  const clientId = Deno.env.get("ZOOM_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET");
  // Current Zoom naming is Meeting SDK "Client ID / Client Secret"; the older
  // SDK Key / SDK Secret names are accepted as aliases for the same values.
  const sdkKey = Deno.env.get("ZOOM_MEETING_SDK_CLIENT_ID") || Deno.env.get("ZOOM_SDK_KEY");
  const sdkSecret = Deno.env.get("ZOOM_MEETING_SDK_CLIENT_SECRET") || Deno.env.get("ZOOM_SDK_SECRET");
  if (!accountId || !clientId || !clientSecret || !sdkKey || !sdkSecret) return null;
  return { accountId, clientId, clientSecret, sdkKey, sdkSecret };
}

function webhookConfigured() {
  return Boolean(Deno.env.get("ZOOM_WEBHOOK_SECRET_TOKEN"));
}

/** Short per-attendance tag appended to the Zoom display name so that Zoom's
 *  own participant events can be mapped back to a Modrek student. */
function participantTag() {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 5).toUpperCase();
}


/** Names of the secrets still missing — never their values. */
function zoomMissingSecrets(): string[] {
  const missing: string[] = [];
  if (!Deno.env.get("ZOOM_ACCOUNT_ID")) missing.push("ZOOM_ACCOUNT_ID");
  if (!Deno.env.get("ZOOM_CLIENT_ID")) missing.push("ZOOM_CLIENT_ID");
  if (!Deno.env.get("ZOOM_CLIENT_SECRET")) missing.push("ZOOM_CLIENT_SECRET");
  if (!Deno.env.get("ZOOM_MEETING_SDK_CLIENT_ID") && !Deno.env.get("ZOOM_SDK_KEY")) {
    missing.push("ZOOM_MEETING_SDK_CLIENT_ID");
  }
  if (!Deno.env.get("ZOOM_MEETING_SDK_CLIENT_SECRET") && !Deno.env.get("ZOOM_SDK_SECRET")) {
    missing.push("ZOOM_MEETING_SDK_CLIENT_SECRET");
  }
  return missing;
}

// ---------------------------------------------------------------- JWT signing
function b64url(bytes: Uint8Array) {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signHs256(payload: Record<string, unknown>, secret: string) {
  const encoder = new TextEncoder();
  const header = b64url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(`${header}.${body}`)),
  );
  return `${header}.${body}.${b64url(signature)}`;
}

/** Meeting SDK signature — role 1 = host, 0 = attendee. */
async function buildSdkSignature(
  cfg: NonNullable<ReturnType<typeof zoomConfig>>,
  meetingNumber: string,
  role: 0 | 1,
) {
  const iat = Math.floor(Date.now() / 1000) - 30;
  const exp = iat + 60 * 60 * 2; // Zoom requires 30 min .. 48 h
  return await signHs256(
    {
      appKey: cfg.sdkKey,
      sdkKey: cfg.sdkKey,
      mn: meetingNumber,
      role,
      iat,
      exp,
      tokenExp: exp,
    },
    cfg.sdkSecret,
  );
}

// ------------------------------------------------------------------ Zoom REST
function sanitizeZoomDiagnostic(
  step: SafeDiagnostic["step"],
  source: string,
  status: number,
  json: any,
  requestId?: string | null,
): SafeDiagnostic {
  return {
    step,
    source,
    httpStatus: status,
    zoomCode: json?.code ?? json?.error ?? undefined,
    zoomMessage: String(json?.message ?? json?.reason ?? json?.error_description ?? "Zoom request failed").slice(0, 500),
    requestId: requestId || undefined,
    fileLine: "supabase/functions/zoom-live/index.ts",
  };
}

class ZoomApiError extends Error {
  diagnostic: SafeDiagnostic;
  constructor(diagnostic: SafeDiagnostic) {
    super(diagnostic.zoomMessage || "Zoom request failed");
    this.diagnostic = diagnostic;
  }
}

async function zoomAccessToken(cfg: NonNullable<ReturnType<typeof zoomConfig>>) {
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(cfg.accountId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${cfg.clientId}:${cfg.clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
  );
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { message: text.slice(0, 300) }; }
  if (!res.ok || !json?.access_token) {
    throw new ZoomApiError(sanitizeZoomDiagnostic(
      "oauth_token",
      "POST https://zoom.us/oauth/token?grant_type=account_credentials&account_id=ZOOM_ACCOUNT_ID",
      res.status,
      json,
      res.headers.get("x-zm-trackingid"),
    ));
  }
  return json.access_token as string;
}

async function zoomApi(token: string, path: string, init: RequestInit = {}, step: SafeDiagnostic["step"] = "unknown") {
  const res = await fetch(`https://api.zoom.us/v2${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return {
    ok: res.ok,
    status: res.status,
    json,
    diagnostic: res.ok ? undefined : sanitizeZoomDiagnostic(
      step,
      `${init.method || "GET"} /v2${path.replace(/\/users\/[^/]+/, "/users/{userId}")}`,
      res.status,
      json,
      res.headers.get("x-zm-trackingid"),
    ),
  };
}

async function resolveZoomHost(token: string, expectedAccountId: string) {
  const configuredUserId = Deno.env.get("ZOOM_HOST_USER_ID")?.trim();
  const path = `/users/${encodeURIComponent(configuredUserId || "me")}`;
  const response = await zoomApi(token, path, {}, "zoom_user");
  if (!response.ok || !response.json?.id) {
    throw new ZoomApiError(response.diagnostic || sanitizeZoomDiagnostic("zoom_user", "GET /v2/users/{userId}", response.status, response.json));
  }
  if (response.json?.account_id && response.json.account_id !== expectedAccountId) {
    throw new ZoomApiError({
      step: "zoom_user",
      source: "GET /v2/users/{userId}",
      httpStatus: 409,
      zoomCode: "zoom_account_mismatch",
      zoomMessage: "مستخدم Zoom المحدد لا يتبع الحساب المرتبط بتطبيق Modrek Live Backend",
      fileLine: "supabase/functions/zoom-live/index.ts",
    });
  }
  return { id: String(response.json.id), status: String(response.json.status || "") };
}

type MeetingState = "match" | "other_host" | "missing" | "unknown";

/** Classify an existing Zoom meeting so a rejoin never churns a live meeting.
 *  "unknown" (transient Zoom/API failure) is treated as reusable by callers:
 *  creating a second meeting while the first is still running is exactly what
 *  produces Zoom error 3000 ("Already has other meetings in progress"). */
async function inspectExistingMeeting(
  token: string,
  meetingNumber: string,
  hostId: string,
): Promise<MeetingState> {
  const response = await zoomApi(
    token,
    `/meetings/${encodeURIComponent(meetingNumber)}`,
    {},
    "meeting_lookup",
  );
  if (response.ok) {
    return String(response.json?.host_id || "") === hostId ? "match" : "other_host";
  }
  if (response.status === 404 || response.status === 400) return "missing";
  return "unknown";
}

/** End every meeting still in progress for this Zoom host (except one we intend
 *  to keep). Required before creating a fresh meeting: a single-host Zoom
 *  account rejects a second concurrent meeting with SDK error 3000. */
async function endHostLiveMeetings(token: string, hostId: string, keepMeetingId?: string) {
  const live = await zoomApi(
    token,
    `/users/${encodeURIComponent(hostId)}/meetings?type=live&page_size=30`,
    {},
    "meeting_lookup",
  );
  if (!live.ok) return;
  const meetings: any[] = Array.isArray(live.json?.meetings) ? live.json.meetings : [];
  for (const meeting of meetings) {
    const id = String(meeting?.id ?? "");
    if (!id || (keepMeetingId && id === keepMeetingId)) continue;
    await zoomApi(
      token,
      `/meetings/${encodeURIComponent(id)}/status`,
      { method: "PUT", body: JSON.stringify({ action: "end" }) },
      "meeting_lookup",
    );
  }
}

async function closeModrekSession(supabase: any, session: { id: string; group_id?: string | null }) {
  const now = new Date().toISOString();
  const tasks: PromiseLike<unknown>[] = [
    supabase
      .from("live_sessions")
      .update({ status: "ended", ended_at: now, viewer_count: 0, updated_at: now })
      .eq("id", session.id),
    supabase
      .from("live_attendance")
      .update({ left_at: now, status: "left", updated_at: now })
      .eq("live_session_id", session.id)
      .is("left_at", null),
  ];
  if (session.group_id) {
    tasks.push(
      supabase
        .from("live_boards")
        .update({ is_open: false, updated_at: now })
        .eq("group_id", session.group_id),
    );
  }
  await Promise.all(tasks);
}

/** Returns null when Zoom could not be checked, otherwise whether this exact
 * meeting is currently listed as live for the configured host. */
async function isMeetingCurrentlyLive(token: string, hostId: string, meetingId: string): Promise<boolean | null> {
  const response = await zoomApi(
    token,
    `/users/${encodeURIComponent(hostId)}/meetings?type=live&page_size=30`,
    {},
    "meeting_lookup",
  );
  if (!response.ok) return null;
  const meetings: any[] = Array.isArray(response.json?.meetings) ? response.json.meetings : [];
  return meetings.some((meeting) => String(meeting?.id ?? "") === meetingId);
}


// --------------------------------------------------------------- user context
async function getUserContext(supabase: any, userId: string) {
  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from("profiles").select("full_name, email, role").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const roles = new Set((roleRows || []).map((row: any) => String(row.role)));
  return {
    userName: profile?.full_name || "مستخدم",
    email: profile?.email || null,
    isAdmin: roles.has("admin") || profile?.role === "admin",
    isTeacher: roles.has("teacher") || profile?.role === "teacher",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return fail("unauthorized", 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) return fail("invalid_token", 401);

    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "";
    if (!action) return fail("invalid_payload", 400);

    // Demo accounts may inspect capabilities/diagnostics but never create,
    // join, leave or end a live session (all of those write attendance rows).
    const isDemo = await isDemoUserId(user.id);
    const LIVE_WRITE_ACTIONS = new Set(["start", "join", "leave", "end"]);
    if (LIVE_WRITE_ACTIONS.has(action) && isDemo) {
      return fail(DEMO_READ_ONLY_CODE, 403, DEMO_READ_ONLY_MESSAGE);
    }

    // Availability probe — never returns any secret value, only names.
    if (action === "capabilities") {
      return ok({
        zoomEnabled: Boolean(zoomConfig()),
        missingSecrets: zoomMissingSecrets(),
        webhookConfigured: webhookConfigured(),
        environment: "server",
      });
    }

    const ctx = await getUserContext(supabase, user.id);

    // --------------------------------------------------------------- status
    // Lightweight reconciliation used while a live card is visible. It repairs
    // a missed Zoom webhook without polling the database aggressively.
    if (action === "status") {
      const sessionId = String(body.sessionId || "");
      if (!sessionId) return fail("invalid_payload", 400);
      const { data: session } = await supabase
        .from("live_sessions")
        .select("id,group_id,teacher_id,status,provider,zoom_meeting_id,started_at")
        .eq("id", sessionId)
        .maybeSingle();
      if (!session) return fail("session_not_found", 404);

      const isOwner = session.teacher_id === user.id;
      if (!isOwner && !ctx.isAdmin) {
        const { data: purchase } = await supabase
          .from("student_group_purchases")
          .select("id")
          .eq("group_id", session.group_id)
          .eq("student_id", user.id)
          .maybeSingle();
        if (!purchase) return fail("student_not_subscribed", 403);
      }

      if (session.status !== "live" || session.provider !== "zoom" || !session.zoom_meeting_id) {
        return ok({ status: session.status, active: session.status === "live" });
      }

      // Give the host enough time to approve permissions and complete SDK join.
      const ageMs = Date.now() - new Date(session.started_at).getTime();
      if (!isDemo && ageMs >= 5 * 60 * 1000) {
        const cfg = zoomConfig();
        if (cfg) {
          try {
            const token = await zoomAccessToken(cfg);
            const host = await resolveZoomHost(token, cfg.accountId);
            const active = await isMeetingCurrentlyLive(token, host.id, String(session.zoom_meeting_id));
            if (active === false) {
              await closeModrekSession(supabase, session);
              return ok({ status: "ended", active: false, reconciled: true });
            }
          } catch (error) {
            console.error("[zoom-live] status_reconcile_failed", String(error));
          }
        }
      }
      return ok({ status: "live", active: true });
    }

    // Real Zoom connectivity check (admins only): proves the Server-to-Server
    // OAuth app works and reports which granted scopes are still missing.
    if (action === "diagnostics") {
      if (!ctx.isAdmin) return fail("teacher_not_authorized", 403);
      const cfg = zoomConfig();
      if (!cfg) return ok({ oauth: false, missingSecrets: zoomMissingSecrets() });
      try {
        const token = await zoomAccessToken(cfg);
        const host = await resolveZoomHost(token, cfg.accountId);
        const zak = await zoomApi(token, `/users/${encodeURIComponent(host.id)}/token?type=zak`, {}, "zak");
        return ok({
          oauth: true,
          hostAccountActive: host.status === "active",
          zakAvailable: zak.ok && Boolean(zak.json?.token),
          sdkSignatureAvailable: Boolean(await buildSdkSignature(cfg, "123456789", 0)),
          webhookConfigured: webhookConfigured(),
          missingScopes: [
            ...(zak.ok ? [] : ["user:read:token:admin"]),
          ],
          zakDiagnostic: zak.diagnostic,
        });
      } catch (error) {
        const diagnostic = error instanceof ZoomApiError ? error.diagnostic : undefined;
        console.error("[zoom-live] diagnostics_failed", { diagnostic, message: error instanceof Error ? error.message : String(error) });
        return ok({ oauth: false, reason: "zoom_authorization_failed", diagnostic });
      }
    }


    // ------------------------------------------------------------------ start
    if (action === "start") {
      const groupId = String(body.groupId || "");
      if (!groupId) return fail("invalid_payload", 400);
      if (!ctx.isTeacher && !ctx.isAdmin) return fail("teacher_not_authorized", 403);

      const { data: group } = await supabase
        .from("content_groups")
        .select("id, title, teacher_id, is_active")
        .eq("id", groupId)
        .maybeSingle();

      if (!group) return fail("group_not_found", 404);
      if (!ctx.isAdmin && group.teacher_id !== user.id) return fail("teacher_not_authorized", 403);
      if (!group.is_active) return fail("group_inactive", 400);

      const cfg = zoomConfig();
      if (!cfg) return fail("zoom_credentials_missing", 503);

      // Idempotency: reuse an existing active Zoom session for this group.
      const { data: existing } = await supabase
        .from("live_sessions")
        .select("*")
        .eq("group_id", groupId)
        .in("status", ["live", "starting"])
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let token: string;
      try {
        token = await zoomAccessToken(cfg);
      } catch (error) {
        const diagnostic = error instanceof ZoomApiError ? error.diagnostic : undefined;
        return fail("zoom_authorization_failed", 502, error instanceof Error ? error.message : String(error), diagnostic);
      }

      let host: { id: string; status: string };
      try {
        host = await resolveZoomHost(token, cfg.accountId);
      } catch (error) {
        const diagnostic = error instanceof ZoomApiError ? error.diagnostic : undefined;
        return fail("meeting_creation_failed", 502, error instanceof Error ? error.message : String(error), diagnostic);
      }
      if (host.status && host.status !== "active") {
        return fail("meeting_creation_failed", 409, "zoom host is not active", {
          step: "zoom_user",
          source: "GET /v2/users/{userId}",
          httpStatus: 409,
          zoomCode: "zoom_host_inactive",
          zoomMessage: "حساب مضيف Zoom غير نشط",
          fileLine: "supabase/functions/zoom-live/index.ts",
        });
      }

      let zakToken: string | null = null;
      const zak = await zoomApi(token, `/users/${encodeURIComponent(host.id)}/token?type=zak`, {}, "zak");
      if (zak.ok) zakToken = zak.json?.token || null;
      if (!zakToken) {
        return fail("meeting_creation_failed", 502, "host ZAK unavailable", zak.diagnostic || {
          step: "zak",
          source: "GET /v2/users/{userId}/token?type=zak",
          httpStatus: zak.status,
          zoomCode: "zak_missing",
          zoomMessage: "تعذر إصدار رمز المضيف ZAK. أضف نطاق user:read:token:admin إلى تطبيق Modrek Live Backend ثم أعد تفعيله.",
          fileLine: "supabase/functions/zoom-live/index.ts",
        });
      }

      const existingState: MeetingState = existing && existing.provider === "zoom" && existing.zoom_meeting_id
        ? await inspectExistingMeeting(token, String(existing.zoom_meeting_id), host.id)
        : "missing";
      // A rejoin after a reload/exit must land back on the SAME meeting the
      // teacher started. Only a meeting owned by a different host is unusable.
      const canReuseExisting = existingState === "match" || existingState === "unknown";

      if (existing && canReuseExisting) {
        const signature = await buildSdkSignature(cfg, String(existing.zoom_meeting_id), 1);
        if (existing.status !== "live") {
          await supabase
            .from("live_sessions")
            .update({ status: "live", ended_at: null, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
        }
        return ok({
          provider: "zoom",
          reused: true,
          session: { ...existing, status: "live" },
          sdkKey: cfg.sdkKey,
          signature,
          meetingNumber: String(existing.zoom_meeting_id),
          password: existing.zoom_join_url?.includes("pwd=")
            ? new URL(existing.zoom_join_url).searchParams.get("pwd")
            : null,
          zak: zakToken,
          role: 1,
          userName: ctx.userName,
        });
      }

      if (existing) {
        // Never reuse a stale meeting created for another Zoom host. A ZAK is
        // user-bound; combining it with that meeting produces Zoom's "Token error".
        await closeModrekSession(supabase, existing);
      }

      // Clear anything still running on the Zoom host so the new meeting can
      // actually start (otherwise Zoom answers with SDK error 3000).
      await endHostLiveMeetings(token, host.id);



      const title = String(body.title || "حصة مباشرة").slice(0, 160);
      const created = await zoomApi(token, `/users/${encodeURIComponent(host.id)}/meetings`, {
        method: "POST",
        body: JSON.stringify({
          topic: `${group.title} — ${title}`.slice(0, 200),
          type: 1, // instant meeting
          default_password: true,
          settings: {
            host_video: true,
            participant_video: false,
            join_before_host: false,
            waiting_room: false,
            mute_upon_entry: true,
            auto_recording: "none",
            approval_type: 2, // no registration
          },
        }),
      }, "create_meeting");

      if (!created.ok || !created.json?.id) {
        return fail("meeting_creation_failed", 502, JSON.stringify(created.json).slice(0, 300), created.diagnostic);
      }

      const meetingNumber = String(created.json.id);
      const insert = await supabase
        .from("live_sessions")
        .insert({
          group_id: groupId,
          teacher_id: user.id,
          title,
          room_name: `zoom-${meetingNumber}`,
          status: "live",
          provider: "zoom",
          zoom_meeting_id: meetingNumber,
          zoom_meeting_uuid: created.json.uuid || null,
          zoom_join_url: created.json.join_url || null,
          zoom_host_email: created.json.host_email || null,
          allow_student_camera: body.allowCamera ?? false,
          allow_student_mic: body.allowMic ?? true,
          viewer_count: 0,
        })
        .select()
        .single();

      if (insert.error || !insert.data) {
        // Unique index hit => another concurrent start won the race; reuse it.
        const { data: raced } = await supabase
          .from("live_sessions")
          .select("*")
          .eq("group_id", groupId)
          .in("status", ["live", "starting"])
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!raced) return fail("meeting_creation_failed", 500, insert.error?.message, {
          step: "database",
          source: "INSERT public.live_sessions",
          httpStatus: 500,
          zoomCode: insert.error?.code,
          zoomMessage: insert.error?.message || "تعذر حفظ جلسة Zoom بعد إنشائها",
          fileLine: "supabase/functions/zoom-live/index.ts",
        });
        const signature = await buildSdkSignature(cfg, String(raced.zoom_meeting_id ?? meetingNumber), 1);
        return ok({
          provider: raced.provider,
          reused: true,
          session: raced,
          sdkKey: cfg.sdkKey,
          signature,
          meetingNumber: String(raced.zoom_meeting_id ?? meetingNumber),
          password: created.json.password || null,
          zak: zakToken,
          role: 1,
          userName: ctx.userName,
        });
      }

      const session = insert.data;

      const { data: subscribers } = await supabase
        .from("student_group_purchases")
        .select("student_id")
        .eq("group_id", groupId);

      if (subscribers?.length) {
        await supabase.from("notifications").insert(
          subscribers.map((s: any) => ({
            user_id: s.student_id,
            title: "🔴 بث مباشر الآن!",
            message: `بدأ المعلم ${ctx.userName} حصة مباشرة: ${title}`,
            notification_type: "live",
            created_by: user.id,
          })),
        );
      }

      const signature = await buildSdkSignature(cfg, meetingNumber, 1);
      return ok({
        provider: "zoom",
        reused: false,
        session,
        sdkKey: cfg.sdkKey,
        signature,
        meetingNumber,
        password: created.json.password || null,
        zak: zakToken,
        role: 1,
        userName: ctx.userName,
      });
    }

    // ------------------------------------------------------------------- join
    if (action === "join") {
      const sessionId = String(body.sessionId || "");
      if (!sessionId) return fail("invalid_payload", 400);

      const { data: session } = await supabase
        .from("live_sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();

      if (!session) return fail("session_not_found", 404);
      if (!["live", "starting"].includes(session.status)) return fail("meeting_ended", 409);

      const isOwner = session.teacher_id === user.id;

      if (!isOwner && !ctx.isAdmin) {
        // Teachers of other groups get no special treatment: membership only.
        const { data: purchase } = await supabase
          .from("student_group_purchases")
          .select("id")
          .eq("group_id", session.group_id)
          .eq("student_id", user.id)
          .maybeSingle();
        if (!purchase) return fail("student_not_subscribed", 403);
      }

      const { data: banAction } = await supabase
        .from("live_session_actions")
        .select("action")
        .eq("session_id", sessionId)
        .eq("student_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (banAction?.action === "ban") return fail("student_not_subscribed", 403);

      if (session.provider !== "zoom" || !session.zoom_meeting_id) {
        // No legacy provider exists any more: the teacher must start a Zoom session.
        return fail("meeting_ended", 409, `non_zoom_session ${sessionId}`);
      }

      const cfg = zoomConfig();
      if (!cfg) return fail("zoom_credentials_missing", 503);

      let signature: string;
      try {
        signature = await buildSdkSignature(cfg, String(session.zoom_meeting_id), isOwner ? 1 : 0);
      } catch (error) {
        return fail("sdk_signature_failed", 500, String(error));
      }

      let zakToken: string | null = null;
      if (isOwner) {
        try {
          const token = await zoomAccessToken(cfg);
          const host = await resolveZoomHost(token, cfg.accountId);
          const state = await inspectExistingMeeting(
            token,
            String(session.zoom_meeting_id),
            host.id,
          );
          if (state === "other_host") {
            return fail("meeting_ended", 409, "meeting host mismatch", {
              step: "meeting_lookup",
              source: "GET /v2/meetings/{meetingId}",
              httpStatus: 409,
              zoomCode: "zoom_host_mismatch",
              zoomMessage: "هذه الجلسة مرتبطة بمضيف Zoom قديم. أنهِها وابدأ حصة جديدة.",
              fileLine: "supabase/functions/zoom-live/index.ts",
            });
          }

          const zak = await zoomApi(
            token,
            `/users/${encodeURIComponent(host.id)}/token?type=zak`,
            {},
            "zak",
          );
          if (zak.ok) zakToken = zak.json?.token || null;
        } catch (error) {
          console.error("[zoom-live] zak_refresh_failed", String(error));
        }
        if (!zakToken) {
          return fail("meeting_creation_failed", 502, "host ZAK unavailable", {
            step: "zak",
            source: "GET /v2/users/{userId}/token?type=zak",
            httpStatus: 502,
            zoomCode: "zak_missing",
            zoomMessage: "تعذر إصدار رمز المضيف من Zoom. أغلق الحصة وابدأ حصة جديدة.",
            fileLine: "supabase/functions/zoom-live/index.ts",
          });
        }
      }

      const password = session.zoom_join_url?.includes("pwd=")
        ? new URL(session.zoom_join_url).searchParams.get("pwd")
        : null;

      let displayName = ctx.userName;

      if (!isOwner) {
        await supabase
          .from("live_sessions")
          .update({
            viewer_count: (session.viewer_count || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sessionId);

        const { data: attendance } = await supabase
          .from("live_attendance")
          .select("id, participant_tag")
          .eq("live_session_id", sessionId)
          .eq("student_id", user.id)
          .maybeSingle();

        const tag = attendance?.participant_tag || participantTag();
        if (!attendance) {
          await supabase.from("live_attendance").insert({
            live_session_id: sessionId,
            student_id: user.id,
            participant_tag: tag,
            status: "joined",
          });
        } else {
          await supabase
            .from("live_attendance")
            .update({
              left_at: null,
              status: "joined",
              participant_tag: tag,
              updated_at: new Date().toISOString(),
            })
            .eq("id", attendance.id);
        }
        // The tag lets Zoom's own participant events prove attendance server-side.
        displayName = `${ctx.userName} #${tag}`;
      }

      return ok({
        provider: "zoom",
        session,
        sdkKey: cfg.sdkKey,
        signature,
        meetingNumber: String(session.zoom_meeting_id),
        password,
        zak: zakToken,
        role: isOwner ? 1 : 0,
        userName: displayName,
        canPublishAudio: isOwner ? true : Boolean(session.allow_student_mic),

        canPublishVideo: isOwner ? true : Boolean(session.allow_student_camera),
      });
    }

    // ------------------------------------------------------------------ leave
    if (action === "leave") {
      const sessionId = String(body.sessionId || "");
      if (!sessionId) return fail("invalid_payload", 400);

      const { data: session } = await supabase
        .from("live_sessions")
        .select("id, teacher_id, viewer_count")
        .eq("id", sessionId)
        .maybeSingle();

      if (session && session.teacher_id !== user.id) {
        await supabase
          .from("live_sessions")
          .update({
            viewer_count: Math.max(0, (session.viewer_count || 0) - 1),
            updated_at: new Date().toISOString(),
          })
          .eq("id", sessionId);

        const { data: attendance } = await supabase
          .from("live_attendance")
          .select("id, joined_at, duration_seconds")
          .eq("live_session_id", sessionId)
          .eq("student_id", user.id)
          .maybeSingle();

        if (attendance) {
          const joined = new Date(attendance.joined_at).getTime();
          const seconds = Math.max(0, Math.round((Date.now() - joined) / 1000));
          await supabase
            .from("live_attendance")
            .update({
              left_at: new Date().toISOString(),
              duration_seconds: Math.max(attendance.duration_seconds || 0, seconds),
              updated_at: new Date().toISOString(),
            })
            .eq("id", attendance.id);
        }
      }

      return ok({ success: true });
    }

    // -------------------------------------------------------------------- end
    if (action === "end") {
      const sessionId = String(body.sessionId || "");
      if (!sessionId) return fail("invalid_payload", 400);

      const { data: session } = await supabase
        .from("live_sessions")
        .select("id, group_id, teacher_id, provider, zoom_meeting_id, status")
        .eq("id", sessionId)
        .maybeSingle();

      if (!session) return fail("session_not_found", 404);
      if (session.teacher_id !== user.id && !ctx.isAdmin) return fail("teacher_not_authorized", 403);

      if (session.provider === "zoom" && session.zoom_meeting_id) {
        const cfg = zoomConfig();
        if (cfg) {
          try {
            const token = await zoomAccessToken(cfg);
            await zoomApi(token, `/meetings/${session.zoom_meeting_id}/status`, {
              method: "PUT",
              body: JSON.stringify({ action: "end" }),
            });
          } catch (error) {
            console.error("[zoom-live] end_meeting_failed", String(error));
          }
        }
      }

      await closeModrekSession(supabase, session);

      return ok({ success: true });
    }

    return fail("invalid_payload", 400, `unknown action ${action}`);
  } catch (error) {
    console.error("[zoom-live] unhandled", error);
    return fail("internal_error", 500, error instanceof Error ? error.message : String(error));
  }
});

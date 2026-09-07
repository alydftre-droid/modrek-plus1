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

function fail(code: ErrorCode, status: number, detail?: string) {
  if (detail) console.error(`[zoom-live] ${code}: ${detail}`);
  return new Response(JSON.stringify({ error: ERROR_MESSAGES[code], errorCode: code }), {
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
  if (!res.ok) {
    throw new Error(`oauth_failed:${res.status}:${(await res.text()).slice(0, 200)}`);
  }
  const json = await res.json();
  return json.access_token as string;
}

async function zoomApi(token: string, path: string, init: RequestInit = {}) {
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
  return { ok: res.ok, status: res.status, json };
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

    // Availability probe — never returns any secret value, only names.
    if (action === "capabilities") {
      return ok({ zoomEnabled: Boolean(zoomConfig()), missingSecrets: zoomMissingSecrets() });
    }

    const ctx = await getUserContext(supabase, user.id);

    // Real Zoom connectivity check (admins only): proves the Server-to-Server
    // OAuth app works and reports which granted scopes are still missing.
    if (action === "diagnostics") {
      if (!ctx.isAdmin) return fail("teacher_not_authorized", 403);
      const cfg = zoomConfig();
      if (!cfg) return ok({ oauth: false, missingSecrets: zoomMissingSecrets() });
      try {
        const token = await zoomAccessToken(cfg);
        const me = await zoomApi(token, "/users/me");
        const zak = await zoomApi(token, "/users/me/token?type=zak");
        return ok({
          oauth: true,
          hostAccountActive: me.ok && me.json?.status === "active",
          zakAvailable: zak.ok && Boolean(zak.json?.token),
          missingScopes: [
            ...(zak.ok ? [] : ["user:read:token:admin"]),
          ],
        });
      } catch (error) {
        console.error("[zoom-live] diagnostics_failed", String(error));
        return ok({ oauth: false, reason: "zoom_authorization_failed" });
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
        return fail("zoom_authorization_failed", 502, String(error));
      }

      let zakToken: string | null = null;
      const zak = await zoomApi(token, "/users/me/token?type=zak");
      if (zak.ok) zakToken = zak.json?.token || null;

      if (existing && existing.provider === "zoom" && existing.zoom_meeting_id) {
        const signature = await buildSdkSignature(cfg, String(existing.zoom_meeting_id), 1);
        return ok({
          provider: "zoom",
          reused: true,
          session: existing,
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
        // A pre-Zoom session row is still marked active: close it so the teacher
        // can start a real Zoom meeting instead of reviving a dead provider.
        await supabase
          .from("live_sessions")
          .update({ status: "ended", ended_at: new Date().toISOString(), viewer_count: 0, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      }


      const title = String(body.title || "حصة مباشرة").slice(0, 160);
      const created = await zoomApi(token, "/users/me/meetings", {
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
      });

      if (!created.ok || !created.json?.id) {
        return fail("meeting_creation_failed", 502, JSON.stringify(created.json).slice(0, 300));
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
        if (!raced) return fail("meeting_creation_failed", 500, insert.error?.message);
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
          const zak = await zoomApi(token, "/users/me/token?type=zak");
          if (zak.ok) zakToken = zak.json?.token || null;
        } catch (error) {
          console.error("[zoom-live] zak_refresh_failed", String(error));
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
        .select("id, teacher_id, provider, zoom_meeting_id, status")
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

      await supabase
        .from("live_sessions")
        .update({
          status: "ended",
          ended_at: new Date().toISOString(),
          viewer_count: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId);

      return ok({ success: true });
    }

    return fail("invalid_payload", 400, `unknown action ${action}`);
  } catch (error) {
    console.error("[zoom-live] unhandled", error);
    return fail("internal_error", 500, error instanceof Error ? error.message : String(error));
  }
});

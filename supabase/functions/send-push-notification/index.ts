// Edge function: send-push-notification
// Sends FCM push notifications via the modern HTTP v1 API using a Firebase
// service account. Requires FIREBASE_SERVICE_ACCOUNT secret (the full JSON
// of a service account key with Firebase Cloud Messaging API enabled).
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { blockDemoWrites } from "../_shared/demoGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// --- OAuth2 access token from service account (cached in memory) ---
let cachedToken: { token: string; exp: number } | null = null;

async function writeDeliveryLog(supabase: ReturnType<typeof createClient>, entry: Record<string, unknown>) {
  try {
    await supabase.from("notification_delivery_logs").insert(entry);
  } catch (error) {
    console.error("notification_delivery_logs insert failed:", error);
  }
}

async function getAccessToken(serviceAccount: any): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() / 1000 + 60) {
    return cachedToken.token;
  }

  const pem = serviceAccount.private_key as string;
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const now = getNumericDate(0);
  const jwt = await create(
    { alg: "RS256", typ: "JWT" },
    {
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
    cryptoKey
  );

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Failed to get access token: " + JSON.stringify(data));

  cachedToken = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return data.access_token;
}

const EXPECTED_FIREBASE_PROJECT_ID =
  Deno.env.get("FIREBASE_PROJECT_ID")?.trim() || "dotted-banner-489523-m3";
const ANDROID_PUSH_CHANNEL_ID = "modrek_high_v4";

function firebaseProjectMatchesClient(serviceAccount: any) {
  const projectId = typeof serviceAccount?.project_id === "string" ? serviceAccount.project_id.trim() : "";
  return Boolean(projectId && projectId === EXPECTED_FIREBASE_PROJECT_ID);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Demo accounts are read-only (server-side boundary, cannot be bypassed).
  const demoBlock = await blockDemoWrites(req, corsHeaders);
  if (demoBlock) return demoBlock;

  let parsedBody: any;
  try {
    parsedBody = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const productionPublishableKey = Deno.env.get("PRODUCTION_SUPABASE_PUBLISHABLE_KEY")?.trim() || "";
    const productionLegacyPublishableKey = "sb_publishable_rN8ogJuF9T1Dy6aMkdLVeQ__RbfP19A";
    const legacyAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvaGhybGlhZWNkdGFleWZoY3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3MTU1NDYsImV4cCI6MjA4MTI5MTU0Nn0.0j-tjPRX-s2wMCYfJypWo2dlYk9Mi40ueU8z0f00y8A";
    const publicDispatchKeys = new Set(
      [anonKey, productionPublishableKey, productionLegacyPublishableKey, legacyAnonKey].filter(Boolean),
    );

  // Auth guard: allow service-role bearer, the project's anon/publishable key
  // (used by the internal DB trigger public.dispatch_notification_push), or an
  // authenticated admin JWT. Anything else is rejected.
  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const apiKeyHeader = req.headers.get("apikey")?.trim() || "";
  let authorized = false;
  let dbTriggerCall = false;
    if (bearer && bearer === serviceKey) {
    authorized = true;
    } else if ((bearer && publicDispatchKeys.has(bearer)) || (apiKeyHeader && publicDispatchKeys.has(apiKeyHeader))) {
    dbTriggerCall = true;
  } else if (bearer) {
    try {
      const authClient = createClient(supabaseUrl, anonKey);
      const { data, error } = await authClient.auth.getUser(bearer);
      if (!error && data?.user) {
        const adminClient = createClient(supabaseUrl, serviceKey);
        const { data: isAdmin } = await adminClient.rpc("has_role", {
          _user_id: data.user.id,
          _role: "admin",
        });
        if (isAdmin) authorized = true;
      }
    } catch (_) {
      // fallthrough to unauthorized
    }
  }

  if (!authorized && dbTriggerCall) {
    const { user_id, title, body, notification_id } = parsedBody;
    if (user_id && title && body && notification_id) {
      try {
        const adminClient = createClient(supabaseUrl, serviceKey);
        const { data: notification } = await adminClient
          .from("notifications")
          .select("id, user_id, title, message, created_at")
          .eq("id", notification_id)
          .maybeSingle();
        const createdAt = notification?.created_at ? Date.parse(notification.created_at) : 0;
        const recent = createdAt > Date.now() - 1000 * 60 * 60 * 24 * 7;
        const sameRecipient = !notification?.user_id || notification.user_id === user_id;
        const sameTitle = (notification?.title || "إشعار جديد") === title;
        const sameBody = (notification?.message || "") === body;
        if (notification && recent && sameRecipient && sameTitle && sameBody) {
          authorized = true;
        }
      } catch (_) {
        // fallthrough to unauthorized
      }
    }
  }

  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }


  try {
    const { user_id, user_ids, title, body, link, notification_id } = parsedBody;

    const targets: string[] = Array.isArray(user_ids)
      ? user_ids
      : user_id
      ? [user_id]
      : [];

    if (!targets.length || !title || !body) {
      return new Response(
        JSON.stringify({ error: "user_id(s), title, body required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    for (const target of targets) {
      await writeDeliveryLog(supabase, {
        user_id: target,
        notification_id: notification_id || null,
        source_table: "edge_function",
        notification_type: "direct_push",
        event_type: "push_request_received",
        delivery_channel: "push",
        status: "queued",
        title,
        body,
        link: link || null,
        details: { target_count: targets.length },
      });
    }

    const { data: tokens, error: tokensError } = await supabase
      .from("device_push_tokens")
      .select("user_id, token, platform")
      .in("user_id", targets);

    if (tokensError) {
      console.error("device_push_tokens query failed:", tokensError);
      return new Response(
        JSON.stringify({ sent: 0, reason: "token_query_failed", error: tokensError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tokens?.length) {
      for (const target of targets) {
        await writeDeliveryLog(supabase, {
          user_id: target,
          notification_id: notification_id || null,
          source_table: "edge_function",
          notification_type: "direct_push",
          event_type: "no_device_token",
          delivery_channel: "push",
          status: "no_device",
          title,
          body,
          link: link || null,
        });
      }
      return new Response(
        JSON.stringify({ sent: 0, reason: "no_devices" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const saJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!saJson) {
      for (const target of targets) {
        await writeDeliveryLog(supabase, {
          user_id: target,
          notification_id: notification_id || null,
          source_table: "edge_function",
          notification_type: "direct_push",
          event_type: "fcm_not_configured",
          delivery_channel: "push",
          status: "failed",
          title,
          body,
          link: link || null,
        });
      }
      return new Response(
        JSON.stringify({
          sent: 0,
          reason: "fcm_not_configured",
          message: "FIREBASE_SERVICE_ACCOUNT secret not set.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let serviceAccount: any;
    try {
      serviceAccount = JSON.parse(saJson);
      if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
        throw new Error("missing project_id/client_email/private_key");
      }
    } catch (error) {
      console.error("invalid FIREBASE_SERVICE_ACCOUNT:", error);
      for (const target of targets) {
        await writeDeliveryLog(supabase, {
          user_id: target,
          notification_id: notification_id || null,
          source_table: "edge_function",
          notification_type: "direct_push",
          event_type: "fcm_secret_invalid",
          delivery_channel: "push",
          status: "failed",
          title,
          body,
          link: link || null,
          details: { error: error instanceof Error ? error.message : String(error) },
        });
      }
      return new Response(
        JSON.stringify({ sent: 0, reason: "fcm_secret_invalid" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!firebaseProjectMatchesClient(serviceAccount)) {
      console.error("FIREBASE_SERVICE_ACCOUNT project mismatch", {
        expected_project_id: EXPECTED_FIREBASE_PROJECT_ID,
        configured_project_id: serviceAccount.project_id || null,
      });
      for (const target of targets) {
        await writeDeliveryLog(supabase, {
          user_id: target,
          notification_id: notification_id || null,
          source_table: "edge_function",
          notification_type: "direct_push",
          event_type: "fcm_project_mismatch",
          delivery_channel: "push",
          status: "failed",
          title,
          body,
          link: link || null,
          details: {
            expected_project_id: EXPECTED_FIREBASE_PROJECT_ID,
            configured_project_id: serviceAccount.project_id || null,
          },
        });
      }
      return new Response(
        JSON.stringify({ sent: 0, reason: "fcm_project_mismatch" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = await getAccessToken(serviceAccount);
    const projectId = serviceAccount.project_id;
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    let sent = 0;
    const failedTokens: string[] = [];

    for (const t of tokens) {
      try {
        const unreadCountResult = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", (t as any).user_id)
          .eq("is_read", false);
        const notificationCount = Math.max(unreadCountResult.count || 1, 1);

        const res = await fetch(fcmUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: t.token,
              data: {
                title: String(title),
                body: String(body),
                link: link || "",
                notification_id: notification_id || "",
                channel_id: ANDROID_PUSH_CHANNEL_ID,
                click_action: "OPEN_MODREK_NOTIFICATION",
                notification_count: String(notificationCount),
                sent_as: "data_only_native_android",
              },
              android: {
                priority: "HIGH",
                ttl: "2419200s",
              },
            },
          }),
        });
        if (res.ok) {
          sent++;
          await writeDeliveryLog(supabase, {
            user_id: (t as any).user_id || null,
            notification_id: notification_id || null,
            source_table: "edge_function",
            notification_type: "direct_push",
            event_type: "push_sent",
            delivery_channel: "push",
            status: "sent",
            token: t.token,
            title,
            body,
            link: link || null,
            details: { platform: (t as any).platform || null, android_channel_id: ANDROID_PUSH_CHANNEL_ID, notification_count: notificationCount, sent_as: "data_only_native_android" },
          });
        } else {
          const errText = await res.text();
          console.warn("fcm send failed:", res.status, errText);
          const senderMismatch = res.status === 403 && /SENDER_ID_MISMATCH/i.test(errText);
          await writeDeliveryLog(supabase, {
            user_id: (t as any).user_id || null,
            notification_id: notification_id || null,
            source_table: "edge_function",
            notification_type: "direct_push",
            event_type: "push_failed",
            delivery_channel: "push",
            status: "failed",
            token: t.token,
            title,
            body,
            link: link || null,
            details: {
              status_code: res.status,
              error: errText,
              platform: (t as any).platform || null,
              firebase_project_id: projectId,
              expected_firebase_project_id: EXPECTED_FIREBASE_PROJECT_ID,
              android_channel_id: ANDROID_PUSH_CHANNEL_ID,
              root_cause: senderMismatch
                ? "The FCM token was issued by a different Firebase sender than the server service account. Replace FIREBASE_SERVICE_ACCOUNT with a key from the same Firebase project embedded in android/app/google-services.json, then rebuild/reinstall the APK so a fresh token is registered."
                : undefined,
            },
          });
          const shouldRemoveToken =
            res.status === 404 ||
            res.status === 400;

          // Remove only truly invalid/unregistered tokens. Sender mismatch is a server/app
          // Firebase configuration problem, so deleting the device token hides the root cause.
          if (shouldRemoveToken) {
            failedTokens.push(t.token);
          }
        }
      } catch (e) {
        console.warn("fcm send exception:", e);
        await writeDeliveryLog(supabase, {
          user_id: (t as any).user_id || null,
          notification_id: notification_id || null,
          source_table: "edge_function",
          notification_type: "direct_push",
          event_type: "push_exception",
          delivery_channel: "push",
          status: "failed",
          token: t.token,
          title,
          body,
          link: link || null,
          details: { error: e instanceof Error ? e.message : String(e), platform: (t as any).platform || null },
        });
      }
    }

    // Cleanup invalid tokens
    if (failedTokens.length) {
      await supabase.from("device_push_tokens").delete().in("token", failedTokens);
    }

    return new Response(
      JSON.stringify({ sent, total: tokens.length, removed: failedTokens.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("send-push-notification error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

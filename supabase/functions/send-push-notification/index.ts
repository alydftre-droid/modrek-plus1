// Edge function: send-push-notification
// Sends FCM push notifications via the modern HTTP v1 API using a Firebase
// service account. Requires FIREBASE_SERVICE_ACCOUNT secret (the full JSON
// of a service account key with Firebase Cloud Messaging API enabled).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { user_id, user_ids, title, body, link } = await req.json();

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

    const { data: tokens } = await supabase
      .from("device_push_tokens")
      .select("token")
      .in("user_id", targets);

    if (!tokens?.length) {
      for (const target of targets) {
        await writeDeliveryLog(supabase, {
          user_id: target,
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
      return new Response(
        JSON.stringify({
          sent: 0,
          reason: "fcm_not_configured",
          message: "FIREBASE_SERVICE_ACCOUNT secret not set.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceAccount = JSON.parse(saJson);
    const accessToken = await getAccessToken(serviceAccount);
    const projectId = serviceAccount.project_id;
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    let sent = 0;
    const failedTokens: string[] = [];

    for (const t of tokens) {
      try {
        const res = await fetch(fcmUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: t.token,
              notification: { title, body },
              data: { link: link || "" },
              android: {
                priority: "HIGH",
                notification: {
                  channel_id: "modrek_default",
                  sound: "default",
                  default_vibrate_timings: true,
                },
              },
            },
          }),
        });
        if (res.ok) {
          sent++;
          await writeDeliveryLog(supabase, {
            user_id: targets.find(() => true) || null,
            source_table: "edge_function",
            notification_type: "direct_push",
            event_type: "push_sent",
            delivery_channel: "push",
            status: "sent",
            token: t.token,
            title,
            body,
            link: link || null,
          });
        } else {
          const errText = await res.text();
          console.warn("fcm send failed:", res.status, errText);
          await writeDeliveryLog(supabase, {
            user_id: targets.find(() => true) || null,
            source_table: "edge_function",
            notification_type: "direct_push",
            event_type: "push_failed",
            delivery_channel: "push",
            status: "failed",
            token: t.token,
            title,
            body,
            link: link || null,
            details: { status_code: res.status, error: errText },
          });
          // Token invalid? Mark for cleanup
          if (res.status === 404 || res.status === 400) {
            failedTokens.push(t.token);
          }
        }
      } catch (e) {
        console.warn("fcm send exception:", e);
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

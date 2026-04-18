// Edge function: send-push-notification
// Sends FCM push notifications to all device tokens of a target user (or list).
// Requires FCM_SERVER_KEY secret to be configured. If absent, returns a clear
// message — local-realtime notifications still work as the primary fallback.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    const { data: tokens } = await supabase
      .from("device_push_tokens")
      .select("token")
      .in("user_id", targets);

    if (!tokens?.length) {
      return new Response(
        JSON.stringify({ sent: 0, reason: "no_devices" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fcmKey = Deno.env.get("FCM_SERVER_KEY");
    if (!fcmKey) {
      return new Response(
        JSON.stringify({
          sent: 0,
          reason: "fcm_not_configured",
          message: "FCM_SERVER_KEY secret not set — only local realtime notifications active.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let sent = 0;
    for (const t of tokens) {
      try {
        const res = await fetch("https://fcm.googleapis.com/fcm/send", {
          method: "POST",
          headers: {
            Authorization: `key=${fcmKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: t.token,
            notification: { title, body, sound: "default" },
            data: { link: link || "" },
            priority: "high",
          }),
        });
        if (res.ok) sent++;
      } catch (e) {
        console.warn("fcm send failed:", e);
      }
    }

    return new Response(JSON.stringify({ sent, total: tokens.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-push-notification error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { blockDemoWrites } from "../_shared/demoGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Demo accounts are read-only (server-side boundary, cannot be bypassed).
  // Preflight and service-role/cron callers carry no user token and pass through.
  const demoBlock = await blockDemoWrites(req, corsHeaders);
  if (demoBlock) return demoBlock;
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!bearer || bearer !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Find pending withdrawals older than 3 days
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    const { data: expiredRequests, error: fetchError } = await supabase
      .from("teacher_withdrawal_requests")
      .select("id, teacher_id, amount")
      .eq("status", "pending")
      .lt("created_at", threeDaysAgo);

    if (fetchError) throw fetchError;

    if (!expiredRequests || expiredRequests.length === 0) {
      return new Response(JSON.stringify({ message: "No expired requests", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let cancelledCount = 0;

    for (const req of expiredRequests) {
      // Update request status to auto_cancelled
      await supabase
        .from("teacher_withdrawal_requests")
        .update({
          status: "rejected",
          admin_message: "تم إلغاء الطلب تلقائياً لعدم المعالجة خلال 3 أيام عمل - تم إرجاع المبلغ",
          processed_at: new Date().toISOString(),
        })
        .eq("id", req.id);

      // Refund to teacher wallet
      const { data: wallet } = await supabase
        .from("teacher_wallets")
        .select("balance")
        .eq("teacher_id", req.teacher_id)
        .maybeSingle();

      if (wallet) {
        await supabase
          .from("teacher_wallets")
          .update({
            balance: (wallet.balance || 0) + req.amount,
            updated_at: new Date().toISOString(),
          })
          .eq("teacher_id", req.teacher_id);
      }

      // Notify teacher
      await supabase.from("notifications").insert({
        user_id: req.teacher_id,
        title: "إلغاء طلب سحب تلقائي",
        message: `تم إلغاء طلب سحب ${req.amount} جنيه تلقائياً لعدم المعالجة خلال 3 أيام. تم إرجاع المبلغ لمحفظتك.`,
        notification_type: "withdrawal_auto_cancelled",
      });

      cancelledCount++;
    }

    return new Response(
      JSON.stringify({ message: "Auto-cancel complete", cancelled: cancelledCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

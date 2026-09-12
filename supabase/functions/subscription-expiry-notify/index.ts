import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { blockDemoWrites } from "../_shared/demoGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Demo accounts are read-only (server-side boundary, cannot be bypassed).
  // Preflight and service-role/cron callers carry no user token and pass through.
  const demoBlock = await blockDemoWrites(req, corsHeaders);
  if (demoBlock) return demoBlock;
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!bearer || bearer !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sixDaysFromNow = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);

    // Find subscriptions expiring in exactly 7 days (within a 24-hour window)
    const { data: expiringSubscriptions, error: subError } = await supabase
      .from("subscriptions")
      .select(`
        id,
        student_id,
        subject_id,
        end_date,
        subjects (
          name,
          stage,
          grade
        )
      `)
      .eq("is_active", true)
      .gte("end_date", sixDaysFromNow.toISOString())
      .lte("end_date", sevenDaysFromNow.toISOString());

    if (subError) {
      console.error("Error fetching subscriptions:", subError);
      throw subError;
    }

    console.log(`Found ${expiringSubscriptions?.length || 0} subscriptions expiring soon`);

    if (!expiringSubscriptions || expiringSubscriptions.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No subscriptions expiring in 7 days",
          notificationsSent: 0 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get unique student IDs
    const studentIds = [...new Set(expiringSubscriptions.map((s) => s.student_id))];

    // Get student profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", studentIds);

    const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

    // Create notifications for each expiring subscription
    const notifications = expiringSubscriptions.map((sub) => {
      const profile = profileMap.get(sub.student_id);
      const subjectName = (sub.subjects as any)?.name || "المادة";
      const endDate = new Date(sub.end_date);
      const formattedDate = endDate.toLocaleDateString("ar-EG", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      return {
        user_id: sub.student_id,
        title: "تنبيه: اشتراكك ينتهي قريباً",
        message: `مرحباً ${profile?.full_name || ""}، اشتراكك في مادة "${subjectName}" سينتهي في ${formattedDate}. قم بالتجديد للاستمرار في الوصول للمحتوى.`,
        is_read: false,
      };
    });

    // Check for existing notifications to avoid duplicates (sent today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data: existingNotifications } = await supabase
      .from("notifications")
      .select("user_id, title")
      .eq("title", "تنبيه: اشتراكك ينتهي قريباً")
      .gte("created_at", today.toISOString())
      .lt("created_at", tomorrow.toISOString());

    const existingUserIds = new Set(existingNotifications?.map((n) => n.user_id) || []);

    // Filter out notifications for users who already received one today
    const newNotifications = notifications.filter(
      (n) => !existingUserIds.has(n.user_id)
    );

    if (newNotifications.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "All notifications already sent today",
          notificationsSent: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert notifications
    const { error: insertError } = await supabase
      .from("notifications")
      .insert(newNotifications);

    if (insertError) {
      console.error("Error inserting notifications:", insertError);
      throw insertError;
    }

    console.log(`Successfully sent ${newNotifications.length} notifications`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sent ${newNotifications.length} expiry notifications`,
        notificationsSent: newNotifications.length,
        subscriptionsChecked: expiringSubscriptions.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in subscription-expiry-notify:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});

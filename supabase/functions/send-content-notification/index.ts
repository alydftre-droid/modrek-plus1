import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { teacherId, subjectId, contentType, contentTitle } = await req.json();

    if (!teacherId || !subjectId || !contentType || !contentTitle) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get teacher name
    const { data: teacherProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", teacherId)
      .single();

    const teacherName = teacherProfile?.full_name || "المعلم";

    // Get subject name
    const { data: subjectData } = await supabase
      .from("subjects")
      .select("name, category, stage, grade")
      .eq("id", subjectId)
      .single();

    const subjectName = subjectData?.name || "المادة";

    // Find all students who chose this teacher for this subject's category/stage/grade
    const { data: choices } = await supabase
      .from("student_teacher_choices")
      .select("student_id")
      .eq("teacher_id", teacherId)
      .eq("category", subjectData?.category || "")
      .eq("stage", subjectData?.stage || "")
      .eq("grade", subjectData?.grade || "");

    if (!choices || choices.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map content type to Arabic
    const typeMap: Record<string, string> = {
      video: "فيديو جديد 🎥",
      pdf: "كتاب جديد 📚",
      summary: "ملخص جديد 📝",
      exam: "امتحان جديد 📋",
    };

    const typeLabel = typeMap[contentType] || "محتوى جديد";
    const title = `${typeLabel} - ${subjectName}`;
    const message = `قام ${teacherName} بإضافة ${typeLabel}: "${contentTitle}" في مادة ${subjectName}`;

    // Insert notifications for each student
    const notifications = choices.map((c: any) => ({
      user_id: c.student_id,
      title,
      message,
      notification_type: contentType,
      is_read: false,
      created_by: teacherId,
    }));

    const { error } = await supabase.from("notifications").insert(notifications);
    if (error) {
      console.error("Error inserting notifications:", error);
      throw error;
    }

    // Also cleanup old notifications (60+ days)
    await supabase.rpc("cleanup_old_notifications");

    return new Response(JSON.stringify({ sent: notifications.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-content-notification error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "حدث خطأ" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

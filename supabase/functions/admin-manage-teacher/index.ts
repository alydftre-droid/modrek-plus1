import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  action: "update_email" | "update_password" | "update_profile" | "delete_teacher" | "ban_teacher" | "unban_teacher";
  teacher_id: string;
  new_email?: string;
  new_password?: string;
  full_name?: string;
  phone?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Decode JWT to get user id
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "جلسة منتهية" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // Verify caller is admin
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "هذه العملية متاحة للمطور فقط" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = (await req.json()) as Body;
    const { action, teacher_id } = body;
    if (!action || !teacher_id) {
      return new Response(JSON.stringify({ error: "بيانات ناقصة" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify target is a teacher
    const { data: targetRole } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", teacher_id)
      .eq("role", "teacher")
      .maybeSingle();

    if (action === "update_email") {
      if (!body.new_email || !/^[^@]+@[^@]+\.[^@]+$/.test(body.new_email)) {
        return new Response(JSON.stringify({ error: "بريد إلكتروني غير صالح" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error: e1 } = await admin.auth.admin.updateUserById(teacher_id, {
        email: body.new_email,
        email_confirm: true,
      });
      if (e1) throw e1;
      await admin.from("profiles").update({ email: body.new_email, updated_at: new Date().toISOString() }).eq("id", teacher_id);
      await admin.from("notifications").insert({
        user_id: teacher_id,
        title: "تم تحديث بريدك الإلكتروني",
        message: `قام المطور بتحديث بريدك الإلكتروني إلى: ${body.new_email}`,
        notification_type: "account",
        is_read: false,
        is_sent: true,
      });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "update_password") {
      if (!body.new_password || body.new_password.length < 6) {
        return new Response(JSON.stringify({ error: "كلمة السر يجب أن تكون 6 أحرف على الأقل" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error: e2 } = await admin.auth.admin.updateUserById(teacher_id, {
        password: body.new_password,
      });
      if (e2) throw e2;
      await admin.from("notifications").insert({
        user_id: teacher_id,
        title: "تم تغيير كلمة السر الخاصة بك",
        message: "قام المطور بتغيير كلمة السر الخاصة بحسابك. إذا لم تكن تتوقع هذا، تواصل مع الدعم فوراً.",
        notification_type: "security",
        is_read: false,
        is_sent: true,
      });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "update_profile") {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.full_name) updates.full_name = body.full_name.trim();
      if (body.phone !== undefined) updates.phone = body.phone?.trim() || null;
      const { error: e3 } = await admin.from("profiles").update(updates).eq("id", teacher_id);
      if (e3) throw e3;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "ban_teacher") {
      // 1) Mark banned in profile (used by frontend ProtectedRoute)
      await admin.from("profiles").update({ is_banned: true, updated_at: new Date().toISOString() }).eq("id", teacher_id);
      // 2) Block auth login at Supabase Auth level (100 years) & revoke sessions
      try {
        await admin.auth.admin.updateUserById(teacher_id, { ban_duration: "876000h" } as unknown as { ban_duration: string });
      } catch (err) { console.warn("[ban] auth ban failed", err); }
      try { await admin.auth.admin.signOut(teacher_id, "global" as unknown as never); } catch (err) { console.warn("[ban] signOut failed", err); }
      await admin.from("notifications").insert({
        user_id: teacher_id,
        title: "تم إيقاف حسابك",
        message: "قام المطور بإيقاف حسابك مؤقتاً. تواصل مع الدعم لمزيد من التفاصيل.",
        notification_type: "account",
        is_read: false,
        is_sent: true,
      }).then(() => {}, () => {});
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "unban_teacher") {
      await admin.from("profiles").update({ is_banned: false, updated_at: new Date().toISOString() }).eq("id", teacher_id);
      try {
        await admin.auth.admin.updateUserById(teacher_id, { ban_duration: "none" } as unknown as { ban_duration: string });
      } catch (err) { console.warn("[unban] auth unban failed", err); }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "delete_teacher") {
      // Full cascade cleanup of every teacher-owned row so no FK blocks auth.users deletion.
      const swallow = async (label: string, fn: () => Promise<unknown>) => {
        try { await fn(); } catch (err) { console.warn(`[delete_teacher:${label}]`, err); }
      };

      // ── Bunny.net cleanup ─────────────────────────────────────────────
      // Delete every video (Bunny Stream) and file/thumbnail (Bunny Storage)
      // owned by this teacher BEFORE removing the DB rows, so nothing is left
      // orphaned on Bunny after the cascade.
      const bunnyStreamApiKey  = Deno.env.get("BUNNY_STREAM_API_KEY") || Deno.env.get("BUNNY_API_KEY") || "";
      const bunnyStreamLibrary = Deno.env.get("BUNNY_STREAM_LIBRARY_ID") || "686928";
      const bunnyStorageApiKey = Deno.env.get("BUNNY_STORAGE_API_KEY") || "";
      const bunnyStorageZone   = Deno.env.get("BUNNY_STORAGE_ZONE") || "";
      const bunnyStorageHost   = Deno.env.get("BUNNY_STORAGE_HOST") || "storage.bunnycdn.com";

      const deleteBunnyVideo = async (videoId: string) => {
        if (!bunnyStreamApiKey || !videoId) return;
        try {
          await fetch(`https://video.bunnycdn.com/library/${bunnyStreamLibrary}/videos/${videoId}`, {
            method: "DELETE",
            headers: { AccessKey: bunnyStreamApiKey, Accept: "application/json" },
          });
        } catch (err) { console.warn("[delete_teacher:bunny_stream]", videoId, err); }
      };
      const deleteBunnyFile = async (path: string) => {
        if (!bunnyStorageApiKey || !bunnyStorageZone || !path) return;
        try {
          await fetch(`https://${bunnyStorageHost}/${bunnyStorageZone}/${path}`, {
            method: "DELETE",
            headers: { AccessKey: bunnyStorageApiKey },
          });
        } catch (err) { console.warn("[delete_teacher:bunny_storage]", path, err); }
      };
      const cleanupUrl = async (url: string | null | undefined) => {
        if (!url) return;
        if (url.startsWith("bunny://"))    await deleteBunnyVideo(url.slice("bunny://".length));
        else if (url.startsWith("bstorage://")) await deleteBunnyFile(url.slice("bstorage://".length));
      };

      // Gather every asset URL owned by the teacher.
      const assetUrls: string[] = [];
      try {
        const { data: contentRows } = await admin
          .from("content")
          .select("file_url, thumbnail_url")
          .eq("uploaded_by", teacher_id);
        for (const row of contentRows ?? []) {
          if (row.file_url) assetUrls.push(row.file_url as string);
          if (row.thumbnail_url) assetUrls.push(row.thumbnail_url as string);
        }
      } catch (err) { console.warn("[delete_teacher:collect_content_urls]", err); }
      try {
        const { data: bookRows } = await admin
          .from("library_books")
          .select("pdf_path, cover_url")
          .eq("created_by", teacher_id);
        for (const row of bookRows ?? []) {
          if (row.pdf_path) assetUrls.push(row.pdf_path as string);
          if (row.cover_url) assetUrls.push(row.cover_url as string);
        }
      } catch (err) { console.warn("[delete_teacher:collect_book_urls]", err); }
      try {
        const { data: storageAssets } = await admin
          .from("storage_assets")
          .select("object_path, storage_provider")
          .eq("uploaded_by", teacher_id);
        for (const row of storageAssets ?? []) {
          if (row.storage_provider === "bunny" && row.object_path) {
            assetUrls.push(`bstorage://${row.object_path}`);
          }
        }
      } catch (err) { console.warn("[delete_teacher:collect_storage_assets]", err); }
      // Teacher intro video / avatar stored on Bunny
      try {
        const { data: prof } = await admin
          .from("teacher_profiles")
          .select("intro_video_url, avatar_url")
          .eq("teacher_id", teacher_id)
          .maybeSingle();
        if (prof?.intro_video_url) assetUrls.push(prof.intro_video_url as string);
        if (prof?.avatar_url)      assetUrls.push(prof.avatar_url as string);
      } catch (err) { console.warn("[delete_teacher:collect_teacher_profile]", err); }

      // Run deletions with limited concurrency so we don't overwhelm Bunny.
      const uniqueUrls = Array.from(new Set(assetUrls));
      console.info(`[delete_teacher] cleaning ${uniqueUrls.length} bunny assets for teacher ${teacher_id}`);
      const batchSize = 8;
      for (let i = 0; i < uniqueUrls.length; i += batchSize) {
        await Promise.all(uniqueUrls.slice(i, i + batchSize).map(cleanupUrl));
      }
      // ──────────────────────────────────────────────────────────────────


      // Tables keyed by teacher_id (profiles.id / auth.users.id)
      const byTeacherId = [
        "teacher_activity_logs",
        "teacher_wallet_transactions",
        "teacher_withdrawal_requests",
        "teacher_payment_methods",
        "teacher_assignments",
        "teacher_wallets",
        "teacher_monthly_archives",
        "teacher_commission_history",
        "teacher_earning_records",
        "teacher_messages",
        "teacher_schedules",
        "teacher_visibility_diagnostics",
        "teacher_profiles",
        "price_change_requests",
        "student_teacher_choices",
        "student_group_purchases",
        "teacher_requests",
        "subscription_requests",
        "subscriptions",
        "subscription_messages",
        "automated_messages",
        "content_groups",
        "bundled_packages",
        "live_sessions",
        "live_session_messages",
        "live_session_recordings",
        "exams",
        "ads",
      ];
      for (const t of byTeacherId) {
        await swallow(`t/${t}`, () => admin.from(t).delete().eq("teacher_id", teacher_id));
      }

      // Uploaded / created_by references
      await swallow("content.uploaded_by",           () => admin.from("content").delete().eq("uploaded_by", teacher_id));
      await swallow("ai_sources.uploaded_by",        () => admin.from("ai_sources").delete().eq("uploaded_by", teacher_id));
      await swallow("storage_assets.uploaded_by",    () => admin.from("storage_assets").delete().eq("uploaded_by", teacher_id));
      await swallow("notifications.created_by",      () => admin.from("notifications").delete().eq("created_by", teacher_id));
      await swallow("subscriptions.created_by",      () => admin.from("subscriptions").delete().eq("created_by", teacher_id));
      await swallow("subscription_messages.created_by", () => admin.from("subscription_messages").delete().eq("created_by", teacher_id));
      await swallow("automated_messages.created_by", () => admin.from("automated_messages").delete().eq("created_by", teacher_id));
      await swallow("knowledge_sources.created_by",  () => admin.from("knowledge_sources").delete().eq("created_by", teacher_id));
      await swallow("knowledge_source_versions.created_by", () => admin.from("knowledge_source_versions").delete().eq("created_by", teacher_id));
      await swallow("library_books.created_by",      () => admin.from("library_books").delete().eq("created_by", teacher_id));
      await swallow("library_section_explanations.created_by", () => admin.from("library_section_explanations").delete().eq("created_by", teacher_id));
      await swallow("voice_answers.created_by",      () => admin.from("voice_answers").delete().eq("created_by", teacher_id));
      await swallow("teacher_requests.reviewed_by",  () => admin.from("teacher_requests").delete().eq("reviewed_by", teacher_id));
      await swallow("notifications.user_id",         () => admin.from("notifications").delete().eq("user_id", teacher_id));
      await swallow("device_push_tokens.user_id",    () => admin.from("device_push_tokens").delete().eq("user_id", teacher_id));

      await swallow("user_roles", () => admin.from("user_roles").delete().eq("user_id", teacher_id));
      await swallow("profiles",   () => admin.from("profiles").delete().eq("id", teacher_id));

      const { error: e4 } = await admin.auth.admin.deleteUser(teacher_id);
      if (e4) throw e4;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "إجراء غير معروف" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || "خطأ غير متوقع" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

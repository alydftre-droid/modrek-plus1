import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const adminEmail = "aliana200713@gmail.com";
  const adminPassword = "301165Aa#";
  const adminId = "da05c0f4-027f-45f8-b045-e116c1314f8d";

  try {
    const { data: listData } = await supabase.auth.admin.listUsers();
    const existingUser = listData?.users?.find((u: any) => u.id === adminId) || listData?.users?.find((u: any) => u.email === adminEmail);
    
    if (existingUser) {
      const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, {
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          ...(existingUser.user_metadata || {}),
          full_name: existingUser.user_metadata?.full_name || existingUser.user_metadata?.name || "حساب المطور",
          role: "admin",
        },
      });
      if (error) {
        return new Response(JSON.stringify({ step: "update", error: error.message }), { status: 500 });
      }
      return new Response(JSON.stringify({ 
        success: true, 
        action: "updated_password",
        user_id: existingUser.id,
        email: adminEmail
      }));
    }

    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { full_name: "حساب المطور", role: "admin" },
    });

    if (createError) {
      return new Response(JSON.stringify({ step: "create", error: createError.message }), { status: 500 });
    }

    const newId = newUser.user.id;
    if (newId !== adminId) {
      const { error: profErr } = await supabase
        .from("profiles")
        .update({ id: newId })
        .eq("id", adminId);
      
      const { error: roleErr } = await supabase
        .from("user_roles")
        .update({ user_id: newId })
        .eq("user_id", adminId);

      return new Response(JSON.stringify({
        success: true,
        action: "created_new",
        old_id: adminId,
        new_id: newId,
        profile_update_error: profErr?.message || null,
        role_update_error: roleErr?.message || null,
      }));
    }

    return new Response(JSON.stringify({ 
      success: true, 
      action: "created",
      user_id: newId 
    }));
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
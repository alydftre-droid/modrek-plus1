import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const adminEmail = "alyedaft@gmail.com";
  const adminPassword = "301165Aa#";
  const adminId = "deb11e5f-5eb6-4971-a636-aa2017a31465";

  try {
    // First try to delete any existing auth user with this email
    const { data: listData } = await supabase.auth.admin.listUsers();
    const existingUser = listData?.users?.find((u: any) => u.email === adminEmail);
    
    if (existingUser) {
      // Update the existing user's password
      const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, {
        password: adminPassword,
        email_confirm: true,
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

    // User doesn't exist, create new one with the specific ID
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { full_name: "علي محمد علي", role: "admin" },
    });

    if (createError) {
      return new Response(JSON.stringify({ step: "create", error: createError.message }), { status: 500 });
    }

    // If user was created with a different ID, update profile and role
    const newId = newUser.user.id;
    if (newId !== adminId) {
      // Update profile to point to new ID
      const { error: profErr } = await supabase
        .from("profiles")
        .update({ id: newId })
        .eq("id", adminId);
      
      // Update user_roles
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
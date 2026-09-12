// Demo accounts are an absolute READ-ONLY security boundary.
//
// The database already blocks every write coming from a demo account (see the
// `zzz_demo_read_only` statement triggers + `public.current_user_is_demo()`).
// Edge functions run with the service role, where `auth.uid()` is NULL, so the
// database guard cannot see the calling user — every mutating edge function
// must therefore refuse demo callers itself, BEFORE doing any work.
//
// Identity is resolved server-side only:
//   1. the bearer token is signature-validated with Supabase Auth,
//   2. the resulting auth user id is checked against `profiles.is_demo` and the
//      `demo_accounts` registry with the service role.
// Nothing supplied by the client (headers, body, metadata) is trusted.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

export const DEMO_READ_ONLY_CODE = "DEMO_READ_ONLY";
export const DEMO_READ_ONLY_MESSAGE =
  "حساب المعاينة يعمل بوضع المشاهدة فقط ولا يمكنه إجراء تغييرات.";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** True when this auth user id belongs to a demo account. */
export async function isDemoUserId(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const admin = serviceClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("is_demo")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.is_demo === true) return true;
    const { data: registry } = await admin
      .from("demo_accounts")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    return Boolean(registry?.user_id);
  } catch {
    // Fail CLOSED only when we actually know the caller is authenticated but
    // the check failed — callers below treat a thrown/unknown state as demo.
    throw new Error("demo_check_failed");
  }
}

function bearer(req: Request): string | null {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export function demoBlockedResponse(extraHeaders: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({
      error: DEMO_READ_ONLY_CODE,
      code: DEMO_READ_ONLY_CODE,
      message: DEMO_READ_ONLY_MESSAGE,
    }),
    { status: 403, headers: { ...extraHeaders, "Content-Type": "application/json" } },
  );
}

/**
 * Returns a 403 `DEMO_READ_ONLY` Response when the request is made by a demo
 * account, otherwise `null`. Call it before ANY mutation.
 *
 * Service-role / cron / webhook callers (no user token) return `null`: they are
 * authorized by their own checks and are not demo sessions.
 */
export async function blockDemoWrites(
  req: Request,
  extraHeaders: Record<string, string> = {},
): Promise<Response | null> {
  const token = bearer(req);
  if (!token) return null;
  if (SERVICE_KEY && token === SERVICE_KEY) return null;

  let userId: string | null = null;
  try {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await userClient.auth.getUser(token);
    if (error || !data?.user?.id) return null; // not a user session
    userId = data.user.id;
  } catch {
    return null;
  }

  try {
    if (await isDemoUserId(userId)) return demoBlockedResponse(extraHeaders);
    return null;
  } catch {
    // Identity known, verification impossible → refuse the mutation.
    return demoBlockedResponse(extraHeaders);
  }
}

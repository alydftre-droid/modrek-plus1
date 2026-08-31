// Shared auth helpers for edge functions.
//
// SECURITY: `getJwtClaimsFromAuthHeader` used to only base64-decode the JWT
// payload without verifying the signature — that let a caller forge any `sub`
// and impersonate other users. It is now async and always validates the token
// against the Supabase Auth server before returning claims. Callers MUST
// `await` it. If verification fails (bad signature, expired, revoked), it
// returns `null`.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

export type JwtClaims = {
  sub: string;
  exp?: number;
  email?: string;
  role?: string;
  aud?: string | string[];
  [key: string]: unknown;
};

export type VerifiedSupabaseUser = {
  id: string;
  email: string | null;
};

export function getBearerTokenFromAuthHeader(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

async function verifyToken(token: string): Promise<VerifiedSupabaseUser | null> {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!url || !anon) return null;
  try {
    const sb = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data?.user?.id) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
}

/**
 * Returns verified JWT claims (sub + email) after checking the token's
 * signature and expiry with Supabase Auth. Returns null on any failure.
 * Callers MUST `await` this function.
 */
export async function getJwtClaimsFromAuthHeader(
  authHeader: string | null,
): Promise<JwtClaims | null> {
  const token = getBearerTokenFromAuthHeader(authHeader);
  if (!token) return null;
  const user = await verifyToken(token);
  if (!user) return null;
  return { sub: user.id, email: user.email ?? undefined };
}

export async function getVerifiedUserFromAuthHeader(
  _supabaseUrl: string,
  _supabaseAnonKey: string,
  authHeader: string | null,
): Promise<VerifiedSupabaseUser | null> {
  const token = getBearerTokenFromAuthHeader(authHeader);
  if (!token) return null;
  return await verifyToken(token);
}

export type LibraryBookAccessResult =
  | { ok: true; book: Record<string, unknown> }
  | { ok: false; status: number; error: string };

/**
 * Teacher-platform tenant of a user, resolved server-side.
 * `null` = the official Modrek Plus platform.
 */
export async function resolveUserPlatformId(admin: any, userId: string): Promise<string | null> {
  const { data } = await admin
    .from("platform_memberships")
    .select("platform_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return data?.platform_id ?? null;
}

export async function getAccessibleLibraryBook(
  admin: any,
  bookId: string,
  userId: string,
  select = "id,title,subject_name_ar,status,access_tier,page_count",
): Promise<LibraryBookAccessResult> {
  const selectWithPlatform = select.includes("platform_id") ? select : `${select},platform_id`;
  const { data: book, error } = await admin
    .from("library_books")
    .select(selectWithPlatform)
    .eq("id", bookId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message || "book_lookup_failed" };
  if (!book) return { ok: false, status: 404, error: "book_not_found" };

  // Tenant isolation: these functions run with the service role, so the
  // platform boundary has to be enforced here as well as in RLS.
  const isAdmin = await admin
    .rpc("has_role", { _user_id: userId, _role: "admin" })
    .then((r: any) => r?.data === true)
    .catch(() => false);
  if (!isAdmin) {
    const userPlatformId = await resolveUserPlatformId(admin, userId);
    const bookPlatformId = (book as any).platform_id ?? null;
    if ((bookPlatformId ?? null) !== (userPlatformId ?? null)) {
      return { ok: false, status: 404, error: "book_not_found" };
    }
  }

  if (book.status !== "ready") return { ok: false, status: 403, error: "not_ready" };
  if (book.access_tier === "free") return { ok: true, book };

  const { data: allowed, error: accessError } = await admin.rpc("has_library_access", {
    _user_id: userId,
    _tier: book.access_tier,
  });
  if (accessError) return { ok: false, status: 500, error: accessError.message || "access_check_failed" };
  return allowed === true ? { ok: true, book } : { ok: false, status: 403, error: "not_accessible" };
}


export function postgrestIlikeTokens(input: string, minLength = 2, maxTokens = 5): string[] {
  return String(input || "")
    .split(/\s+/)
    .map((token) => token.replace(/[%_,()"'\\]/g, "").trim())
    .filter((token) => token.length >= minLength)
    .slice(0, maxTokens);
}

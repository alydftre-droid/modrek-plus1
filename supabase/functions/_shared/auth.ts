// Shared auth helpers for edge functions.
//
// SECURITY: `getJwtClaimsFromAuthHeader` used to only base64-decode the JWT
// payload without verifying the signature — that let a caller forge any `sub`
// and impersonate other users. It is now async and always validates the token
// against the Supabase Auth server before returning claims. Callers MUST
// `await` it. If verification fails (bad signature, expired, revoked), it
// returns `null`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

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

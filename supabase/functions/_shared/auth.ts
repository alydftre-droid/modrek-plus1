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

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
}

export function getJwtClaimsFromAuthHeader(authHeader: string | null): JwtClaims | null {
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(parts[1]));
    if (!payload || typeof payload !== "object") return null;
    if (typeof payload.sub !== "string" || !payload.sub.trim()) return null;
    if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()) return null;
    return payload as JwtClaims;
  } catch {
    return null;
  }
}

export function getBearerTokenFromAuthHeader(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

export async function getVerifiedUserFromAuthHeader(
  supabaseUrl: string,
  supabaseAnonKey: string,
  authHeader: string | null,
): Promise<VerifiedSupabaseUser | null> {
  const token = getBearerTokenFromAuthHeader(authHeader);
  if (!token || !supabaseUrl || !supabaseAnonKey) return null;

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.4");
    const sb = createClient(supabaseUrl, supabaseAnonKey, {
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
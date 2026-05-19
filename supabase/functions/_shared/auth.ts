export type JwtClaims = {
  sub: string;
  exp?: number;
  email?: string;
  role?: string;
  aud?: string | string[];
  [key: string]: unknown;
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
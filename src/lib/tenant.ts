/**
 * Tenant V2 — authentication + data isolation client helpers.
 *
 * Authorization model (never client-trusted):
 *
 *   hostname → resolve tenant → server authorizes session/account for tenant
 *            → every query is filtered by tenant_id through RLS
 *
 * The hostname only *names* the requested tenant. `tenant_activate_session`
 * is the only thing that grants a session access to a tenant, and it refuses
 * unless an active `tenant_accounts` row exists for that (tenant, user) pair.
 * No localStorage value and no client flag can grant tenant access.
 */
import { supabase } from "@/integrations/supabase/client";
import { detectPlatformSlug } from "@/lib/platformHost";

export const OFFICIAL_TENANT_SLUG = "official";

/** Tenant requested by the current URL. Never an authorization decision. */
export function currentTenantSlug(): string {
  return detectPlatformSlug() ?? OFFICIAL_TENANT_SLUG;
}

export function isOfficialTenantHost(): boolean {
  return currentTenantSlug() === OFFICIAL_TENANT_SLUG;
}

export interface TenantSessionInfo {
  tenant_id: string;
  tenant_type: "official" | "teacher";
  slug: string;
  account_id: string;
  role: string;
  full_name: string | null;
  education_type: string | null;
  stage: string | null;
  grade: string | null;
  section: string | null;
}

export type TenantActivation =
  | { ok: true; tenant: TenantSessionInfo }
  | { ok: false; reason: TenantDenyReason };

export type TenantDenyReason =
  | "no_account_on_tenant"
  | "account_suspended"
  | "tenant_suspended"
  | "tenant_not_found"
  | "not_authenticated"
  | "unknown";

function normalizeReason(message: string | undefined): TenantDenyReason {
  const m = (message || "").toLowerCase();
  if (m.includes("no_account_on_tenant")) return "no_account_on_tenant";
  if (m.includes("account_suspended")) return "account_suspended";
  if (m.includes("tenant_suspended")) return "tenant_suspended";
  if (m.includes("tenant_not_found")) return "tenant_not_found";
  if (m.includes("not_authenticated")) return "not_authenticated";
  return "unknown";
}

export const TENANT_DENY_MESSAGE_AR: Record<TenantDenyReason, string> = {
  no_account_on_tenant: "لا يوجد حساب على هذه المنصة. أنشئ حسابًا جديدًا من هذه المنصة.",
  account_suspended: "تم إيقاف حسابك على هذه المنصة.",
  tenant_suspended: "هذه المنصة موقوفة حاليًا.",
  tenant_not_found: "هذه المنصة غير موجودة.",
  not_authenticated: "يجب تسجيل الدخول أولًا.",
  unknown: "تعذر الوصول إلى هذه المنصة بهذا الحساب.",
};

/**
 * Ask the server to authorize the current auth session for the requested
 * tenant. Returns `ok: false` when the account does not exist in that tenant —
 * the caller MUST then sign the user out (no partial access).
 */
export async function activateTenantSession(
  slug: string = currentTenantSlug(),
): Promise<TenantActivation> {
  const { data, error } = await supabase.rpc("tenant_activate_session", { _slug: slug });
  if (error) return { ok: false, reason: normalizeReason(error.message) };
  if (!data) return { ok: false, reason: "unknown" };
  return { ok: true, tenant: data as unknown as TenantSessionInfo };
}

export async function endTenantSession(): Promise<void> {
  try {
    await supabase.rpc("tenant_end_session");
  } catch {
    /* best effort: the session row expires on its own */
  }
}

/** Explicit registration inside a teacher tenant. There is no auto-join. */
export async function registerTenantStudent(input: {
  slug: string;
  fullName: string;
  educationType?: string | null;
  stage?: string | null;
  grade?: string | null;
  section?: string | null;
}): Promise<TenantActivation> {
  const { data, error } = await supabase.rpc("tenant_register_student", {
    _slug: input.slug,
    _full_name: input.fullName,
    _education_type: input.educationType ?? null,
    _stage: input.stage ?? null,
    _grade: input.grade ?? null,
    _section: input.section ?? null,
  });
  if (error) return { ok: false, reason: normalizeReason(error.message) };
  return { ok: true, tenant: data as unknown as TenantSessionInfo };
}

/** Public branding for a tenant (no authorization value). */
export async function resolveTenantPublic(slug: string = currentTenantSlug()) {
  const { data } = await supabase.rpc("resolve_tenant_public", { _slug: slug });
  const row = Array.isArray(data) ? data[0] : data;
  return (row as Record<string, unknown> | null) ?? null;
}

/** localStorage cache namespace — one isolated cache per tenant host. */
export function tenantCacheKey(base: string): string {
  return `${base}::${currentTenantSlug()}`;
}

/** Prefix any React Query key with the active tenant so caches never mix. */
export function withTenant<T extends readonly unknown[]>(key: T) {
  return [currentTenantSlug(), ...key] as const;
}

/** Storage path prefix — every tenant file lives under its own namespace. */
export function tenantStoragePrefix(tenantId?: string | null): string {
  if (!tenantId || isOfficialTenantHost()) return "official";
  return `platforms/${tenantId}`;
}

/**
 * Client-side helper to delete media assets from Bunny.net (Stream + Storage)
 * BEFORE deleting the associated database rows. The bunny edge functions
 * authorize deletion by verifying that the DB row still references the asset,
 * so this MUST run before the row is removed.
 *
 * Every helper now returns a per-asset outcome so callers can persist an
 * audit log describing what actually happened on Bunny.
 */
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export type BunnyAssetKind = "stream" | "storage";
export interface BunnyAssetResult {
  kind: BunnyAssetKind;
  ref: string;      // videoId or storage path
  ok: boolean;
  status: number;   // HTTP status (0 when network threw)
  error?: string;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function deleteBunnyVideo(videoId: string): Promise<BunnyAssetResult> {
  try {
    const headers = await authHeader();
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/bunny-stream?action=delete-video&videoId=${encodeURIComponent(videoId)}`,
      { method: "POST", headers },
    );
    return {
      kind: "stream",
      ref: videoId,
      ok: res.ok,
      status: res.status,
      error: res.ok ? undefined : await res.text().catch(() => `HTTP ${res.status}`),
    };
  } catch (err) {
    return { kind: "stream", ref: videoId, ok: false, status: 0, error: String(err) };
  }
}

async function deleteBunnyStoragePath(path: string): Promise<BunnyAssetResult> {
  try {
    const headers = await authHeader();
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/bunny-storage?action=delete&path=${encodeURIComponent(path)}`,
      { method: "POST", headers },
    );
    return {
      kind: "storage",
      ref: path,
      ok: res.ok,
      status: res.status,
      error: res.ok ? undefined : await res.text().catch(() => `HTTP ${res.status}`),
    };
  } catch (err) {
    return { kind: "storage", ref: path, ok: false, status: 0, error: String(err) };
  }
}

/** Delete a single asset URL (bunny:// or bstorage://). Returns null for unsupported. */
export async function deleteBunnyAsset(url: string | null | undefined): Promise<BunnyAssetResult | null> {
  if (!url) return null;
  if (url.startsWith("bunny://"))    return deleteBunnyVideo(url.slice("bunny://".length));
  if (url.startsWith("bstorage://")) return deleteBunnyStoragePath(url.slice("bstorage://".length));
  return null;
}

/** Delete every Bunny asset referenced by a content row, returning per-asset outcomes. */
export async function deleteContentBunnyAssets(input: {
  file_url?: string | null;
  thumbnail_url?: string | null;
}): Promise<BunnyAssetResult[]> {
  const results = await Promise.all([
    deleteBunnyAsset(input.file_url),
    deleteBunnyAsset(input.thumbnail_url),
  ]);
  return results.filter((r): r is BunnyAssetResult => r !== null);
}

export interface AuditLogInput {
  actionType: "content_delete" | "teacher_delete" | "book_delete" | "orphan_cleanup";
  targetId?: string | null;
  targetLabel?: string | null;
  targetMeta?: Record<string, unknown>;
  bunnyResults: BunnyAssetResult[];
  startedAt: number;      // performance.now() timestamp
  error?: string | null;
}

/** Persist an audit log row summarizing a deletion + its Bunny cleanup outcome. */
export async function writeDeletionAudit(input: AuditLogInput): Promise<void> {
  try {
    const { data: userRes } = await supabase.auth.getUser();
    const total   = input.bunnyResults.length;
    const success = input.bunnyResults.filter((r) => r.ok).length;
    const failed  = total - success;
    const status  = input.error ? "error" : failed > 0 ? "partial" : "success";
    await supabase.from("deletion_audit_logs").insert({
      actor_id: userRes.user?.id ?? null,
      actor_email: userRes.user?.email ?? null,
      action_type: input.actionType,
      target_id: input.targetId ?? null,
      target_label: input.targetLabel ?? null,
      target_meta: (input.targetMeta ?? {}) as never,
      bunny_total: total,
      bunny_success: success,
      bunny_failed: failed,
      bunny_details: input.bunnyResults as never,
      duration_ms: Math.round(performance.now() - input.startedAt),
      status,
      error: input.error ?? null,
    });
  } catch (err) {
    console.warn("[writeDeletionAudit] failed", err);
  }
}

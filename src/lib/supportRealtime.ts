import { supabase } from "@/integrations/supabase/client";

/**
 * Reliable realtime for the support chat.
 *
 * Background: `postgres_changes` events for `support_messages` were being
 * silently dropped for some users (only appearing after a full refresh).
 * The root cause is well-known: Realtime evaluates the SELECT RLS policy
 * per-message using a short-lived worker context, and when the JWT is close
 * to refresh or the policy uses SECURITY DEFINER helpers, events can be
 * filtered out with no error surface. To make the support chat rock-solid
 * we send an additional Realtime **broadcast** from the sender right after
 * a successful DB write; every open chat subscribes to that broadcast so
 * both sides see the message instantly regardless of postgres_changes state.
 *
 * Channels:
 *   - support-thread-<user_id>   → per-conversation stream (student <-> admin)
 *   - support-global             → admin dashboard (list + counters)
 */

type SupportEventKind = "INSERT" | "UPDATE";

interface SupportBroadcastPayload {
  event: SupportEventKind;
  row: any;
}

type SupportTraceDetails = Record<string, unknown>;

const SUPPORT_TRACE_PREFIX = "[support-chat]";

function safeDetails(details: SupportTraceDetails = {}) {
  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined),
  );
}

export function supportTrace(step: string, details?: SupportTraceDetails) {
  console.info(`${SUPPORT_TRACE_PREFIX} ${step}`, safeDetails(details));
}

export function summarizeSupportRow(row: any) {
  return {
    id: row?.id ?? null,
    userId: row?.user_id ?? null,
    isFromAdmin: !!row?.is_from_admin,
    isTeacherRequest: !!row?.is_teacher_request,
    isResolved: !!row?.is_resolved,
    fileType: row?.file_type ?? null,
    clientId: row?.metadata?.client_id ?? null,
    createdAt: row?.created_at ?? null,
    messageLength: typeof row?.message === "string" ? row.message.length : 0,
  };
}

const threadChannel = (userId: string) => `support-thread-${userId}`;
const GLOBAL_CHANNEL = "support-global";

async function fireBroadcast(channelName: string, payload: SupportBroadcastPayload) {
  try {
    supportTrace("broadcast:subscribe:start", {
      channelName,
      event: payload.event,
      row: summarizeSupportRow(payload.row),
    });
    // A one-shot ephemeral channel just for sending. We subscribe, send, remove.
    const ch = supabase.channel(channelName, { config: { broadcast: { self: false } } });
    await new Promise<void>((resolve) => {
      ch.subscribe((status, err) => {
        supportTrace("broadcast:subscribe:status", {
          channelName,
          status,
          error: err?.message,
        });
        if (status === "SUBSCRIBED") resolve();
      });
      // Fallback timeout so a stuck subscribe never blocks the UI.
      setTimeout(() => {
        supportTrace("broadcast:subscribe:timeout", { channelName });
        resolve();
      }, 1500);
    });
    const result = await ch.send({ type: "broadcast", event: "support_message", payload });
    supportTrace("broadcast:send:result", {
      channelName,
      result,
      event: payload.event,
      row: summarizeSupportRow(payload.row),
    });
    // Give the socket a tick to flush before tearing down.
    setTimeout(() => {
      supportTrace("broadcast:cleanup", { channelName });
      supabase.removeChannel(ch);
    }, 250);
  } catch (e) {
    console.warn("[supportRealtime] broadcast failed", channelName, e);
    supportTrace("broadcast:error", { channelName, error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Insert a support message and broadcast it to the conversation + admin
 * global channel. Returns the inserted row.
 */
export async function insertSupportMessage(payload: Record<string, any>) {
  supportTrace("send:start", {
    userId: payload.user_id ?? null,
    isFromAdmin: !!payload.is_from_admin,
    isTeacherRequest: !!payload.is_teacher_request,
    fileType: payload.file_type ?? null,
    clientId: payload.metadata?.client_id ?? null,
    messageLength: typeof payload.message === "string" ? payload.message.length : 0,
  });
  const { data, error } = await supabase
    .from("support_messages")
    .insert(payload)
    .select()
    .single();
  if (error) {
    supportTrace("db:insert:error", { error: error.message, code: error.code, details: error.details });
    throw error;
  }

  supportTrace("db:inserted", { row: summarizeSupportRow(data) });

  const userId = payload.user_id;
  if (userId && data) {
    await Promise.all([
      fireBroadcast(threadChannel(userId), { event: "INSERT", row: data }),
      fireBroadcast(GLOBAL_CHANNEL, { event: "INSERT", row: data }),
    ]);
  }
  supportTrace("send:complete", { row: summarizeSupportRow(data) });
  return data;
}

/**
 * Update a support message (read receipts, resolution, etc) and broadcast
 * the change so open chats can sync without a re-fetch.
 */
export async function updateSupportMessage(
  id: string,
  userId: string,
  patch: Record<string, any>,
) {
  supportTrace("update:start", { id, userId, patchKeys: Object.keys(patch) });
  const { data, error } = await supabase
    .from("support_messages")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) {
    supportTrace("db:update:error", { id, userId, error: error.message, code: error.code, details: error.details });
    throw error;
  }

  const row = data ?? { id, user_id: userId, ...patch };
  supportTrace("db:updated", { row: summarizeSupportRow(row), patchKeys: Object.keys(patch) });
  await Promise.all([
    fireBroadcast(threadChannel(userId), { event: "UPDATE", row }),
    fireBroadcast(GLOBAL_CHANNEL, { event: "UPDATE", row }),
  ]);
  return row;
}

/**
 * Subscribe to the per-user support broadcast channel. Handler receives
 * the raw row + event kind. Returns an unsubscribe function.
 */
export function subscribeSupportThread(
  userId: string,
  handler: (event: SupportEventKind, row: any) => void,
) {
  const channelName = threadChannel(userId);
  supportTrace("subscribe:thread:create", { channelName, userId });
  const channel = supabase
    .channel(channelName)
    .on("broadcast", { event: "support_message" }, (msg: any) => {
      const p = msg?.payload as SupportBroadcastPayload | undefined;
      if (!p?.row) return;
      supportTrace("realtime:broadcast:thread:received", {
        channelName,
        event: p.event || "INSERT",
        row: summarizeSupportRow(p.row),
      });
      handler(p.event || "INSERT", p.row);
    })
    .subscribe((status, err) => {
      supportTrace("subscribe:thread:status", { channelName, status, error: err?.message });
    });
  return () => {
    supportTrace("subscribe:thread:cleanup", { channelName });
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to the admin global support broadcast channel. Fires on every
 * insert/update across all users so the conversation list stays fresh.
 */
export function subscribeSupportGlobal(
  handler: (event: SupportEventKind, row: any) => void,
) {
  supportTrace("subscribe:global:create", { channelName: GLOBAL_CHANNEL });
  const channel = supabase
    .channel(GLOBAL_CHANNEL)
    .on("broadcast", { event: "support_message" }, (msg: any) => {
      const p = msg?.payload as SupportBroadcastPayload | undefined;
      if (!p?.row) return;
      supportTrace("realtime:broadcast:global:received", {
        channelName: GLOBAL_CHANNEL,
        event: p.event || "INSERT",
        row: summarizeSupportRow(p.row),
      });
      handler(p.event || "INSERT", p.row);
    })
    .subscribe((status, err) => {
      supportTrace("subscribe:global:status", { channelName: GLOBAL_CHANNEL, status, error: err?.message });
    });
  return () => {
    supportTrace("subscribe:global:cleanup", { channelName: GLOBAL_CHANNEL });
    supabase.removeChannel(channel);
  };
}

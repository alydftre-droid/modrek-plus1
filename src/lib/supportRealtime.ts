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

const threadChannel = (userId: string) => `support-thread-${userId}`;
const GLOBAL_CHANNEL = "support-global";

async function fireBroadcast(channelName: string, payload: SupportBroadcastPayload) {
  try {
    // A one-shot ephemeral channel just for sending. We subscribe, send, remove.
    const ch = supabase.channel(channelName, { config: { broadcast: { self: false } } });
    await new Promise<void>((resolve) => {
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
      });
      // Fallback timeout so a stuck subscribe never blocks the UI.
      setTimeout(resolve, 1500);
    });
    await ch.send({ type: "broadcast", event: "support_message", payload });
    // Give the socket a tick to flush before tearing down.
    setTimeout(() => { supabase.removeChannel(ch); }, 250);
  } catch (e) {
    console.warn("[supportRealtime] broadcast failed", channelName, e);
  }
}

/**
 * Insert a support message and broadcast it to the conversation + admin
 * global channel. Returns the inserted row.
 */
export async function insertSupportMessage(payload: Record<string, any>) {
  const { data, error } = await supabase
    .from("support_messages")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;

  const userId = payload.user_id;
  if (userId && data) {
    await Promise.all([
      fireBroadcast(threadChannel(userId), { event: "INSERT", row: data }),
      fireBroadcast(GLOBAL_CHANNEL, { event: "INSERT", row: data }),
    ]);
  }
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
  const { data, error } = await supabase
    .from("support_messages")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw error;

  const row = data ?? { id, user_id: userId, ...patch };
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
  const channel = supabase
    .channel(threadChannel(userId))
    .on("broadcast", { event: "support_message" }, (msg: any) => {
      const p = msg?.payload as SupportBroadcastPayload | undefined;
      if (!p?.row) return;
      handler(p.event || "INSERT", p.row);
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

/**
 * Subscribe to the admin global support broadcast channel. Fires on every
 * insert/update across all users so the conversation list stays fresh.
 */
export function subscribeSupportGlobal(
  handler: (event: SupportEventKind, row: any) => void,
) {
  const channel = supabase
    .channel(GLOBAL_CHANNEL)
    .on("broadcast", { event: "support_message" }, (msg: any) => {
      const p = msg?.payload as SupportBroadcastPayload | undefined;
      if (!p?.row) return;
      handler(p.event || "INSERT", p.row);
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

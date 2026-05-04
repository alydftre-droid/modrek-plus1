import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Real-time typing indicator helper for the support system.
 * Channel name MUST match the admin side: `support-typing-${userId}`
 *
 * - The user (student/teacher) broadcasts `from: 'user'`
 * - The admin broadcasts `from: 'admin'`
 * Each side listens to the opposite "from" value.
 */
export function useSupportTyping(userId: string | null | undefined, side: "user" | "admin") {
  const [otherTyping, setOtherTyping] = useState(false);
  const channelRef = useRef<any>(null);
  const lastSentRef = useRef<number>(0);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`support-typing-${userId}`)
      .on("broadcast", { event: "typing" }, (payload) => {
        const from = (payload.payload as any)?.from;
        if (!from || from === side) return; // ignore self
        setOtherTyping(true);
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = setTimeout(() => setOtherTyping(false), 2500);
      })
      .subscribe();
    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [userId, side]);

  const sendTyping = useCallback(() => {
    const ch = channelRef.current;
    if (!ch) return;
    const now = Date.now();
    // throttle to once per 1.2s
    if (now - lastSentRef.current < 1200) return;
    lastSentRef.current = now;
    ch.send({ type: "broadcast", event: "typing", payload: { from: side } });
  }, [side]);

  return { otherTyping, sendTyping };
}

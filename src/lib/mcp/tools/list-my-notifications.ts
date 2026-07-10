declare const process: { env: Record<string, string | undefined> };
import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_my_notifications",
  title: "List my notifications",
  description: "Return the most recent notifications visible to the signed-in Mudrik Plus user.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).optional().describe("Maximum notifications to return (default 10)."),
    unread_only: z.boolean().optional().describe("If true, return only unread notifications."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, unread_only }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const client = supabaseForUser(ctx);
    let query = client
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit ?? 10);
    if (unread_only) query = query.eq("is_read", false);
    const { data, error } = await query;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { notifications: data ?? [] },
    };
  },
});

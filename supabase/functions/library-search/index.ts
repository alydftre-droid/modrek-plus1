// Library Search — smart search within a book.
// Uses trigram similarity on ocr_text + index title matches. No AI call by
// default (cheap and instant). Returns page hits + matching index nodes.
//
// Request: { book_id, q }
// Response: { pages: [{page_number, snippet, score}], index: [{id,title,page_start,page_end,kind}] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function highlight(text: string, q: string): string {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const lower = clean.toLowerCase();
  const term = q.toLowerCase().split(/\s+/).find((t) => t.length >= 3) || "";
  const at = term ? lower.indexOf(term) : -1;
  if (at < 0) return clean.slice(0, 220);
  const start = Math.max(0, at - 80);
  const end = Math.min(clean.length, at + 160);
  return (start > 0 ? "…" : "") + clean.slice(start, end) + (end < clean.length ? "…" : "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const bookId = String(body.book_id || "");
    const q = String(body.q || "").trim().slice(0, 200);
    if (!bookId || !q) return json({ pages: [], index: [] });

    const { data: book } = await admin
      .from("library_books")
      .select("id,status,access_tier")
      .eq("id", bookId)
      .maybeSingle();
    if (!book || book.status !== "ready" || book.access_tier !== "free") {
      return json({ error: "not_accessible" }, 403);
    }

    const tokens = q.split(/\s+/).filter((t) => t.length >= 2).slice(0, 5);
    const safeTokens = tokens.map((t) => t.replace(/[%_]/g, ""));

    // Page hits via ilike on any token (cheap + uses trgm index we created).
    let pages: Array<{ page_number: number; snippet: string; score: number }> = [];
    if (safeTokens.length) {
      const orClause = safeTokens.map((t) => `ocr_text.ilike.%${t}%`).join(",");
      const { data: hits } = await admin
        .from("library_book_pages")
        .select("page_number,ocr_text")
        .eq("book_id", bookId)
        .or(orClause)
        .limit(50);
      pages = (hits || []).map((row: any) => {
        const text = String(row.ocr_text || "");
        const lower = text.toLowerCase();
        const score = safeTokens.reduce((s, t) => s + (lower.includes(t.toLowerCase()) ? 1 : 0), 0);
        return {
          page_number: row.page_number,
          snippet: highlight(text, q),
          score,
        };
      });
      pages.sort((a, b) => (b.score - a.score) || (a.page_number - b.page_number));
      pages = pages.slice(0, 20);
    }

    // Index hits
    let indexHits: any[] = [];
    if (safeTokens.length) {
      const orClause = safeTokens.map((t) => `title.ilike.%${t}%`).join(",");
      const { data } = await admin
        .from("library_book_index")
        .select("id,title,kind,page_start,page_end")
        .eq("book_id", bookId)
        .or(orClause)
        .order("page_start")
        .limit(15);
      indexHits = data || [];
    }

    return json({ pages, index: indexHits });
  } catch (err: any) {
    console.error("library-search error", err);
    return json({ error: String(err?.message || err) }, 500);
  }
});

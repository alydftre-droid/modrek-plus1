// Library Search — hybrid semantic + trigram search within a book.
// Combines vector search over library_book_chunks (RAG) with trigram matches
// on page OCR text and index titles.
//
// Request: { book_id, q }
// Response: { pages: [{page_number, snippet, score, kind}], index: [...] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveOpenRouterApiKey } from "../_shared/aiSettings.ts";
import { openRouterEmbed, OPENROUTER_DEFAULT_EMBED_MODEL } from "../_shared/openrouter.ts";
import { getAccessibleLibraryBook, postgrestIlikeTokens } from "../_shared/auth.ts";


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

    const access = await getAccessibleLibraryBook(admin, bookId, userData.user.id, "id,status,access_tier", authHeader);
    if (!access.ok) return json({ error: access.error }, access.status);

    const safeTokens = postgrestIlikeTokens(q, 2, 5);

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

    // Semantic search over chunks (RAG). Merges into pages with a bonus score.
    try {
      const { apiKey } = await resolveOpenRouterApiKey(admin);
      if (apiKey) {
        const emb = await openRouterEmbed({
          apiKey,
          model: OPENROUTER_DEFAULT_EMBED_MODEL,
          inputs: [q],
          timeoutMs: 20_000,
        });
        if (emb.ok && emb.vectors[0]?.length) {
          const { data: matches } = await admin.rpc("library_match_chunks", {
            p_book_id: bookId,
            p_query_embedding: emb.vectors[0],
            p_match_count: 8,
          });
          const seen = new Set(pages.map((p) => p.page_number));
          for (const m of matches || []) {
            const page = Number((m as any).page_number);
            const similarity = Number((m as any).similarity || 0);
            const snippet = highlight(String((m as any).content || ""), q);
            const semScore = Math.round(similarity * 10) + 5;
            const existing = pages.find((p) => p.page_number === page);
            if (existing) {
              existing.score += semScore;
              if (!existing.snippet) existing.snippet = snippet;
            } else if (!seen.has(page)) {
              pages.push({ page_number: page, snippet, score: semScore });
              seen.add(page);
            }
          }
          pages.sort((a, b) => (b.score - a.score) || (a.page_number - b.page_number));
          pages = pages.slice(0, 20);
        }
      }
    } catch (e) { console.warn("library-search vector_error", e); }

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

// Library Recommendations — returns personalized study suggestions for a
// student based on: last read page/section, weakness topics, and semantic
// neighbors in the same book (or same subject). Cached per student for 1 hour
// in library_recommendations.
//
// Request: { book_id?: string, limit?: number }
// Response: { items: [{kind, title, book_id, page_number, reason}] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getAccessibleLibraryBook, resolveUserPlatformId } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "unauthorized" }, 401);
    const studentId = userData.user.id;
    const studentPlatformId = await resolveUserPlatformId(admin, studentId);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const bookId = body.book_id ? String(body.book_id) : null;
    const limit = Math.min(12, Math.max(3, Number(body.limit) || 6));

    // 1) Serve fresh cache if present (< 1h)
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: cached } = await admin
      .from("library_recommendations")
      .select("kind,payload,score,created_at,source_book_id")
      .eq("student_id", studentId)
      .gte("created_at", cutoff)
      .order("score", { ascending: false })
      .limit(limit);
    if (cached && cached.length >= 3) {
      return json({ items: cached.map((r: any) => ({ ...r.payload, kind: r.kind })), cached: true });
    }

    // 2) Build fresh recommendations
    const items: Array<{ kind: string; payload: any; score: number; source_book_id: string | null; source_page: number | null }> = [];

    // 2a) Continue-reading (last book)
    const { data: memory } = await admin
      .from("library_student_memory")
      .select("last_book_id,last_page")
      .eq("student_id", studentId).maybeSingle();
    if (memory?.last_book_id) {
      const access = await getAccessibleLibraryBook(admin, memory.last_book_id, studentId, "id,title,subject_name_ar,status,access_tier,page_count");
      if (access.ok) {
        const b = access.book as any;
        items.push({
          kind: "continue",
          score: 100,
          source_book_id: b.id,
          source_page: memory.last_page ?? 1,
          payload: {
            title: `أكمل قراءة "${b.title}"`,
            book_id: b.id,
            page_number: memory.last_page ?? 1,
            reason: `آخر صفحة توقفت عندها في مادة ${b.subject_name_ar || ""}`,
          },
        });
      }
    }

    // 2b) Weak topics → suggest revisiting those pages
    const { data: weaknesses } = await admin
      .from("library_student_weaknesses")
      .select("topic,book_id,page_number,wrong_count,right_count")
      .eq("student_id", studentId)
      .order("wrong_count", { ascending: false })
      .limit(6);
    for (const w of weaknesses || []) {
      const wrong = Number(w.wrong_count || 0);
      const right = Number(w.right_count || 0);
      const mastery = right / Math.max(1, wrong + right);
      if (mastery >= 0.75) continue;
      items.push({
        kind: "weakness",
        score: 80 + wrong,
        source_book_id: w.book_id,
        source_page: w.page_number,
        payload: {
          title: `راجع: ${w.topic}`,
          book_id: w.book_id,
          page_number: w.page_number,
          reason: `أخطأت ${wrong} مرة في هذا الموضوع، ننصح بمراجعته.`,
        },
      });
    }

    // 2c) Related chapters in current/last book
    const targetBook = bookId || memory?.last_book_id || null;
    if (targetBook) {
      const { data: idxRows } = await admin
        .from("library_book_index")
        .select("id,title,page_start,page_end,summary")
        .eq("book_id", targetBook)
        .order("order_index")
        .limit(20);
      const currentPage = memory?.last_page ?? 1;
      const near = (idxRows || [])
        .filter((r: any) => Math.abs((r.page_start || 0) - currentPage) <= 30 && r.page_start !== currentPage)
        .slice(0, 3);
      for (const n of near) {
        items.push({
          kind: "related",
          score: 60,
          source_book_id: targetBook,
          source_page: n.page_start,
          payload: {
            title: n.title,
            book_id: targetBook,
            page_number: n.page_start,
            reason: n.summary || "درس مرتبط بما تدرسه حالياً",
          },
        });
      }
    }

    // 2d) Same-subject other books
    if (targetBook) {
      const access = await getAccessibleLibraryBook(admin, targetBook, studentId, "id,subject_id,subject_name_ar,stage_id,grade_id,status,access_tier");
      const b = access.ok ? access.book as any : null;
      if (b?.subject_id) {
        const { data: others } = await admin.from("library_books")
          .select("id,title,subject_name_ar,access_tier")
          .eq("subject_id", b.subject_id)
          // Tenant isolation: only recommend books from the student's platform.
          [studentPlatformId ? "eq" : "is"]("platform_id", studentPlatformId)
          .eq("status", "ready")
          .eq("access_tier", "free")
          .neq("id", targetBook)
          .limit(3);
        for (const o of others || []) {
          items.push({
            kind: "book",
            score: 40,
            source_book_id: o.id,
            source_page: 1,
            payload: {
              title: o.title,
              book_id: o.id,
              page_number: 1,
              reason: `كتاب آخر في مادة ${o.subject_name_ar || b.subject_name_ar}`,
            },
          });
        }
      }
    }

    // Persist (best-effort). Wipe expired entries first.
    try {
      await admin.from("library_recommendations").delete()
        .eq("student_id", studentId).lt("created_at", cutoff);
      if (items.length) {
        await admin.from("library_recommendations").insert(
          items.map((it) => ({
            student_id: studentId,
            source_book_id: it.source_book_id,
            source_page: it.source_page,
            kind: it.kind,
            payload: it.payload,
            score: it.score,
            expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          })),
        );
      }
    } catch (e) { console.warn("rec_persist_failed", e); }

    const out = items
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((it) => ({ ...it.payload, kind: it.kind }));

    return json({ items: out, cached: false });
  } catch (err: any) {
    console.error("library-recommendations error", err);
    return json({ error: String(err?.message || err) }, 500);
  }
});

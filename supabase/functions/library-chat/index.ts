// Library Chat — per-book conversation with memory + scope (page/book/section).
// All AI + TTS through OpenRouter via _shared. Persistent caching:
//   - Any (page/section, question)-hashed answer is stored in
//     library_section_explanations and reused for future students.
//   - Every turn is written to library_conversation_messages so the assistant
//     remembers the book, current page, current section, and prior Q&A.
//
// Request:
//   { book_id, message, scope: 'page'|'book'|'section',
//     page_number?, section_id?, with_audio?, conversation_id? }
//
// Response:
//   { conversation_id, reply, audio_base64?, cached, sources?: [{page_number, snippet}] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  loadAiSettings,
  resolveOpenRouterApiKey,
  callGeminiWithFallback,
} from "../_shared/aiSettings.ts";
import {
  openRouterTts,
  openRouterEmbed,
  pcmToWav,
  OPENROUTER_DEFAULT_TTS_MODEL,
  OPENROUTER_DEFAULT_TTS_VOICE,
  OPENROUTER_DEFAULT_EMBED_MODEL,
} from "../_shared/openrouter.ts";
import { getAccessibleLibraryBook, postgrestIlikeTokens } from "../_shared/auth.ts";
import { enforceAiQuota, aiQuotaResponse } from "../_shared/aiQuota.ts";
import { resolveAnswerScope, buildAnswerScopeBlock } from "../_shared/answerScope.ts";

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

async function sha256Hex(input: string) {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function b64(buf: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)) as any);
  }
  return btoa(binary);
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
    const studentId = userData.user.id;

    const quota = await enforceAiQuota(studentId, "library-chat");
    if (!quota.allowed) return aiQuotaResponse(quota, corsHeaders);

    const body = await req.json().catch(() => ({}));
    const bookId = String(body.book_id || "");
    const message = String(body.message || "").trim().slice(0, 2000);
    const scope: "page" | "book" | "section" = ["page", "book", "section"].includes(body.scope) ? body.scope : "page";
    const pageNumber = body.page_number ? Number(body.page_number) : null;
    const sectionId = body.section_id ? String(body.section_id) : null;
    const withAudio = body.with_audio === true;
    let conversationId: string | null = body.conversation_id ? String(body.conversation_id) : null;

    if (!bookId || !message) return json({ error: "book_id_and_message_required" }, 400);

    // 1) Verify book access + get metadata
    const access = await getAccessibleLibraryBook(admin, bookId, studentId, "id,title,subject_name_ar,status,access_tier");
    if (!access.ok) return json({ error: access.error }, access.status);
    const book = access.book as any;

    // 2) Get or create conversation
    if (!conversationId) {
      const { data: existing } = await admin
        .from("library_book_conversations")
        .select("id")
        .eq("book_id", bookId)
        .eq("student_id", studentId)
        .maybeSingle();
      if (existing) {
        conversationId = existing.id;
      } else {
        const { data: created, error: cErr } = await admin
          .from("library_book_conversations")
          .insert({
            book_id: bookId,
            student_id: studentId,
            current_page: pageNumber,
            current_section_id: sectionId,
          })
          .select("id")
          .single();
        if (cErr) return json({ error: `conv_create_failed: ${cErr.message}` }, 500);
        conversationId = created.id;
      }
    }

    // Update conversation context (current page/section)
    await admin
      .from("library_book_conversations")
      .update({ current_page: pageNumber, current_section_id: sectionId })
      .eq("id", conversationId);

    // 3) Persistent cache lookup (any student's answer for same page/section/question)
    const cacheKey = await sha256Hex(JSON.stringify({ source: "chat", bookId, pageNumber, sectionId, scope, q: message.toLowerCase() }));
    const { data: cached } = await admin
      .from("library_section_explanations")
      .select("id,text_ar,audio_path,hit_count")
      .eq("book_id", bookId)
      .eq("prompt_hash", cacheKey)
      .maybeSingle();

    if (cached && cached.text_ar) {
      // Log both turns in this student's conversation, no AI call
      await admin.from("library_conversation_messages").insert([
        { conversation_id: conversationId, role: "user", content: message, scope, page_number: pageNumber, section_id: sectionId },
        { conversation_id: conversationId, role: "assistant", content: cached.text_ar, scope, page_number: pageNumber, section_id: sectionId, audio_path: cached.audio_path },
      ]);
      await admin
        .from("library_section_explanations")
        .update({ hit_count: (cached.hit_count ?? 0) + 1 })
        .eq("id", cached.id);
      return json({
        conversation_id: conversationId,
        reply: cached.text_ar,
        audio_base64: null,
        audio_path: cached.audio_path,
        cached: true,
      });
    }

    // 4) Build context based on scope
    let context = "";
    const sources: Array<{ page_number: number; snippet: string }> = [];

    if (scope === "section" && sectionId) {
      const { data: s } = await admin
        .from("library_book_sections")
        .select("raw_text,page_id")
        .eq("id", sectionId)
        .maybeSingle();
      context = s?.raw_text || "";
    } else if (scope === "page" && pageNumber) {
      const { data: p } = await admin
        .from("library_book_pages")
        .select("ocr_text")
        .eq("book_id", bookId)
        .eq("page_number", pageNumber)
        .maybeSingle();
      context = p?.ocr_text || "";
    } else if (scope === "book") {
      // RAG: embed the question and retrieve top-k chunks from the book.
      const { apiKey: embKey } = await resolveOpenRouterApiKey(admin);
      let ragChunks: Array<{ page_number: number; content: string; similarity?: number }> = [];
      if (embKey) {
        const emb = await openRouterEmbed({
          apiKey: embKey,
          model: OPENROUTER_DEFAULT_EMBED_MODEL,
          inputs: [message.slice(0, 1200)],
          timeoutMs: 20_000,
        });
        if (emb.ok && emb.vectors[0]?.length) {
          const { data: matches } = await admin.rpc("library_match_chunks", {
            p_book_id: bookId,
            p_query_embedding: emb.vectors[0],
            p_match_count: 8,
          });
          ragChunks = Array.isArray(matches) ? matches : [];
        }
      }

      // Fallback: keyword search if vector search is empty (book still embedding).
      if (!ragChunks.length) {
        const tokens = postgrestIlikeTokens(message.slice(0, 200), 3, 5);
        if (tokens.length) {
          const orClause = tokens.map((t) => `content.ilike.%${t}%`).join(",");
          const { data: hits } = await admin
            .from("library_book_chunks")
            .select("page_number,content")
            .eq("book_id", bookId)
            .or(orClause)
            .limit(6);
          ragChunks = (hits as any) || [];
        }
      }
      if (!ragChunks.length) {
        const { data: fallback } = await admin
          .from("library_book_pages")
          .select("page_number,ocr_text")
          .eq("book_id", bookId)
          .order("page_number")
          .limit(3);
        ragChunks = (fallback || []).map((p: any) => ({ page_number: p.page_number, content: String(p.ocr_text || "").slice(0, 1200) }));
      }

      const parts: string[] = [];
      for (const c of ragChunks.slice(0, 8)) {
        const snippet = String(c.content || "").slice(0, 900);
        parts.push(`[صفحة ${c.page_number}]\n${snippet}`);
        sources.push({ page_number: c.page_number, snippet: snippet.slice(0, 200) });
      }
      context = parts.join("\n\n");
    }

    // 5) Load conversation memory (last 10 turns)
    const { data: history } = await admin
      .from("library_conversation_messages")
      .select("role,content,scope,page_number")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(10);

    const historyMessages = (history || []).reverse().map((h) => ({
      role: h.role as "user" | "assistant",
      content: h.content,
    }));

    // 6) Prompt
    const scopeLabel = scope === "book" ? "الكتاب بالكامل" : scope === "section" ? "هذا الجزء المحدد" : `الصفحة ${pageNumber || ""}`;

    const systemPrompt = `أنت معلم عربي متمكن يشرح كتاب "${book.title}" مادة "${book.subject_name_ar || ""}".
- اجب بالعربية الفصحى المبسطة، مباشرة بدون مقدمات مثل "بالطبع".
- لا تستخدم Markdown ولا رموز.
- سياق السؤال: ${scopeLabel}.
- إذا كان السؤال عن الكتاب بالكامل، اذكر أرقام الصفحات ذات الصلة في نهاية الرد بصيغة: (انظر صفحة X).
- التزم بمحتوى الكتاب أولاً، وإن لم يكن كافياً استخدم معرفتك العامة بالمادة.

${buildAnswerScopeBlock(resolveAnswerScope(message))}`;

    const userPrompt = `${message}\n\n---محتوى ${scopeLabel}---\n${context || "(لا يوجد نص مستخرج لهذا الجزء)"}`.slice(0, 12000);

    // 7) Call OpenRouter
    const { apiKey } = await resolveOpenRouterApiKey(admin);
    if (!apiKey) return json({ error: "openrouter_key_missing" }, 500);

    const chatSettings = await loadAiSettings(admin, "library-chat");
    const chatResult = await callGeminiWithFallback({
      apiKey,
      models: chatSettings.models_to_try,
      body: {
        messages: [
          { role: "system", content: systemPrompt },
          ...historyMessages,
          { role: "user", content: userPrompt },
        ],
        temperature: 0.6,
      },
      fallbackDelayMs: chatSettings.fallback_delay_ms,
      timeoutMs: 60_000,
    });

    if (!chatResult.ok) {
      return json({ error: `ai_failed: ${chatResult.status} ${(chatResult.lastError || "").slice(0, 200)}` }, 502);
    }
    const aiData = await chatResult.response.json().catch(() => ({}));
    const reply: string = aiData?.choices?.[0]?.message?.content?.trim() || "";
    const usage = aiData?.usage || {};
    if (!reply) return json({ error: "empty_ai_response" }, 502);

    // 8) Optional TTS
    let audioBase64: string | null = null;
    if (withAudio) {
      try {
        const ttsSettings = await loadAiSettings(admin, "library-explain-tts");
        const ttsModel = ttsSettings.models_to_try[0] || OPENROUTER_DEFAULT_TTS_MODEL;
        const ttsRes = await openRouterTts({
          apiKey,
          model: ttsModel,
          input: reply.slice(0, 3800),
          voice: OPENROUTER_DEFAULT_TTS_VOICE,
          format: "pcm",
          timeoutMs: 60_000,
        });
        if (ttsRes.ok) {
          const pcm = new Uint8Array(await ttsRes.response.arrayBuffer());
          audioBase64 = b64(pcmToWav(pcm));
        }
      } catch (e) { console.warn("library-chat tts_error", e); }
    }

    // 9) Persist cache + conversation turns (best-effort; do not fail user)
    try {
      await admin.from("library_section_explanations").insert({
        book_id: bookId,
        section_id: sectionId,
        variant: "default",
        prompt_hash: cacheKey,
        text_ar: reply,
        voice: withAudio ? OPENROUTER_DEFAULT_TTS_VOICE : null,
        tokens_input: usage.prompt_tokens ?? null,
        tokens_output: usage.completion_tokens ?? null,
        created_by: studentId,
        hit_count: 1,
      });
    } catch (e) { console.warn("library-chat cache_insert_failed", e); }

    await admin.from("library_conversation_messages").insert([
      { conversation_id: conversationId, role: "user", content: message, scope, page_number: pageNumber, section_id: sectionId },
      {
        conversation_id: conversationId, role: "assistant", content: reply, scope,
        page_number: pageNumber, section_id: sectionId,
        tokens_input: usage.prompt_tokens ?? null, tokens_output: usage.completion_tokens ?? null,
      },
    ]);

    // Update student learning memory + per-book progress (best-effort)
    try {
      await admin.from("library_student_memory").upsert({
        student_id: studentId,
        last_book_id: bookId,
        last_page: pageNumber,
        last_section_id: sectionId,
        last_conversation_id: conversationId,
        last_question: message.slice(0, 500),
        last_answer: reply.slice(0, 2000),
      }, { onConflict: "student_id" });
      if (pageNumber) {
        await admin.from("library_student_book_progress").upsert({
          student_id: studentId,
          book_id: bookId,
          last_page: pageNumber,
          last_section_id: sectionId,
        }, { onConflict: "student_id,book_id" });
      }
    } catch (e) { console.warn("library-chat memory_update_failed", e); }

    // Related recommendations from index (top nearby chapters/lessons)
    let related: Array<{ id: string; title: string; page_start: number }> = [];
    try {
      if (pageNumber) {
        const { data: idx } = await admin
          .from("library_book_index")
          .select("id,title,page_start,page_end")
          .eq("book_id", bookId)
          .order("page_start")
          .limit(50);
        related = (idx || [])
          .filter((r: any) => Math.abs((r.page_start || 0) - pageNumber) <= 20)
          .slice(0, 4)
          .map((r: any) => ({ id: r.id, title: r.title, page_start: r.page_start }));
      }
    } catch { /* ignore */ }

    return json({
      conversation_id: conversationId,
      reply,
      audio_base64: audioBase64,
      cached: false,
      sources: sources.length ? sources : undefined,
      related: related.length ? related : undefined,
    });
  } catch (err: any) {
    console.error("library-chat error", err);
    return json({ error: String(err?.message || err) }, 500);
  }
});

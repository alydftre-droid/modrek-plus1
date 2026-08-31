import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DEFAULT_WEB_RESEARCH_CONFIG,
  evaluateLibraryCoverage,
  buildResearchQuery,
  buildWebResearchBlock,
  normalizeWebResearchConfig,
} from "./modrekWebResearch.ts";

const baseScope: any = {
  userId: "u1", fullName: "طالب", role: "student", stageCode: "secondary", gradeCode: "sec1",
  trackCodes: [], sectionCode: "azhar",
  labels: { stage: "المرحلة الثانوية", grade: "الصف الأول الثانوي", track: null, system: "أزهري" },
};

function rag(over: Record<string, unknown> = {}): any {
  return {
    scope: baseScope,
    understanding: { intent: "explain_lesson", subject: "الفقه", lesson: null, lessonTitleHint: null, page: null, wholeCurriculum: false, refersToPrevious: false, keywords: [] },
    accessible_books: [], subject_books: [],
    selected_book: { id: "b1", title: "الفقه" },
    outline: [],
    lesson: { title: "الوضوء" },
    passages: [
      { text: "ن".repeat(900), score: 0.82, book_id: "b1", book_title: "الفقه", page_from: 5, page_to: 6 },
      { text: "ن".repeat(900), score: 0.7, book_id: "b1", book_title: "الفقه", page_from: 7, page_to: 8 },
      { text: "ن".repeat(900), score: 0.66, book_id: "b1", book_title: "الفقه", page_from: 9, page_to: 9 },
    ],
    confidence: "high",
    found: true,
    ambiguity: null,
    notes: [],
    trace: {},
    ...over,
  };
}

Deno.test("strong library retrieval stays library-only", () => {
  const ev = evaluateLibraryCoverage(rag(), DEFAULT_WEB_RESEARCH_CONFIG, "ai-chat");
  assertEquals(ev.decision, "library_only");
  assertEquals(ev.needs_web, false);
  assert(ev.coverage > 0.8);
});

Deno.test("partial retrieval triggers hybrid research", () => {
  const ev = evaluateLibraryCoverage(
    rag({ confidence: "low", lesson: null, passages: [{ text: "ن".repeat(400), score: 0.4, book_id: "b1", book_title: "الفقه" }] }),
    DEFAULT_WEB_RESEARCH_CONFIG,
    "ai-chat",
  );
  assertEquals(ev.decision, "hybrid");
  assertEquals(ev.needs_web, true);
});

Deno.test("empty retrieval goes web-only", () => {
  const ev = evaluateLibraryCoverage(
    rag({ confidence: "none", found: false, passages: [], lesson: null, selected_book: null }),
    DEFAULT_WEB_RESEARCH_CONFIG,
    "ai-chat",
  );
  assertEquals(ev.decision, "web_only");
});

Deno.test("list_books never leaves the platform", () => {
  const ev = evaluateLibraryCoverage(
    rag({ confidence: "none", passages: [], understanding: { intent: "list_books", subject: null, lesson: null, keywords: [] } }),
    DEFAULT_WEB_RESEARCH_CONFIG,
    "ai-chat",
  );
  assertEquals(ev.needs_web, false);
  assertEquals(ev.decision, "library_only");
});

Deno.test("disabled surface never searches the web", () => {
  const config = normalizeWebResearchConfig({ surfaces: { "ai-chat": false } });
  const ev = evaluateLibraryCoverage(rag({ confidence: "none", passages: [], lesson: null }), config, "ai-chat");
  assertEquals(ev.needs_web, false);
});

Deno.test("research query carries curriculum scope", () => {
  const q = buildResearchQuery({ query: "اشرح الوضوء", scope: baseScope, subject: "الفقه", lesson: "الوضوء" });
  assert(q.includes("الفقه"));
  assert(q.includes("الصف الأول الثانوي"));
  assert(q.includes("الأزهر الشريف"));
});

Deno.test("web block wraps results as untrusted data with citations", () => {
  const ev = evaluateLibraryCoverage(rag({ confidence: "low", lesson: null, passages: [{ text: "ن".repeat(400), score: 0.4, book_id: "b1", book_title: "x" }] }), DEFAULT_WEB_RESEARCH_CONFIG, "ai-chat");
  const block = buildWebResearchBlock({
    ran: true, engine: "tavily", query: "q", cached: false, duration_ms: 10, error: null, digest: "ملخص",
    results: [{ title: "الوضوء", url: "https://dorar.net/x", domain: "dorar.net", snippet: "تعريف الوضوء" }],
  }, ev);
  assert(block.includes("UNTRUSTED_CONTEXT_START"));
  assert(block.includes("https://dorar.net/x"));
  assert(block.includes("[و1]"));
});

Deno.test("no web results yields explicit NOT_FOUND guidance", () => {
  const ev = evaluateLibraryCoverage(rag({ confidence: "none", passages: [], lesson: null, selected_book: null }), DEFAULT_WEB_RESEARCH_CONFIG, "ai-chat");
  const block = buildWebResearchBlock({ ran: true, engine: "model", query: "q", results: [], digest: null, cached: false, duration_ms: 5, error: null }, ev);
  assert(block.includes("WEB_RESULT = NOT_FOUND"));
});

Deno.test("fresh-info questions force hybrid even with strong library", async () => {
  const { evaluateLibraryCoverage: ev2 } = await import("./modrekWebResearch.ts");
  const ev = ev2(rag(), DEFAULT_WEB_RESEARCH_CONFIG, "ai-chat", "ما هو المحذوف من المنهج هذا العام؟");
  assertEquals(ev.decision, "hybrid");
  assertEquals(ev.needs_web, true);
  assertEquals(ev.needs_fresh, true);
});

Deno.test("law/date questions are flagged for cross-verification", () => {
  const ev = evaluateLibraryCoverage(rag(), DEFAULT_WEB_RESEARCH_CONFIG, "ai-chat", "اكتب قانون نيوتن الثاني");
  assertEquals(ev.needs_verification, true);
});

Deno.test("official domains rank above trusted educational ones", async () => {
  const { sourceTier } = await import("./modrekWebResearch.ts");
  const trusted = DEFAULT_WEB_RESEARCH_CONFIG.trusted_domains;
  assert(sourceTier("moe.gov.eg", trusted) > sourceTier("wikipedia.org", trusted));
  assert(sourceTier("wikipedia.org", trusted) > sourceTier("random-blog.net", trusted));
});

Deno.test("mandate forbids refusing when web sources exist", async () => {
  const { buildAnswerMandateBlock } = await import("./modrekWebResearch.ts");
  const ev = evaluateLibraryCoverage(rag({ confidence: "none", passages: [], lesson: null, selected_book: null }), DEFAULT_WEB_RESEARCH_CONFIG, "ai-chat", "الدرس الاول في الفقه");
  const block = buildAnswerMandateBlock(ev, {
    ran: true, engine: "tavily", query: "q", cached: false, duration_ms: 5, error: null, digest: null,
    results: [{ title: "t", url: "https://moe.gov.eg/x", domain: "moe.gov.eg", snippet: "s" }],
  } as any);
  assert(block.includes("ممنوع"));
  assert(!block.includes("توقف عن الإجابة"));
});

Deno.test("mandate still demands a real answer when web search returns nothing", async () => {
  const { buildAnswerMandateBlock } = await import("./modrekWebResearch.ts");
  const ev = evaluateLibraryCoverage(rag({ confidence: "none", passages: [], lesson: null, selected_book: null }), DEFAULT_WEB_RESEARCH_CONFIG, "ai-chat", "الدرس الاول في الفقه");
  const block = buildAnswerMandateBlock(ev, { ran: true, engine: "model", query: "q", cached: false, duration_ms: 5, error: null, digest: null, results: [] } as any);
  assert(block.includes("اشرح"));
});

Deno.test("exams and library surfaces are enabled by default", () => {
  assertEquals(DEFAULT_WEB_RESEARCH_CONFIG.surfaces["modrek-ai-exams"], true);
  assertEquals(DEFAULT_WEB_RESEARCH_CONFIG.surfaces["library-chat"], true);
  assertEquals(DEFAULT_WEB_RESEARCH_CONFIG.surfaces["library-explain"], true);
});

---
name: Intelligent Hybrid RAG + Web Research
description: Automatic decision engine that uses the Modrek library first and only falls back to trusted external web research when coverage is incomplete
type: feature
---

# Hybrid RAG + Web Research (Modrek AI)

Shared brain: `supabase/functions/_shared/modrekWebResearch.ts`.

## Decision rules (deterministic, no model call)
- `evaluateLibraryCoverage()` scores library retrieval 0..1 from real evidence:
  confidence level + passage count + retrieved text volume + top score,
  penalties for unresolved requested lesson, no matched book, tiny text, ambiguity.
- Decisions: `library_only` (coverage >= min_library_coverage), `hybrid`
  (partial), `web_only` (coverage <= web_only_below), `no_source`.
- Intent `list_books` NEVER goes to the web (platform data only).
- The student is never asked; the engine decides automatically.

## Web search engines
`engine: auto` → Tavily (`TAVILY_API_KEY`) → Serper (`SERPER_API_KEY`) →
active AI gateway model with the OpenRouter `web` plugin (default
`google/gemini-2.5-flash`, parses both JSON output and `url_citation`
annotations). Results filtered by trusted/blocked domains; trusted first.

## Safety
- Web results always pass through `wrapRetrievedContext` (untrusted data envelope).
- Prompt forbids attributing external facts to a library book/page and requires
  `[و1]`-style citations plus a "مصادر خارجية" links section.
- Library content always keeps priority in the prompt.

## Storage / settings / telemetry
- Settings: `platform_settings.key = 'web_research_config'` (JSON), edited in the
  developer AI settings page via `WebResearchSettings.tsx` (enable, thresholds,
  max results, cache TTL, engine, model, trusted/blocked domains, per-surface toggles).
- Cache: `modrek_search_cache` (`intent = 'web_research'`, TTL from settings).
- Logs: `modrek_search_logs` with `surface = '<surface>:web-research'`, trace holds
  coverage, decision, reasons, engine and URLs.

## Answer mandate (no refusal)
`buildAnswerMandateBlock()` is injected into every wired prompt: when search ran, the
assistant MUST answer (library first, then external sources with `[و1]` citations and a
"مصادر خارجية" section). When search returned nothing it may state unavailability in one
sentence only, then still teach from the official curriculum. Refusing to answer is an error.
`buildLibraryContextBlock(result, { researchActive })` drops the old
`LIBRARY_RESULT = NOT_FOUND` stop instruction while research is active.

## Freshness & verification
`needsFreshInfo(query)` forces hybrid + cache bypass for news/curriculum-change/schedule/date
questions even with high library coverage. `needsVerification(query)` flags laws, formulas,
rulings, numbers and dates for cross-source verification. `sourceTier()` ranks official
(gov/edu/moe/azhar) > trusted educational > other.

## Wired surfaces
All AI assistants: `ai-chat`, `modrek-ai-study`, `modrek-retrieve` (payload returns
`research` with `context_block`, `mandate_block`, `citations`, `needs_fresh`,
`needs_verification`), `modrek-reason` (teacher exam generator, consumes modrek-retrieve
research), `modrek-ai-exams`, `library-chat` (only when page/section context < 400 chars)
and `library-explain` (only when there is neither page text nor page image). All surfaces
are enabled by default and toggleable in the developer AI settings page.

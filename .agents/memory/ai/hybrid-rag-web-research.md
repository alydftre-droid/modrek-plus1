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

## Wired surfaces
`ai-chat`, `modrek-ai-study`, `modrek-retrieve` (returns a `research` object in its
payload). `modrek-ai-exams` is off by default (exams must stay curriculum-bound).

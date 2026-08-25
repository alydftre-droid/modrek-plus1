---
name: Answer Scope Engine (Intent -> Scope -> Length)
description: Deterministic Arabic intent detection that controls Modrek AI answer length and scope without changing persona, RAG, or web research
type: feature
---

# Answer Scope Engine

Shared module: `supabase/functions/_shared/answerScope.ts`.

- `detectAnswerIntent(content)` → deterministic Arabic regex intent:
  FACT_LOOKUP, DEFINITION, SHORT_ANSWER, DIRECT_QUESTION, PROBLEM_SOLVING, MCQ,
  IMAGE_QUESTION, EXPLANATION, FULL_LESSON, SUMMARY, PRACTICE, EXAM, COMPARISON,
  REVIEW, AMBIGUOUS. No model call.
- `resolveAnswerScopeFromMessages(messages)` uses the last user turn (text parts +
  image detection).
- `buildAnswerScopeBlock(scope)` injects the mandatory scope/length rules:
  short intents forbid auto-expansion (no full lesson, extra drills, exam
  questions, closing summary blocks) and allow ONE short progressive-disclosure
  offer; expansive intents (EXPLANATION, FULL_LESSON, PRACTICE, EXAM, REVIEW)
  keep the full teaching style.
- `buildTeacherEnginePrompt(extra, { concise })` in `_shared/teacherEngine.ts`
  swaps in `TEACHER_METHOD_CONCISE` + `TEACHER_FORMAT_CONCISE` (same KaTeX /
  cards / Mermaid rules, no fixed closing sections) for non-expansive intents.

Wired surfaces: `ai-chat` (student branch only — admin and lesson-studio JSON
modes untouched) and `modrek-ai-study`. RAG, hybrid web research, safety, and
persona are unchanged.

Also wired: `modrek-ai-exams` (exam generation stays inside the requested
lesson/scope, `explanation` fields kept to 1-2 lines), `library-explain`
(page/vision path — a student question answers that question only; no question
still gives the full page explanation), `library-analyze-region`, `library-chat`.

Image paths use `resolveAnswerScope(text, { hasImage: true })`. Intents:
`IMAGE_QUESTION` (extract and answer only the asked question, never the other
questions on the sheet) and `IMAGE_EXAM_FULL` (only when the student asks for all
questions / the whole exam). An attached image outranks generic exam wording.

Tests: `supabase/functions/_shared/answerScope_test.ts` (19 tests).

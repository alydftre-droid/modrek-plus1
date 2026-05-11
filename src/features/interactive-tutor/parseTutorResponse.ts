import type { StructuredTutorResponse } from "./types";

/**
 * Robustly extract structured tutor data from an AI response.
 * Supports:
 *  - Plain text (returned as narration only).
 *  - JSON-only response.
 *  - Markdown with a ```json ... ``` fenced block.
 *  - Trailing/leading natural language around a JSON block.
 */
export function parseTutorResponse(raw: string): StructuredTutorResponse {
  if (!raw || typeof raw !== "string") {
    return { narration: "" };
  }

  // 1. Try fenced ```json block
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/);
  const candidates: string[] = [];
  if (fenced && fenced[1]) candidates.push(fenced[1].trim());

  // 2. Try whole string as JSON
  candidates.push(raw.trim());

  // 3. Try first {...} block heuristic
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(raw.slice(firstBrace, lastBrace + 1));
  }

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === "object" && typeof parsed.narration === "string") {
        return {
          narration: String(parsed.narration || ""),
          annotations: Array.isArray(parsed.annotations) ? parsed.annotations : undefined,
          mode: parsed.mode === "whiteboard" ? "whiteboard" : "page",
          whiteboard:
            parsed.whiteboard && Array.isArray(parsed.whiteboard.steps)
              ? { title: parsed.whiteboard.title, steps: parsed.whiteboard.steps }
              : undefined,
        };
      }
    } catch {
      // continue
    }
  }

  // Fallback: treat whole text as narration
  // Strip any leftover code fences so they aren't read aloud.
  const cleaned = raw
    .replace(/```json[\s\S]*?```/gi, "")
    .replace(/```[\s\S]*?```/g, "")
    .trim();
  return { narration: cleaned || raw };
}

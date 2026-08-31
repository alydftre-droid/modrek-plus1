// ============================================================================
// Modrek Plus — Lesson answer post-processing
// ----------------------------------------------------------------------------
// Two jobs, both about the QUALITY of long lesson explanations:
//   1. Repetition cleanup: reasoning models that continue a long answer often
//      repeat a heading, a paragraph or a whole solved example. We drop exact
//      duplicated blocks while keeping legitimate short lines (list bullets,
//      table rows, math delimiters).
//   2. Truncation detection: tells the caller whether the answer was cut in the
//      middle of the lesson so it can ask the model to continue.
// ============================================================================

const KEEP_SHORT = /^(\s*[-*+]\s|\s*\d+[.)]\s|\||\$\$|```|#{1,6}\s*$)/;

function normalizeBlock(block: string): string {
  return block
    .replace(/\s+/g, " ")
    .replace(/[\u064B-\u0652\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .trim()
    .toLowerCase();
}

/**
 * Remove repeated paragraphs/blocks from a long answer.
 * Fenced code blocks (```mermaid / ```svg) are treated as single units and
 * deduplicated too, so the same diagram is never drawn twice.
 */
export function dedupeRepeatedBlocks(text: string): string {
  if (!text) return text;
  const lines = text.split("\n");
  const blocks: string[] = [];
  let buffer: string[] = [];
  let fence: string | null = null;

  const flush = () => {
    if (buffer.length) blocks.push(buffer.join("\n"));
    buffer = [];
  };

  for (const line of lines) {
    const fenceMatch = /^\s*```/.test(line);
    if (fenceMatch && !fence) {
      flush();
      fence = "open";
      buffer.push(line);
      continue;
    }
    if (fence) {
      buffer.push(line);
      if (fenceMatch) {
        fence = null;
        flush();
      }
      continue;
    }
    if (!line.trim()) {
      flush();
      blocks.push("");
      continue;
    }
    buffer.push(line);
  }
  if (fence) flush();
  flush();

  const seen = new Set<string>();
  const out: string[] = [];
  for (const block of blocks) {
    if (!block.trim()) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }
    const key = normalizeBlock(block);
    const isShortStructural = key.length < 40 && KEEP_SHORT.test(block) && !block.trim().startsWith("```");
    if (!isShortStructural && seen.has(key)) continue;
    seen.add(key);
    out.push(block);
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** True when the model stopped because it ran out of output budget. */
export function isTruncated(choice: any): boolean {
  const reason = String(choice?.finish_reason ?? choice?.native_finish_reason ?? "").toLowerCase();
  return reason === "length" || reason === "max_tokens";
}

/** Continuation instruction that keeps the lesson going without repeating. */
export const CONTINUE_INSTRUCTION =
  "أكمل الشرح من النقطة التي توقفت عندها بالحرف، بدون أي مقدمة وبدون إعادة أي جزء كتبته قبل ذلك، وبدون تكرار العناوين السابقة. لو الشرح انتهى فعلًا فاكتب الأقسام الختامية فقط.";

/** Joins a continuation chunk to the previous text without duplicated overlap. */
export function stitchContinuation(previous: string, next: string): string {
  const cleanNext = next.replace(/^\s*(تكملة|استكمال|نكمل)[^\n]*\n/, "").trimStart();
  const tail = previous.slice(-400);
  // Find the longest overlap between the tail of `previous` and head of `next`.
  for (let len = Math.min(300, tail.length, cleanNext.length); len > 40; len--) {
    if (tail.endsWith(cleanNext.slice(0, len))) {
      return previous + cleanNext.slice(len);
    }
  }
  return `${previous}\n${cleanNext}`;
}

// ---------------------------------------------------------------------------
// Automatic lesson diagram
// ---------------------------------------------------------------------------

export interface LessonDiagram {
  format: "mermaid" | "svg";
  code: string;
  title: string;
}

export const LESSON_DIAGRAM_SYSTEM = `أنت مُصمّم رسوم تعليمية داخل منصة مدرك بلس.
مهمتك: توليد رسم توضيحي واحد فقط يلخّص الدرس الذي تم شرحه، ليعرض في بطاقة مستقلة تحت الشرح.

القواعد الإلزامية:
- أخرج JSON فقط بهذا الشكل بدون أي نص إضافي وبدون أسوار كود:
  {"title":"عنوان الرسم بالعربية","format":"mermaid","code":"..."}
- استخدم "mermaid" للخرائط الذهنية والمخططات والمقارنات وخطوات الحل (مثل: graph TD أو mindmap أو flowchart LR).
- استخدم "svg" فقط للرسوم الهندسية/البيانية الحقيقية (مثلث، دائرة، زوايا، محاور، متجهات، دائرة كهربية)، وابدأ الكود بـ <svg viewBox="0 0 360 240"> وبدون أي سكربت.
- النصوص داخل الرسم بالعربية وقصيرة (كلمتان إلى أربع كلمات لكل عقدة).
- في mermaid: ضع كل نص عقدة بين علامتي تنصيص مزدوجة داخل الأقواس مثل A["المتغير"]، ولا تستخدم أقواسًا أو رموزًا رياضية أو LaTeX أو إيموجي داخل النصوص.
- من 6 إلى 14 عقدة كحد أقصى، ويجب أن يكون الرسم صحيح البنية ويعمل من أول محاولة.
- الرسم يجب أن يعكس محتوى الدرس المعروض فقط، لا معلومات من خارجه.`;

/** Extract the diagram JSON out of a model reply, tolerating code fences. */
export function parseLessonDiagram(raw: string): LessonDiagram | null {
  if (!raw) return null;
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    const format = parsed?.format === "svg" ? "svg" : "mermaid";
    const code = String(parsed?.code ?? "").trim();
    if (!code || code.length > 6000) return null;
    if (format === "svg" && !/^<svg[\s>]/i.test(code)) return null;
    if (/<script|javascript:/i.test(code)) return null;
    return {
      format,
      code,
      title: String(parsed?.title ?? "رسم توضيحي للدرس").slice(0, 120),
    };
  } catch {
    return null;
  }
}

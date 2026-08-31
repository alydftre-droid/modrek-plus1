import { describe, expect, it } from "vitest";
import {
  dedupeRepeatedBlocks,
  isTruncated,
  stitchContinuation,
  parseLessonDiagram,
} from "../../supabase/functions/_shared/lessonAnswerPostProcess";

describe("dedupeRepeatedBlocks", () => {
  it("removes repeated paragraphs and diagrams", () => {
    const text = [
      "## الدرس الأول",
      "",
      "هذه فكرة الدرس الأساسية التي نشرحها للطالب بالتفصيل الكامل.",
      "",
      "هذه فكرة الدرس الأساسية التي نشرحها للطالب بالتفصيل الكامل.",
      "",
      "```mermaid",
      "graph TD",
      "```",
      "",
      "```mermaid",
      "graph TD",
      "```",
    ].join("\n");
    const out = dedupeRepeatedBlocks(text);
    expect(out.match(/فكرة الدرس/g)?.length).toBe(1);
    expect(out.match(/graph TD/g)?.length).toBe(1);
  });

  it("keeps legitimate repeated short list markers", () => {
    const text = "- ١\n- ١\n- ٢";
    expect(dedupeRepeatedBlocks(text).split("\n").length).toBe(3);
  });
});

describe("isTruncated", () => {
  it("detects length finish reasons", () => {
    expect(isTruncated({ finish_reason: "length" })).toBe(true);
    expect(isTruncated({ finish_reason: "stop" })).toBe(false);
    expect(isTruncated(undefined)).toBe(false);
  });
});

describe("stitchContinuation", () => {
  it("drops overlapping text between chunks", () => {
    const prev = "نبدأ الشرح بخطوة أولى واضحة جدا ثم ننتقل لخطوة ثانية مهمة للطالب داخل الفصل";
    const overlap = prev.slice(-60);
    const out = stitchContinuation(prev, `${overlap} وبعدها الخطوة الثالثة`);
    expect(out).toBe(`${prev} وبعدها الخطوة الثالثة`);
  });

  it("joins non overlapping chunks with a newline", () => {
    expect(stitchContinuation("أول", "ثانٍ")).toBe("أول\nثانٍ");
  });
});

describe("parseLessonDiagram", () => {
  it("parses fenced json output", () => {
    const d = parseLessonDiagram('```json\n{"title":"خريطة","format":"mermaid","code":"graph TD\\nA[\\"س\\"]-->B[\\"ص\\"]"}\n```');
    expect(d?.format).toBe("mermaid");
    expect(d?.title).toBe("خريطة");
  });

  it("rejects scripted svg and bad svg", () => {
    expect(parseLessonDiagram('{"format":"svg","code":"<svg><script>x</script></svg>"}')).toBeNull();
    expect(parseLessonDiagram('{"format":"svg","code":"not svg"}')).toBeNull();
  });

  it("returns null for garbage", () => {
    expect(parseLessonDiagram("لا يوجد رسم")).toBeNull();
  });
});

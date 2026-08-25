import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { detectAnswerIntent, resolveAnswerScope, buildAnswerScopeBlock } from "./answerScope.ts";

const cases: Array<[string, unknown, string]> = [
  ["A", "ما اسم الدرس الأول في الصرف؟", "FACT_LOOKUP"],
  ["B", "ما تعريف المفعول المطلق؟", "DEFINITION"],
  ["C", "ما عاصمة مصر؟", "DIRECT_QUESTION"],
  ["D", "حل 2x + 5 = 15.", "PROBLEM_SOLVING"],
  ["E", "اشرح لي طريقة حل المسألة", "EXPLANATION"],
  ["F", "اشرح لي الدرس الأول في الصرف بالتفصيل", "FULL_LESSON"],
  ["G", "لخص الدرس الأول", "SUMMARY"],
  ["H", "اعمل لي 10 أسئلة على الدرس", "PRACTICE"],
  ["I", [{ type: "text", text: "حل السؤال الثاني بس" }, { type: "image_url", image_url: { url: "x" } }], "IMAGE_QUESTION"],
  ["exam", "اعمل لي امتحان على الدرس", "EXAM"],
  ["review", "راجع لي الدرس الأول", "REVIEW"],
  ["why", "ليه الإجابة دي صح؟", "SHORT_ANSWER"],
  ["ambiguous", "اشرح لي الصرف", "AMBIGUOUS"],
  ["image_all", [{ type: "text", text: "حل الامتحان كامل من الصورة" }, { type: "image_url", image_url: { url: "x" } }], "IMAGE_EXAM_FULL"],
  ["compare", "قارن بين النكرة والمعرفة", "COMPARISON"],
];

for (const [name, input, expected] of cases) {
  Deno.test(`answerScope intent ${name}`, () => {
    assertEquals(detectAnswerIntent(input), expected);
  });
}

Deno.test("short intents are non-expansive, teaching intents are expansive", () => {
  assertEquals(resolveAnswerScope("ما عاصمة مصر؟").expansive, false);
  assertEquals(resolveAnswerScope("اشرح لي الدرس الأول بالتفصيل").expansive, true);
});

Deno.test("scope block forbids auto-expansion only for short answers", () => {
  const short = buildAnswerScopeBlock(resolveAnswerScope("ما تعريف المفعول المطلق؟"));
  assert(short.includes("Progressive Disclosure"));
  assert(short.includes("ممنوع تلقائيًا"));
  const long = buildAnswerScopeBlock(resolveAnswerScope("اشرح لي الدرس الأول بالتفصيل"));
  assert(long.includes("الأسلوب التعليمي الكامل"));
  assert(!long.includes("Progressive Disclosure"));
});

Deno.test("out-of-band images are treated as image questions", () => {
  const scope = resolveAnswerScope("حل السؤال الثالث فقط", { hasImage: true });
  assertEquals(scope.intent, "IMAGE_QUESTION");
  assertEquals(scope.expansive, false);
  assert(buildAnswerScopeBlock(scope).includes("ممنوع حل أسئلة أخرى"));
});

Deno.test("full-image exam solving stays expansive", () => {
  const scope = resolveAnswerScope("حل كل الأسئلة في الصورة", { hasImage: true });
  assertEquals(scope.intent, "IMAGE_EXAM_FULL");
  assertEquals(scope.expansive, true);
});

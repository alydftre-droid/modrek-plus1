import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const { essays } = await req.json();
    // essays: Array<{ index: number, question: string, studentAnswer: string, modelAnswer: string, maxPoints: number }>

    if (!essays || !Array.isArray(essays) || essays.length === 0) {
      return new Response(JSON.stringify({ scores: {}, feedback: {} }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = essays.map((e: any, i: number) => `
سؤال ${i + 1}: ${e.question}
الإجابة النموذجية: ${e.modelAnswer}
إجابة الطالب: ${e.studentAnswer}
الدرجة القصوى: ${e.maxPoints}
`).join("\n---\n");

    const tools = [
      {
        type: "function",
        function: {
          name: "grade_essays",
          description: "Grade essay answers and provide feedback",
          parameters: {
            type: "object",
            properties: {
              results: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    index: { type: "number" },
                    score: { type: "number" },
                    feedback: { type: "string" },
                  },
                  required: ["index", "score", "feedback"],
                  additionalProperties: false,
                },
              },
            },
            required: ["results"],
            additionalProperties: false,
          },
        },
      },
    ];

    const modelsToTry = ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-flash-latest"];
    let response: Response | null = null;
    for (const model of modelsToTry) {
      response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "أنت مصحح امتحانات محترف. قيّم إجابات الطلاب المقالية وأعطِ درجة وتعليق مختصر بالعربية." },
            { role: "user", content: prompt },
          ],
          tools,
          tool_choice: { type: "function", function: { name: "grade_essays" } },
        }),
      });
      if (response.ok) break;
      const errText = await response.text();
      console.error("Gemini error:", model, response.status, errText);
      if (response.status === 401 || response.status === 403 || response.status === 402) {
        return new Response(JSON.stringify({ error: "تحقق من مفتاح GEMINI_API_KEY" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 429 || response.status === 502 || response.status === 503) continue;
      break;
    }

    if (!response || !response.ok) {
      const status = response?.status === 429 ? 429 : 502;
      return new Response(JSON.stringify({ error: status === 429 ? "تم تجاوز الحد، حاول بعد دقيقة" : "خدمة الذكاء الاصطناعي غير متاحة مؤقتاً" }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    const scores: Record<string, number> = {};
    const feedback: Record<string, string> = {};

    if (toolCall) {
      const parsed = JSON.parse(toolCall.function.arguments);
      (parsed.results || []).forEach((r: any) => {
        const essayItem = essays[r.index] || essays.find((e: any) => e.index === r.index);
        const key = String(essayItem?.index ?? r.index);
        scores[key] = Math.min(r.score, essayItem?.maxPoints || r.score);
        feedback[key] = r.feedback;
      });
    }

    return new Response(JSON.stringify({ scores, feedback }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("grade-essay error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "حدث خطأ" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

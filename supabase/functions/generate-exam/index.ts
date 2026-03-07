import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { subjectName, lessonTitle, lessonText, questionCount = 10, difficulty = "متوسط" } = await req.json();

    const prompt = `أنت مساعد متخصص في إنشاء امتحانات تعليمية باللغة العربية.

أنشئ امتحان في مادة: ${subjectName}
الدرس: ${lessonTitle || subjectName}
${lessonText ? `نص الدرس:\n${lessonText}\n` : ""}
عدد الأسئلة: ${questionCount}
مستوى الصعوبة: ${difficulty}

الشروط:
- أنواع الأسئلة المطلوبة: اختيار من متعدد (mcq)، صح وخطأ (true_false)، ومقالي (essay)
- وزع الأسئلة بين الأنواع الثلاثة بشكل متوازن
- أسئلة الاختيار من متعدد: 4 خيارات لكل سؤال
- أسئلة صح وخطأ: خياران فقط "صح" و "خطأ"
- الأسئلة المقالية: بدون خيارات، ضع نموذج إجابة في model_answer
- لكل سؤال حدد نقاط (points) من 1 إلى 5 حسب الصعوبة
- أرجع النتيجة بصيغة JSON فقط بدون أي نص إضافي`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "أنت مولد امتحانات احترافي. أرجع JSON فقط." },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_exam_questions",
              description: "Generate structured exam questions",
              parameters: {
                type: "object",
                properties: {
                  questions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        question: { type: "string" },
                        type: { type: "string", enum: ["mcq", "true_false", "essay"] },
                        options: { type: "array", items: { type: "string" } },
                        correct_answer: { type: "string" },
                        model_answer: { type: "string" },
                        points: { type: "number" },
                      },
                      required: ["question", "type", "points"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["questions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_exam_questions" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "تم تجاوز الحد المسموح، حاول لاحقاً" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      // Fallback: try to parse content directly
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        try {
          const parsed = JSON.parse(content.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
          return new Response(JSON.stringify(parsed), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch {
          throw new Error("Could not parse AI response");
        }
      }
      throw new Error("No valid response from AI");
    }

    const questions = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(questions), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-exam error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "حدث خطأ" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

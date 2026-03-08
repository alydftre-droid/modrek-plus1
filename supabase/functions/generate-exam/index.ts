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

    const {
      subjectName, lessonTitle, lessonText, questionCount = 10,
      difficulty = "متوسط", mcqCount, tfCount, essayCount,
      imageBase64, // NEW: base64 encoded image for OCR exam extraction
    } = await req.json();

    const mcq = mcqCount ?? Math.ceil(questionCount * 0.5);
    const tf = tfCount ?? Math.ceil(questionCount * 0.3);
    const essay = essayCount ?? Math.max(1, questionCount - mcq - tf);

    // Build messages based on whether we have an image or text
    const messages: any[] = [
      { role: "system", content: "أنت خبير تعليمي متخصص في إنشاء امتحانات تعليمية باللغة العربية. أرجع JSON فقط." },
    ];

    if (imageBase64) {
      // Image-based exam extraction (OCR mode)
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: `انظر إلى صورة الامتحان المرفقة واستخرج جميع الأسئلة منها بدقة.

صنف كل سؤال حسب نوعه:
- أسئلة الاختيار من متعدد (mcq) مع 4 خيارات
- أسئلة صح وخطأ (true_false) مع خيارين "صح" و "خطأ"  
- أسئلة مقالية (essay) بدون خيارات

لكل سؤال:
- اكتب نص السؤال بالضبط كما في الصورة
- حدد الإجابة الصحيحة (correct_answer) إذا كانت واضحة، وإلا اقترح الإجابة الأنسب
- للأسئلة المقالية أضف نموذج إجابة شامل (model_answer)
- حدد نقاط لكل سؤال (points) من 1-5

المادة: ${subjectName || "غير محدد"}
${lessonTitle ? `الدرس: ${lessonTitle}` : ""}

مهم جداً: استخرج الأسئلة بالضبط كما هي في الصورة ولا تضف أسئلة من عندك.`,
          },
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
          },
        ],
      });
    } else {
      // Text-based generation
      const prompt = `أنت خبير تعليمي متخصص في إنشاء امتحانات تعليمية باللغة العربية.

أنشئ امتحان في مادة: ${subjectName}
الدرس: ${lessonTitle || subjectName}
${lessonText ? `نص الدرس أو الوصف:\n${lessonText}\n` : ""}

المطلوب:
- ${mcq} سؤال اختيار من متعدد (mcq) بـ 4 خيارات لكل سؤال
- ${tf} سؤال صح وخطأ (true_false) بخيارين "صح" و "خطأ"
- ${essay} سؤال مقالي (essay) بدون خيارات مع نموذج إجابة شامل

مستوى الصعوبة: ${difficulty}

تعليمات مهمة:
- رتب الأسئلة: اختياري أولاً ثم صح وخطأ ثم مقالي
- الأسئلة يجب أن تكون واضحة ودقيقة ومن المنهج
- نموذج الإجابة للمقالي يجب أن يكون شاملاً ويقبل إجابات بنفس المعنى
- حدد نقاط لكل سؤال (1-5) حسب الصعوبة`;

      messages.push({ role: "user", content: prompt });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: imageBase64 ? "google/gemini-2.5-flash" : "google/gemini-2.5-flash",
        messages,
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
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "يرجى تجديد رصيد الاستخدام" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
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

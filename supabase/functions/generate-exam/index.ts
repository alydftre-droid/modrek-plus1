import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { loadAiSettings, callGeminiWithFallback, errorResponseFromStatus } from "../_shared/aiSettings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Missing GEMINI_API_KEY is non-fatal: callGeminiWithFallback will fall back to Lovable AI Gateway.
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

    let parsedBody: any;
    try {
      parsedBody = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "صيغة الطلب غير صالحة" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const {
      subjectName, lessonTitle, lessonText, questionCount = 10,
      difficulty = "متوسط", mcqCount, tfCount, essayCount,
      imageBase64, fileBase64, fileMimeType, fileName,
    } = parsedBody;

    const mcq = mcqCount ?? Math.ceil(questionCount * 0.5);
    const tf = tfCount ?? Math.ceil(questionCount * 0.3);
    const essay = essayCount ?? Math.max(1, questionCount - mcq - tf);

    // Build messages based on whether we have an image or text
    const messages: any[] = [
      { role: "system", content: "أنت خبير تعليمي متخصص في إنشاء امتحانات تعليمية باللغة العربية. أرجع JSON فقط." },
    ];

    const attachedBase64 = imageBase64 || fileBase64;
    const attachedMimeType = fileMimeType || (imageBase64 ? "image/jpeg" : "");

    if (attachedBase64) {
      const isPdf = attachedMimeType.includes("pdf") || String(fileName || "").toLowerCase().endsWith(".pdf");
      const fileBlock = isPdf
        ? { type: "file", file: { filename: fileName || "content.pdf", file_data: `data:application/pdf;base64,${attachedBase64}` } }
        : { type: "image_url", image_url: { url: `data:${attachedMimeType || "image/jpeg"};base64,${attachedBase64}` } };

      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: `حلل المحتوى المرفق بدقة واستخرج منه امتحاناً منظماً. إذا كان المرفق صورة فاقرأ النصوص منها، وإذا كان PDF فاستخرج أسئلته أو حول محتواه لأسئلة.

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
${lessonText ? `طلب المعلم الإضافي:\n${lessonText}` : ""}

مهم جداً: التزم بطلب المعلم، واستخرج الأسئلة من المحتوى المرفق أو أنشئ أسئلة دقيقة من نفس المحتوى فقط.`,
          },
          fileBlock,
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

    const tools = [
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
    ];

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseServiceKey);
    const settings = await loadAiSettings(sb, "generate-exam");

    const result = await callGeminiWithFallback({
      apiKey: GEMINI_API_KEY,
      models: settings.models_to_try,
      body: { messages, tools, tool_choice: { type: "function", function: { name: "generate_exam_questions" } } },
      fallbackDelayMs: settings.fallback_delay_ms,
    });

    if (!result.ok) return errorResponseFromStatus(result.status, corsHeaders);
    const response = result.response;

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
      JSON.stringify({ error: error instanceof Error ? error.message : "حدث خطأ" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

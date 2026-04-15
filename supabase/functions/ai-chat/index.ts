import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ChatMsg = { role: "user" | "assistant" | "system"; content: unknown };

function normalizeTextContent(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) return String((part as { text?: string }).text || "");
        return "";
      })
      .join("\n")
      .trim();
  }
  return String(content ?? "");
}

function stageLabel(stage?: string | null) {
  if (stage === "preparatory") return "المرحلة الإعدادية الأزهرية";
  if (stage === "secondary") return "المرحلة الثانوية الأزهرية";
  return undefined;
}

function gradeLabel(grade?: string | null) {
  if (grade === "first") return "الصف الأول";
  if (grade === "second") return "الصف الثاني";
  if (grade === "third") return "الصف الثالث";
  return undefined;
}

function sectionLabel(section?: string | null) {
  if (section === "scientific") return "علمي";
  if (section === "literary") return "أدبي";
  return undefined;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const messages = (body?.messages ?? []) as ChatMsg[];
    const subjectName = (body?.subjectName ?? "") as string;
    const subSubjectName = (body?.subSubjectName ?? null) as string | null;
    const allSubSubjects = (body?.allSubSubjects ?? []) as string[];
    const subjectId = (body?.subjectId ?? "") as string;
    const stage = body?.stage as string | undefined;
    const grade = body?.grade as string | undefined;
    const section = (body?.section ?? null) as string | null;
    const educationType = (body?.educationType ?? null) as string | null;
    const isAdmin = (body?.isAdmin ?? false) as boolean;
    const isLessonStudio = (body?.isLessonStudio ?? false) as boolean;
    
    // Lesson studio context
    const lessonTitle = (body?.lessonTitle ?? null) as string | null;
    const _lessonDescription = (body?.lessonDescription ?? null) as string | null;
    const pageNumber = body?.pageNumber as number | null;
    const pageTitle = (body?.pageTitle ?? null) as string | null;
    const pageNotes = (body?.pageNotes ?? null) as string | null;
    const pageImageUrl = (body?.pageImageUrl ?? null) as string | null;

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "الرسائل غير صالحة" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    
    let adminInstructions: string[] = [];
    let aiSourcesInfo = "";
    
    if (subjectId && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      const { data: instructions } = await supabase
        .from("ai_admin_instructions")
        .select("instruction")
        .eq("subject_id", subjectId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      
      if (instructions && instructions.length > 0) {
        adminInstructions = instructions.map((i: any) => i.instruction);
      }
      
      const { data: sources } = await supabase
        .from("ai_sources")
        .select("file_name, file_url")
        .eq("subject_id", subjectId);
      
      if (sources && sources.length > 0) {
        const bookNames = sources.map((s: any) => s.file_name).join("، ");
        aiSourcesInfo = `\n\n📚 كتب المنهج المرفوعة للمادة (يجب الاعتماد عليها في الإجابة):\n${sources.map((s: any) => `- ${s.file_name}`).join("\n")}\n\nأنت حافظ لمحتوى هذه الكتب: ${bookNames}. استخدم معلوماتها أولاً عند الإجابة على أسئلة الطلاب. أرجع للكتاب المحدد عند الاستشهاد.`;
      }
    }

    const metaParts: string[] = [];
    if (subSubjectName) metaParts.push(`القسم الفرعي: ${subSubjectName}`);
    else if (subjectName) metaParts.push(`المادة: ${subjectName}`);
    if (subjectName && subSubjectName) metaParts.push(`المادة الرئيسية: ${subjectName}`);
    const s = stageLabel(stage);
    const g = gradeLabel(grade);
    const sec = sectionLabel(section);
    if (s) metaParts.push(`المرحلة: ${s}`);
    if (g) metaParts.push(`الصف: ${g}`);
    if (sec) metaParts.push(`الشعبة: ${sec}`);
    if (educationType) metaParts.push(`نوع التعليم: ${educationType === "أزهر" ? "تعليم أزهري" : "تعليم عام"}`);

    let adminInstructionsSection = "";
    if (adminInstructions.length > 0) {
      adminInstructionsSection = `\n\nتعليمات خاصة من المطور (يجب اتباعها دائماً):\n${adminInstructions.map((inst, i) => `${i + 1}. ${inst}`).join("\n")}`;
    }

    // Build lesson studio context
    let lessonStudioContext = "";
    if (isLessonStudio) {
      lessonStudioContext = `\n\n=== سياق الصفحة الحالية ===`;
      if (lessonTitle) lessonStudioContext += `\nعنوان الدرس: ${lessonTitle}`;
      if (pageNumber) lessonStudioContext += `\nرقم الصفحة: ${pageNumber}`;
      if (pageTitle) lessonStudioContext += `\nعنوان الصفحة: ${pageTitle}`;
      if (pageNotes) lessonStudioContext += `\nملاحظات المعلم: ${pageNotes}`;
    }

    let systemPrompt: string;
    
    if (isAdmin) {
      systemPrompt = `أنت مساعد ذكي لمنصة "مدرك Plus" التعليمية - وضع المطور/الأدمن.
${metaParts.length ? metaParts.join("\n") : ""}
${aiSourcesInfo}
${adminInstructionsSection}

أنت الآن تتحدث مع المطور/الأدمن وليس طالباً.

قدراتك مع المطور:
1. يمكن للمطور إعطائك تعليمات وأوامر لتتبعها مع الطلاب
2. يمكنه تحديد إجابات معينة لأسئلة معينة
3. يمكنه إخبارك بمعلومات إضافية لتستخدمها
4. يمكنك مساعدته في إدارة المحتوى والإجابة على استفساراته

عندما يعطيك المطور تعليمات مثل:
- "عندما يسألك طالب عن X أجب Y" 
- "استخدم هذه المعلومة: ..."
- "لا تجب على أسئلة عن ..."

أخبره أنك فهمت التعليمات وستتبعها.

قواعد:
- تحدث بأسلوب احترافي مع المطور
- ساعده في أي استفسار عن المنصة أو المحتوى
- أجب باللغة العربية الفصحى
`;
    } else if (isLessonStudio) {
      systemPrompt = `أنت معلم أزهري خبير ومتمرس، حافظ ودارس لجميع كتب المنهج الأزهري الرسمي (${new Date().getFullYear()}-${new Date().getFullYear() + 1}) بما فيها كتب الوزارة وكتب سلاح الأزهر وكتب الامتحانات. أنت تعرف كل درس وكل سؤال وكل مسألة.
${metaParts.length ? metaParts.join("\n") : ""}
${adminInstructionsSection}
${lessonStudioContext}

🎯 أسلوبك في الشرح (مثل معلم حقيقي في الفصل):
1. ابدأ بشرح محتوى الصفحة مباشرة بدون مقدمات.
2. اشرح كل نقطة بالتفصيل مع أمثلة توضيحية تبسّط الفكرة.
3. بعد شرح كل نقطة مهمة، قل: "⚡ دي نقطة مهمة جداً - احفظها كويس!"
4. اذكر الأسئلة التي تأتي في الامتحانات على هذا الجزء، مثلاً: "📝 السؤال ده جه في امتحان 2024 بالظبط!"
5. قدّم أسئلة تدريبية: "يلا نشوف لو جالك السؤال ده في الامتحان: علل / اذكر / قارن..."
6. أعطِ ملخصات سريعة: "📌 خلاصة النقطة دي في سطرين..."
7. نبّه الطالب على الأخطاء الشائعة: "⚠️ كتير من الطلاب بيغلطوا هنا..."
8. اربط المعلومة بحياة الطالب أو بأمثلة واقعية لتثبيت الفهم.

📚 معرفتك بالمنهج:
- أنت حافظ جميع كتب المنهج الأزهري: الكتاب المدرسي، سلاح الأزهر، كتب الامتحانات.
- إذا رأيت صفحة من كتاب، تعرف فوراً هذا من أي كتاب وأي درس.
- تستطيع حل أي مسألة أو سؤال بدقة 100% من الكتب الدراسية.
- عند شرح صفحة: اشرح ما فيها + أضف معلومات مكملة من باقي المنهج.

⚠️ قواعد:
- تحدث بلغة بسيطة وواضحة مثل معلم في الفصل.
- لا تقدم نفسك ولا تقل "أهلاً" إلا في أول رسالة.
- لا تقرأ علامات الترقيم. اشرح بأسلوب سردي طبيعي.
- لا تشرح أكثر من صفحة واحدة في المرة.
- إذا سأل الطالب سؤالاً خارج الصفحة، أجب من معرفتك بالمنهج بدقة.
- السنة الدراسية: ${new Date().getFullYear()}-${new Date().getFullYear() + 1}.
${s ? `- الطالب في ${s}.` : ""}
${g ? `- ${g}.` : ""}
${sec ? `- الشعبة: ${sec}.` : ""}
${subSubjectName ? `- القسم: "${subSubjectName}" فقط.` : ""}
`;
    } else {
      const eduLabel = educationType === "أزهر" ? "الأزهري" : educationType === "عام" ? "العام" : "الأزهري";
      systemPrompt = `أنت معلم ${eduLabel === "الأزهري" ? "أزهري" : ""} خبير ومساعد ذكي لمنصة "مدرك Plus" التعليمية. أنت حافظ ودارس لجميع كتب المنهج ${eduLabel} الرسمي (${new Date().getFullYear()}-${new Date().getFullYear() + 1}) بما فيها الكتاب المدرسي ${eduLabel === "الأزهري" ? "وسلاح الأزهر" : ""} وكتب الامتحانات والاختبارات لجميع الصفوف (أولى وتانية وتالتة إعدادي، وأولى وتانية وتالتة ثانوي علمي وأدبي).
${metaParts.length ? metaParts.join("\n") : ""}
${aiSourcesInfo}
${adminInstructionsSection}
${allSubSubjects.length > 0 ? `\nالأقسام الفرعية المتاحة في هذه المادة: ${allSubSubjects.join("، ")}` : ""}

📚 قدراتك:
- أنت تعرف كل درس وكل سؤال وكل مسألة في المنهج الأزهري.
- تحل أي مسألة وأي سؤال بدقة 100% وتشرح خطوات الحل بالتفصيل.
- إجاباتك موثوقة من الكتب الدراسية الرسمية.
- تعطي أمثلة توضيحية وملخصات مفيدة.
- تنبّه الطالب على النقاط المهمة: "⚡ دي نقطة مهمة - احفظها!"
- تذكر أسئلة الامتحانات السابقة: "📝 السؤال ده جه في امتحان 2024"
- تعطي تدريبات: "يلا نشوف لو جالك: علل / اذكر / قارن..."
- تنبّه على الأخطاء الشائعة: "⚠️ كتير من الطلاب بيغلطوا هنا"

🎯 أسلوبك:
- اشرح مثل معلم حقيقي فاهم المنهج - بسّط وأعطِ أمثلة.
- بعد الشرح أعطِ ملخص وأسئلة تدريبية.
${subSubjectName ? `- ⚠️ أنت الآن داخل قسم "${subSubjectName}" تحديداً. ركّز إجاباتك على "${subSubjectName}" فقط.` : ""}
${s ? `- الطالب في ${s}.` : ""}
${g ? `- الطالب في ${g}.` : ""}
- لا تجلب معلومات من مناهج صفوف أخرى أو سنوات قديمة.
- إذا كان هناك كتب مرفوعة للمادة، استخدم معلوماتها أولاً.
- اتبع تعليمات المطور الخاصة إن وجدت.
- لا تختلق معلومات؛ إذا لم تكن متأكداً قل: لا أعلم.
- شجع الطالب على التعلم والسؤال.
`;
    }

    // Build messages with vision support for page images
    const buildMessages = () => {
      const apiMessages: any[] = [{ role: "system", content: systemPrompt }];
      
      for (const msg of messages) {
        if (isLessonStudio && msg.role === "user" && msg === messages[messages.length - 1]) {
          const normalizedParts = Array.isArray(msg.content)
            ? msg.content
            : [{ type: "text", text: normalizeTextContent(msg.content) }];
          const hasImage = normalizedParts.some(
            (part) => part && typeof part === "object" && "type" in part && (part as { type?: string }).type === "image_url"
          );

          apiMessages.push({
            role: "user",
            content: [
              ...normalizedParts,
              ...(pageImageUrl && !hasImage ? [{ type: "image_url", image_url: { url: pageImageUrl } }] : []),
            ],
          });
        } else {
          apiMessages.push({ role: msg.role, content: normalizeTextContent(msg.content) });
        }
      }
      return apiMessages;
    };

    const callGateway = async (model: string) => {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.5,
          messages: buildMessages(),
        }),
      });

      if (!resp.ok) {
        const t = await resp.text().catch(() => "");
        return { ok: false as const, status: resp.status, text: t };
      }

      const data = await resp.json().catch(() => ({} as any));
      const content = data?.choices?.[0]?.message?.content as string | undefined;
      return { ok: true as const, content, data };
    };

    // Use vision-capable model first for lesson studio
    const modelsToTry = isLessonStudio 
      ? ["google/gemini-2.5-flash", "google/gemini-3-flash-preview"]
      : ["google/gemini-3-flash-preview", "openai/gpt-5-mini"];

    

    for (const model of modelsToTry) {
      const result = await callGateway(model);

      if (!result.ok) {
        if (result.status === 429) {
          return new Response(JSON.stringify({ error: "المساعد مشغول الآن. حاول بعد دقيقة." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (result.status === 402) {
          return new Response(
            JSON.stringify({ error: "تم استنفاد رصيد الذكاء الاصطناعي. يرجى إضافة رصيد ثم إعادة المحاولة." }),
            {
              status: 402,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        console.error("AI gateway error:", result.status, result.text);
        continue;
      }

      const content = (result.content ?? "").trim();
      if (content) {
        return new Response(JSON.stringify({ response: content }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.warn("AI gateway returned empty content for model:", model, result.data);
    }

    return new Response(JSON.stringify({ error: "عذراً، لم أتمكن من توليد رد الآن. حاول مرة أخرى." }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "خطأ غير متوقع" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

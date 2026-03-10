import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ChatMsg = { role: "user" | "assistant" | "system"; content: string };

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
    const isAdmin = (body?.isAdmin ?? false) as boolean;
    const isLessonStudio = (body?.isLessonStudio ?? false) as boolean;
    
    // Lesson studio context
    const lessonTitle = (body?.lessonTitle ?? null) as string | null;
    const lessonDescription = (body?.lessonDescription ?? null) as string | null;
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
        .select("file_name")
        .eq("subject_id", subjectId);
      
      if (sources && sources.length > 0) {
        aiSourcesInfo = `\n\nالكتب المرفوعة للمادة:\n${sources.map((s: any) => `- ${s.file_name}`).join("\n")}`;
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
      systemPrompt = `أنت مساعد ذكي لمنصة "أزهاريون" التعليمية - وضع المطور/الأدمن.
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
      systemPrompt = `أنت معلم ذكي في منصة "أزهاريون" التعليمية الأزهرية.
${metaParts.length ? metaParts.join("\n") : ""}
${aiSourcesInfo}
${adminInstructionsSection}
${lessonStudioContext}

⚠️ تعليمات مهمة جداً:
- أنت تشرح دروس المنهج الأزهري الحالي (${new Date().getFullYear()}-${new Date().getFullYear() + 1}).
${s ? `- الطالب في ${s}.` : ""}
${g ? `- الطالب في ${g}.` : ""}
${sec ? `- الشعبة: ${sec}.` : ""}
${subSubjectName ? `- أنت تشرح قسم "${subSubjectName}" تحديداً. لا تخلط مع أقسام أخرى.` : ""}
- ⚠️ يجب أن تشرح من المنهج الحالي فقط، ليس مناهج قديمة أو صفوف أخرى.
- اشرح المحتوى كأنك معلم أزهري خبير في الفصل.
- استخدم لغة عربية فصحى واضحة ومبسطة.
- ابدأ بتقديم الموضوع ثم اشرح كل نقطة بالتفصيل مع أمثلة.
- إذا كان هناك ملاحظات من المعلم على الصفحة، استخدمها كأساس للشرح.
- اربط الشرح بالمنهج الأزهري واستخدم مصادر موثوقة (الأزهر الشريف، الكتب المدرسية المعتمدة).
- لا تجلب معلومات من مناهج صفوف أخرى أو سنوات سابقة.
- عند طلب الطالب إعادة شرح أو توضيح، أعد الشرح بأسلوب مختلف وأبسط.
- شجع الطالب وحفزه على الفهم.
- لا تختلق معلومات. إذا لم تكن متأكداً قل ذلك.
`;
    } else {
      systemPrompt = `أنت مساعد ذكي لمنصة "أزهاريون" التعليمية.
${metaParts.length ? metaParts.join("\n") : ""}
${aiSourcesInfo}
${adminInstructionsSection}
${allSubSubjects.length > 0 ? `\nالأقسام الفرعية المتاحة في هذه المادة: ${allSubSubjects.join("، ")}` : ""}

قواعد مهمة:
- أجب باللغة العربية الفصحى وبأسلوب واضح ومبسط للطلاب.
${subSubjectName ? `- ⚠️ مهم جداً: أنت الآن داخل قسم "${subSubjectName}" تحديداً. يجب أن تركز جميع إجاباتك على "${subSubjectName}" فقط.
- عند تقديم نفسك أو الترحيب بالطالب، قل أنك مساعد في "${subSubjectName}".` : ""}
${s ? `- الطالب في ${s}.` : ""}
${g ? `- الطالب في ${g}.` : ""}
- اشرح من المنهج الأزهري الحالي (${new Date().getFullYear()}-${new Date().getFullYear() + 1}) فقط.
- لا تجلب معلومات من مناهج صفوف أخرى أو سنوات قديمة.
- إذا كان هناك كتب مرفوعة للمادة، استخدم معلوماتها أولاً للإجابة.
- يمكنك الإجابة عن أي سؤال عام.
- اتبع تعليمات المطور الخاصة إن وجدت.
- لا تختلق معلومات؛ إذا لم تكن متأكداً قل: لا أعلم.
- شجع الطالب على التعلم والسؤال.
`;
    }

    const callGateway = async (model: string) => {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.7,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
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

    const modelsToTry = ["google/gemini-3-flash-preview", "openai/gpt-5-mini"];

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

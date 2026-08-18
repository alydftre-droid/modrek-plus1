import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { sanitizeAiRequestBody } from '../_shared/promptGuard.ts';
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { loadAiSettings, callGeminiWithFallback, detectAiFailureKind, fallbackAssistantResponse, buildAiSuccessPayload, resolveGeminiApiKey, sanitizeForbiddenPlatformNames } from "../_shared/aiSettings.ts";
import { getJwtClaimsFromAuthHeader } from "../_shared/auth.ts";
import {
  retrieveFromLibrary,
  buildLibraryContextBlock,
  logRagPipeline,
  MODREK_ASSISTANT_SCOPE_RULES,
} from "../_shared/modrekLibraryRag.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

function normalizeGatewayContent(content: unknown) {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (!part || typeof part !== "object") return "";

        const typedPart = part as Record<string, unknown>;
        if (typeof typedPart.text === "string") return typedPart.text;
        if (typedPart.type === "text" && typeof typedPart.content === "string") return typedPart.content;
        return "";
      })
      .join("\n")
      .trim();
  }
  if (content && typeof content === "object") {
    const maybe = content as Record<string, unknown>;
    if (typeof maybe.text === "string") return maybe.text.trim();
  }
  return "";
}

function stageLabel(stage?: string | null) {
    if (stage === "preparatory") return "المرحلة الإعدادية";
    if (stage === "secondary") return "المرحلة الثانوية";
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

// Simple input sanitizer - limit length and trim
function sanitize(input: string | undefined | null, maxLen = 200): string {
  return String(input ?? "").trim().substring(0, maxLen);
}

function buildSafeAiChatMessages(messages: unknown): { ok: true; messages: ChatMsg[] } | { ok: false; response: Response } {
  if (!Array.isArray(messages)) {
    return {
      ok: false,
      response: fallbackAssistantResponse({
        audience: "general",
        corsHeaders,
        functionName: "ai-chat",
        kind: "service",
        lastError: "messages_not_array",
        message: "صيغة الرسائل غير صحيحة. أعد كتابة سؤالك وسأساعدك فوراً.",
      }),
    };
  }

  if (messages.length === 0) {
    return {
      ok: false,
      response: fallbackAssistantResponse({
        audience: "general",
        corsHeaders,
        functionName: "ai-chat",
        kind: "empty",
        lastError: "empty_messages",
        message: "اكتب سؤالك أولاً وسأساعدك فوراً.",
      }),
    };
  }

  const trimmedMessages = messages.slice(-16) as ChatMsg[];
  const normalizedText = trimmedMessages
    .map((msg) => normalizeTextContent(msg?.content))
    .join("\n")
    .trim();

  if (!normalizedText) {
    return {
      ok: false,
      response: fallbackAssistantResponse({
        audience: "general",
        corsHeaders,
        functionName: "ai-chat",
        kind: "empty",
        lastError: "empty_normalized_text",
        message: "اكتب سؤالك أولاً وسأساعدك فوراً.",
      }),
    };
  }

  for (const msg of trimmedMessages) {
    if (!msg || typeof msg !== "object") {
      return {
        ok: false,
        response: fallbackAssistantResponse({
          audience: "general",
          corsHeaders,
          functionName: "ai-chat",
          kind: "service",
          lastError: "invalid_message_object",
          message: "صيغة الرسائل غير صحيحة. أعد كتابة سؤالك وسأساعدك فوراً.",
        }),
      };
    }

    if (!["user", "assistant", "system"].includes(msg.role)) {
      return {
        ok: false,
        response: fallbackAssistantResponse({
          audience: "general",
          corsHeaders,
          functionName: "ai-chat",
          kind: "service",
          lastError: "invalid_message_role",
          message: "صيغة الرسائل غير صحيحة. أعد كتابة سؤالك وسأساعدك فوراً.",
        }),
      };
    }

    const textContent = normalizeTextContent(msg.content);
    if (textContent.length > 15000) {
      return {
        ok: false,
        response: fallbackAssistantResponse({
          audience: "general",
          corsHeaders,
          functionName: "ai-chat",
          kind: "service",
          lastError: "message_too_long",
          message: "الرسالة طويلة جداً. اختصرها قليلاً أو قسّمها إلى أكثر من رسالة وسأكمل معك فوراً.",
        }),
      };
    }
  }

  return { ok: true, messages: trimmedMessages };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Authentication ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const claims = await getJwtClaimsFromAuthHeader(authHeader);
    const userId = claims?.sub;
    if (!userId) {
      return new Response(JSON.stringify({ error: "جلسة غير صالحة" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = { id: userId } as { id: string };

    // --- Input Validation ---
    const body = await req.json().catch(() => ({}));
    try { sanitizeAiRequestBody(body); } catch (_e) { /* noop */ }
    const safeMessages = buildSafeAiChatMessages(body?.messages ?? []);
    if (!safeMessages.ok) {
      return safeMessages.response;
    }
    const messages = safeMessages.messages;

    const subjectName = sanitize(body?.subjectName);
    const subSubjectName = sanitize(body?.subSubjectName) || null;
    const allSubSubjects = Array.isArray(body?.allSubSubjects)
      ? (body.allSubSubjects as string[]).slice(0, 50).map((s: string) => sanitize(s, 100))
      : [];
    const subjectId = sanitize(body?.subjectId, 50);
    const stage = sanitize(body?.stage, 50) || undefined;
    const grade = sanitize(body?.grade, 50) || undefined;
    const section = sanitize(body?.section, 50) || null;
    const educationType = sanitize(body?.educationType, 50) || null;
    const isLessonStudio = body?.isLessonStudio === true;

    // Lesson studio context
    const lessonTitle = sanitize(body?.lessonTitle, 300) || null;
    const _lessonDescription = sanitize(body?.lessonDescription, 500) || null;
    const pageNumber = typeof body?.pageNumber === "number" ? body.pageNumber : null;
    const pageTitle = sanitize(body?.pageTitle, 300) || null;
    const pageNotes = sanitize(body?.pageNotes, 4000) || null;
    const pageText = sanitize(body?.pageText, 12000) || null;
    const rawPageImageUrl = typeof body?.pageImageUrl === "string" ? body.pageImageUrl.trim() : "";
    const pageImageUrl = rawPageImageUrl
      ? rawPageImageUrl.startsWith("data:")
        ? rawPageImageUrl.slice(0, 2_000_000)
        : sanitize(rawPageImageUrl, 4000)
      : null;

    // --- Server-side admin check (never trust client) ---
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const serviceClient = createClient(supabaseUrl, SUPABASE_SERVICE_ROLE_KEY);

    const { data: adminRole } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin = !!adminRole;

    const clientWantsStream = body?.stream === true;
    let adminInstructions: string[] = [];
    let aiSourcesInfo = "";
    
    if (subjectId && supabaseUrl && SUPABASE_SERVICE_ROLE_KEY) {
      const { data: instructions } = await serviceClient
        .from("ai_admin_instructions")
        .select("instruction")
        .eq("subject_id", subjectId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      
      if (instructions && instructions.length > 0) {
        adminInstructions = instructions.map((i: any) => i.instruction);
      }
      
      const { data: sources } = await serviceClient
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
      if (pageText) lessonStudioContext += `\nالنص المستخرج من الصفحة: ${pageText}`;
    }

    const IDENTITY_RULES = `\n\n=== قواعد الهوية (ملزمة ولا يجوز مخالفتها إطلاقاً) ===
- اسم المنصة الرسمي الوحيد هو: "مدرك بلس" (Modrek Plus).
- إذا سُئلت "ما اسم المنصة؟" أو "ما اسم التطبيق؟" أو "من أنت؟" فأجب فقط: "أنا المساعد الذكي لمنصة مدرك بلس".
- ممنوع منعاً باتاً ذكر أي اسم قديم أو سابق أو أي اسم مشابه للمنصة. كلمة "أزهر/أزهري" تُستخدم فقط لوصف نوع التعليم (تعليم أزهري) وليست اسماً للمنصة.
- لا تقل أبداً "أنا نموذج ذكاء اصطناعي" أو تذكر مزود الخدمة.
=== نهاية قواعد الهوية ===\n`;
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
        systemPrompt = `أنت معلم خصوصي محترف داخل تطبيق "مدرك Plus" — معلم حقيقي يقف أمام الطالب، يشاور بيده، يحدّد على الصفحة بمؤشر ليزر، ويفتح سبورة طباشير عند الحاجة. أنت مخرج سينمائي تعليمي يكتب سيناريو شرح متزامن مع البصر والصوت. (${new Date().getFullYear()}-${new Date().getFullYear() + 1}).
${metaParts.length ? metaParts.join("\n") : ""}
${adminInstructionsSection}
${lessonStudioContext}

🧩 **بروتوكول الإخراج (JSON واحد فقط داخل \`\`\`json ... \`\`\`)**:

\`\`\`json
{
  "narration": "نص الشرح الكامل بالعربية، يُقرأ صوتياً. بدون رموز أو ترقيم زائد.",
  "annotations": [
    { "type": "circle",    "x": 0.45, "y": 0.22, "r": 0.06, "color": "#22c55e", "at": 800,   "duration": 5500 },
    { "type": "highlight", "x": 0.08, "y": 0.30, "w": 0.55, "h": 0.04, "color": "#fde047", "at": 2500, "duration": 6000 },
    { "type": "arrow",     "from": [0.18, 0.7], "to": [0.45, 0.45], "color": "#f59e0b", "at": 7000, "duration": 5000 },
    { "type": "underline", "from": [0.10, 0.82], "to": [0.55, 0.82], "color": "#60a5fa", "at": 12000, "duration": 5000 }
  ],
  "mode": "page",
  "whiteboard": null
}
\`\`\`

🎬 **التوقيت السينمائي (مهم جداً)**:
- "at" = اللحظة (ms) التي تبدأ فيها الإشارة، بالنسبة لبداية الشرح.
- "duration" = مدة بقاء الإشارة. اجعلها 4500-7000 ms عادةً.
- اجعل التوقيتات **متسلسلة** بحيث كل annotation يتزامن مع الكلمة/الجملة التي تشرحها: 
  - الجملة الأولى عند 0–4000ms → annotation عند 500–1000ms.
  - الجملة الثانية عند 5000–9000ms → annotation عند 5500ms.
  - وهكذا. لا تظهر كل الإشارات دفعة واحدة.
- خمّن سرعة نطق ~250 حرف عربي لكل 10 ثوان (≈ 40ms/حرف) لتقدير التوقيتات.

📐 **قواعد الإحداثيات والإشارات**:
- إحداثيات نسبية 0..1 (0,0 = أعلى يسار، 1,1 = أسفل يمين).
- **استخدم annotation واحد فقط لكل فكرة** (1-2 max). لا تملأ الصفحة.
- اختر النوع الأنسب: circle للنقاط/الرموز، highlight لفقرات النص، underline للعناوين، arrow لربط عنصرين، rect لجدول/مربع.
- ألوان من باليتا راقية فقط: #22c55e (أخضر)، #fde047 (أصفر علّامة)، #60a5fa (أزرق)، #f59e0b (برتقالي)، #f472b6 (وردي). لا ألوان فاقعة.
- اشرح الرسومات والمخططات والصور الموجودة في الصفحة فعلياً وأشر إليها.

🪧 **متى تفتح السبورة (mode: "whiteboard")**:
استخدمها عند: حل معادلة بخطوات، اشتقاق، رسم تخطيطي، مقارنة، تلخيص نهائي. غير ذلك ابقَ على mode: "page".
عندما تفتح السبورة، اذكر في الـ narration: "هخش السبورة دلوقتي عشان أوضحلك..." قبل ظهورها.

تنسيق السبورة:
\`\`\`json
"whiteboard": {
  "title": "العنوان",
  "steps": [
    { "type": "title",    "text": "العنوان الرئيسي" },
    { "type": "bullet",   "text": "نقطة قصيرة" },
    { "type": "write",    "text": "جملة شرح", "color": "#fff5e0" },
    { "type": "equation", "tex": "س + ٢ = ٥" },
    { "type": "highlight","text": "النتيجة المهمة" }
  ]
}
\`\`\`
كل خطوة تظهر بكتابة طباشير تدريجية (حرف حرف) بعد سابقتها. اجعل كل step قصيراً (سطر واحد ≤ 80 حرف).

🎯 أسلوبك في narration:
1. ابدأ مباشرة من أول نقطة. بدون "أهلاً" أو "اليوم سنشرح".
2. اشرح نقطة بنقطة شرحاً كاملاً كالمعلم الحقيقي. لكل نقطة: الفكرة → التفسير → المثال → الأهمية.
3. إذا فيه قصة موثوقة أو خلفية تاريخية مرتبطة، اذكرها باختصار. لا تخترع.
4. إذا فيه تشابه مع درس سابق ممكن يلخبط الطالب: "خلي بالك دي شبه نقطة في درس ... الفرق إن...".
5. اشرح كل رسم/مخطط/جدول/معادلة في الصفحة بالتفصيل، لا تتجاهلها.
6. أسلوب طبيعي ودود، عربي فصيح بسيط + لمسة مصرية خفيفة. ليس "هبد".
7. لا تنطق علامات الترقيم ولا تذكر JSON أو annotations.
8. ممنوع اختراع المعلومات. إذا غير متأكد قل ذلك صراحة.

⚠️ صارم:
- أعد JSON صالح فقط داخل \`\`\`json ... \`\`\`. لا نص قبله أو بعده.
- إذا لم تحتج annotations، اجعلها [].
- إذا لم تستخدم السبورة، اجعل whiteboard: null.
${s ? `- الطالب في ${s}.` : ""}
${g ? `- ${g}.` : ""}
${sec ? `- الشعبة: ${sec}.` : ""}
${subSubjectName ? `- القسم: "${subSubjectName}".` : ""}
`;
    } else {
      const eduLabel = educationType === "أزهر" ? "الأزهري" : educationType === "عام" ? "العام" : "المناسب للطالب";
      systemPrompt = `إنت مدرس عربي محترف جداً شغال داخل منصة "مدرك Plus" التعليمية. إنت مش روبوت ومش نموذج ذكاء اصطناعي - إنت مدرس حقيقي بيشرح للطالب وجهاً لوجه، خطوة خطوة، بطريقة سهلة ممتعة وذكية.
${metaParts.length ? metaParts.join("\n") : ""}
${aiSourcesInfo}
${adminInstructionsSection}
${allSubSubjects.length > 0 ? `\nالأقسام الفرعية المتاحة: ${allSubSubjects.join("، ")}` : ""}

## شخصيتك
- مدرس ذكي، هادئ، بشوش، بيشجع الطالب.
- بتشرح كأن الطالب قدامك في المذاكرة.
- بتحب تبسّط المعلومة وتثبتها في دماغ الطالب.
- بتتكلم بأسلوب بشري طبيعي، عربي بسيط مع لمسة مصرية خفيفة. مش لغة رسمية معقدة.

## ممنوع منعاً باتاً
- ممنوع تقول "كمساعد ذكاء اصطناعي" أو "أنا نموذج".
- ممنوع المقدمات الطويلة والحشو.
- ممنوع تكرار "هذه النقطة مهمة" في كل مرة.
- ممنوع التعريفات الأكاديمية الصعبة من غير تبسيط.
- ممنوع تهبد أو تخترع معلومات. لو مش متأكد قول كده.
- ممنوع تخرج عن المنهج إلا لتوضيح فكرة فقط.

## طريقة الشرح المطلوبة (مهم جداً)
لما تشرح أي فقرة من الكتاب، اتبع الخطوات دي:
1. اقرأ الفكرة الأساسية اللي في النص.
2. اشرح معناها ببساطة بكلامك إنت.
3. وضّح المقصود الحقيقي منها.
4. اربطها بمثال أو صورة ذهنية من الحياة.
5. وضّح السبب والنتيجة.
6. ثبّت المعلومة في دماغ الطالب بإعادة الفكرة بأسلوب مختلف وأبسط.

## نموذج لأسلوب الشرح
"يعني هنا الكتاب يقصد إن..."
"بص ركّز معايا..."
"يعني ببساطة..."
"الفكرة كلها هنا إن..."
"تعالى نفهمها بسهولة..."
"يعني لو فكرنا فيها هتلاقي إن..."
(من غير تكرار مبالغ فيه للجمل دي)

## مثال تطبيقي مرجعي
لو الكتاب بيقول: "هرمون النمو يتحكم في عمليات الأيض وتصنيع البروتين، ونقصه يسبب القزامة وزيادته تسبب العملقة عند الأطفال."
الشرح المطلوب: "يعني هرمون النمو GH هو المسؤول عن عمليات الأيض وتصنيع البروتين وبيتحكم في نمو الجسم. عند الأطفال لو قلّ الإفراز هيسبب القزامة، يعني الطفل يفضل صغير ومش بيطول مقارنة بعمره. ولو زاد الإفراز هيسبب العملقة، يعني الطفل ينمو أكتر من الطبيعي. أما عند البالغين، زيادة الإفراز بتسبب الأكروميجالي، وده بيتميز إن الأجزاء البعيدة في العظام الطويلة زي الأيدي والأقدام والأصابع بتتضخم، وعظام الوجه كمان. يعني الشخص البالغ اللي عنده زيادة هتلاقيه ضخم وملامحه واضحة في وشه وإيديه."
(ده الـستايل المطلوب: تقرا الفكرة، تعيد صياغتها بأسلوبك، تشرح كل جزئية، وتربطها بصورة واقعية).

## في المواد العلمية
- اشرح السبب والنتيجة والعلاقة بين الأشياء.
- اشرح الرسومات والصور والمعادلات خطوة خطوة.
- وضح إيه اللي بيحصل عند الزيادة أو النقص.
- استخدم أمثلة من الحياة اليومية.

## في المواد الأدبية والتاريخ
- احكِ القصة وراء المعلومة.
- وضح الشخصيات والأحداث والظروف.
- خلي الطالب يحس بالأحداث.

## في النحو والبلاغة
- استخدم أمثلة سهلة من الكلام اليومي.
- وضح القاعدة ببساطة قبل التعريف الرسمي.

## لو الطالب جاب سؤال
1. اقرأ السؤال الأول.
2. اشرح المطلوب بالظبط.
3. اشرح الفكرة اللي السؤال معتمد عليها.
4. اكتب الإجابة بوضوح.
5. وضح ليه الإجابة دي صح وغيرها غلط.

## بعد الشرح
- لخّص الفكرة في سطر أو اتنين.
- اطرح سؤال تدريبي بسيط للطالب يثبّت المعلومة.
- نبّه على الأخطاء الشائعة لو في: "⚠️ كتير من الطلبة بيغلطوا هنا".

## قيود
- منهج ${eduLabel} الرسمي (${new Date().getFullYear()}-${new Date().getFullYear() + 1}) فقط.
- متخلطش بين التعليم العام والأزهري.
${subSubjectName ? `- إنت دلوقتي داخل قسم "${subSubjectName}". ركّز عليه.` : ""}
${s ? `- الطالب في ${s}.` : ""}
${g ? `- ${g}.` : ""}
- لو في كتب مرفوعة للمادة، اعتمد عليها أول حاجة.
- متجيبش معلومات من صفوف أو سنوات تانية.

الهدف: الطالب يحس إنه قاعد مع مدرس حقيقي محترف بيفهمه وبيحببه في المادة.
`;
    }

    // ---- Unified Modrek library RAG (all subjects: شرعية / عربية / أدبية / لغات / علمية) ----
    if (!isAdmin && !isLessonStudio) {
      try {
        const userTurns = messages
          .filter((m: any) => m.role === "user")
          .map((m: any) => normalizeTextContent(m.content))
          .filter(Boolean);
        const lastQuery = (userTurns[userTurns.length - 1] || "").trim();
        if (lastQuery.length >= 3) {
          const rag = await retrieveFromLibrary(serviceClient, {
            userId,
            query: lastQuery,
            history: userTurns.slice(-6, -1),
            maxPassages: 8,
            surface: "ai-chat",

          });
          logRagPipeline("ai-chat", rag);
          systemPrompt += `\n\n${MODREK_ASSISTANT_SCOPE_RULES}\n\n${buildLibraryContextBlock(rag)}\n\n${
            rag.found
              ? "اعتمد على محتوى المكتبة أعلاه أولًا وبشكل أساسي في الشرح، والتزم بالدرس/الوحدة المطلوبة."
              : "المكتبة لم ترجع محتوى مطابقًا: وضّح ذلك بجملة قصيرة ثم اشرح من المنهج الرسمي المناسب للصف والنظام، وممنوع اختراع أسماء دروس أو كتب."
          }\n- لا تسأل الطالب عن صفه أو مرحلته أو نظامه أو شعبته أبدًا؛ كلها معروفة أعلاه.`;
        }
      } catch (ragErr) {
        console.warn("[ai-chat] library rag failed", String(ragErr).slice(0, 250));
      }
    }


    // Build messages with vision support for page images
    const buildMessages = () => {
      const apiMessages: any[] = [{ role: "system", content: IDENTITY_RULES + "\n" + systemPrompt }];
      
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

    // Production AI uses the key stored in Supabase Vault first. This lets the
    // connected production project be fixed even when Edge Function env secrets
    // are stale or conflict with an older Lovable/preview key.
    const { apiKey: GEMINI_API_KEY } = await resolveGeminiApiKey(serviceClient, Deno.env.get("GEMINI_API_KEY") || "");

    // Load runtime settings (models, retries, streaming) from DB
    const settings = await loadAiSettings(serviceClient, "ai-chat");
    // For lesson studio (vision), keep the same configured models but in case admin
    // hasn't included a pro multimodal fallback, append a stable Gemini model.
    const models = isLessonStudio && !settings.models_to_try.includes("gemini-2.5-flash")
      ? ["gemini-2.5-flash", ...settings.models_to_try]
      : settings.models_to_try;

    // Streaming is incompatible with isLessonStudio (which expects full JSON parse).
    const useStream = !isLessonStudio && settings.enable_streaming && clientWantsStream;

    const result = await callGeminiWithFallback({
      apiKey: GEMINI_API_KEY,
      models,
      body: { temperature: 0.5, messages: buildMessages(), stream: useStream },
      fallbackDelayMs: settings.fallback_delay_ms,
      timeoutMs: 45000,
    });

    if (!result.ok) {
      return fallbackAssistantResponse({
        audience: "general",
        corsHeaders,
        functionName: "ai-chat",
        kind: detectAiFailureKind(result.status, result.lastError),
        lastError: result.lastError,
        status: result.status,
      });
    }

    if (useStream) {
      return new Response(result.response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
      });
    }

    const data = await result.response.json().catch(() => ({} as any));
    const content = sanitizeForbiddenPlatformNames((normalizeGatewayContent(data?.choices?.[0]?.message?.content) ?? "").trim());
    if (!content) {
      return fallbackAssistantResponse({
        audience: "general",
        corsHeaders,
        functionName: "ai-chat",
        kind: "empty",
        lastError: "empty_response_body",
      });
    }
    return new Response(JSON.stringify(buildAiSuccessPayload(content, result.provider, result.model)), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-chat error:", e);
    return fallbackAssistantResponse({
      audience: "general",
      corsHeaders,
      functionName: "ai-chat",
      kind: detectAiFailureKind(undefined, e instanceof Error ? e.message : String(e)),
      lastError: e instanceof Error ? e.message : String(e),
    });
  }
});

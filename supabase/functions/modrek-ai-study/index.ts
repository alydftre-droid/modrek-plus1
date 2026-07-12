// Modrek AI - Study assistant (chat)
// Reads student profile automatically. Supports text + images + PDF via Lovable AI Gateway.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stageLabel(s?: string | null) {
  if (s === "preparatory") return "المرحلة الإعدادية";
  if (s === "secondary") return "المرحلة الثانوية";
  return null;
}
function gradeLabel(g?: string | null) {
  if (g === "first") return "الصف الأول";
  if (g === "second") return "الصف الثاني";
  if (g === "third") return "الصف الثالث";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const token = auth.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => null);
    if (!body?.messages || !Array.isArray(body.messages)) return json({ error: "messages required" }, 400);

    const { messages, conversationContext = {} } = body;

    // Load profile for automatic context
    const { data: profile } = await supabase
      .from("profiles")
      .select("stage, grade, section, education_type, full_name")
      .eq("id", userId)
      .maybeSingle();

    const eduType = profile?.education_type === "azhar" ? "الأزهر" : "التعليم العام";
    const stage = stageLabel(profile?.stage);
    const grade = gradeLabel(profile?.grade);
    const section = profile?.section || null;

    const contextLine = conversationContext?.title
      ? `سياق المحادثة الثابت: ${conversationContext.title}${conversationContext.subject_name ? ` (المادة: ${conversationContext.subject_name})` : ""}${conversationContext.chapter ? ` — ${conversationContext.chapter}` : ""}.`
      : "";

    const systemPrompt = `أنت "Modrek AI" - مساعد دراسي ذكي متخصص للطلاب المصريين.

معلومات الطالب (استخدمها تلقائيًا دون سؤال):
- الاسم: ${profile?.full_name || "الطالب"}
- المرحلة: ${stage || "غير محددة"}
- الصف: ${grade || "غير محدد"}
- النظام: ${eduType}
${section ? `- الشعبة: ${section}` : ""}

${contextLine}

مهامك:
- شرح الدروس وتبسيط المفاهيم.
- الإجابة عن الأسئلة وحل المسائل.
- شرح الصور وملفات PDF المرفقة.
- إنشاء تدريبات ومراجعات وتلخيص.

قواعد صارمة:
- لا تسأل الطالب عن مرحلته أو صفه أو نظامه أو شعبته أبدًا — هذه البيانات معروفة تلقائيًا.
- إذا لم يذكر الطالب المادة صراحة، استخدم سياق المحادثة الثابت أعلاه.
- استخدم مصادر تعليمية موثوقة فقط.
- الرد بالعربية الفصحى بأسلوب واضح ومختصر.
- استخدم Markdown (عناوين، قوائم، **تمييز**) لتنظيم الإجابة.
- للمعادلات الرياضية استخدم LaTeX داخل $...$ أو $$...$$.`;

    const gwMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI service not configured" }, 500);

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: gwMessages,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 429) return json({ error: "تم تجاوز حد الاستخدام. حاول بعد قليل." }, 429);
      if (res.status === 402) return json({ error: "نفدت رصيد الاشتراك في خدمة الذكاء الاصطناعي." }, 402);
      console.error("[modrek-ai-study] gateway error", res.status, text.slice(0, 300));
      return json({ error: "تعذر الحصول على الرد" }, 502);
    }

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content ?? "";
    return json({ reply, usage: data?.usage ?? null });
  } catch (e) {
    console.error("[modrek-ai-study] error", e);
    return json({ error: (e as Error)?.message || "Internal error" }, 500);
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function formatRoleLabel(role: string | null) {
  switch (role) { case "admin": return "إداري"; case "teacher": return "معلم"; case "support": return "دعم"; default: return "طالب"; }
}

function normalizeAssistantContent(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p) => (typeof p === "string" ? p : (p as any)?.text || "")).join("\n").trim();
  return "";
}

function safeText(v: string | null | undefined, fb = "غير متوفر") { return String(v || "").trim() || fb; }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "غير مصرح" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { messages } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

    // Verify JWT properly using Supabase auth
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "جلسة غير صالحة" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = user.id;

    const sb = createClient(supabaseUrl, supabaseServiceKey);

    const [profileRes, walletRes, subsRes, depositsRes, usageRes, examAttemptsRes, roleRes, supportRes, teacherChoicesRes, purchasesRes] = await Promise.all([
      sb.from("profiles").select("id, full_name, email, phone, stage, grade, section, student_code, created_at").eq("id", userId).maybeSingle(),
      sb.from("wallets").select("balance, updated_at").eq("user_id", userId).maybeSingle(),
      sb.from("subscriptions").select("start_date, end_date, is_active, teacher_id, subjects(name)").eq("student_id", userId).order("created_at", { ascending: false }).limit(10),
      sb.from("deposit_requests").select("amount, status, created_at, payment_method, admin_message, rejection_reason").eq("student_id", userId).order("created_at", { ascending: false }).limit(10),
      sb.from("usage_logs").select("action, created_at, duration_minutes").eq("user_id", userId).order("created_at", { ascending: false }).limit(12),
      sb.from("exam_attempts").select("score, total, submitted_at, exams(title, subjects:subject_id(name))").eq("student_id", userId).order("submitted_at", { ascending: false }).limit(10),
      sb.from("user_roles").select("role").eq("user_id", userId).limit(5),
      sb.from("support_messages").select("message, is_from_admin, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
      sb.from("student_teacher_choices").select("category, stage, grade, teacher_id, created_at").eq("student_id", userId).limit(10),
      sb.from("student_group_purchases").select("amount_paid, purchased_at, group_id").eq("student_id", userId).order("purchased_at", { ascending: false }).limit(10),
    ]);

    const teacherIds = Array.from(new Set([
      ...(subsRes.data || []).map((i) => i.teacher_id).filter(Boolean),
      ...(teacherChoicesRes.data || []).map((i) => i.teacher_id).filter(Boolean),
    ]));
    const teacherProfilesRes = teacherIds.length ? await sb.from("profiles").select("id, full_name").in("id", teacherIds) : { data: [] };
    const teacherNameMap = new Map((teacherProfilesRes.data || []).map((i) => [i.id, i.full_name]));

    let ctx = "";
    const p = profileRes.data;
    const roles = (roleRes.data || []).map((i) => formatRoleLabel(i.role)).join("، ") || "طالب";
    const stageMap: Record<string, string> = { preparatory: "إعدادي", secondary: "ثانوي" };
    const gradeMap: Record<string, string> = { first: "الأول", second: "الثاني", third: "الثالث" };
    const sectionMap: Record<string, string> = { scientific: "علمي", literary: "أدبي" };

    if (p) {
      ctx += `\n## ملف الطالب\n- الاسم: ${safeText(p.full_name)}\n- نوع: ${roles}\n- البريد: ${safeText(p.email)}\n- كود: ${safeText(p.student_code)}\n- تسجيل: ${new Date(p.created_at || user.created_at).toLocaleDateString("ar-EG")}\n- المرحلة: ${stageMap[p.stage||""]||p.stage||"غير محدد"}\n- الصف: ${gradeMap[p.grade||""]||p.grade||"غير محدد"}\n`;
      if (p.section) ctx += `- القسم: ${sectionMap[p.section]||p.section}\n`;
      ctx += `- الهاتف: ${safeText(p.phone)}\n`;
    }
    if (walletRes.data) ctx += `\n## المحفظة\n- الرصيد: ${walletRes.data.balance} جنيه\n- آخر تحديث: ${walletRes.data.updated_at ? new Date(walletRes.data.updated_at).toLocaleString("ar-EG") : "غير متوفر"}\n`;
    if (subsRes.data?.length) { ctx += `\n## الاشتراكات\n`; for (const s of subsRes.data) ctx += `- ${(s as any).subjects?.name||"؟"}: ${new Date(s.start_date).toLocaleDateString("ar-EG")} → ${new Date(s.end_date).toLocaleDateString("ar-EG")} (${s.is_active?"نشط":"غير نشط"}) | ${teacherNameMap.get(s.teacher_id||"")||"غير محدد"}\n`; }
    if (teacherChoicesRes.data?.length) { ctx += `\n## المعلمون\n`; for (const c of teacherChoicesRes.data) ctx += `- ${teacherNameMap.get(c.teacher_id)||c.teacher_id} | ${c.category} | ${c.stage} ${c.grade}\n`; }
    if (depositsRes.data?.length) { ctx += `\n## الإيداعات\n`; for (const d of depositsRes.data) { const st = d.status==="approved"?"مقبول":d.status==="rejected"?"مرفوض":"قيد المراجعة"; ctx += `- ${d.amount} ج | ${st} | ${new Date(d.created_at).toLocaleDateString("ar-EG")}\n`; if(d.admin_message) ctx+=`  رسالة: ${d.admin_message}\n`; if(d.rejection_reason) ctx+=`  سبب الرفض: ${d.rejection_reason}\n`; } }
    if (purchasesRes.data?.length) { ctx += `\n## المشتريات\n`; for (const p of purchasesRes.data) ctx += `- ${p.amount_paid||0} ج | ${new Date(p.purchased_at).toLocaleDateString("ar-EG")}\n`; }
    if (usageRes.data?.length) { ctx += `\n## النشاط\n`; for (const u of usageRes.data) ctx += `- ${u.action} | ${new Date(u.created_at).toLocaleString("ar-EG")} | ${u.duration_minutes||0}د\n`; }
    if (examAttemptsRes.data?.length) { ctx += `\n## الامتحانات\n`; for (const a of examAttemptsRes.data) ctx += `- ${(a as any).exams?.subjects?.name||"؟"} / ${(a as any).exams?.title||"امتحان"}: ${a.score}/${a.total}\n`; }
    if (supportRes.data?.length) { ctx += `\n## رسائل الدعم\n`; for (const m of supportRes.data) ctx += `- ${m.is_from_admin?"الدعم":"الطالب"}: ${m.message.slice(0,120)}\n`; }

    const today = new Date();
    const todayStr = today.toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    const systemPrompt = `أنت موظف دعم ذكي ولطيف لمنصة "مدرك Plus" التعليمية. المنصة تخدم التعليم العام والتعليم الأزهري معاً. تتحدث بالعربية المصرية بشكل طبيعي.

## التاريخ الحالي
اليوم هو: ${todayStr}
التاريخ بالميلادي: ${today.toISOString().split("T")[0]}

## معلومات المنصة
- اسم المنصة: مدرك Plus (ليست "الأزهر التعليمية" - تم تغيير الاسم)
- تخدم طلاب التعليم العام وطلاب التعليم الأزهري
- المواد العربية والشرعية مفصولة حسب نوع التعليم (عام / أزهري)
- المواد العلمية مشتركة بين النوعين

## أسلوبك
- ودود، ذكي، سريع، عملي.
- لا تكتب ردوداً فارغة أبداً.
- استخدم نقاط قصيرة وخطوات مباشرة.
- لا تذكر بيانات حساسة.

## قاعدة التحويل للدعم البشري (مهم جداً!)
- لا تحوّل الطالب تلقائياً للدعم البشري أبداً.
- فقط عندما يطلب الطالب صراحةً التحويل (مثل "حوّلني للدعم" أو "عايز أكلم موظف" أو "أريد التحدث مع الدعم")، ضع العلامة [ESCALATE_TO_SUPPORT] في ردك.
- إذا لم يطلب الطالب التحويل بوضوح، ساعده أنت ولا تحوّله.

## صلاحياتك
- الاطلاع على بيانات الحساب المرفقة فقط.
- المساعدة في: الاشتراك، الدفع، الإيداع، الرصيد، المواد، المعلمين، النشاط، الامتحانات، والمشاكل العامة.
- تحليل الصور المرسلة كجزء من المشكلة.

## المطلوب
- افهم السؤال بدقة من أول مرة.
- أعطِ السبب ثم الحل.
- اختم باقتراح خطوة تالية.

${ctx}`;

    const gatewayMessages = [{ role: "system", content: systemPrompt }, ...(Array.isArray(messages) ? messages.slice(-12) : [])];
    const modelsToTry = ["google/gemini-3-flash-preview", "google/gemini-2.5-flash", "openai/gpt-5-mini"];
    let content = "";

    for (const model of modelsToTry) {
      try {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages: gatewayMessages, stream: false }),
        });

        if (!aiResponse.ok) {
          if (aiResponse.status === 429) return new Response(JSON.stringify({ error: "تم تجاوز الحد، حاول لاحقاً" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          if (aiResponse.status === 402) return new Response(JSON.stringify({ error: "يرجى إضافة رصيد" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          console.error("AI error:", model, aiResponse.status);
          continue;
        }

        const aiData = await aiResponse.json();
        content = normalizeAssistantContent(aiData?.choices?.[0]?.message?.content);
        if (content) break;
      } catch (e) { console.error("Model error:", model, e); continue; }
    }

    content ||= "أنا موجود لمساعدتك، أعد إرسال طلبك بصياغة أوضح أو أرسل صورة للمشكلة.";

    return new Response(JSON.stringify({ content }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("support-assistant error:", error);
    return new Response(JSON.stringify({ error: "حدث خطأ، حاول مرة أخرى" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

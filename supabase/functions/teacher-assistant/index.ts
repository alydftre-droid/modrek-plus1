import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function safeText(v: string | null | undefined, fb = "غير متوفر") { return String(v || "").trim() || fb; }

function normalizeContent(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p) => (typeof p === "string" ? p : (p as any)?.text || "")).join("\n").trim();
  return "";
}

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

    const authClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: "جلسة غير صالحة" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sb = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all teacher data in parallel
    const [profileRes, walletRes, assignRes, methodsRes, withdrawRes, groupsRes, messagesRes, notifRes] = await Promise.all([
      sb.from("profiles").select("id, full_name, email, phone, teacher_code, avatar_url, created_at").eq("id", user.id).maybeSingle(),
      sb.from("teacher_wallets").select("balance, total_earned, updated_at").eq("teacher_id", user.id).maybeSingle(),
      sb.from("teacher_assignments").select("stage, grade, category, section").eq("teacher_id", user.id),
      sb.from("teacher_payment_methods").select("method_type, phone_number, is_default").eq("teacher_id", user.id),
      sb.from("teacher_withdrawal_requests").select("amount, status, created_at, payment_method, admin_message").eq("teacher_id", user.id).order("created_at", { ascending: false }).limit(10),
      sb.from("content_groups").select("id, title, price, subject_id, created_at").or(`teacher_id.eq.${user.id},created_by.eq.${user.id}`),
      sb.from("teacher_messages").select("id, is_read, is_from_teacher, created_at", { count: "exact", head: false }).eq("teacher_id", user.id).order("created_at", { ascending: false }).limit(20),
      sb.from("notifications").select("title, message, created_at, is_read").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    ]);

    const stageMap: Record<string, string> = { preparatory: "إعدادي", secondary: "ثانوي" };
    const gradeMap: Record<string, string> = { first: "الأول", second: "الثاني", third: "الثالث" };
    const methodMap: Record<string, string> = { vodafone_cash: "فودافون كاش", orange_cash: "أورانج كاش", etisalat_cash: "اتصالات كاش", instapay: "InstaPay" };

    let ctx = "";
    const p = profileRes.data;
    if (p) {
      ctx += `\n## ملف المعلم\n- الاسم: ${safeText(p.full_name)}\n- البريد: ${safeText(p.email)}\n- الهاتف: ${safeText(p.phone)}\n- كود المعلم: ${safeText(p.teacher_code)}\n- تاريخ التسجيل: ${new Date(p.created_at || "").toLocaleDateString("ar-EG")}\n`;
    }

    if (walletRes.data) {
      ctx += `\n## المحفظة\n- الرصيد المتاح: ${walletRes.data.balance} جنيه\n- إجمالي الأرباح: ${walletRes.data.total_earned} جنيه\n- آخر تحديث: ${walletRes.data.updated_at ? new Date(walletRes.data.updated_at).toLocaleString("ar-EG") : "غير متوفر"}\n`;
    }

    if (assignRes.data?.length) {
      ctx += `\n## التخصصات والصفوف\n`;
      for (const a of assignRes.data) {
        ctx += `- ${a.category} | المرحلة ${stageMap[a.stage] || a.stage} | الصف ${gradeMap[a.grade] || a.grade}\n`;
      }
    }

    if (methodsRes.data?.length) {
      ctx += `\n## طرق الدفع\n`;
      for (const m of methodsRes.data) ctx += `- ${methodMap[m.method_type] || m.method_type}: ${m.phone_number} ${m.is_default ? "(افتراضي)" : ""}\n`;
    }

    // Get student counts per grade
    if (assignRes.data?.length) {
      const { data: choices } = await sb.from("student_teacher_choices").select("student_id, grade, category").eq("teacher_id", user.id);
      if (choices?.length) {
        ctx += `\n## الطلاب\n- إجمالي الطلاب: ${new Set(choices.map(c => c.student_id)).size}\n`;
        const byGrade = new Map<string, Set<string>>();
        for (const c of choices) {
          const key = `${c.category} - ${gradeMap[c.grade] || c.grade}`;
          if (!byGrade.has(key)) byGrade.set(key, new Set());
          byGrade.get(key)!.add(c.student_id);
        }
        for (const [key, students] of byGrade) ctx += `  - ${key}: ${students.size} طالب\n`;
      }
    }

    // Group purchases for earnings
    if (groupsRes.data?.length) {
      const groupIds = groupsRes.data.map(g => g.id);
      const { data: purchases } = await sb.from("student_group_purchases").select("group_id, amount_paid, purchased_at").in("group_id", groupIds);
      
      ctx += `\n## المجموعات والاشتراكات\n`;
      let totalStudentPurchases = 0;
      for (const g of groupsRes.data) {
        const gPurchases = (purchases || []).filter(p => p.group_id === g.id);
        const earned = gPurchases.reduce((s, p) => s + (p.amount_paid || 0) * 0.7, 0);
        totalStudentPurchases += gPurchases.length;
        ctx += `- "${g.title}" | السعر: ${g.price} ج | ${gPurchases.length} مشترك | أرباحك: ${Math.round(earned)} ج\n`;
      }
      ctx += `- إجمالي الاشتراكات في المجموعات: ${totalStudentPurchases}\n`;

      // Monthly breakdown
      const now = new Date();
      const thisMonth = (purchases || []).filter(p => {
        const d = new Date(p.purchased_at);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      const thisMonthEarnings = thisMonth.reduce((s, p) => s + (p.amount_paid || 0) * 0.7, 0);
      ctx += `- أرباح الشهر الحالي: ${Math.round(thisMonthEarnings)} ج (${thisMonth.length} اشتراك)\n`;
    }

    if (withdrawRes.data?.length) {
      ctx += `\n## طلبات السحب\n`;
      for (const w of withdrawRes.data) {
        const st = w.status === "approved" ? "مكتمل" : w.status === "rejected" ? "مرفوض" : "معلق";
        ctx += `- ${w.amount} ج | ${st} | ${new Date(w.created_at).toLocaleDateString("ar-EG")}`;
        if (w.admin_message) ctx += ` | ملاحظة: ${w.admin_message}`;
        ctx += "\n";
      }
    }

    const unreadMsgs = (messagesRes.data || []).filter(m => !m.is_read && !m.is_from_teacher).length;
    ctx += `\n## الرسائل\n- رسائل غير مقروءة من الطلاب: ${unreadMsgs}\n`;

    const unreadNotifs = (notifRes.data || []).filter(n => !n.is_read).length;
    ctx += `\n## الإشعارات\n- إشعارات غير مقروءة: ${unreadNotifs}\n`;

    const today = new Date();
    const todayStr = today.toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    const systemPrompt = `أنت موظف دعم ذكي ومحترم لمنصة "مدرك Plus" التعليمية، والمنصة الآن تخدم التعليم العام والتعليم الأزهري معاً. تتحدث بالعربية المصرية بلباقة واحترام.

## التاريخ الحالي
اليوم هو: ${todayStr}
التاريخ بالميلادي: ${today.toISOString().split("T")[0]}

## شخصيتك
- موظف دعم محترف وودود ومحترم
- تخاطب المعلم بـ "حضرتك" أو "مستر/أستاذ ${p?.full_name || ""}"
- سريع ودقيق في الإجابات
- تقدم معلومات عملية ومفيدة

## صلاحياتك
- الاطلاع على بيانات المعلم المرفقة (الطلاب، الأرباح، المجموعات، طرق الدفع، طلبات السحب)
- المساعدة في: إدارة المحتوى، الأرباح، السحب، طرق الدفع، الطلاب، المجموعات، الإعدادات
- تحليل أداء المعلم وتقديم نصائح

## القواعد
- لا تذكر بيانات حساسة (كلمات سر)
- أجب بدقة بناءً على البيانات المتاحة
- إذا لم تعرف الإجابة، قل ذلك بوضوح
- استخدم النقاط والخطوات المباشرة
- نسبة أرباح المعلم 70% من سعر المجموعة
- طلبات السحب تستغرق حتى 3 أيام عمل

${ctx}`;

    const gatewayMessages = [{ role: "system", content: systemPrompt }, ...(Array.isArray(messages) ? messages.slice(-12) : [])];

    const modelsToTry = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"];
    let content = "";

    for (const model of modelsToTry) {
      try {
        const aiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages: gatewayMessages, stream: false }),
        });

        if (!aiResponse.ok) {
          if (aiResponse.status === 429) { continue; }
          if (aiResponse.status === 401 || aiResponse.status === 403) return new Response(JSON.stringify({ error: "تحقق من مفتاح GEMINI_API_KEY" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          continue;
        }

        const aiData = await aiResponse.json();
        content = normalizeContent(aiData?.choices?.[0]?.message?.content);
        if (content) break;
      } catch (e) { console.error("Model error:", model, e); continue; }
    }

    content ||= "أنا موجود لمساعدتك، أعد إرسال طلبك.";

    return new Response(JSON.stringify({ content }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("teacher-assistant error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

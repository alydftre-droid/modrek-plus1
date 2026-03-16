import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, userId } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not set");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Fetch student context
    let studentContext = "";
    if (userId) {
      const [profileRes, walletRes, subsRes, depositsRes, usageRes] = await Promise.all([
        sb.from("profiles").select("*").eq("id", userId).maybeSingle(),
        sb.from("wallets").select("balance").eq("user_id", userId).maybeSingle(),
        sb.from("subscriptions").select("*, subjects(name)").eq("student_id", userId).order("created_at", { ascending: false }).limit(5),
        sb.from("deposit_requests").select("amount, status, created_at, payment_method").eq("student_id", userId).order("created_at", { ascending: false }).limit(5),
        sb.from("usage_logs").select("action, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
      ]);

      const p = profileRes.data;
      if (p) {
        const stageMap: Record<string, string> = { preparatory: "إعدادي", secondary: "ثانوي" };
        const gradeMap: Record<string, string> = { first: "الأول", second: "الثاني", third: "الثالث" };
        const sectionMap: Record<string, string> = { scientific: "علمي", literary: "أدبي" };
        studentContext += `\n## بيانات الطالب\n`;
        studentContext += `- الاسم: ${p.full_name}\n`;
        studentContext += `- البريد: ${p.email}\n`;
        studentContext += `- كود الطالب: ${p.student_code || "غير متوفر"}\n`;
        studentContext += `- المرحلة: ${stageMap[p.stage || ""] || p.stage || "غير محدد"}\n`;
        studentContext += `- الصف: ${gradeMap[p.grade || ""] || p.grade || "غير محدد"}\n`;
        if (p.section) studentContext += `- القسم: ${sectionMap[p.section] || p.section}\n`;
        studentContext += `- الهاتف: ${p.phone || "غير متوفر"}\n`;
      }

      if (walletRes.data) {
        studentContext += `\n## المحفظة\n- الرصيد الحالي: ${walletRes.data.balance} جنيه\n`;
      }

      if (subsRes.data && subsRes.data.length > 0) {
        studentContext += `\n## الاشتراكات (آخر 5)\n`;
        for (const s of subsRes.data) {
          const subjectName = (s as any).subjects?.name || "غير معروف";
          studentContext += `- ${subjectName}: من ${s.start_date} إلى ${s.end_date} (${s.is_active ? "نشط" : "منتهي"})\n`;
        }
      }

      if (depositsRes.data && depositsRes.data.length > 0) {
        studentContext += `\n## آخر طلبات الإيداع\n`;
        for (const d of depositsRes.data) {
          studentContext += `- ${d.amount} جنيه - ${d.status === "approved" ? "مقبول" : d.status === "rejected" ? "مرفوض" : "قيد المراجعة"} - ${new Date(d.created_at).toLocaleDateString("ar-EG")}\n`;
        }
      }

      if (usageRes.data && usageRes.data.length > 0) {
        studentContext += `\n## آخر نشاط\n`;
        for (const u of usageRes.data) {
          studentContext += `- ${u.action} - ${new Date(u.created_at).toLocaleDateString("ar-EG")}\n`;
        }
      }
    }

    const systemPrompt = `أنت مساعد ذكي لمنصة "الأزهر التعليمية" (Azhar LearnVerse). أنت بمثابة الدعم الفني للطلاب.

## عن المنصة
- منصة تعليمية مخصصة لطلاب الأزهر الشريف (إعدادي وثانوي)
- تتضمن مواد: العربية، الشرعية، العلمية (فيزياء/كيمياء/أحياء)، الأدبية، والإنجليزية
- لكل مادة معلمين يمكن للطالب الاختيار بينهم
- نظام اشتراكات شهرية لكل مادة
- نظام محفظة إلكترونية للإيداع والشراء
- مساعد ذكي يشرح الدروس بالصوت والصورة
- مكتبة شخصية لرفع كتب PDF والتعلم منها

## كيف تساعد الطالب
- التنقل في المنصة: الصفحة الرئيسية ← أقسام المواد ← اختيار المادة ← اختيار المعلم ← المجموعات والدروس
- الاشتراك: من صفحة المعلم ← اضغط "اشترك" ← ادفع من المحفظة أو ارفع إيصال
- الإيداع: من "محفظتي" ← "إيداع جديد" ← ادخل المبلغ ورقم الهاتف وارفع الإيصال
- تغيير البيانات: من "الإعدادات" أو "ملفي الشخصي"
- المكتبة: من "مكتبتي" ← ارفع كتاب PDF ← اضغط على الكتاب لتفعيل المساعد الذكي
- الدعم: من "الدعم الفني" في القائمة الجانبية

## قواعد
- لا تكشف كلمات السر أو بيانات حساسة أبداً
- إذا لم تستطع حل المشكلة، قل للطالب: "سأقوم بتحويلك للدعم الفني" واطلب منه كتابة "تحويل للدعم"
- كن ودوداً ومختصراً
- إذا طلب الطالب التحدث مع الدعم أو خدمة العملاء، أجب بـ: [ESCALATE_TO_SUPPORT]
- إذا شعرت أن المشكلة تحتاج تدخل بشري، أجب بـ: [ESCALATE_TO_SUPPORT]
- قدم اقتراحات سريعة للطالب في نهاية ردودك

${studentContext}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "تم تجاوز الحد المسموح، حاول لاحقاً" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "يرجى إضافة رصيد" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      return new Response(JSON.stringify({ error: "خطأ في المساعد الذكي" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("support-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

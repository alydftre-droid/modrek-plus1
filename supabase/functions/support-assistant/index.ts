import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function formatRoleLabel(role: string | null) {
  switch (role) {
    case "admin":
      return "إداري";
    case "teacher":
      return "معلم";
    case "support":
      return "دعم";
    default:
      return "طالب";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not set");

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "جلسة المستخدم غير صالحة" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, supabaseServiceKey);

    const [profileRes, walletRes, subsRes, depositsRes, usageRes, examAttemptsRes, roleRes, supportRes] = await Promise.all([
      sb.from("profiles").select("id, full_name, email, phone, stage, grade, section, student_code").eq("id", user.id).maybeSingle(),
      sb.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
      sb
        .from("subscriptions")
        .select("start_date, end_date, is_active, teacher_id, subjects(name)")
        .eq("student_id", user.id)
        .order("created_at", { ascending: false })
        .limit(6),
      sb
        .from("deposit_requests")
        .select("amount, status, created_at, payment_method, admin_message, rejection_reason")
        .eq("student_id", user.id)
        .order("created_at", { ascending: false })
        .limit(6),
      sb
        .from("usage_logs")
        .select("action, created_at, duration_minutes")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
      sb
        .from("exam_attempts")
        .select("score, total, submitted_at, exams(title, subjects:subject_id(name))")
        .eq("student_id", user.id)
        .order("submitted_at", { ascending: false })
        .limit(6),
      sb.from("user_roles").select("role").eq("user_id", user.id).limit(5),
      sb
        .from("support_messages")
        .select("message, is_from_admin, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

    let studentContext = "";
    const p = profileRes.data;
    const roles = (roleRes.data || []).map((item) => formatRoleLabel(item.role)).join("، ") || "طالب";

    if (p) {
      const stageMap: Record<string, string> = { preparatory: "إعدادي", secondary: "ثانوي" };
      const gradeMap: Record<string, string> = { first: "الأول", second: "الثاني", third: "الثالث" };
      const sectionMap: Record<string, string> = { scientific: "علمي", literary: "أدبي" };
      studentContext += `\n## ملف الطالب\n`;
      studentContext += `- الاسم: ${p.full_name}\n`;
      studentContext += `- نوع الحساب: ${roles}\n`;
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

    if (subsRes.data?.length) {
      studentContext += `\n## الاشتراكات الأخيرة\n`;
      for (const subscription of subsRes.data) {
        const subjectName = (subscription as any).subjects?.name || "غير معروف";
        studentContext += `- ${subjectName}: من ${subscription.start_date} إلى ${subscription.end_date} (${subscription.is_active ? "نشط" : "غير نشط"})\n`;
      }
    }

    if (depositsRes.data?.length) {
      studentContext += `\n## آخر طلبات الإيداع\n`;
      for (const deposit of depositsRes.data) {
        const statusLabel =
          deposit.status === "approved" ? "مقبول" : deposit.status === "rejected" ? "مرفوض" : "قيد المراجعة";
        studentContext += `- ${deposit.amount} جنيه | ${statusLabel} | ${new Date(deposit.created_at).toLocaleDateString("ar-EG")}\n`;
        if (deposit.admin_message) studentContext += `  • رسالة الإدارة: ${deposit.admin_message}\n`;
        if (deposit.rejection_reason) studentContext += `  • سبب الرفض: ${deposit.rejection_reason}\n`;
      }
    }

    if (usageRes.data?.length) {
      studentContext += `\n## آخر نشاط داخل المنصة\n`;
      for (const usage of usageRes.data) {
        studentContext += `- ${usage.action} | ${new Date(usage.created_at).toLocaleString("ar-EG")} | المدة: ${usage.duration_minutes || 0} دقيقة\n`;
      }
    }

    if (examAttemptsRes.data?.length) {
      studentContext += `\n## آخر الامتحانات\n`;
      for (const attempt of examAttemptsRes.data) {
        const examTitle = (attempt as any).exams?.title || "امتحان";
        const subjectName = (attempt as any).exams?.subjects?.name || "مادة غير محددة";
        studentContext += `- ${subjectName} / ${examTitle}: ${attempt.score}/${attempt.total} بتاريخ ${new Date(attempt.submitted_at).toLocaleDateString("ar-EG")}\n`;
      }
    }

    if (supportRes.data?.length) {
      studentContext += `\n## آخر رسائل الدعم\n`;
      for (const message of supportRes.data) {
        studentContext += `- ${message.is_from_admin ? "الدعم" : "الطالب"}: ${message.message.slice(0, 140)}\n`;
      }
    }

    const systemPrompt = `أنت موظف دعم حقيقي ولطيف جداً لمنصة "الأزهر التعليمية". تتحدث بالعربية المصرية بشكل مهذب واحترافي ومختصر وواضح، وكأنك موظف خدمة عملاء ممتاز.

## مهمتك
- حل مشاكل الطالب داخل المنصة خطوة بخطوة.
- الاعتماد على بيانات الحساب والسجل المرفقين لك لفهم حالة الطالب الحالية.
- شرح التنقل داخل المنصة بوضوح: الرئيسية، المواد، المعلم، الدروس، المحفظة، الإعدادات، مكتبة الطالب، وتقارير التقدم.
- إذا أرسل الطالب صورة مشكلة، حلل الصورة واستنتج المشكلة ثم قدم الحل بدقة.
- لا تذكر أي أسرار أو بيانات حساسة أو كلمات مرور أو رموز دخول.
- يمكنك ذكر الرصيد الحالي، آخر اشتراك، آخر إيداع، وآخر نشاطات آمنة فقط.
- لو طلب الطالب التحويل للدعم البشري، أو كان الحل يحتاج تدخل موظف بشري، أو كانت المشكلة غير واضحة/حساسة/مالية معقدة، أجب فقط داخل الرد نفسه بالعلامة: [ESCALATE_TO_SUPPORT]
- قبل التصعيد حاول مساعدته بلطف، لكن إذا لزم الأمر فصعّد فوراً.
- اختم معظم الردود باقتراحات قصيرة قابلة للتنفيذ.

## أمثلة للأسئلة التي تجيب عنها
- كيف أشترك في مادة؟
- لماذا لم يظهر الإيداع؟
- كيف أغير كلمة السر؟
- أين آخر اشتراك؟
- ما آخر نشاط قمت به؟
- لماذا لا يفتح الكتاب أو الامتحان؟
- كيف أصل لصفحة المعلم أو التقارير؟

${studentContext}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, ...(messages || [])],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "تم تجاوز الحد المسموح، حاول لاحقاً" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "يرجى إضافة رصيد لاستخدام الذكاء الاصطناعي" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const errorText = await response.text();
      console.error("AI error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "خطأ في المساعد الذكي" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("support-assistant error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

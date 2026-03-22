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

function normalizeAssistantContent(content: unknown) {
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
  return "";
}

function safeText(value: string | null | undefined, fallback = "غير متوفر") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
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

    const [profileRes, walletRes, subsRes, depositsRes, usageRes, examAttemptsRes, roleRes, supportRes, teacherChoicesRes, purchasesRes] = await Promise.all([
      sb.from("profiles").select("id, full_name, email, phone, stage, grade, section, student_code, created_at").eq("id", user.id).maybeSingle(),
      sb.from("wallets").select("balance, updated_at").eq("user_id", user.id).maybeSingle(),
      sb
        .from("subscriptions")
        .select("start_date, end_date, is_active, teacher_id, subjects(name)")
        .eq("student_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
      sb
        .from("deposit_requests")
        .select("amount, status, created_at, payment_method, admin_message, rejection_reason")
        .eq("student_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
      sb
        .from("usage_logs")
        .select("action, created_at, duration_minutes")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(12),
      sb
        .from("exam_attempts")
        .select("score, total, submitted_at, exams(title, subjects:subject_id(name))")
        .eq("student_id", user.id)
        .order("submitted_at", { ascending: false })
        .limit(10),
      sb.from("user_roles").select("role").eq("user_id", user.id).limit(5),
      sb
        .from("support_messages")
        .select("message, is_from_admin, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(8),
      sb
        .from("student_teacher_choices")
        .select("category, stage, grade, teacher_id, created_at")
        .eq("student_id", user.id)
        .limit(10),
      sb
        .from("student_group_purchases")
        .select("amount_paid, purchased_at, group_id")
        .eq("student_id", user.id)
        .order("purchased_at", { ascending: false })
        .limit(10),
    ]);

    const teacherIds = Array.from(new Set([
      ...(subsRes.data || []).map((item) => item.teacher_id).filter(Boolean),
      ...(teacherChoicesRes.data || []).map((item) => item.teacher_id).filter(Boolean),
    ]));

    const teacherProfilesRes = teacherIds.length
      ? await sb.from("profiles").select("id, full_name").in("id", teacherIds)
      : { data: [], error: null };

    const teacherNameMap = new Map((teacherProfilesRes.data || []).map((item) => [item.id, item.full_name]));

    let studentContext = "";
    const p = profileRes.data;
    const roles = (roleRes.data || []).map((item) => formatRoleLabel(item.role)).join("، ") || "طالب";

    if (p) {
      const stageMap: Record<string, string> = { preparatory: "إعدادي", secondary: "ثانوي" };
      const gradeMap: Record<string, string> = { first: "الأول", second: "الثاني", third: "الثالث" };
      const sectionMap: Record<string, string> = { scientific: "علمي", literary: "أدبي" };
      studentContext += `\n## ملف الطالب\n`;
      studentContext += `- الاسم: ${safeText(p.full_name)}\n`;
      studentContext += `- نوع الحساب: ${roles}\n`;
      studentContext += `- البريد: ${safeText(p.email)}\n`;
      studentContext += `- كود الطالب: ${safeText(p.student_code)}\n`;
      studentContext += `- تاريخ التسجيل: ${new Date(p.created_at || user.created_at).toLocaleDateString("ar-EG")}\n`;
      studentContext += `- المرحلة: ${stageMap[p.stage || ""] || p.stage || "غير محدد"}\n`;
      studentContext += `- الصف: ${gradeMap[p.grade || ""] || p.grade || "غير محدد"}\n`;
      if (p.section) studentContext += `- القسم: ${sectionMap[p.section] || p.section}\n`;
      studentContext += `- الهاتف: ${safeText(p.phone)}\n`;
    }

    if (walletRes.data) {
      studentContext += `\n## المحفظة\n- الرصيد الحالي: ${walletRes.data.balance} جنيه\n- آخر تحديث للرصيد: ${walletRes.data.updated_at ? new Date(walletRes.data.updated_at).toLocaleString("ar-EG") : "غير متوفر"}\n`;
    }

    if (subsRes.data?.length) {
      studentContext += `\n## الاشتراكات\n`;
      for (const subscription of subsRes.data) {
        const subjectName = (subscription as any).subjects?.name || "غير معروف";
        const teacherName = teacherNameMap.get(subscription.teacher_id || "") || (subscription.teacher_id ? `المعلم ${subscription.teacher_id}` : "غير محدد");
        studentContext += `- ${subjectName}: من ${new Date(subscription.start_date).toLocaleDateString("ar-EG")} إلى ${new Date(subscription.end_date).toLocaleDateString("ar-EG")} (${subscription.is_active ? "نشط" : "غير نشط"}) | ${teacherName}\n`;
      }
    }

    if (teacherChoicesRes.data?.length) {
      studentContext += `\n## المعلمون المرتبطون بالطالب\n`;
      for (const choice of teacherChoicesRes.data) {
        const teacherName = teacherNameMap.get(choice.teacher_id) || `المعلم ${choice.teacher_id}`;
        studentContext += `- ${teacherName} | فئة ${choice.category} | ${choice.stage} | ${choice.grade}\n`;
      }
    }

    if (depositsRes.data?.length) {
      studentContext += `\n## آخر طلبات الإيداع\n`;
      for (const deposit of depositsRes.data) {
        const statusLabel = deposit.status === "approved" ? "مقبول" : deposit.status === "rejected" ? "مرفوض" : "قيد المراجعة";
        studentContext += `- ${deposit.amount} جنيه | ${statusLabel} | ${new Date(deposit.created_at).toLocaleDateString("ar-EG")} | ${deposit.payment_method || "وسيلة غير محددة"}\n`;
        if (deposit.admin_message) studentContext += `  • رسالة الإدارة: ${deposit.admin_message}\n`;
        if (deposit.rejection_reason) studentContext += `  • سبب الرفض: ${deposit.rejection_reason}\n`;
      }
    }

    if (purchasesRes.data?.length) {
      studentContext += `\n## آخر المشتريات\n`;
      for (const purchase of purchasesRes.data) {
        studentContext += `- شراء مجموعة ${purchase.group_id} | المبلغ ${purchase.amount_paid || 0} جنيه | ${new Date(purchase.purchased_at).toLocaleDateString("ar-EG")}\n`;
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
        studentContext += `- ${message.is_from_admin ? "الدعم" : "الطالب"}: ${message.message.slice(0, 160)}\n`;
      }
    }

    const systemPrompt = `أنت موظف دعم ذكي جداً ولطيف جداً لمنصة تعليمية اسمها "الأزهر التعليمية". تتحدث بالعربية المصرية بشكل طبيعي جداً، وكأنك موظف دعم محترف وحقيقي.

## أسلوبك
- ودود، ذكي، سريع الفهم، وعملي.
- لا تكتب ردوداً فارغة أبداً.
- إذا لم تكفِ البيانات، قل ما تعرفه بدقة واسأل سؤالاً واحداً واضحاً فقط.
- استخدم نقاط قصيرة وخطوات مباشرة.
- لا تذكر أي أسرار أو رموز دخول أو بيانات حساسة غير آمنة.

## صلاحياتك داخل الحوار
- لديك صلاحية الاطلاع على بيانات الحساب الآمنة المرفقة في السياق فقط.
- يمكنك مساعدة الطالب في: الاشتراك، الدفعات، الإيداع، الرصيد، المواد، المعلمين، آخر النشاط، الامتحانات، والمشاكل العامة داخل المنصة.
- إذا أرسل صورة، فحلل الصورة كجزء من المشكلة.
- إذا احتاج الطالب لموظف بشري أو كانت الحالة تتطلب متابعة بشرية، ضع داخل الرد العلامة [ESCALATE_TO_SUPPORT] مرة واحدة فقط.

## المطلوب منك
- افهم السؤال بدقة من أول مرة.
- إن كانت المشكلة واضحة، أعطِ السبب ثم الحل.
- إن كان السؤال عن الحساب، اعتمد على السجل الحقيقي المرفق.
- اختم غالباً باقتراح خطوة تالية واضحة.

${studentContext}`;

    const gatewayMessages = [{ role: "system", content: systemPrompt }, ...(Array.isArray(messages) ? messages.slice(-12) : [])];
    const modelsToTry = ["google/gemini-3-flash-preview", "google/gemini-2.5-flash", "openai/gpt-5-mini"];
    let content = "";

    for (const model of modelsToTry) {
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: gatewayMessages,
          stream: false,
        }),
      });

      if (!aiResponse.ok) {
        if (aiResponse.status === 429) {
          return new Response(JSON.stringify({ error: "تم تجاوز الحد المسموح، حاول لاحقاً" }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (aiResponse.status === 402) {
          return new Response(JSON.stringify({ error: "يرجى إضافة رصيد لاستخدام الذكاء الاصطناعي" }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const errorText = await aiResponse.text();
        console.error("AI error:", model, aiResponse.status, errorText);
        continue;
      }

      const aiData = await aiResponse.json();
      content = normalizeAssistantContent(aiData?.choices?.[0]?.message?.content);
      if (content) break;
    }

    content ||= "أنا موجود لمساعدتك الآن، لكن أعد إرسال طلبك بصياغة أوضح أو أرسل صورة للمشكلة وسأكمل معك فوراً.";

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("support-assistant error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

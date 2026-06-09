import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { loadAiSettings, callGeminiWithFallback, detectAiFailureKind, fallbackAssistantResponse } from "../_shared/aiSettings.ts";
import { getJwtClaimsFromAuthHeader } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function safeText(v: string | null | undefined, fb = "غير متوفر") { return String(v || "").trim() || fb; }

function normalizeContent(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p) => (typeof p === "string" ? p : (p as any)?.text || "")).join("\n").trim();
  return "";
}

function validateTeacherMessages(messages: unknown) {
  if (!Array.isArray(messages)) return { ok: false, reason: "messages_not_array" };
  const content = messages.map((msg: any) => normalizeContent(msg?.content)).join("\n").trim();
  if (!content) return { ok: false, reason: "empty_message" };
  return { ok: true as const };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "غير مصرح" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const { messages, stream: clientWantsStream } = body;
    const payloadState = validateTeacherMessages(messages);
    if (!payloadState.ok) {
      return fallbackAssistantResponse({
        audience: "teacher",
        corsHeaders,
        functionName: "teacher-assistant",
        kind: payloadState.reason === "empty_message" ? "empty" : "service",
        lastError: payloadState.reason,
        message: payloadState.reason === "empty_message"
          ? "اكتب سؤالك أولاً وسأساعدك مباشرة."
          : "صيغة الرسائل غير صحيحة. أعد المحاولة من فضلك.",
      });
    }


    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

    const claims = getJwtClaimsFromAuthHeader(authHeader);
    const userId = claims?.sub;
    if (!userId) return new Response(JSON.stringify({ error: "جلسة غير صالحة" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const user = { id: userId } as { id: string };

    const sb = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all teacher data in parallel
    const [profileRes, walletRes, assignRes, methodsRes, withdrawRes, groupsRes, messagesRes, notifRes, contentRes, examsRes, settingsRes, commRes, earningsRes] = await Promise.all([
      sb.from("profiles").select("id, full_name, email, phone, teacher_code, avatar_url, created_at, commission_rate, pending_commission_rate, pending_effective_date, bio, education_type").eq("id", user.id).maybeSingle(),
      sb.from("teacher_wallets").select("balance, frozen_balance, total_earned, current_period, updated_at").eq("teacher_id", user.id).maybeSingle(),
      sb.from("teacher_assignments").select("stage, grade, category, section, education_type").eq("teacher_id", user.id),
      sb.from("teacher_payment_methods").select("method_type, phone_number, is_default").eq("teacher_id", user.id),
      sb.from("teacher_withdrawal_requests").select("amount, status, created_at, payment_method, admin_message").eq("teacher_id", user.id).order("created_at", { ascending: false }).limit(10),
      sb.from("content_groups").select("id, title, price, subject_id, is_active, created_at").or(`teacher_id.eq.${user.id},created_by.eq.${user.id}`),
      sb.from("teacher_messages").select("id, is_read, is_from_teacher, created_at, student_id", { count: "exact", head: false }).eq("teacher_id", user.id).order("created_at", { ascending: false }).limit(50),
      sb.from("notifications").select("title, message, created_at, is_read").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
      sb.from("content").select("id, type, group_id, created_at, is_active").eq("uploaded_by", user.id),
      sb.from("exams").select("id, title, group_id, is_published, created_at").eq("created_by", user.id),
      sb.from("platform_settings").select("key, value").in("key", ["withdrawal_open_day", "withdrawal_manual_state", "teacher_commission_rate", "platform_name", "support_phone", "support_whatsapp"]),
      sb.rpc("get_effective_teacher_commission", { _teacher_id: user.id }),
      sb.from("teacher_earning_records").select("group_id, gross_amount, net_amount, period_label, student_id, created_at").eq("teacher_id", user.id).order("created_at", { ascending: false }).limit(200),
    ]);

    const stageMap: Record<string, string> = { preparatory: "إعدادي", secondary: "ثانوي" };
    const gradeMap: Record<string, string> = { first: "الأول", second: "الثاني", third: "الثالث" };
    const methodMap: Record<string, string> = { vodafone_cash: "فودافون كاش", orange_cash: "أورانج كاش", etisalat_cash: "اتصالات كاش", instapay: "InstaPay" };

    let ctx = "";
    const p = profileRes.data;
    const settingsMap = new Map<string, string>((settingsRes.data || []).map((s: any) => [s.key, s.value]));
    const commissionRate = typeof commRes.data === "number" ? commRes.data : (Number(p?.commission_rate) || 0.7);
    const commissionPct = Math.round(commissionRate * 100);
    const withdrawalOpenDay = parseInt(settingsMap.get("withdrawal_open_day") || "25", 10);
    const withdrawalManual = settingsMap.get("withdrawal_manual_state") || "auto";

    if (p) {
      ctx += `\n## ملف المعلم\n- الاسم: ${safeText(p.full_name)}\n- البريد: ${safeText(p.email)}\n- الهاتف: ${safeText(p.phone)}\n- كود المعلم: ${safeText(p.teacher_code)}\n- نوع التعليم: ${safeText(p.education_type)}\n- النبذة: ${safeText(p.bio, "لم تُكتب بعد")}\n- تاريخ التسجيل: ${new Date(p.created_at || "").toLocaleDateString("ar-EG")}\n- نسبة العمولة الحالية: ${commissionPct}%${p.pending_commission_rate ? ` (تعديل مجدول إلى ${Math.round(p.pending_commission_rate*100)}% بتاريخ ${p.pending_effective_date})` : ""}\n`;
    }

    if (walletRes.data) {
      ctx += `\n## المحفظة\n- الرصيد المتاح للسحب: ${walletRes.data.balance} جنيه\n- الرصيد المجمّد (أرباح الفترة الجارية): ${walletRes.data.frozen_balance || 0} جنيه\n- إجمالي الأرباح منذ البداية: ${walletRes.data.total_earned} جنيه\n- الفترة الحالية: ${safeText(walletRes.data.current_period)}\n- آخر تحديث: ${walletRes.data.updated_at ? new Date(walletRes.data.updated_at).toLocaleString("ar-EG") : "غير متوفر"}\n`;
    }

    ctx += `\n## نظام السحب\n- يوم فتح السحب الشهري: يوم ${withdrawalOpenDay} من كل شهر\n- الحالة الحالية: ${withdrawalManual === "open" ? "مفتوح يدوياً" : withdrawalManual === "closed" ? "مغلق يدوياً" : "تلقائي حسب اليوم"}\n`;

    if (assignRes.data?.length) {
      ctx += `\n## التخصصات والصفوف المسنّدة\n`;
      for (const a of assignRes.data) {
        ctx += `- ${a.category} | ${stageMap[a.stage] || a.stage} | الصف ${gradeMap[a.grade] || a.grade}${a.section ? ` | شعبة ${a.section}` : ""}${a.education_type ? ` | ${a.education_type}` : ""}\n`;
      }
    }

    if (methodsRes.data?.length) {
      ctx += `\n## طرق الدفع المسجلة\n`;
      for (const m of methodsRes.data) ctx += `- ${methodMap[m.method_type] || m.method_type}: ${m.phone_number} ${m.is_default ? "(افتراضي)" : ""}\n`;
    } else {
      ctx += `\n## طرق الدفع\n- لم يضف أي طريقة دفع بعد. لازم يضيفها من /teacher/settings قبل أي طلب سحب.\n`;
    }

    // Students with names
    const { data: choices } = await sb.from("student_teacher_choices").select("student_id, grade, category, created_at").eq("teacher_id", user.id);
    const studentIds = Array.from(new Set((choices || []).map((c: any) => c.student_id)));
    const studentNames = new Map<string, string>();
    if (studentIds.length) {
      const { data: studentProfiles } = await sb.from("profiles").select("id, full_name, student_code").in("id", studentIds);
      for (const s of studentProfiles || []) studentNames.set(s.id, `${s.full_name || "طالب"}${s.student_code ? ` (${s.student_code})` : ""}`);
    }
    if (choices?.length) {
      ctx += `\n## الطلاب\n- إجمالي الطلاب اللي اختاروك: ${studentIds.length}\n`;
      const byGrade = new Map<string, Set<string>>();
      for (const c of choices) {
        const key = `${c.category} - ${gradeMap[c.grade] || c.grade}`;
        if (!byGrade.has(key)) byGrade.set(key, new Set());
        byGrade.get(key)!.add(c.student_id);
      }
      for (const [key, students] of byGrade) ctx += `  - ${key}: ${students.size} طالب\n`;
      const recent = [...choices].sort((a: any, b: any) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 5);
      ctx += `- آخر 5 طلاب اختاروك:\n`;
      for (const r of recent) ctx += `  • ${studentNames.get(r.student_id) || "طالب"} — ${new Date(r.created_at).toLocaleDateString("ar-EG")}\n`;
    } else {
      ctx += `\n## الطلاب\n- لسه مفيش طلاب اختاروك.\n`;
    }

    // Groups with earnings (using real commission rate)
    const groupTitles = new Map<string, { title: string; price: number }>();
    if (groupsRes.data?.length) {
      for (const g of groupsRes.data) groupTitles.set(g.id, { title: g.title, price: Number(g.price) || 0 });
      const groupIds = groupsRes.data.map((g: any) => g.id);
      const { data: purchases } = await sb.from("student_group_purchases").select("group_id, amount_paid, purchased_at, student_id").in("group_id", groupIds);

      ctx += `\n## المجموعات والاشتراكات (إجمالي: ${groupsRes.data.length} مجموعة)\n`;
      let totalSubs = 0;
      const rows: { title: string; price: number; count: number; earned: number; active: boolean }[] = [];
      for (const g of groupsRes.data) {
        const gp = (purchases || []).filter((pp: any) => pp.group_id === g.id);
        const earned = gp.reduce((s: number, pp: any) => s + (Number(pp.amount_paid) || 0) * commissionRate, 0);
        totalSubs += gp.length;
        rows.push({ title: g.title, price: Number(g.price) || 0, count: gp.length, earned: Math.round(earned), active: !!g.is_active });
      }
      rows.sort((a, b) => b.earned - a.earned);
      for (const r of rows) ctx += `- "${r.title}"${r.active ? "" : " (غير نشطة)"} | ${r.price} ج | ${r.count} مشترك | أرباحك: ${r.earned} ج\n`;
      ctx += `- إجمالي الاشتراكات: ${totalSubs}\n`;

      const now = new Date();
      const thisMonth = (purchases || []).filter((pp: any) => {
        const d = new Date(pp.purchased_at);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      const thisMonthEarnings = thisMonth.reduce((s: number, pp: any) => s + (Number(pp.amount_paid) || 0) * commissionRate, 0);
      ctx += `- اشتراكات الشهر الحالي: ${thisMonth.length} | أرباح الشهر: ${Math.round(thisMonthEarnings)} ج\n`;

      const recentP = [...(purchases || [])].sort((a: any, b: any) => +new Date(b.purchased_at) - +new Date(a.purchased_at)).slice(0, 5);
      if (recentP.length) {
        ctx += `- آخر 5 اشتراكات:\n`;
        for (const rp of recentP) {
          const gt = groupTitles.get(rp.group_id);
          ctx += `  • ${studentNames.get(rp.student_id) || "طالب"} → "${gt?.title || "مجموعة"}" بـ ${rp.amount_paid} ج — ${new Date(rp.purchased_at).toLocaleDateString("ar-EG")}\n`;
        }
      }
    } else {
      ctx += `\n## المجموعات\n- لسه مفيش مجموعات. ينشئها من /teacher/upload/:subjectId.\n`;
    }

    // Content + exams stats
    const cArr = contentRes.data || [];
    const eArr = examsRes.data || [];
    if (cArr.length || eArr.length) {
      const videos = cArr.filter((x: any) => x.type === "video").length;
      const files = cArr.filter((x: any) => x.type === "file" || x.type === "pdf").length;
      const others = cArr.length - videos - files;
      const publishedExams = eArr.filter((e: any) => e.is_published).length;
      ctx += `\n## المحتوى المرفوع\n- فيديوهات: ${videos} | ملفات/PDF: ${files}${others > 0 ? ` | محتوى آخر: ${others}` : ""}\n- إجمالي الامتحانات: ${eArr.length} (منشور: ${publishedExams} | مسودة: ${eArr.length - publishedExams})\n`;
    } else {
      ctx += `\n## المحتوى\n- لم يرفع أي محتوى أو امتحانات بعد.\n`;
    }

    if (withdrawRes.data?.length) {
      ctx += `\n## طلبات السحب (آخر 10)\n`;
      for (const w of withdrawRes.data) {
        const st = w.status === "approved" ? "مكتمل ✓" : w.status === "rejected" ? "مرفوض ✗" : "قيد المراجعة ⏳";
        ctx += `- ${w.amount} ج | ${st} | ${methodMap[w.payment_method] || w.payment_method} | ${new Date(w.created_at).toLocaleDateString("ar-EG")}`;
        if (w.admin_message) ctx += ` | ملاحظة الإدارة: ${w.admin_message}`;
        ctx += "\n";
      }
    } else {
      ctx += `\n## طلبات السحب\n- لم يقدم أي طلب سحب بعد.\n`;
    }

    const studentMsgs = (messagesRes.data || []).filter((m: any) => !m.is_from_teacher);
    const unreadMsgs = studentMsgs.filter((m: any) => !m.is_read).length;
    const uniqueChatStudents = new Set(studentMsgs.map((m: any) => m.student_id)).size;
    ctx += `\n## الرسائل\n- عدد الطلاب اللي راسلوك: ${uniqueChatStudents}\n- رسائل غير مقروءة من الطلاب: ${unreadMsgs}\n`;

    const unreadNotifs = (notifRes.data || []).filter((n: any) => !n.is_read).length;
    ctx += `\n## الإشعارات\n- إشعارات غير مقروءة: ${unreadNotifs}\n`;
    const recentNotifs = (notifRes.data || []).slice(0, 5);
    if (recentNotifs.length) {
      ctx += `- آخر إشعارات:\n`;
      for (const n of recentNotifs) ctx += `  • ${n.title} — ${new Date(n.created_at).toLocaleDateString("ar-EG")}${n.is_read ? "" : " (غير مقروء)"}\n`;
    }

    // Earnings per period (last 6 months)
    if (earningsRes.data?.length) {
      const byPeriod = new Map<string, { gross: number; net: number; count: number }>();
      for (const e of earningsRes.data) {
        const k = e.period_label;
        if (!byPeriod.has(k)) byPeriod.set(k, { gross: 0, net: 0, count: 0 });
        const v = byPeriod.get(k)!;
        v.gross += Number(e.gross_amount) || 0;
        v.net += Number(e.net_amount) || 0;
        v.count += 1;
      }
      const sorted = [...byPeriod.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
      ctx += `\n## كشف الأرباح الشهري (آخر ${sorted.length} شهور)\n`;
      for (const [period, v] of sorted) ctx += `- ${period}: ${v.count} اشتراك | إجمالي ${Math.round(v.gross)} ج | صافي لك ${Math.round(v.net)} ج\n`;
    }

    const today = new Date();
    const todayStr = today.toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    const teacherFirstName = (p?.full_name || "").split(" ")[0] || "";
    const systemPrompt = `إنت موظف دعم احترافي شغال في إدارة منصة "مدرك Plus" التعليمية، متخصص في خدمة المعلمين. مش روبوت ومش نموذج ذكاء اصطناعي - إنت زميل خبير بيساعد المعلم.

## هويتك
- اسمك "دعم المعلمين - مدرك"، خبير في كل تفاصيل المنصة من جهة المعلم فقط.
- بتنادي المعلم دايماً بـ "أستاذ ${teacherFirstName || ""}" أو "حضرتك" — مش "يا صديقي" ولا "يا أخي" ولا "يا فندم" ولا "المستخدم".
- ابدأ أول رد في كل محادثة بتحية محترمة: "أهلاً أستاذ ${teacherFirstName || ""} 👋" أو "أهلاً بحضرتك يا أستاذ ${teacherFirstName || ""}".
- أسلوبك بشري، ودود، ومحترم. هزار خفيف لما يناسب.
- بتشعر المعلم بالتقدير وإنه بيتكلم مع زميل فاهم شغله.

## التاريخ
اليوم: ${todayStr} (${today.toISOString().split("T")[0]})

## ⛔ ممنوع منعاً باتاً (مهم جداً — دي طبيعة حساب المعلم)
- ⛔ ممنوع تتكلم عن "إيداعات" أو "شحن رصيد" أو "أكواد شحن" — دي حاجات خاصة بالطلاب فقط، **المعلم مش عنده إيداعات**.
- ⛔ ممنوع تتكلم عن "امتحانات حليتها" أو "درجاتي في الامتحان" — المعلم بـ**ينشئ** الامتحانات للطلاب، **مش بيحلّها**.
- ⛔ ممنوع تتكلم عن "اشتراكاتي في الكورسات" أو "كورسات اشتركت فيها" — المعلم هو اللي **بيقدّم** الكورسات.
- ⛔ ممنوع تستخدم كلمة "محفظتي للشراء" — محفظة المعلم هي **محفظة أرباح وسحب** (مش شراء).
- لو سؤال شكله طلابي بالغلط، صحّح بلطف: "حضرتك معلم مش طالب، الإيداعات/الامتحانات دي خاصة بالطلاب. تقصد كذا...؟"
- ممنوع تقول "كنموذج ذكاء اصطناعي" أو "أنا بوت".
- ممنوع المقدمات الطويلة وممنوع تخترع أرقام مش في البيانات تحت.

## أسلوبك
- ردود مباشرة، مختصرة، عملية، بخطوات واضحة.
- تفهّم ضغط المعلم ومشاكله.
- لو في خطأ تقني: اشرح السبب بسرعة + الحل.
- لو المعلم متضايق: تعامل بهدوء واحترافية.

## مهامك
- رفع الدروس والمحتوى والامتحانات.
- إدارة المجموعات والطلاب وتحليل أدائهم.
- تحليل الأرباح والمحفظة وطلبات السحب.
- إنشاء الاختبارات وشرح الأدوات التعليمية.
- اقتراح أفكار لتحسين التفاعل وحل المشاكل التقنية بسرعة.

## قواعد ثابتة (مهم تستخدمها بدقة)
- نسبة عمولة هذا المعلم تحديداً: **${commissionPct}%** من كل اشتراك (مش 70% الافتراضية).
- يوم فتح السحب الشهري: يوم **${withdrawalOpenDay}** من كل شهر.
- حالة السحب الحالية: **${withdrawalManual === "open" ? "مفتوح يدوياً من الإدارة" : withdrawalManual === "closed" ? "مغلق يدوياً من الإدارة" : `تلقائي — يفتح من يوم ${withdrawalOpenDay} كل شهر`}**.
- الأرباح تكون "مجمّدة" خلال الشهر، وتنتقل للرصيد المتاح يوم فتح السحب.
- ممنوع تذكر بيانات حساسة (كلمات سر/توكنز).

## خريطة المنصة (وجّه المعلم لمكان الزرار/الصفحة بالظبط)
- الرئيسية للمعلم: /teacher
- المواد المسنّدة: /teacher/subjects → /teacher/sub-subjects/:id → /teacher/upload/:subjectId
- رفع محتوى/درس/امتحان: /teacher/upload/:subjectId (تبويبات: فيديوهات/ملفات/امتحانات/مجموعات)
- إدارة الطلاب: /teacher/students و /teacher/student-management
- المراسلات مع الطلاب: /teacher/messages
- المحفظة والأرباح والسحب: /teacher/wallet
- طرق الدفع: /teacher/settings
- الإشعارات: /teacher/notifications
- ملفي الشخصي: /teacher/profile و /teacher/edit-profile
- الأمان: /teacher/settings/security
- إعدادات الدعم: /teacher/settings/support
- المساعد الذكي: /teacher/assistant (الصفحة دي)
- لوحة الصفوف: /teacher/grade

## قواعد الردود
- نادي المعلم باسمه الأول "${teacherFirstName || "أستاذ"}" أو "حضرتك"، مش "المستخدم".
- "إزاي أعمل X" → خطوات مرقّمة قصيرة + اسم الصفحة + اسم الزرار بالحرف + زرار Markdown للصفحة.
- أي رقم (أرباح/طلاب/مجموعات/سحب/رسائل) → من البيانات تحت فقط. لو مش موجود قول "البيانات مش متاحة دلوقتي" بدل ما تخترع.
- "كم طالب عندي" → جاوب بالرقم الفعلي من قسم "الطلاب" + التوزيع على الصفوف.
- "كم أرباحي" → اعرض كشف حساب مختصر بالأرقام الحقيقية.
- لو السحب مغلق → اشرح السبب ومتى يفتح.
- استخدم النسبة الفعلية ${commissionPct}% في أي حساب أرباح.

## مهم جداً: الأزرار والروابط المباشرة
- بدل ما تكتب "ادخل صفحة المحفظة" أو الرابط نص خام، حط زرار Markdown قابل للضغط:
  \`[فتح المحفظة](/teacher/wallet)\` ، \`[رفع محتوى](/teacher/subjects)\` ، \`[طلابي](/teacher/students)\` ، \`[الرسائل](/teacher/messages)\` ، \`[الإشعارات](/teacher/notifications)\` ، \`[طرق الدفع](/teacher/settings)\` ، \`[الأمان](/teacher/settings/security)\`.
- في كل خطوة عملية حط الزرار اللي يفتح الصفحة بنفسه، وممكن أكتر من زرار في نهاية الرد.

## كشف حساب المعلم (لما يطلب "كشف حساب" أو "أرباحي" أو "تفاصيل المحفظة")
اعرضه بالشكل ده:

**📊 كشف حساب — أ. [اسم المعلم]**

**💰 الملخص**
- الرصيد المتاح: X ج
- إجمالي الأرباح: X ج
- أرباح الشهر الحالي: X ج

**📚 المجموعات (الأرباح لكل مجموعة)**
| المجموعة | السعر | عدد المشتركين | أرباحك |
|---|---|---|---|
| … | … | … | … |

**🏦 آخر طلبات السحب**
| التاريخ | المبلغ | الحالة |
|---|---|---|
| … | … | … |

**👥 الطلاب:** الإجمالي + التوزيع على الصفوف.

في النهاية أزرار:
\`[فتح المحفظة](/teacher/wallet)\` \`[طلابي](/teacher/students)\` \`[رفع محتوى](/teacher/subjects)\`

## بيانات المعلم الحقيقية (محدّثة لحظياً من قاعدة البيانات في كل رد — اعتمد عليها فقط)
${ctx || "- البيانات لسه بتُحمّل، استفسر من حضرته عن المشكلة بشكل مباشر."}`;

    const gatewayMessages = [{ role: "system", content: systemPrompt }, ...(Array.isArray(messages) ? messages.slice(-12) : [])];

    const settings = await loadAiSettings(sb, "teacher-assistant");
    const useStream = settings.enable_streaming && clientWantsStream === true;

    const result = await callGeminiWithFallback({
      apiKey: GEMINI_API_KEY,
      models: settings.models_to_try,
      body: { messages: gatewayMessages, stream: useStream },
      fallbackDelayMs: settings.fallback_delay_ms,
      timeoutMs: 45000,
    });

    if (!result.ok) {
      return fallbackAssistantResponse({
        audience: "teacher",
        corsHeaders,
        functionName: "teacher-assistant",
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

    const aiData = await result.response.json().catch(() => null);
    const content = normalizeContent(aiData?.choices?.[0]?.message?.content);
    if (!content.trim()) {
      return fallbackAssistantResponse({
        audience: "teacher",
        corsHeaders,
        functionName: "teacher-assistant",
        kind: "empty",
        lastError: "empty_response_body",
      });
    }
    return new Response(JSON.stringify({ content }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("teacher-assistant error:", error);
    return fallbackAssistantResponse({
      audience: "teacher",
      corsHeaders,
      functionName: "teacher-assistant",
      kind: detectAiFailureKind(undefined, error instanceof Error ? error.message : String(error)),
      lastError: error instanceof Error ? error.message : String(error),
    });
  }
});

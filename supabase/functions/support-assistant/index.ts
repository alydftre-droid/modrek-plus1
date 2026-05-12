import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { loadAiSettings, callGeminiWithFallback, errorResponseFromStatus } from "../_shared/aiSettings.ts";

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

    const body = await req.json();
    const { messages, stream: clientWantsStream } = body;
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

    const authClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "جلسة غير صالحة" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = user.id;

    const sb = createClient(supabaseUrl, supabaseServiceKey);
    const settings = await loadAiSettings(sb, "support-assistant");

    const [profileRes, walletRes, subsRes, depositsRes, usageRes, examAttemptsRes, roleRes, supportRes, teacherChoicesRes, purchasesRes, videoProgRes] = await Promise.all([
      sb.from("profiles").select("id, full_name, email, phone, stage, grade, section, student_code, created_at, education_type").eq("id", userId).maybeSingle(),
      sb.from("wallets").select("balance, updated_at").eq("user_id", userId).maybeSingle(),
      sb.from("subscriptions").select("start_date, end_date, is_active, teacher_id, subjects(name)").eq("student_id", userId).order("created_at", { ascending: false }).limit(10),
      sb.from("deposit_requests").select("amount, status, created_at, payment_method, admin_message, rejection_reason").eq("student_id", userId).order("created_at", { ascending: false }).limit(15),
      sb.from("usage_logs").select("action, created_at, duration_minutes").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
      sb.from("exam_attempts").select("score, total, submitted_at, time_taken, exams(title, subjects:subject_id(name))").eq("student_id", userId).order("submitted_at", { ascending: false }).limit(15),
      sb.from("user_roles").select("role").eq("user_id", userId).limit(5),
      sb.from("support_messages").select("message, is_from_admin, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
      sb.from("student_teacher_choices").select("category, stage, grade, teacher_id, created_at").eq("student_id", userId).limit(10),
      sb.from("student_group_purchases").select("amount_paid, purchased_at, group_id").eq("student_id", userId).order("purchased_at", { ascending: false }).limit(20),
      sb.from("video_progress").select("content_id, progress_seconds, duration_seconds, updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(30),
    ]);

    const teacherIds = Array.from(new Set([
      ...(subsRes.data || []).map((i) => i.teacher_id).filter(Boolean),
      ...(teacherChoicesRes.data || []).map((i) => i.teacher_id).filter(Boolean),
    ]));
    const groupIds = Array.from(new Set((purchasesRes.data || []).map((i) => i.group_id).filter(Boolean)));
    const contentIds = Array.from(new Set((videoProgRes.data || []).map((i) => i.content_id).filter(Boolean)));

    const [teacherProfilesRes, groupsInfoRes, contentInfoRes] = await Promise.all([
      teacherIds.length ? sb.from("profiles").select("id, full_name").in("id", teacherIds) : Promise.resolve({ data: [] as any[] }),
      groupIds.length ? sb.from("content_groups").select("id, title, subject_id, teacher_id, subjects:subject_id(name)").in("id", groupIds) : Promise.resolve({ data: [] as any[] }),
      contentIds.length ? sb.from("content").select("id, title").in("id", contentIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const teacherNameMap = new Map((teacherProfilesRes.data || []).map((i: any) => [i.id, i.full_name]));
    const groupInfoMap = new Map((groupsInfoRes.data || []).map((g: any) => [g.id, g]));
    const contentNameMap = new Map((contentInfoRes.data || []).map((c: any) => [c.id, c.title]));

    // ربط أسماء معلمي المجموعات
    const groupTeacherIds = Array.from(new Set((groupsInfoRes.data || []).map((g: any) => g.teacher_id).filter(Boolean)));
    const missingTeacherIds = groupTeacherIds.filter((id) => !teacherNameMap.has(id));
    if (missingTeacherIds.length) {
      const { data: extra } = await sb.from("profiles").select("id, full_name").in("id", missingTeacherIds);
      (extra || []).forEach((t: any) => teacherNameMap.set(t.id, t.full_name));
    }

    let ctx = "";
    const p = profileRes.data;
    const roles = (roleRes.data || []).map((i) => formatRoleLabel(i.role)).join("، ") || "طالب";
    const stageMap: Record<string, string> = { preparatory: "إعدادي", secondary: "ثانوي" };
    const gradeMap: Record<string, string> = { first: "الأول", second: "الثاني", third: "الثالث" };
    const sectionMap: Record<string, string> = { scientific: "علمي", literary: "أدبي" };

    if (p) {
      ctx += `\n## ملف الطالب\n- الاسم: ${safeText(p.full_name)}\n- نوع: ${roles}\n- البريد: ${safeText(p.email)}\n- كود: ${safeText(p.student_code)}\n- تاريخ التسجيل بالمنصة: ${new Date(p.created_at || user.created_at).toLocaleDateString("ar-EG")}\n- المرحلة: ${stageMap[p.stage||""]||p.stage||"غير محدد"}\n- الصف: ${gradeMap[p.grade||""]||p.grade||"غير محدد"}\n`;
      if (p.section) ctx += `- القسم: ${sectionMap[p.section]||p.section}\n`;
      ctx += `- الهاتف: ${safeText(p.phone)}\n`;
    }

    // ملخص مالي شامل
    const approvedDeposits = (depositsRes.data || []).filter((d) => d.status === "approved");
    const pendingDeposits = (depositsRes.data || []).filter((d) => d.status === "pending");
    const totalDeposited = approvedDeposits.reduce((s, d) => s + Number(d.amount || 0), 0);
    const totalSpent = (purchasesRes.data || []).reduce((s, x) => s + Number(x.amount_paid || 0), 0);
    const balance = walletRes.data?.balance ?? 0;
    ctx += `\n## ملخص مالي\n- الرصيد الحالي: ${balance} جنيه\n- إجمالي الإيداعات المقبولة: ${totalDeposited} جنيه (${approvedDeposits.length} عملية)\n- إجمالي المنصرف على الكورسات: ${totalSpent} جنيه (${(purchasesRes.data || []).length} اشتراك)\n- إيداعات قيد المراجعة: ${pendingDeposits.length}\n- آخر تحديث للمحفظة: ${walletRes.data?.updated_at ? new Date(walletRes.data.updated_at).toLocaleString("ar-EG") : "—"}\n`;

    if (depositsRes.data?.length) {
      ctx += `\n## سجل الإيداعات (الأحدث أولاً)\n`;
      for (const d of depositsRes.data) {
        const st = d.status === "approved" ? "✅ مقبول" : d.status === "rejected" ? "❌ مرفوض" : "⏳ قيد المراجعة";
        ctx += `- ${new Date(d.created_at).toLocaleString("ar-EG")} | ${d.amount} ج | ${d.payment_method || "—"} | ${st}\n`;
        if (d.admin_message) ctx += `  • رسالة الإدارة: ${d.admin_message}\n`;
        if (d.rejection_reason) ctx += `  • سبب الرفض: ${d.rejection_reason}\n`;
      }
    }

    if (purchasesRes.data?.length) {
      ctx += `\n## سجل المنصرف (الاشتراكات في المجموعات)\n`;
      for (const pp of purchasesRes.data) {
        const g: any = groupInfoMap.get(pp.group_id);
        const groupTitle = g?.title || "مجموعة";
        const subjectName = g?.subjects?.name || "مادة";
        const teacherName = teacherNameMap.get(g?.teacher_id) || "—";
        ctx += `- ${new Date(pp.purchased_at).toLocaleString("ar-EG")} | ${pp.amount_paid} ج | ${subjectName} → "${groupTitle}" | المعلم: ${teacherName}\n`;
      }
    }

    if (subsRes.data?.length) {
      ctx += `\n## الاشتراكات (المواد)\n`;
      for (const s of subsRes.data) {
        ctx += `- ${(s as any).subjects?.name||"؟"}: من ${new Date(s.start_date).toLocaleDateString("ar-EG")} إلى ${new Date(s.end_date).toLocaleDateString("ar-EG")} (${s.is_active?"نشط":"منتهي"}) | المعلم: ${teacherNameMap.get(s.teacher_id||"") || "—"}\n`;
      }
    }

    if (teacherChoicesRes.data?.length) {
      ctx += `\n## المعلمون اللي اخترتهم\n`;
      for (const c of teacherChoicesRes.data) ctx += `- ${teacherNameMap.get(c.teacher_id) || c.teacher_id} | ${c.category} | ${stageMap[c.stage]||c.stage} ${gradeMap[c.grade]||c.grade}\n`;
    }

    // مشاهدة الفيديوهات
    if (videoProgRes.data?.length) {
      const totalSeconds = videoProgRes.data.reduce((s, v) => s + Number(v.progress_seconds || 0), 0);
      const totalMinutes = Math.round(totalSeconds / 60);
      const completed = videoProgRes.data.filter((v) => v.duration_seconds && v.progress_seconds && Number(v.progress_seconds) >= Number(v.duration_seconds) * 0.9).length;
      ctx += `\n## نشاط المشاهدة\n- عدد الفيديوهات اللي اتفتحت: ${videoProgRes.data.length}\n- منها مكتمل تقريباً: ${completed}\n- إجمالي وقت المشاهدة: ${totalMinutes} دقيقة\n- آخر مشاهدة: ${new Date(videoProgRes.data[0].updated_at).toLocaleString("ar-EG")}\n`;
      ctx += `### آخر 5 فيديوهات شفتها\n`;
      for (const v of videoProgRes.data.slice(0, 5)) {
        const title = contentNameMap.get(v.content_id) || "فيديو";
        const pct = v.duration_seconds ? Math.min(100, Math.round((Number(v.progress_seconds) / Number(v.duration_seconds)) * 100)) : 0;
        ctx += `- ${title} | ${pct}% | ${new Date(v.updated_at).toLocaleDateString("ar-EG")}\n`;
      }
    }

    if (usageRes.data?.length) {
      const totalActMin = usageRes.data.reduce((s, u) => s + Number(u.duration_minutes || 0), 0);
      ctx += `\n## النشاط العام\n- إجمالي وقت النشاط المسجّل: ${totalActMin} دقيقة (آخر 20 عملية)\n`;
      ctx += `### آخر 8 عمليات\n`;
      for (const u of usageRes.data.slice(0, 8)) ctx += `- ${u.action} | ${new Date(u.created_at).toLocaleString("ar-EG")} | ${u.duration_minutes||0}د\n`;
    }

    if (examAttemptsRes.data?.length) {
      const scores = examAttemptsRes.data.filter((a) => Number(a.total) > 0);
      const avg = scores.length ? Math.round((scores.reduce((s, a) => s + (Number(a.score) / Number(a.total)) * 100, 0) / scores.length)) : 0;
      ctx += `\n## الامتحانات والدرجات\n- عدد المحاولات: ${examAttemptsRes.data.length}\n- متوسط النسبة: ${avg}%\n`;
      for (const a of examAttemptsRes.data) {
        const subj = (a as any).exams?.subjects?.name || "؟";
        const title = (a as any).exams?.title || "امتحان";
        const pct = Number(a.total) ? Math.round((Number(a.score) / Number(a.total)) * 100) : 0;
        ctx += `- ${new Date(a.submitted_at).toLocaleDateString("ar-EG")} | ${subj} / ${title} | ${a.score}/${a.total} (${pct}%) | ${a.time_taken||0}د\n`;
      }
    }

    if (supportRes.data?.length) { ctx += `\n## آخر رسائل الدعم\n`; for (const m of supportRes.data) ctx += `- ${m.is_from_admin?"الدعم":"الطالب"}: ${m.message.slice(0,120)}\n`; }

    // كورسات/مجموعات متاحة لمرحلة الطالب (الأسعار)
    if (p?.stage && p?.grade) {
      const { data: matchedSubjects } = await sb.from("subjects")
        .select("id, name").eq("stage", p.stage).eq("grade", p.grade).eq("is_active", true);
      const subjectIds = (matchedSubjects || []).map((s: any) => s.id);
      if (subjectIds.length) {
        const { data: groups } = await sb.from("content_groups")
          .select("title, price, subject_id, month_label, education_type")
          .in("subject_id", subjectIds).eq("is_active", true).limit(40);
        const subjectNameMap = new Map((matchedSubjects || []).map((s: any) => [s.id, s.name]));
        const filtered = (groups || []).filter((g: any) => !p.education_type || !g.education_type || g.education_type === p.education_type);
        if (filtered.length) {
          ctx += `\n## كورسات متاحة لمرحلتك (الأسعار)\n`;
          for (const g of filtered.slice(0, 25))
            ctx += `- ${subjectNameMap.get(g.subject_id) || "مادة"}: "${g.title}" — ${g.price} ج${g.month_label ? ` (${g.month_label})` : ""}\n`;
        }
      }
    }

    // إعدادات المنصة (أرقام الدفع، أسعار افتراضية، صيانة)
    const { data: platformSettings } = await sb.from("platform_settings")
      .select("key, value")
      .in("key", ["platform_name", "support_phone", "support_whatsapp", "support_email", "subscription_default_price", "subscription_currency", "payment_receive_number", "deposit_tutorial_video", "maintenance_mode", "maintenance_message"]);
    if (platformSettings?.length) {
      ctx += `\n## إعدادات المنصة\n`;
      for (const s of platformSettings) if (s.value) ctx += `- ${s.key}: ${s.value}\n`;
    }

    const today = new Date();
    const todayStr = today.toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    const studentName = (p?.full_name || "").split(" ")[0] || "";
    const systemPrompt = `إنت موظف دعم حقيقي شغال في إدارة منصة "مدرك Plus" التعليمية. مش روبوت ومش نموذج ذكاء اصطناعي. إنت بني آدم بتساعد الطلبة بحب واحترام.

## هويتك
- اسمك "دعم مدرك"، موظف داخل إدارة المنصة.
- بتتكلم باللهجة المصرية البسيطة المفهومة، زي أي موظف دعم محترم.
- بترحب بالطالب باسمه الأول${studentName ? ` (${studentName})` : ""} في أول رد بس، مش في كل رسالة.
- بتخلي الطالب يحس بالراحة والثقة إنه بيتكلم مع حد فاهم وهيحلّه المشكلة.

## التاريخ
اليوم: ${todayStr} (${today.toISOString().split("T")[0]})

## ممنوع منعاً باتاً
- ممنوع تقول "كنموذج ذكاء اصطناعي" أو "أنا بوت" أو "أنا مساعد آلي".
- ممنوع المقدمات الطويلة والكلام الفاضي.
- ممنوع تكرر نفس الجملة ولا الردود الجاهزة.
- ممنوع تخترع معلومة مش موجودة في بيانات الطالب اللي تحت.
- ممنوع الردود العامة الضعيفة زي "ممكن أساعدك في إيه؟".

## أسلوبك
- ردود قصيرة، واضحة، عملية، خطوة خطوة.
- كلام بشري طبيعي زي ما الموظف بيكلم العميل.
- ممكن إيموجي خفيفة لما تنفع (✅ ⚡ 💙 📚) من غير مبالغة.
- لو الطالب متوتر طمّنه، لو زعلان اعتذر باحترام، لو في خطأ من النظام قول "آسفين والله، خلينا نحلها سوا".

## مهامك
- مشاكل تسجيل الدخول والحساب وكلمة السر.
- الاشتراكات والخطط والأسعار.
- الإيداع والرصيد وطرق الدفع.
- شرح استخدام المنصة والامتحانات.
- معرفة حالة الطالب: مواده، اشتراكاته، نشاطه، تقدمه، نتائج امتحاناته.
- اقتراح حلول ذكية عملية لأي مشكلة.

## قاعدة التحويل للدعم البشري
- متحوّلش الطالب للدعم البشري من نفسك.
- بس لما الطالب يطلب صراحة "عايز أكلم حد"، حط في آخر ردك العلامة دي: [ESCALATE_TO_SUPPORT]

## خريطة المنصة (لازم تستخدمها لتوجيه الطالب لمكان الزرار/الصفحة بالظبط)
- الرئيسية: /dashboard — الواجهة الأساسية للطالب بعد الدخول.
- المواد: /subjects → اختيار المادة → /subject/:id (لاستعراض المعلمين والكورسات).
- اختيار المعلم: /teacher-selection — قبل الاشتراك في أي مادة.
- مادتي بعد الاشتراك: /student-subject (الفيديوهات، الملفات، الامتحانات، الحصص، AI شرح).
- كورساتي: /my-courses — كل اللي مشترك فيه.
- المكتبة الشخصية: /my-library — الطالب يرفع كتبه و /my-library/book/:id للشرح التفاعلي مع المساعد.
- المحفظة والشحن: /wallet — يشحن بكود أو يطلب إيداع (فودافون كاش / إنستاباي / أورانج / اتصالات). زرار "إيداع جديد" أعلى الصفحة، و"استخدام كود شحن" تحته.
- الإيداع: من /wallet → "طلب إيداع" → اختر الطريقة → ابعت على الرقم المعروض → ارفع صورة الإيصال + كتابة المبلغ.
- الامتحانات: من /student-subject → تبويب "الامتحانات" → ابدأ → /student-exam.
- الإشعارات: /notifications — مع جرس في الهيدر.
- الدعم: /support — الشات الذكي ده هنا، وممكن تحويل لدعم بشري بطلب الطالب.
- الملف الشخصي: /student-profile — تعديل الاسم/الصورة/الهاتف.
- الأمان وكلمة السر: /student-security — تغيير كلمة المرور والبريد.
- التقدم: /student-progress — نسب الإنجاز ونتائج الامتحانات.
- معلومات المنصة: /about-platform.
- اختيار نوع التعليم (عام/أزهر): /select-education-type — لو الطالب لسه ما اختارش.

## قواعد الردود
- لما الطالب يسأل "إزاي أعمل X" → اذكر الخطوات بالأرقام + اسم الصفحة + اسم الزرار/التبويب بالحرف.
- لما يسأل عن سعر كورس → استخدم قسم "كورسات متاحة لمرحلتك" تحت. لو مش موجود قول "اسأل المعلم/الإدارة".
- لما يسأل عن رصيده/اشتراكه/امتحاناته → اعتمد على بياناته الحقيقية تحت بس.
- لو حاجة مش في البيانات → قول "مش لاقي ده في حسابك" بدل ما تخترع.

## بيانات الطالب الحقيقية (اعتمد عليها بس، ومتختلقش حاجة تانية)
${ctx || "- لسه مفيش بيانات متاحة، اطلب من الطالب يوضح مشكلته."}`;

    const gatewayMessages = [{ role: "system", content: systemPrompt }, ...(Array.isArray(messages) ? messages.slice(-12) : [])];
    const useStream = settings.enable_streaming && clientWantsStream === true;

    const result = await callGeminiWithFallback({
      apiKey: GEMINI_API_KEY,
      models: settings.models_to_try,
      body: { messages: gatewayMessages, stream: useStream },
      fallbackDelayMs: settings.fallback_delay_ms,
    });

    if (!result.ok) return errorResponseFromStatus(result.status, corsHeaders);

    if (useStream) {
      // Pass-through SSE from upstream
      return new Response(result.response.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    const aiData = await result.response.json();
    const content = normalizeAssistantContent(aiData?.choices?.[0]?.message?.content) || "أنا موجود لمساعدتك، أعد إرسال طلبك.";
    return new Response(JSON.stringify({ content }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("support-assistant error:", error);
    return new Response(JSON.stringify({ error: "حدث خطأ، حاول مرة أخرى" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

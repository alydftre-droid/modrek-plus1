import type { StudentDeposit, StudentProfile, StudentPurchase } from "./types";
import { formatArabicDate, formatCurrency, sectionDisplayLabel } from "./types";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

const rowOrEmpty = (rows: string[], emptyText: string, columns = 4) => {
  if (rows.length > 0) return rows.join("");
  return `<tr><td colspan="${columns}" class="empty">${escapeHtml(emptyText)}</td></tr>`;
};

interface StudentReportInput {
  student: StudentProfile;
  walletBalance: number;
  totalDeposited: number;
  totalSpent: number;
  totalWatchMinutes: number;
  averageScore: number;
  deposits: StudentDeposit[];
  purchases: StudentPurchase[];
  subscriptions: Array<{ id: string; start_date: string; end_date: string; is_active: boolean; subjects?: { name?: string } | null; teacher_name?: string }>;
  exams: Array<{ id: string; score: number; total: number; submitted_at: string | null; attempted?: boolean; status?: string; group_title?: string | null; exams?: { title?: string } | null }>;
  videos: Array<{ id: string; progress_seconds: number; duration_seconds: number; content?: { title?: string; type?: string } | null }>;
  activities: Array<{ id: string; action: string; duration_minutes?: number | null; created_at: string | null; content?: { title?: string; type?: string } | null }>;
  teacherChoices: Array<{ id: string; teacher_name?: string; category?: string; stage?: string; grade?: string }>;
}

export const buildStudentReportHtml = ({
  student,
  walletBalance,
  totalDeposited,
  totalSpent,
  totalWatchMinutes,
  averageScore,
  deposits,
  purchases,
  subscriptions,
  exams,
  videos,
  activities,
  teacherChoices,
}: StudentReportInput) => {
  const initials = student.full_name.trim().slice(0, 2) || "ط";

  const depositRows = deposits.map(
    (item) => `
      <tr>
        <td>${escapeHtml(formatArabicDate(item.created_at))}</td>
        <td>${escapeHtml(formatCurrency(item.amount))}</td>
        <td>${escapeHtml(item.payment_method || "-")}</td>
        <td>${escapeHtml(item.status === "approved" ? "مقبول" : item.status === "rejected" ? "مرفوض" : "معلق")}</td>
      </tr>`,
  );

  const purchaseRows = purchases.map(
    (item) => `
      <tr>
        <td>${escapeHtml(item.subject_name || "-")}</td>
        <td>${escapeHtml(item.group_title || "مجموعة")}</td>
        <td>${escapeHtml(item.teacher_name || "-")}</td>
        <td>${escapeHtml(formatCurrency(item.amount_paid || 0))}</td>
        <td>${escapeHtml(formatArabicDate(item.purchased_at))}</td>
      </tr>`,
  );

  const subscriptionRows = subscriptions.map(
    (item) => `
      <tr>
        <td>${escapeHtml(item.subjects?.name || "-")}</td>
        <td>${escapeHtml(item.teacher_name || "-")}</td>
        <td>${escapeHtml(formatArabicDate(item.start_date))}</td>
        <td>${escapeHtml(item.is_active ? "نشط" : "منتهي")}</td>
      </tr>`,
  );

  const examRows = exams.map((item) => {
    const attempted = item.attempted !== false;
    const statusLabel = item.status || (attempted ? "حل الامتحان" : "متغيب");
    const statusColor = attempted ? "hsl(154 66% 34%)" : "hsl(0 74% 48%)";
    return `
      <tr>
        <td>${escapeHtml(item.exams?.title || "امتحان")}${item.group_title ? `<br/><small style="color:hsl(215 16% 45%)">${escapeHtml(item.group_title)}</small>` : ""}</td>
        <td style="font-weight:700;color:${statusColor}">${escapeHtml(statusLabel)}</td>
        <td>${escapeHtml(attempted ? `${item.score}/${item.total}` : "—")}</td>
        <td>${escapeHtml(attempted && item.total > 0 ? `${Math.round((item.score / item.total) * 100)}%` : "—")}</td>
        <td>${escapeHtml(attempted && item.submitted_at ? formatArabicDate(item.submitted_at) : "لم يحل")}</td>
      </tr>`;
  });


  const videoRows = videos.map(
    (item) => `
      <tr>
        <td>${escapeHtml(item.content?.title || "فيديو")}</td>
        <td>${escapeHtml(`${Math.round(item.progress_seconds / 60)} دقيقة`)}</td>
        <td>${escapeHtml(`${item.duration_seconds > 0 ? Math.min(Math.round((item.progress_seconds / item.duration_seconds) * 100), 100) : 0}%`)}</td>
        <td>${escapeHtml(item.content?.type || "video")}</td>
      </tr>`,
  );

  const activityRows = activities.map(
    (item) => `
      <tr>
        <td>${escapeHtml(item.action)}</td>
        <td>${escapeHtml(item.content?.title || "-")}</td>
        <td>${escapeHtml(item.duration_minutes ? `${item.duration_minutes} دقيقة` : "-")}</td>
        <td>${escapeHtml(formatArabicDate(item.created_at))}</td>
      </tr>`,
  );

  const teacherRows = teacherChoices.map(
    (item) => `
      <tr>
        <td>${escapeHtml(item.teacher_name || "-")}</td>
        <td>${escapeHtml(item.category || "-")}</td>
        <td>${escapeHtml(item.stage || "-")}</td>
        <td>${escapeHtml(item.grade || "-")}</td>
      </tr>`,
  );

  return `
  <div dir="rtl" style="font-family: Cairo, Arial, sans-serif; background: hsl(220 30% 99%); color: hsl(215 30% 18%); padding: 24px; width: 794px; box-sizing: border-box;">
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; }
      .sheet { background: hsl(0 0% 100%); border-radius: 28px; overflow: hidden; border: 1px solid hsl(214 38% 88%); box-shadow: 0 24px 60px -28px hsl(231 36% 32% / 0.18); }
      .hero { background: linear-gradient(135deg, hsl(224 72% 54%) 0%, hsl(247 72% 58%) 55%, hsl(279 70% 57%) 100%); color: hsl(0 0% 100%); padding: 28px 30px; position: relative; }
      .hero::before,.hero::after { content: ""; position: absolute; border-radius: 999px; background: hsl(0 0% 100% / 0.08); }
      .hero::before { width: 180px; height: 180px; top: -70px; right: -30px; }
      .hero::after { width: 220px; height: 220px; left: -90px; bottom: -120px; }
      .hero-grid { display: grid; grid-template-columns: 84px 1fr; gap: 18px; align-items: center; position: relative; z-index: 2; }
      .avatar { width: 84px; height: 84px; border-radius: 26px; background: linear-gradient(135deg, hsl(198 100% 76%) 0%, hsl(274 90% 73%) 100%); display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 700; }
      .hero h1 { margin: 0 0 6px; font-size: 28px; line-height: 1.4; }
      .hero p { margin: 0; color: hsl(0 0% 100% / 0.82); }
      .meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
      .meta span { padding: 7px 12px; border-radius: 999px; background: hsl(0 0% 100% / 0.12); font-size: 12px; font-weight: 700; }
      .content { padding: 28px; }
      .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 22px; }
      .stat { border-radius: 22px; padding: 16px; color: hsl(0 0% 100%); }
      .stat strong { display: block; font-size: 23px; margin-bottom: 6px; }
      .stat span { font-size: 12px; color: hsl(0 0% 100% / 0.76); }
      .stat-one { background: linear-gradient(135deg, hsl(210 90% 60%) 0%, hsl(224 86% 58%) 100%); }
      .stat-two { background: linear-gradient(135deg, hsl(154 66% 44%) 0%, hsl(174 74% 38%) 100%); }
      .stat-three { background: linear-gradient(135deg, hsl(24 98% 58%) 0%, hsl(358 93% 63%) 100%); }
      .stat-four { background: linear-gradient(135deg, hsl(289 69% 58%) 0%, hsl(324 77% 58%) 100%); }
      .section { border: 1px solid hsl(214 38% 89%); border-radius: 22px; margin-bottom: 18px; overflow: hidden; }
      .section-head { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; background: linear-gradient(180deg, hsl(222 35% 98%) 0%, hsl(215 44% 96%) 100%); border-bottom: 1px solid hsl(214 38% 89%); }
      .section-head h2 { margin: 0; font-size: 18px; color: hsl(218 34% 22%); }
      .section-body { padding: 16px 18px 18px; }
      .overview-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .overview-item { background: hsl(220 33% 98%); border: 1px solid hsl(214 38% 90%); border-radius: 18px; padding: 14px; }
      .overview-item small { display: block; color: hsl(215 16% 45%); margin-bottom: 5px; }
      .overview-item strong { font-size: 15px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { border-bottom: 1px solid hsl(214 38% 91%); padding: 11px 8px; text-align: right; vertical-align: top; }
      th { color: hsl(221 28% 34%); background: hsl(220 33% 98%); font-size: 12px; }
      .empty { text-align: center; color: hsl(215 16% 45%); padding: 18px; }
      .footer-note { margin-top: 18px; text-align: center; color: hsl(215 16% 45%); font-size: 12px; }
    </style>
    <div class="sheet">
      <div class="hero">
        <div class="hero-grid">
          <div class="avatar">${escapeHtml(initials)}</div>
          <div>
            <p>تقرير الطالب الكامل</p>
            <h1>${escapeHtml(student.full_name)}</h1>
            <p>${escapeHtml(student.email)}</p>
            <div class="meta">
              <span>الكود: ${escapeHtml(student.student_code || "-")}</span>
              <span>${escapeHtml(student.stage || "-")} · ${escapeHtml(student.grade || "-")}</span>
              <span>${escapeHtml(sectionDisplayLabel(student.section))}</span>
              <span>${escapeHtml(student.is_banned ? "الحساب محظور" : "الحساب نشط")}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="content">
        <div class="stats">
          <div class="stat stat-one"><strong>${escapeHtml(formatCurrency(walletBalance))}</strong><span>الرصيد الحالي</span></div>
          <div class="stat stat-two"><strong>${escapeHtml(formatCurrency(totalDeposited))}</strong><span>إجمالي الإيداعات المقبولة</span></div>
          <div class="stat stat-three"><strong>${escapeHtml(formatCurrency(totalSpent))}</strong><span>إجمالي الإنفاق داخل المنصة</span></div>
          <div class="stat stat-four"><strong>${escapeHtml(`${averageScore}%`)}</strong><span>متوسط نتائج الامتحانات</span></div>
        </div>
        <div class="section"><div class="section-head"><h2>البيانات الأساسية</h2></div><div class="section-body overview-grid"><div class="overview-item"><small>الاسم</small><strong>${escapeHtml(student.full_name)}</strong></div><div class="overview-item"><small>البريد الإلكتروني</small><strong>${escapeHtml(student.email)}</strong></div><div class="overview-item"><small>رقم الهاتف</small><strong>${escapeHtml(student.phone || "-")}</strong></div><div class="overview-item"><small>تاريخ التسجيل</small><strong>${escapeHtml(formatArabicDate(student.created_at))}</strong></div></div></div>
        <div class="section"><div class="section-head"><h2>المعلمون والاختيارات التعليمية</h2></div><div class="section-body"><table><thead><tr><th>المعلم</th><th>التخصص</th><th>المرحلة</th><th>الصف</th></tr></thead><tbody>${rowOrEmpty(teacherRows, "لا توجد اختيارات معلمين مسجلة")}</tbody></table></div></div>
        <div class="section"><div class="section-head"><h2>المحفظة والإيداعات</h2></div><div class="section-body"><table><thead><tr><th>التاريخ</th><th>المبلغ</th><th>وسيلة الدفع</th><th>الحالة</th></tr></thead><tbody>${rowOrEmpty(depositRows, "لا توجد إيداعات لهذا الطالب")}</tbody></table></div></div>
        <div class="section"><div class="section-head"><h2>المجموعات والاشتراكات</h2></div><div class="section-body"><table style="margin-bottom: 14px;"><thead><tr><th>المادة</th><th>المجموعة</th><th>المعلم</th><th>القيمة</th><th>تاريخ الشراء</th></tr></thead><tbody>${rowOrEmpty(purchaseRows, "لا توجد مجموعات مدفوعة", 5)}</tbody></table><table><thead><tr><th>المادة</th><th>المعلم</th><th>بداية الاشتراك</th><th>الحالة</th></tr></thead><tbody>${rowOrEmpty(subscriptionRows, "لا توجد اشتراكات حالية أو سابقة")}</tbody></table></div></div>
        <div class="section"><div class="section-head"><h2>الأداء الأكاديمي</h2></div><div class="section-body"><table><thead><tr><th>الامتحان</th><th>الدرجة</th><th>النسبة</th><th>التاريخ</th></tr></thead><tbody>${rowOrEmpty(examRows, "لا توجد امتحانات تم حلها")}</tbody></table></div></div>
        <div class="section"><div class="section-head"><h2>الفيديوهات والتقدم</h2><span>${escapeHtml(`${totalWatchMinutes} دقيقة مشاهدة`)}</span></div><div class="section-body"><table><thead><tr><th>الفيديو</th><th>مدة المشاهدة</th><th>نسبة التقدم</th><th>النوع</th></tr></thead><tbody>${rowOrEmpty(videoRows, "لا توجد فيديوهات مشاهدة")}</tbody></table></div></div>
        <div class="section"><div class="section-head"><h2>سجل النشاط</h2></div><div class="section-body"><table><thead><tr><th>النشاط</th><th>المحتوى</th><th>المدة</th><th>التاريخ</th></tr></thead><tbody>${rowOrEmpty(activityRows, "لا توجد بيانات نشاط مسجلة")}</tbody></table></div></div>
        <div class="footer-note">تم إنشاء هذا التقرير تلقائيًا من لوحة إدارة الطلاب — ${escapeHtml(formatArabicDate(new Date().toISOString()))}</div>
      </div>
    </div>
  </div>`;
};

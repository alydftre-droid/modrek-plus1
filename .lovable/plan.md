## نطاق التحديث

بناء لوحة مطور احترافية على مستوى Stripe/Linear بدون تغيير هوية ModrekPlus، تعتمد كلياً على بيانات حقيقية من قاعدة البيانات مع تحديث Real-time.

---

## 1) قاعدة البيانات (تغييرات محدودة وضرورية فقط)

### جداول جديدة
- `student_activity_logs`: يسجل كل حركة للطالب
  - الحقول الأساسية: `student_id`, `action_type`, `description`, `subject_id`, `group_id`, `content_id`, `teacher_id`, `metadata (jsonb)`, `ip_address`, `user_agent`, `device_type`, `browser`, `os`, `session_id`, `duration_seconds`
- `teacher_activity_logs`: نفس الفكرة للمعلمين (بعض الحقول موجودة بالفعل — سنكمّلها بأعمدة IP/جهاز إذا لزم)

### RLS
- المطور/الأدمن فقط يقرأ. المستخدم يكتب لنفسه فقط (INSERT).
- GRANT كامل لـ `authenticated` و `service_role`.

### دوال تجميع (Materialized/RPC) — لتفادي Queries مكررة
- `get_developer_student_overview(_student_id)` → كل إحصائيات نظرة عامة في استدعاء واحد
- `get_developer_student_exams(_student_id, filters jsonb)` → قائمة امتحانات مع بيانات مجمعة
- `get_developer_student_progress(_student_id)` → تقدم شهري (فيديو/PDF/امتحانات/ساعات)
- `get_developer_teacher_overview(_teacher_id)` → إحصائيات المعلم الحقيقية
- `get_developer_teacher_subscriptions(_teacher_id, filters)` → اشتراكات حسب الصف/المجموعة
- `get_developer_smart_reports(period)` → التقارير الذكية المجمعة

**بدون تغيير جداول موجودة أو حذف أي شيء.**

---

## 2) واجهة اللوحة

### هيكل الملفات الجديد
```
src/components/admin/developer/
  ├── DeveloperLayout.tsx           # قشرة موحدة (SidebarLayout بأسلوب Linear)
  ├── shared/
  │   ├── DataTable.tsx             # جدول ذكي: بحث + فلترة + ترتيب + Pagination + تصدير
  │   ├── ExportMenu.tsx            # PDF + Excel
  │   ├── StatCard.tsx              # بطاقة KPI
  │   ├── ChartCard.tsx             # غلاف موحد للـ Charts
  │   └── FilterBar.tsx
  ├── student/
  │   ├── StudentOverviewTab.tsx    # 15+ KPI + بطاقات
  │   ├── StudentExamsTab.tsx       # جدول امتحانات + فلاتر + إحصائيات
  │   ├── StudentProgressTab.tsx    # Charts احترافية (Line/Progress/Heatmap/Monthly)
  │   └── StudentLogsTab.tsx        # Audit Log كامل
  └── teacher/
      ├── TeacherOverviewTab.tsx    # إحصائيات حقيقية + KPI Cards Drill-down
      ├── TeacherStudentsBreakdown.tsx  # صفحة تفكيك الطلاب حسب الصف
      ├── TeacherSubscriptionsTab.tsx
      ├── TeacherCoursesTab.tsx
      └── TeacherLogsTab.tsx

src/pages/admin/developer/
  ├── DeveloperStudentDetailPage.tsx
  ├── DeveloperTeacherDetailPage.tsx
  └── DeveloperSmartReportsPage.tsx  # صفحة تقارير جديدة
```

### التبويبات
1. **نظرة عامة (الطالب)**: اسم، صورة، صف، رقم، تاريخ تسجيل، آخر نشاط، حالة، عدد الكورسات/المجموعات/المعلمين/الفيديوهات/PDF/الامتحانات، متوسط الدرجات، نسبة التقدم، نسبة النشاط — كل ذلك من RPC واحد.
2. **الامتحانات**: DataTable مع فلاتر (صف/مادة/مجموعة/معلم/شهر/سنة/حالة). أعمدة كاملة كما طلب المستخدم. بطاقات إحصائية أسفل الجدول.
3. **التقدم**: 4 Charts (Recharts): Line للتقدم الشهري، Progress شعاعي، Activity Heatmap (تقويم)، Bar للمواد.
4. **السجلات (Audit Log)**: جدول ذكي مع بحث/فلترة/تصدير.

### تبويبات المعلم
- **نظرة عامة**: نفس البطاقات الحالية لكن كل رقم من RPC حقيقي. الضغط على "إجمالي الطلاب" يفتح `TeacherStudentsBreakdown` (طبقات: صفوف → طلاب).
- **الاشتراكات**: مجمّعة صف → مجموعة → تفاصيل.
- **الكورسات**: هرمية صف→مادة→مجموعة→كورس.
- **السجلات**: من `teacher_activity_logs` مع كل الأحداث.

---

## 3) نظام السجلات (تتبع تلقائي)

### طبقة Client Logger
- ملف `src/lib/activityLogger.ts`: دالة `logStudentActivity(action, meta)` تكتب مباشرة في `student_activity_logs`.
- استخدامها في نقاط رئيسية: تسجيل دخول/خروج (في `useAuth`)، فتح/إغلاق فيديو (في مشغل الفيديو)، فتح PDF، بدء/تسليم/ترك امتحان، شراء، تغيير كلمة سر.
- IP/UA يُلتقطان في Edge Function خفيفة `log-activity` (لأن العميل لا يعرف IP الحقيقي).

### Triggers للأحداث الجاهزة
- Trigger على `exam_attempts` insert/update → يكتب سطر في `student_activity_logs`.
- Trigger على `subscriptions` insert → يكتب سطر.
- Trigger على `content` insert/update/delete (بجانب `teacher_activity_logs` الموجود بالفعل).

---

## 4) الرسوم البيانية (Charts)

استخدام **recharts** (موجود بالفعل غالباً — سنتحقق ونضيف إن لزم):
- LineChart للتقدم الشهري
- RadialBarChart لنسبة الإنجاز
- BarChart للمواد
- Heatmap (تقويم نشاط) عبر مكوّن مخصص بسيط

---

## 5) البحث الذكي والتصدير

### `DataTable.tsx` مشترك
- بحث لحظي (debounced)
- فلترة متعددة
- ترتيب أعمدة
- Pagination + Infinite Scroll (خيار)
- تصدير:
  - **Excel**: مكتبة `xlsx` (SheetJS)
  - **PDF**: `jspdf` + `jspdf-autotable` (يدعم العربي عبر خط Cairo مضمّن)

---

## 6) التقارير الذكية

صفحة `DeveloperSmartReportsPage.tsx` بأقسام:
- أفضل 10 طلاب / معلمين
- أكثر الكورسات مشاهدة
- أنشط/أقل المواد
- أعلى/أقل الإيرادات
- الطلاب المهددون بالانسحاب (منطق: لا نشاط 14+ يوم + اشتراك نشط)
- المعلمون غير النشطين (لا محتوى جديد 30+ يوم)
- اشتراكات يومية/شهرية (Chart)
- إحصائيات الأرباح والمشاهدات

كلها من `get_developer_smart_reports(period)`.

---

## 7) الأداء

- React Query مع `staleTime` مناسب (30ث للـ Real-time، 5د للمستقر)
- `refetchInterval` للبيانات الحية
- Supabase Realtime channels على الجداول المهمة (`exam_attempts`, `subscriptions`) لتحديث فوري
- Pagination سيرفر-سايد لكل الجداول الكبيرة
- Lazy loading للتبويبات (React.lazy)
- عدم عمل joins ضخمة على العميل — كل شيء عبر RPC مُحسّن

---

## 8) خطة التنفيذ على مراحل (نفس هذه الجلسة)

**المرحلة أ — البنية التحتية**
- Migration للجداول والدوال والسياسات
- `activityLogger.ts` + Edge Function خفيفة لـ IP
- ربط الـ logger في `useAuth`

**المرحلة ب — لوحة الطالب**
- `DeveloperStudentDetailPage` بالتبويبات الأربعة
- Charts + DataTable + Export

**المرحلة ج — لوحة المعلم**
- تحديث الصفحة الحالية `AdminTeacherDetailPage` لتصبح كاملة
- Drill-down "إجمالي الطلاب"
- تبويبات الاشتراكات/الكورسات/السجلات

**المرحلة د — التقارير الذكية**
- صفحة جديدة + رابط في لوحة الأدمن

**المرحلة هـ — تصدير + بحث + تحقق نهائي**
- `DataTable` المشترك، جسر التصدير، ولاية RTL في PDF
- مراجعة الأزرار والبيانات الفارغة

---

## ملاحظات فنية للمطور

- كل RPC يحمي نفسه بـ `has_role(auth.uid(), 'admin')`.
- المفتاح `student_activity_logs` مقسّم بالتاريخ (index على `student_id, created_at DESC`) لأداء عالٍ مع عشرات الآلاف.
- خط Cairo لتصدير PDF عربي — يُضاف كأصل ثابت.
- لا حذف/تغيير لأي مكوّن أو دالة قائمة.
- لا يُلمَس نظام Supabase Auth أو `config.toml`.

---

## المخرجات المتوقعة

- كل الأزرار تعمل
- كل الأرقام حقيقية من DB
- Charts احترافية
- تصدير PDF/Excel من أي جدول
- Audit Log كامل يبدأ من لحظة التفعيل
- لا أخطاء Console / TypeScript / Runtime

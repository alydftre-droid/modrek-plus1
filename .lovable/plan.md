
# إعادة بناء لوحة شؤون المعلمين — تصميم احترافي بمستوى المنصات العالمية

> ✅ لن يتم تغيير أي منطق أعمال أو قاعدة بيانات. التعديل واجهة + تنظيم + إضافة أدوات تحكم للمطور.

## 1) رأس الصفحة (Header)
- الإبقاء على: صورة المعلم، الاسم، الحالة (نشط/محظور/بانتظار الاعتماد)، الكود، تاريخ الانضمام، البريد، الهاتف.
- إعادة تنظيم بأسلوب Google Workspace Admin: بطاقة بيضاء نظيفة بظلال خفيفة، Avatar دائري كبير، شارات ملوّنة.
- **استبدال الأزرار العلوية:**
  - زر "الطلاب" ← **✏️ تعديل البيانات** (Dialog لتعديل: الاسم، البريد، الهاتف، كلمة السر، الصورة، السيرة الذاتية، سنوات الخبرة، الفيديو التعريفي).
  - زر "المحفظة" الكبير أسفل البيانات ← **🚫 حظر / رفع الحظر** مع نافذة تأكيد.

## 2) بطاقات الإحصائيات
شبكة بطاقات صغيرة (Icon + Label + Value) بألوان فاتحة نظيفة:
- 👨‍🎓 إجمالي الطلاب
- ✅ المشتركون الفعّالون
- 👁 إجمالي المشاهدات
- 📚 إجمالي الكورسات
- 🎥 الفيديوهات
- 📄 الملفات (PDF)
- ⭐ متوسط التقييم (إن وُجد)
- 💰 أرباح الشهر الحالي
- 💵 إجمالي الأرباح

## 3) القائمة الرئيسية (Tabs)
`نظرة عامة | المحفظة | السحوبات | الكورسات | السجلات | الأمان`

### نظرة عامة
البطاقات + ملخص أداء (آخر نشاط، آخر سحب، إجمالي أرباح، متوسط درجات).

### المحفظة (إعادة تصميم كامل)
- **قسم نسبة الأرباح:** عرض النسبة + زر تعديل + زر "📜 سجل التعديلات" (القديم/الجديد/من/التاريخ/السبب).
- **قسم إدارة الرصيد اليدوي:** ➕ إضافة / ➖ خصم / 🎁 مكافأة، مع سبب + إشعار اختياري للمعلم.
- **سجل المعاملات:** جدول بالتاريخ/العملية/المبلغ/السبب/المسؤول.

### السحوبات
جدول احترافي مع فلاتر حالة (معلق/تمت/مرفوض/قيد التنفيذ)، أعمدة: رقم الطلب، المبلغ، طريقة السحب، رقم المحفظة، تاريخ الطلب، تاريخ الموافقة، تاريخ التحويل، المسؤول، سبب الرفض، الحالة.

### الكورسات
تدفق من خطوتين:
1. اختيار الصف الدراسي.
2. عرض كل المجموعات داخل الصف ككروت كبيرة: الاسم، المادة، تاريخ الإنشاء، السعر، عدد الطلاب، المشتركون، المشاهدات، الفيديوهات، الملفات، الامتحانات، الأرباح، نسبة المعلم، الحالة.

### السجلات (آخر 90 يوم)
Timeline احترافي مع فلاتر (نوع العملية/التاريخ/الشهر). كل سطر: التاريخ، الوقت، العنوان، التفاصيل، IP، الجهاز، المتصفح.

### الأمان
أزرار مع نوافذ تأكيد صارمة:
- 🚫 حظر / 🔓 إعادة تفعيل
- ⏸ إيقاف مؤقت
- 🔒 تقييد صلاحيات
- 🗑 حذف نهائي (يتطلب كتابة `DELETE` للتأكيد)

## 4) مواصفات التصميم
- خلفية بيضاء نقية، ظلال ناعمة، حواف `rounded-2xl`.
- ألوان هوية منصة Modrek Plus (لا خلفيات داكنة).
- أيقونات Lucide حديثة.
- Skeleton Loading + Empty States + Toasts.
- Responsive كامل (Mobile-first — العرض الحالي 649px).
- بحث/فلترة/ترتيب/تصدير PDF+Excel لكل الجداول.
- كل البيانات حقيقية من Supabase (RPCs الموجودة).

## 5) الملفات التي ستُنشأ/تُعدَّل
**جديد:**
- `src/components/admin/developer/teacher/TeacherEditProfileDialog.tsx`
- `src/components/admin/developer/teacher/TeacherBanDialog.tsx`
- `src/components/admin/developer/teacher/TeacherSecurityTab.tsx`
- `src/components/admin/developer/teacher/TeacherCommissionSection.tsx`
- `src/components/admin/developer/teacher/TeacherManualBalanceSection.tsx`
- `src/components/admin/developer/teacher/TeacherCoursesByGrade.tsx`

**تعديل:**
- `src/pages/admin/DeveloperTeacherDetailPage.tsx` (رأس جديد + أزرار جديدة + ترتيب Tabs).
- `src/components/admin/developer/teacher/TeacherOverviewTab.tsx` (إضافة تقييم/أرباح شهر/متوسط درجات/آخر نشاط).
- `src/components/admin/developer/teacher/TeacherWalletTab.tsx` (تقسيم لثلاثة أقسام + سجل النسبة).
- `src/components/admin/developer/teacher/TeacherWithdrawalsTab.tsx` (فلاتر + أعمدة كاملة + تصدير).
- `src/components/admin/developer/teacher/TeacherCoursesTab.tsx` (تدفق الصف→المجموعات).
- `src/components/admin/developer/teacher/TeacherLogsTab.tsx` (Timeline + فلاتر + IP/Device).
- `src/index.css` (توسيع نظام `tm-` بألوان فاتحة نظيفة، بطاقات، Timeline).

**بدون تغييرات:** قاعدة البيانات، RPCs، Edge Functions، منطق الأعمال. سنستخدم RPCs الحالية فقط:
`get_developer_teacher_profile / _overview / _students / _subscriptions / _courses / _wallet_monthly / _withdrawals / _logs` + `admin_manage_teacher` edge function للتعديل والحظر.

## 6) ملاحظات فنية
- تصدير Excel عبر مكتبة `xlsx`، PDF عبر `jspdf` + `html2canvas` (المستخدمة مسبقًا).
- تعديل بيانات المعلم وكلمة السر يمرّ عبر Edge Function `admin-manage-teacher` (مع صلاحية مطور).
- الحظر: `profiles.is_banned = true` + إشعار المعلم.
- سجل تعديلات النسبة: من `teacher_commission_history` (موجود).
- السجلات: من `teacher_activity_logs` (موجود، آخر 90 يوم).

---
هل توافق على البدء بتنفيذ الخطة كما هي، أم تريد تعديل شيء (مثلاً: البدء بتبويب معين أولاً، إضافة/إزالة حقل، أو تركيز على الموبايل فقط)؟

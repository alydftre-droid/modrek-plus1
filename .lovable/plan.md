## الهدف
بناء صفحة "التواصل مع الدعم" احترافية توفّر ثلاث وسائل تواصل، مع لوحة إدارة للمطور، وسجل استخدام في قاعدة البيانات — مع الإبقاء على المساعد الذكي الحالي كما هو تماماً.

## 1) قاعدة البيانات (migration واحدة)

- إضافة مفاتيح إلى `platform_settings`:
  - `support_whatsapp_student`, `support_whatsapp_teacher`
  - `support_whatsapp_enabled` (true/false)
  - `support_messenger_student`, `support_messenger_teacher`
  - `support_messenger_enabled`
  - `support_assistant_enabled`, `support_assistant_display_name`
  - `support_message_template` (قالب مع متغيرات {{name}} …)
- جدول جديد `support_contact_logs`:
  - `id, user_id, user_role, channel (whatsapp|messenger|assistant), user_code, created_at`
  - GRANT SELECT/INSERT للـ authenticated، ALL للـ service_role، GRANT SELECT للـ admins
  - RLS: المستخدم يُدرج سجله فقط؛ الأدمن يقرأ الكل.

## 2) صفحة "التواصل مع الدعم" الجديدة

- تحديث `src/pages/student/SupportPage.tsx` — تصبح صفحة اختيار وسيلة تواصل (Landing) بدلاً من فتح المساعد مباشرة:
  - Header: "التواصل مع الدعم" + وصف.
  - ثلاث بطاقات حديثة (rounded-3xl, shadow, hover scale, ripple):
    1. 🟢 واتساب → `wa.me/<رقم>?text=<قالب مملوء>`
    2. 💬 التواصل المباشر مع الدعم → يفتح صفحة المساعد الذكي الحالي عبر `/support/assistant`
    3. 🔵 فيسبوك Messenger → يفتح رابط الإعداد
  - كل بطاقة تسجّل ضغطة في `support_contact_logs`.
  - إخفاء البطاقة إذا كانت معطّلة في الإعدادات.
- نقل محتوى المساعد الذكي الحالي (الكود الموجود داخل `SupportPage.tsx`) كما هو إلى `src/pages/student/SupportAssistantPage.tsx` بدون أي تغيير منطقي — فقط قص/لصق. الراوت الجديد `/support/assistant`.
- الحفاظ على `DashboardSupportLauncher` كما هو (يبقى يفتح `/support`).
- المعلّم: تحديث `TeacherSupportSettingsPage.tsx` لتستخدم نفس المكوّن الجديد للبطاقات مع أرقام/روابط المعلمين. زر "التواصل المباشر" يفتح `/support/assistant` (نفس الصفحة، لأن نظام المساعد يفصل بين طالب/معلم داخلياً).

## 3) قالب الرسالة والمتغيّرات

- helper `src/lib/supportContactTemplate.ts`:
  - يجلب بيانات المستخدم (profile + teacher_profile إن وُجد + app version من `capacitor` + platform/device).
  - يُبدّل `{{name}} {{role}} {{studentCode}} {{teacherCode}} {{grade}} {{stage}} {{phone}} {{email}} {{appVersion}} {{platform}} {{device}} {{time}} {{date}}`.
  - قالب افتراضي عربي في حال فقدان الإعداد.

## 4) لوحة تحكم المطور

- مكوّن جديد `src/components/admin/settings/SupportChannelsSettings.tsx`:
  - أقسام: واتساب / فيسبوك / التواصل المباشر / قالب الرسالة.
  - كل قسم فيه inputs + Switch تفعيل، وحفظ إلى `platform_settings`.
  - في قسم قالب الرسالة: Textarea + قائمة بالمتغيّرات المتاحة.
- إضافة تبويب "الدعم الفني" في `SettingsPage.tsx` (لو نظام تبويبات) أو استبدال `PlatformSupportSettings` القديم (سيصبح deprecated لكن يبقى لعدم الكسر) بالمكوّن الجديد — الأفضل: إضافة قسم جديد لا يمس القديم.
- صفحة/تبويب سجل التواصل داخل الأدمن: قائمة من `support_contact_logs` مع فلترة بالقناة.

## 5) الحفاظ على المساعد الذكي

- لا تعديل على `supabase/functions/support-assistant/*`.
- لا تعديل على منطق التحويل لموظف الدعم.
- فقط نُقل مكان عرض الواجهة إلى صفحة فرعية `/support/assistant`.

## الملفات

جديدة:
- `supabase/migrations/<ts>_support_channels.sql`
- `src/pages/student/SupportAssistantPage.tsx` (نقل الكود الحالي)
- `src/lib/supportContactTemplate.ts`
- `src/components/support/SupportChannelsView.tsx` (مشترك طالب/معلم)
- `src/components/admin/settings/SupportChannelsSettings.tsx`
- `src/pages/admin/SupportLogsPage.tsx` (اختياري صغير)

معدّلة:
- `src/pages/student/SupportPage.tsx` → landing جديدة
- `src/pages/teacher/TeacherSupportSettingsPage.tsx` → يستخدم SupportChannelsView
- `src/App.tsx` → إضافة route `/support/assistant`
- `src/pages/admin/SettingsPage.tsx` → إضافة تبويب/قسم الدعم الفني

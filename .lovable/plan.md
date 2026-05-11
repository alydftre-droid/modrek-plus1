# خطة تنفيذ شاملة لنظام الذكاء الاصطناعي

## 1. جدول إعدادات AI في قاعدة البيانات

إنشاء جدول `ai_function_settings` لتخزين إعدادات كل وظيفة:

```text
ai_function_settings
├── function_name (PK)   — ai-chat | support-assistant | teacher-assistant | generate-exam | grade-essay
├── models_to_try (text[]) — قائمة الموديلات بالترتيب
├── max_retries (int)    — حدود المحاولات
├── fallback_delay_ms (int) — وقت الانتظار بين المحاولات
├── enable_streaming (bool)
└── updated_at, updated_by
```

- RLS: قراءة عامة (للـ edge functions)، تعديل للأدمن فقط
- بذر القيم الافتراضية لكل وظيفة (ai-chat يبدأ بـ gemini-2.5-pro، الباقي بـ gemini-2.5-flash)

## 2. صفحة إعدادات الأدمن

`src/pages/admin/AiSettingsPage.tsx` + رابط في `SettingsPage.tsx`:
- عرض كل وظيفة في بطاقة منفصلة
- محرر قائمة الموديلات (إضافة/حذف/ترتيب بالسحب)
- حقول: max_retries, fallback_delay_ms, enable_streaming
- زر "حفظ" يحدّث الجدول مباشرة

## 3. دالة موحدة لقراءة الإعدادات في Edge Functions

`supabase/functions/_shared/aiSettings.ts` (يُنسخ في كل وظيفة لأن edge functions لا تشارك ملفات):
- `loadSettings(supabase, fnName)` ترجع الإعدادات أو القيم الافتراضية
- استخدامها في جميع الوظائف الخمس بدل القيم الثابتة

## 4. Streaming للوظائف الثلاث (ai-chat, support-assistant, teacher-assistant)

Backend:
- إذا `enable_streaming = true`، تمرير `stream: true` إلى Gemini وإرجاع `text/event-stream`
- معالجة chunks وإرسالها بصيغة SSE

Frontend (3 ملفات شات):
- استبدال `supabase.functions.invoke` بـ `fetch` مع `ReadableStream`
- تحديث الرسالة الأخيرة في الواجهة تدريجياً مع كل chunk
- Fallback تلقائي عند فشل streaming

## 5. اختبارات Deno تلقائية

ملفات `*_test.ts` لكل وظيفة من الأربعة (ai-chat, support-assistant, teacher-assistant, generate-exam):
- محاكاة استجابات Gemini بـ 429/402/502 عبر `globalThis.fetch` mock
- التحقق من:
  - 429 → تجربة الموديل التالي ثم رسالة "تم تجاوز الحد"
  - 402/401/403 → رسالة "تحقق من مفتاح GEMINI_API_KEY" مع status 402
  - 502/503 → fallback ثم رسالة "خدمة غير متاحة"
  - 200 → إرجاع المحتوى بشكل صحيح
- تشغيلها عبر `supabase--test_edge_functions`

## التفاصيل التقنية

- جميع الموديلات تبقى Gemini فقط (gemini-2.5-pro، gemini-2.5-flash، gemini-flash-latest، gemini-2.5-flash-lite)
- Streaming يستخدم OpenAI-compatible SSE format من Gemini
- في حال خطأ في تحميل الإعدادات من DB، تُستخدم القيم المضمّنة في الكود
- لا تغيير في schema الموجودة — جدول جديد فقط

## الملفات المتأثرة

جديد:
- migration واحدة لجدول `ai_function_settings`
- `src/pages/admin/AiSettingsPage.tsx`
- 4 ملفات `*_test.ts`

تعديل:
- 5 edge functions (إضافة قراءة الإعدادات + streaming حيث مناسب)
- `src/components/student/FloatingSupportBot.tsx` + `AssistantLessonStudio.tsx` + `TeacherAssistantBot.tsx` (أو ما يكافئها) لدعم streaming
- `src/lib/supportAssistant.ts` لإضافة streaming
- `src/pages/admin/SettingsPage.tsx` لإضافة الرابط

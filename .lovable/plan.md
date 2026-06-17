# خطة إعادة بناء نظام امتحانات المعلم - Modrek Plus

سأقوم بإعادة بناء واجهة المعلم للامتحانات بالكامل لتطابق الصور السبع المرفقة 100%، مع الاحتفاظ بنفس قاعدة البيانات (الجداول الحالية: `exams`, `exam_questions`, `exam_question_options`, `exam_drafts`).

## الصفحات الجديدة (استبدال كامل)

1. **`/teacher/exams`** — الصفحة الرئيسية (صورة 1)
   - بطل كبير بنفسجي مع روبوت + زر واحد "إنشاء امتحان جديد"
   - 6 بطاقات إحصائيات (إجمالي، منشورة، طلاب أدوا، متوسط الدرجة، أعلى درجة، نسبة النجاح)
   - جدول "الامتحانات الأخيرة" مع شارات حالة (منشور/مسودة/مجدول/مغلق)
   - شريط مميزات النظام في الأسفل (6 بطاقات)

2. **`/teacher/exams/new`** — اختيار طريقة الإنشاء (صورة 2)
   - بطاقتان فقط: المساعد الذكي (بنفسجي) + الإنشاء اليدوي (أزرق)
   - شارة "الأقوى والذكى" + "تحكم كامل"
   - قائمة مميزات لكل خيار + أيقونات أنواع الأسئلة/المصادر
   - نصيحة سفلية

3. **`/teacher/exams/new/ai`** — المساعد الذكي (صورة 3)
   - شريط خطوات أعلى (المساعد → المراجعة → الإعدادات → المعاينة)
   - واجهة محادثة بأسلوب ChatGPT (رسائل، إدخال، إرفاق)
   - بطاقات سريعة: رفع امتحان ورقي / صور كتاب / PDF / نص الدرس
   - يستدعي edge function `generate-exam` الموجودة (مع دعم الصور والـ PDF)

4. **`/teacher/exams/new/manual`** — الإنشاء اليدوي (صورة 7)
   - شريط خطوات (إنشاء → الإعدادات → المعاينة)
   - لوحة جانبية: أنواع الأسئلة (اختيار، صح/خطأ، قصيرة، مقالي، ترتيب، مطابقة، ملء الفراغ) + ملخص الامتحان
   - بطاقات أسئلة بسحب وإفلات، تحرير مباشر، حذف، درجة لكل سؤال

5. **`/teacher/exams/:id/review`** — مراجعة الأسئلة (صورة 4)
   - بطاقات إحصاء أنواع الأسئلة (MCQ/TF/مطابقة/مقالية)
   - قائمة جانبية مرقمة + بطاقات أسئلة قابلة للتعديل
   - أزرار: تعديل، نسخ، حذف، إضافة سؤال، إعادة استخراج

6. **`/teacher/exams/:id/settings`** — إعدادات الامتحان (صورة 5)
   - معلومات (عنوان، وصف، بداية/نهاية، مدة)
   - تعليمات للطلاب (محرر نصي بسيط)
   - النتيجة وإظهار الدرجات
   - بطاقة مكافحة الغش (Toggles: الحد الأقصى للخروج، منع النسخ، منع التطبيقات، منع التحميل، التقاط صورة عشوائية)
   - شريط جانبي: ملخص الامتحان

7. **`/teacher/exams/:id/preview`** — المعاينة والنشر (صورة 6)
   - عرض كل الأسئلة كما يراها الطالب
   - شريط جانبي ملخص + بطاقة "جاهز للنشر" + زر "نشر الامتحان الآن"

## مكونات مشتركة جديدة

- `ExamWizardStepper` — شريط الخطوات أعلى الصفحات (يتكيف 3 أو 4 خطوات)
- `ExamPageHeader` — شريط رأسي موحد (عودة، حفظ كمسودة، toggle theme)
- `ExamStatCard`, `ExamStatusBadge`, `QuestionTypeBadge`
- `QuestionEditorCard` — بطاقة سؤال موحدة (تعرض/تعدّل حسب النوع)
- `AntiCheatSettings` — مجموعة toggles كاملة

## قاعدة البيانات

استخدام الموجود. إضافة عمود (إن لزم) عبر migration:
- `exams.anti_cheat_settings jsonb` (إن لم يوجد) — يحتوي maxExits, preventCopy, preventApps, preventReload, randomSnapshots, preventPrint, preventDevtools

## تفاصيل تقنية

- RTL كامل، Tailwind + shadcn، Framer Motion للانتقالات
- ألوان مطابقة: بنفسجي `#7C5CFA` للذكي، أزرق `#3B82F6` لليدوي، خلفية ناعمة `#F8F8FC`
- Dark mode متوافق مع tokens الموجودة
- React Query لجلب/تحديث البيانات
- إزالة الصفحات القديمة: `TeacherExamEditorPage` (يستبدل بـ ai/manual/review/settings/preview)
- ربط نظام النشر بـ status='published' وإظهار تلقائي للطلاب المرتبطين (الموجود حاليًا)
- المادة والصف يُؤخذان تلقائياً من حساب المعلم (لا حقول اختيار)

## الملفات

**جديدة**:
- `src/pages/teacher/exams/ExamsHomePage.tsx`
- `src/pages/teacher/exams/CreateMethodPage.tsx`
- `src/pages/teacher/exams/AiAssistantPage.tsx`
- `src/pages/teacher/exams/ManualBuilderPage.tsx`
- `src/pages/teacher/exams/ReviewQuestionsPage.tsx`
- `src/pages/teacher/exams/ExamSettingsPage.tsx`
- `src/pages/teacher/exams/PreviewPublishPage.tsx`
- `src/components/exams/teacher/ExamWizardStepper.tsx`
- `src/components/exams/teacher/QuestionEditorCard.tsx`
- `src/components/exams/teacher/AntiCheatPanel.tsx`
- `src/components/exams/teacher/QuestionTypePicker.tsx`
- `src/components/exams/teacher/ExamSummaryCard.tsx`

**معدّلة**:
- `src/App.tsx` — تحديث routes
- `src/hooks/useExams.ts` — إضافة mutations لـ draft/publish

**محذوفة**:
- `src/pages/teacher/TeacherExamsListPage.tsx`
- `src/pages/teacher/TeacherExamEditorPage.tsx`
(يستبقى Analytics/Attempts كما هي للوصول من القائمة)

## خارج النطاق (سيُؤكد لاحقًا)

- لا تغييرات على لوحة الطالب (مبنية مسبقًا)
- لا تغييرات على edge function `generate-exam` (تستخدم كما هي)
- لا تغييرات على Android build

هل أبدأ التنفيذ؟


# مكتبة الطلاب التفاعلية 2026 — خطة إعادة البناء

الخطة تحافظ **بالكامل** على تصميم صفحة مكتبة الطالب الحالية (البطاقات، الشبكة، طريقة فتح الكتاب). التعديلات البصرية على واجهة الطالب محصورة في:
1) حذف زر «رفع PDF».
2) إضافة فواصل بسيطة لتجميع الكتب حسب المادة.
3) طبقة تفاعل شفافة فوق صفحات الـPDF (لا تغيّر شكل القارئ).

كل ما عدا ذلك Backend + لوحة مطور جديدة.

---

## 1) قاعدة البيانات

### جداول جديدة
- `library_books` — سجل الكتاب الرسمي المُدار من المطور.
  الحقول الوظيفية: `title`, `description`, `cover_url`, `pdf_path` (bstorage)، `education_type` (عام/أزهر/both)، `stage_id`, `track_id` (nullable)، `subject_id`, `page_count`, `file_size`, `status` (`draft|uploading|processing|ready|failed|paused|hidden`)، `processing_progress`, `processing_error`, `access_tier` (`free|premium|vip` — افتراضي `free`)، `published_at`، `created_by`.
- `library_book_pages` — صفحة لكل سطر: `book_id`, `page_number`, `image_url` (معالجة/OCR)، `ocr_text`, `width`, `height`.
- `library_book_sections` — قطع قابلة للنقر داخل كل صفحة: `book_id`, `page_id`, `kind` (`title|paragraph|image|table|equation`), `bbox` (jsonb: x,y,w,h نسبية 0..1), `order_index`, `raw_text`, `embedding` (vector) — لإعادة استخدام الشرح دلاليًا.
- `library_section_explanations` — كاش الشرح (نص+صوت): `section_id` (nullable للأسئلة الحرة), `book_id`, `page_id`, `prompt_hash`, `variant` (`default|deeper|simpler`), `text_ar`, `audio_url`, `voice`, `tokens`, `created_by_user_id`, `created_at`. فهرس فريد على (`section_id`,`variant`).
- `library_book_access_tiers` — جدول مرجعي بسيط (`free`,`premium`,`vip`) للتوسع المستقبلي دون تغيير الكود.
- `library_processing_jobs` — طابور المعالجة: `book_id`, `stage` (upload/split/ocr/sections/embed/explain/tts)، `state`, `attempts`, `last_error`, `started_at`, `finished_at`.

### تعديلات
- الاعتماد على جداول المكتبة الحالية (`library_stages`, `library_tracks`, `library_subjects`, `library_sub_subjects`, `library_grades`) لبناء شجرة الاختيار في الـWizard.
- `content` لن يُستخدم للكتب المدارة من المطور — يظل مخصصًا لكتب الطالب الشخصية (سنُخفيها من واجهة المكتبة الجديدة، بدون حذف بيانات).
- RLS:
  - `library_books`: قراءة لأي مصادق عليه إذا `status='ready' AND access_tier='free'` (لاحقًا نضيف اشتراك). كل شيء آخر للمطور فقط.
  - `library_book_pages`, `library_book_sections`: قراءة لأي مستخدم يستطيع قراءة الكتاب.
  - `library_section_explanations`: قراءة عامة (مشترك)، كتابة عبر Service Role من Edge Functions فقط.
  - `library_processing_jobs`: مطور فقط.
- GRANTs كاملة (authenticated + service_role) لكل الجداول الجديدة.

---

## 2) التخزين

- Bunny Storage: مسار `library-books/{book_id}/source.pdf`، `pages/{n}.jpg`، `explanations/{section_id}/{variant}.mp3`.
- لا رابط عام. كل التقديم عبر `bunny-storage` edge function مع التحقق من الصلاحية.
- عرض الصفحات في القارئ يحوّل الـPDF لصور مسبقة (فك التحميل الفعلي عن المتصفح، ويسمح بطبقة النقر النسبية).

---

## 3) Edge Functions (جديدة)

- `library-admin` — CRUD كامل يستدعيه المطور فقط (تحقق `has_role admin`): إنشاء/تعديل/حذف/إخفاء/إعادة معالجة + إحصائيات Dashboard.
- `library-ingest` — يُشغَّل عند نشر كتاب: يقسّم الـPDF لصفحات (pdf.js في Deno + rasterize)، يشغّل OCR عند الحاجة (Google Vision عبر `LOVABLE_API_KEY` أو Gemini vision)، يستخرج Sections مع bboxes.
- `library-embed` — يستدعي `google/gemini-embedding-2` لتضمين نصوص الأقسام.
- `library-explain` — يستقبل `section_id` أو (book_id,page,bbox,question). إذا وُجد كاش يرجعه فورًا؛ وإلا يستدعي `openai/gpt-5.5` (الافتراضي) لإنتاج الشرح، ثم `openai/gpt-4o-mini-tts` لتوليد الصوت، ويحفظ كليهما.
- `library-tts` — أداة داخلية مشتركة.
- كل النداءات من العميل تمر عبر هذه الدوال (لا مفاتيح في الواجهة).

Pipeline يعمل غير متزامن (`library_processing_jobs`) مع تحديث `status/processing_progress` — الكتاب لا يظهر للطالب حتى `status='ready'`.

---

## 4) لوحة المطور الجديدة

مكان: `/admin/library` داخل لوحة المطور (ليس المعلم).

الصفحات:
- **Dashboard**: بطاقات KPI (كتب، صفحات، مواد، صفوف، معالجة/تحت المعالجة، ملفات صوتية، حجم التخزين) + آخر 10 كتب.
- **Books**: جدول-بطاقات حديث (بحث + فلترة: نظام/صف/شعبة/مادة/حالة)، وأزرار: تعديل، حذف، إعادة معالجة، إيقاف، إخفاء، معاينة.
- **Upload Wizard** (9 خطوات كما طلب المستخدم): النظام → الصف → الشعبة (تلقائي التخطي) → المادة (ديناميكي من DB) → PDF → غلاف → اسم → وصف → مراجعة & نشر. شريط تقدم للمعالجة بعد النشر.
- **Preview**: عرض داخلي للكتاب مع مؤشرات الأقسام والشروحات المولّدة.

التصميم: بطاقات زجاجية، ألوان Modrek، بدون جداول قديمة — مستوحى من Linear/Stripe.

---

## 5) واجهة الطالب

- إزالة زر «رفع PDF» بالكامل من `MyLibraryPage`.
- تجميع الكتب حسب المادة برأس مادة أنيق (اسم عربي + أيقونة صغيرة + خط فاصل رفيع)، والبطاقات كما هي.
- الفلترة الضمنية: النظام + الصف + الشعبة + مواد الطالب النشطة.
- داخل `LibraryBookStudio`: لا تغيير على تخطيط القارئ. تُضاف طبقة SVG شفافة فوق الصفحة تعرض bbox قابلة للنقر. عند النقر:
  - إن وُجد شرح كاش → يشغّل الصوت + يعرض النص في الشريط السفلي (نفس المكان الحالي).
  - وإلا → يستدعي `library-explain` (يبقي «المساعد يشرح الصفحة…» الحالي).
- زر مايكروفون/دردشة الحالي يستمر بالعمل عبر نفس نقطة `library-explain` بمتغير `deeper`/`simpler` عندما يقول الطالب «اشرح أكثر».
- كل الأصول تُطلب موقّعة، لا روابط PDF مباشرة، لا زر تحميل.

---

## 6) الاشتراك المستقبلي (بنية فقط)

- `library_books.access_tier` + جدول `library_access_tiers`.
- Helper `has_library_access(user_id, tier)` — الآن يرجع `true` دائمًا للـ`free`. لاحقًا يُربط بجدول اشتراك مكتبة عام دون تغيير الواجهة.

---

## 7) الأداء والأمان

- تحميل الصور بصيغة تدريجية (تكبير عند الحاجة) + IndexedDB cache للصفحات (نُعيد استخدام `libraryCache`).
- Virtualization لقوائم لوحة المطور.
- Rate-limit على `library-explain` لكل مستخدم.
- كل الردود من Edge Functions تمر بـCORS محدود ومصادقة JWT.

---

## 8) خطة التنفيذ بالترتيب

1. Migration واحد شامل: جداول + RLS + GRANTs + Helper.
2. Bunny paths + policies للـedge functions.
3. `library-admin` + `library-ingest` + `library-embed` + `library-explain` + `library-tts`.
4. صفحات لوحة المطور (`/admin/library/*`) + Wizard.
5. تعديل `MyLibraryPage` (حذف الرفع + التجميع + مصدر بيانات جديد).
6. تعديل `LibraryBookStudio` (طبقة الأقسام + استدعاء الشرح الجديد).
7. اختبار end-to-end: رفع كتاب، معالجة، ظهور للطالب، شرح، صوت، كاش.

---

## ملاحظات تقنية

- النموذج الافتراضي: `openai/gpt-5.5` للنص، `google/gemini-embedding-2` للتضمين، `openai/gpt-4o-mini-tts` للصوت — كلها عبر Lovable AI Gateway (بدون مفاتيح للعميل).
- كتب الطالب القديمة في جدول `content` تُترك كما هي في قاعدة البيانات، لكنها تختفي من واجهة المكتبة الجديدة (نسمح بها فقط للمطور من أداة تنظيف).
- لن يتم لمس `client.ts`، `types.ts`، `config.toml`، أو Auth.

بانتظار موافقتك لأبدأ التنفيذ.

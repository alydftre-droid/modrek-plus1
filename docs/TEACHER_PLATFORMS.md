# منصات المعلمين (Teacher Platforms) — التوثيق التقني

منصة معلم = (معلم واحد + مواد مسموح بها + هوية بصرية + slug). المنصة الرسمية
"مدرك Plus" = عدم وجود عضوية (`platform_id IS NULL`).

## 1. قاعدة البيانات

| الجدول | الدور |
| --- | --- |
| `teacher_platforms` | بيانات المنصة: `name, slug, logo_url, brand_color, owner_teacher_id, status` |
| `teacher_platform_subjects` | المواد المسموح بها داخل المنصة |
| `platform_memberships` | مصدر الحقيقة لانتماء الطالب/المعلم (`status = active`) |
| `platform_reserved_slugs` | slugs محجوزة (www, admin, api …) |

أعمدة `platform_id` أضيفت إلى `library_books` و`knowledge_sources` وتُملأ تلقائيًا
عبر Triggers حسب رافع المحتوى.

### دوال العزل (SECURITY DEFINER)

- `user_platform_id(uuid)` / `platform_scope_for_user(uuid)` — منصة المستخدم.
- `platform_actor_ok`, `platform_row_ok`, `platform_group_ok` — التحقق من التطابق دون Recursion.
- `get_platform_by_slug(text)` — بيانات الهوية البصرية للمنصة النشطة فقط.
- `platform_join_as_student(text)` — ربط الطالب بالمنصة عند الدخول من رابطها.
- `storage_platform_path_ok(text, uuid)` — التحقق من مسارات التخزين.
- `admin_create_teacher_platform`, `admin_update_teacher_platform`, `admin_set_platform_status` — إدارة الأدمن فقط.

## 2. العزل (Backend فقط، وليس إخفاءً في الواجهة)

- سياسات `AS RESTRICTIVE` على `content`, `content_groups`, `exams`, `exam_attempts`,
  `exam_statistics`, `subscriptions`, `library_books`, `knowledge_sources`,
  `profiles`, `teacher_profiles`, `subjects` وغيرها؛ الأدمن مستثنى.
- العزل معاكس أيضًا: طلاب ومعلمو المنصات لا يظهرون في المنصة الرسمية.
- **Storage**: سياسة `Platform storage isolation` (RESTRICTIVE) على `storage.objects`:
  أي كائن تحت `platforms/<platform_id>/...` متاح فقط لأعضاء تلك المنصة.
  المسارات القديمة خارج هذه البادئة لم تتأثر.

## 3. عزل الذكاء الاصطناعي والمكتبة (RAG)

وظائف الحافة تعمل بمفتاح الخدمة (يتجاوز RLS)، لذلك العزل يُفرض في الكود:

- `resolveStudentScope` يقرأ `platformId` من `platform_memberships` (لا من body).
- `applyPlatformScope` يقيّد `library_books` و`knowledge_sources` بمنصة المستخدم
  (أو `platform_id IS NULL` للمنصة الرسمية)؛ كل المقاطع (chunks) تُجلب بمعرفات
  الكتب المسموح بها فقط.
- `getAccessibleLibraryBook` يرفض أي كتاب من منصة أخرى بـ `404 book_not_found`.
- `modrek-retrieve` يعيد فلترة نتائج `modrek_hybrid_search` حسب منصة المصدر.
- `library-recommendations` يوصي بكتب المنصة نفسها فقط.

## 4. الروابط والهوية البصرية

- `<slug>.modrekplus.com` (يحتاج wildcard DNS/Domain في الاستضافة) أو المسار
  الاحتياطي `modrekplus.com/p/<slug>`.
- `src/lib/platformHost.ts` يستخرج الـslug، و`PlatformProvider` يحمّل الهوية
  ويربط الطالب بالمنصة، و`supabaseRuntimeGuard` يسمح بالنطاقات الفرعية.
- الـslug لا يُستخدم للتصريح أبدًا — فقط للهوية البصرية.

## 5. نتائج الاختبار الفعلي (منصتان تجريبيتان)

اختبار بجلسات حقيقية (JWT) لطلاب ومعلمين عبر PostREST ووظائف الحافة:

| الفحص | النتيجة |
| --- | --- |
| طالب منصة A يقرأ درس/امتحان منصة B | ممنوع (صفر صفوف) |
| طالب منصة A يرى معلم منصة B | ممنوع |
| طالب منصة A يقرأ محتوى المنصة الرسمية | ممنوع |
| طالب المنصة الرسمية يرى معلمي/محتوى المنصات | ممنوع |
| شرح كتاب منصة A: طالب A / طالب B / طالب رسمي | 200 / 404 / 404 |
| الأدمن | يرى كل المنصات |

بعد الاختبار حُذفت كل بيانات التجربة (المنصتان، العضويات، المجموعات، الدروس،
الامتحانات، الكتاب التجريبي) وتم التأكد من عودة المنصة الرسمية لحالتها السابقة.

## 6. إنشاء وتعطيل منصة

من حساب المطور: **منصات المعلمين** → معالج الإنشاء (اسم، slug، شعار، معلم، مواد)
→ إدارة (تعديل، تعطيل/تفعيل، أرشفة). التعطيل يوقف الرابط فورًا لأن
`get_platform_by_slug` يعيد المنصات النشطة فقط.

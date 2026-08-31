# Teacher Platforms (Platform Manager) — منصات المعلمين

## ما اكتشفته من فحص المشروع (Phase 1 + 2)

- التطبيق SPA واحد (React + Vite + react-router) يعمل على Vercel، وجميع المسارات معرّفة في `src/App.tsx` مع rewrites في `vercel.json`.
- يوجد إجبار على origin واحد في `src/lib/supabaseRuntimeGuard.ts` (`enforceCanonicalRuntimeOrigin`) يعيد أي origin غير `https://modrekplus.com` إلى الدومين الرسمي. هذا **سيكسر أي subdomain** ويجب استثناء `*.modrekplus.com` قبل أي شيء آخر.
- العزل الحالي في قاعدة البيانات **مبني أصلًا على المعلم**: `content_groups.teacher_id`، `exams.teacher_id`، `subscriptions.teacher_id`، `teacher_assignments`، `student_teacher_choices`، بالإضافة إلى `content.group_id → content_groups`. أي أن "منصة معلم واحد" يمكن بناؤها فوق ملكية المعلم الموجودة بدل حشو `platform_id` في ~140 جدولًا.
- الأدوار في `user_roles` + `has_role()`، والحماية في `ProtectedRoute` و`TeacherProtectedRoute`.
- الملفات: Bunny CDN (فيديو/ملفات) عبر `bunny-storage`/`bunny-stream` + Supabase Storage للمكتبة والصور.
- المكتبة/AI: `knowledge_sources` و`library_books` و`modrekLibraryRag.ts` مع تصفية بالمادة والصلاحيات، ولا يوجد حاليًا مفهوم tenant.

**الخلاصة:** البنية تسمح بالتنفيذ بأمان كطبقة Tenant رقيقة، بشرط عدم لمس منطق المنصة الرسمية إلا في نقاط محددة.

## نموذج الـTenant المقترح

Platform = (معلم واحد + مجموعة مواد مسموح بها + هوية بصرية + slug).

جداول جديدة فقط (لا تعديل مدمّر على الجداول الحالية):

- `teacher_platforms`: `id, name, slug, description, logo_url, brand_color, owner_teacher_id, status (active|suspended|archived), created_by, created_at, updated_at`
- `teacher_platform_subjects`: `platform_id, subject_id` (المواد المسموح بها)
- `platform_memberships`: `platform_id, user_id, member_role (teacher|student), status, joined_at` — هذا هو مصدر الحقيقة لانتماء الطالب.
- `platform_reserved_slugs`: قائمة slugs محجوزة (`www, app, admin, api, auth, teacher, student, cdn, mail, notify …`).

المنصة الرسمية = غياب membership (`platform_id IS NULL`)، فلا migration على بيانات الطلاب الحاليين ولا خطر ربطهم بمنصة بالخطأ.

دوال SECURITY DEFINER:
- `platform_id_for_slug(slug)` → id للمنصة النشطة فقط.
- `is_platform_member(_platform_id, _user_id)` / `platform_ids_for_user(_user_id)`.
- `admin_create_teacher_platform(...)`, `admin_update_teacher_platform(...)`, `admin_set_platform_status(...)` — كلها تتحقق من `has_role(auth.uid(),'admin')`.
- `platform_join_as_student(_platform_id)` — الطالب ينضم فقط عبر منصة نشطة.

## العزل (Phase 5)

العزل يُطبّق في الـBackend عبر قاعدتين مركّبتين وليس عبر الواجهة:

1. **عزل حسب المعلم:** الطالب في منصة أحمد لا يرى إلا محتوى/مجموعات/امتحانات/اشتراكات مالكها `owner_teacher_id` للمنصة. يُنفّذ بتعديل RLS policies الخاصة بالطلاب على `content_groups`, `content`, `exams`, `subscriptions`, `notifications`, `student_teacher_choices` بإضافة شرط: إذا كان للمستخدم membership في منصة، فالمعلم المالك يجب أن يكون معلم تلك المنصة.
2. **عزل حسب المادة:** المواد المرئية داخل المنصة محصورة في `teacher_platform_subjects`.
3. **عزل معاكس:** طلاب المنصات لا يظهرون لمعلمي المنصة الرسمية (نفس أسلوب `is_test_student()` الموجود) — عبر helper `student_platform_id(user_id)` يُضاف إلى استعلامات المعلمين.
4. **الملفات:** مسارات Supabase Storage تُنسّق `platforms/{platform_id}/...` مع policies تعتمد على `is_platform_member`؛ روابط Bunny تبقى موقّعة قصيرة الأجل عبر `sign-playback` (لا وصول مباشر بتغيير المسار).
5. **AI:** تمرير `platform_id` مستنتَج من الجلسة (لا من body) داخل `modrek-retrieve` / `modrek-ai-study` / `ai-chat` / `library-chat` / `teacher-assistant`، وتقييد `knowledge_sources`/`library_books` والمحادثات بالمنصة. أي مصدر لا يخص المنصة يُستبعد قبل الـretrieval.

## Routing والهوية البصرية (Phase 4)

- `src/lib/platformHost.ts`: استخراج الـslug من `window.location.hostname` (`<slug>.modrekplus.com`) مع بديل تطويري `?platform=<slug>` على localhost/preview فقط.
- `PlatformProvider` (context) يحمّل المنصة من DB مرة واحدة ويكشّها؛ `usePlatform()` متاح لكل الواجهات.
- في `src/App.tsx`: عند وجود منصة، يُركّب شجرة routes خاصة بالـtenant (landing + auth + student + teacher) بدل صفحات المنصة الرسمية التسويقية؛ **بدون حذف أو تغيير أي route حالي** للمنصة الرسمية.
- استثناء `*.modrekplus.com` في `enforceCanonicalRuntimeOrigin` + إضافة wildcard rewrite للـSPA في `vercel.json`. إعداد wildcard DNS/domain في Vercel خطوة يدوية سأوثّقها.
- Branding: الشعار والاسم واللون في صفحة الدخول والهيدر ولوحات الطالب والمعلم داخل المنصة فقط.

## واجهة الأدمن (Phase 3)

- بند جديد في `AdminSidebar`: "منصات المعلمين" → `/admin/platforms`.
- صفحة `AdminPlatformsPage.tsx`: 4 مؤشرات (إجمالي/نشطة/متوقفة/إجمالي الطلاب) + شبكة Cards (شعار، اسم، معلم، مادة، عدد الطلاب، الحالة، الرابط + نسخ) + أزرار فتح/إدارة.
- Wizard إنشاء: بيانات المنصة (اسم، slug مع تحقق فوري من التوفر، شعار، وصف) → اختيار المعلم من المعلمين الحقيقيين → اختيار المواد الفعلية → إنشاء.
- صفحة إدارة منصة: تعديل البيانات، تغيير المادة/المعلم (بضوابط)، تعطيل/تفعيل/أرشفة (soft delete)، قائمة طلاب المنصة.
- حساب المعلم: يُستخدم حساب معلم موجود (بدون كلمات مرور مخزّنة)؛ إذا احتاج الأدمن معلمًا جديدًا يُنشأ عبر الـEdge Function الحالي `admin-manage-teacher` مع دعوة/إعادة تعيين كلمة مرور من Auth.

## Backend

Edge Function واحدة جديدة `platform-admin` (إنشاء/تعديل/حالة/إحصاءات) تتحقق من دور admin بالـJWT، وتستدعي الـRPCs أعلاه. لا endpoints تثق في `platform_id` من الـclient.

## الاختبارات (Phase 8)

- unit: تحليل الـhostname، تنقية وتحقق الـslug، الـslugs المحجوزة.
- integration مقابل قاعدة البيانات الحقيقية: طالب منصة A لا يقرأ محتوى/امتحانات/اشتراكات منصة B ولا المنصة الرسمية (SELECT/INSERT/UPDATE/DELETE)، معلم A لا يرى بيانات B، الأدمن يرى الكل، والمنصة الرسمية تعمل كما هي.
- AI: استعلام من منصة A لا يسترجع مصادر منصة B.

## التسليمات

- `docs/TEACHER_PLATFORMS.md` (Architecture، DB، RLS، Storage، AI، Routing، كيفية إنشاء/تعطيل منصة، مسار الدومينات المخصصة مستقبلًا).
- تقرير نهائي بالأقسام A→K كما طُلب.

## مخاطر أعرضها عليك الآن

1. **Wildcard subdomain**: يحتاج إضافة `*.modrekplus.com` في إعدادات الدومين لدى الاستضافة/DNS — لا أستطيع تنفيذها من الكود. حتى تُفعّل، ستعمل المنصات عبر مسار احتياطي `modrekplus.com/p/<slug>` سأضيفه أيضًا لضمان عمل النظام فعليًا.
2. **تعديل RLS على جداول حسّاسة** (`content`, `exams`, `subscriptions`): سأتبع نمطًا إضافيًا (شرط يُحيّد نفسه للمستخدمين بلا membership) حتى لا يتأثر أي طالب حالي.
3. **تطبيق Android** يشير إلى الدومين الرسمي؛ المنصات مرحلة ويب فقط في هذه المرحلة.

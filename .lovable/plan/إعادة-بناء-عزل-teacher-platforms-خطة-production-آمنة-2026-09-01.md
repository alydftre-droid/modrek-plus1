# إعادة بناء عزل Teacher Platforms — خطة Production آمنة

## القرار المعماري

Teacher Platform ستكون Tenant حقيقية داخل نفس الكود وقاعدة البيانات، وليست Theme. المصدر الوحيد للـTenant الحالي:

```text
hostname الحالي
  → resolveTenant(hostname)
  → tenant_id ثابت
  → tenant-scoped auth session
  → tenant account + role
  → queries/RPC/RLS تحمل tenant_id
  → rows/storage/RAG/cache تحمل tenant_id
```

لن تُستخدم عضوية المستخدم أو `localStorage` أو أول منصة يملكها المستخدم لتحديد المنصة المفتوحة.

## نتائج التدقيق والأسباب الجذرية

1. `detectPlatformSlug()` يرجع إلى `mp_platform_slug` المخزن؛ لذلك قد يحمل الدومين الرسمي هوية منصة سابقة.
2. `PlatformProvider` ينفذ `platform_join_as_student` تلقائيًا لأي طالب مسجل دخوله؛ هذا يلوث العضويات بمجرد زيارة الرابط.
3. جميع مسارات الطالب/المعلم الرسمية مركبة داخل subdomain بلا Route Boundary؛ لذلك منصة المعلم تعرض صفحات واكتشاف معلمي ومواد Modrek Plus.
4. `user_platform_id()` و`platform_actor_ok()` و`platform_row_ok()` تستنتج الـTenant من المستخدم، لا من الطلب الحالي؛ وهذا يكسر المنصة الرسمية ويمنع نموذج العضويات المتعددة.
5. `platform_memberships` يحتوي `UNIQUE(user_id)`، فيجعل المستخدم تابعًا لمنصة واحدة عالميًا بدل حساب Tenant مستقل.
6. أغلب الموارد الحرجة لا تحمل `platform_id`: المحتوى والمجموعات والاشتراكات والاختيارات والامتحانات والإجابات والإشعارات والرسائل والتقدم وغيرها؛ العزل الحالي تخميني عبر المالك وسلاسل علاقات قابلة للخطأ.
7. الاستعلامات الرسمية مثل `TeacherSelection` و`useSubscription` لا تحمل Tenant context؛ والسياسات الجديدة غيّرت سلوكها بدل إبقاء الرسمي كما كان.
8. React Query يستخدم cache عالميًا (`mp-rq-cache-v3`) ومفاتيح بلا tenant، ما يسمح بوميض/إعادة عرض بيانات Tenant آخر.
9. OAuth والبريد وإعادة التعيين تستخدم أحيانًا `modrekplus.com` صراحة؛ ولا يوجد تحقق من Tenant Account بعد إنشاء جلسة Auth.
10. وظائف AI ذات service role تتجاوز RLS وبعضها يستنتج المنصة من membership؛ كما أن `ai_sources` و`ai_admin_instructions` ومسارات تخزين قديمة لا تحمل Tenant صريحًا.
11. قاعدة الإنتاج الحالية تحتوي سياسات Tenant مبنية على المالك/العضوية، بينما لا توجد حاليًا عضويات أو منصات ظاهرة في قاعدة البيئة التي تم فحصها؛ لذلك أي إصلاح بيانات سيكون بعد Inventory مؤكد ولن يفترض وجود صفوف.

## قيد المصادقة الصريح

مشروع Auth واحد يفرض بريدًا فريدًا عالميًا؛ لذلك لا يمكن إنشاء هويتين Auth مستقلتين تمامًا بنفس البريد وكلمتي مرور مستقلتين داخل مشروع Auth واحد دون Identity Provider منفصل لكل Tenant أو نظام هوية مخصص كامل.

المسار الآمن داخل البنية الحالية:

- Auth user = هوية إثبات البريد/كلمة المرور فقط.
- `tenant_accounts` = الحساب التطبيقي المستقل داخل كل Tenant، مع `UNIQUE(tenant_id, auth_user_id)` وبيانات الطالب/المعلم الخاصة بذلك الـTenant.
- تسجيل الدخول على Tenant ينجح تقنيًا في Auth ثم لا يمنح أي وصول حتى توجد `tenant_account` فعالة في الـTenant الحالي؛ وإلا تُمسح الجلسة فورًا وتظهر «لا يوجد حساب على هذه المنصة».
- نفس Auth principal يمكن أن يملك حسابين Tenant منفصلين بعد تسجيل صريح مستقل في كل منصة، لكن كلمة المرور والبريد الأساسيان يظلان عالميين. إذا كان المطلوب كلمتي مرور مستقلتين لنفس البريد، فهذا يتطلب Auth project/Identity Realm مستقل لكل منصة، وليس حيلة synthetic email.

هذا يحقق معيار عدم انتقال الحساب أو البيانات أو الصلاحيات تلقائيًا، مع توثيق الحد الحقيقي بدل إخفائه.

## المرحلة 1 — إيقاف الضرر واستعادة الرسمي

- إزالة استدعاء `platform_join_as_student` التلقائي بالكامل.
- حذف localStorage fallback من Tenant resolution؛ `/p/:slug` يعمل فقط عندما يكون slug موجودًا في المسار نفسه، والـhostname هو المرجع في subdomains.
- إضافة `OfficialOnlyRoute` و`TenantOnlyRoute`:
  - الرسمي يحتفظ بكل مساراته الحالية وسلوكه.
  - Tenant يمنع directory المعلمين، تسجيل المعلم العام، SEO الرسمي، وإدارة الأدمن العامة.
- تعطيل تأثير سياسات membership-derived الحالية على مسارات الرسمي عبر migration تصحيحية مدروسة، بعد التقاط تعريف كل Policy الحالية؛ لا حذف جداول أو بيانات.
- اختبار فوري للرسمي: التسجيل، الدخول، اختيار المعلم، الاشتراك، الشراء، المواد والمحتوى.

## المرحلة 2 — نموذج البيانات الجديد (Additive / Zero Downtime)

### جداول أساسية

- `tenants`: سجل رسمي ثابت (`tenant_type='official'`) وسجل لكل منصة معلم (`tenant_type='teacher'`, slug, status).
- `tenant_accounts`: `tenant_id, auth_user_id, role, status, full_name, education_type, stage, grade, section`؛ المفتاح الفريد مركب.
- `tenant_session_contexts`: يربط Session ID الموثق بـ`tenant_id` و`tenant_account_id`؛ RLS يعتمد عليه بدل «أول membership للمستخدم».
- `tenant_teacher_config`: المالك، المواد، أنواع التعليم، المراحل والصفوف المتاحة.
- إبقاء `teacher_platforms` كإعداد Branding/إدارة وربطه بـ`tenant_id`، وعدم اعتباره مصدر التفويض.

### تحويل آمن

- إنشاء Tenant رسمي ثابت أولًا.
- إضافة `platform_id/tenant_id` كعمود Nullable أو Default رسمي لكل جدول مملوك للTenant.
- Backfill حتمي: البيانات الحالية الرسمية → Tenant الرسمي؛ البيانات المرتبطة بمنصة مؤكدة → Tenant المنصة؛ الصفوف الملتبسة تُسجل في تقرير ولا تُنقل تخمينيًا.
- تحديث التطبيق للكتابة في العمود الجديد، ثم التحقق من عدم وجود NULL، ثم `NOT NULL` في Migration لاحقة.
- استبدال `UNIQUE(user_id)` بمنطق جديد `UNIQUE(tenant_id, auth_user_id)` داخل `tenant_accounts`. إبقاء `platform_memberships` القديم مؤقتًا للقراءة الانتقالية ثم إيقاف استخدامه، بدون Drop.

### الجداول المشمولة

إضافة/توريث Tenant صريح إلى: profiles tenant layer، teacher profiles/config، assignments، teacher choices، subscriptions، purchases، groups، sub-subjects، content، exams/questions/answers/attempts/statistics، notifications، messages، live sessions، video/progress، wallets/financial tenant rows، library/RAG tables، AI conversations/messages/usage، storage assets، وأي جدول أعمال يظهره Inventory للعلاقات.

## المرحلة 3 — Tenant Session وRLS

- RPC عام آمن `resolve_tenant_by_hostname/slug` يعيد بيانات Branding العامة فقط للTenant النشط.
- بعد login/register، RPC/Edge موثق ينشئ `tenant_session_context` للـSession الحالي والـTenant المطلوب بعد التحقق من `tenant_account`.
- Helper واحد `current_request_tenant_id()` يقرأ Session context؛ لا يستخدم membership ولا owner inference.
- كل Policy تصبح مفهوميًا:

```text
auth.uid() + current session tenant + active tenant_account + row.tenant_id
```

- الأدمن فقط يملك cross-tenant RPCs صريحة ومدققة Audit Log.
- سياسات SELECT/INSERT/UPDATE/DELETE منفصلة ومختبرة؛ لا `owner IS NULL => true` ولا `NULL = official`.
- جميع الـRPCs تستقبل tenant identifier المطلوب، تتحقق من Session tenant، ولا تثق في قيمة client منفردة.

## المرحلة 4 — Frontend والRouting والBranding

- `TenantProvider` وحيد يحل hostname في كل load/navigation ولا يقرأ Tenant من user.
- حالات واضحة: resolving / official / active tenant / suspended / not found.
- لا تُركّب واجهات الرسمي داخل Tenant إلا المكونات المشتركة المعاد استخدامها ببيانات Tenant-scoped.
- Auth/login/register/forgot/reset/callback تستخدم origin الحالي وتحتفظ بالـTenant المقصود بأمان.
- `ProtectedRoute` و`TeacherProtectedRoute` يتحققان من Tenant Account ودورها، لا من `user_roles` العالمي فقط.
- Logo/title/name/header/login/dashboard كلها من Branding الحالي؛ لا ظهور لهوية Modrek Plus داخل Tenant إلا attribution قانوني اختياري.

## المرحلة 5 — التسجيل الذكي داخل منصة المعلم

- التسجيل على Tenant ينشئ `tenant_account` صراحة؛ لا Auto Join.
- إذا سجل مستخدم رسمي بياناته على Tenant بلا tenant account: رفض ورسالة «لا يوجد حساب على هذه المنصة».
- إذا أراد إنشاء حساب في Tenant بنفس البريد: إثبات ملكية Auth ثم إنشاء Tenant Account مستقل فقط بعد موافقة صريحة، بدون نسخ profile الرسمي.
- خيارات التسجيل من `tenant_teacher_config`:
  - نوع التعليم المتاح.
  - المراحل المحددة فقط.
  - الصفوف المحددة فقط.
- بعد التسجيل لا يظهر teacher directory؛ المعلم الوحيد هو مالك Tenant ويُربط الاشتراك/المجموعة به داخل Tenant نفسه.

## المرحلة 6 — البيانات والاشتراكات والواجهات

- الرسمي: يبقى teacher selection وsubscriptions والcheckout كما كان، لكن كل الصفوف الجديدة تحمل Tenant الرسمي.
- Tenant: لا teacher selection؛ subject catalog محصور في `tenant_teacher_config`، ثم مجموعات المالك المطابقة للتعليم/المرحلة/الصف.
- تحديث كل query/mutation لتأخذ `tenantId` من `TenantProvider` وتضيف filter صريحًا، مع RLS كدفاع ثانٍ.
- Teacher dashboard يستخدم Tenant الحالي في الطلاب والاشتراكات والمجموعات والمحتوى والرسائل والماليات والتحليلات.
- Admin manager يضبط المواد والتعليم والمراحل والصفوف والهوية والحالة.

## المرحلة 7 — AI/RAG/Storage/Cache

- Request Context موحد لكل Edge Function: verified user + tenant session + role + tenant account.
- كل service-role query تستخدم `scopeToTenant()`؛ إضافة tenant_id إلى مصادر وتعليمات AI والمحادثات والعدادات.
- RAG retrieval يفلتر داخل SQL قبل جلب المقاطع، وليس post-filter فقط.
- كل ملفات Tenant تحت `platforms/<tenant_id>/...`، وسياسات bucket تتحقق من Session tenant؛ الرسمي له prefix/tenant ثابت، لا مساحة NULL مشتركة.
- React Query keys تبدأ بـ`[tenantId, ...]`، والـpersister key لكل hostname/Tenant؛ مسح cache عند tenant mismatch وقبل العرض.

## المرحلة 8 — الاختبارات الإلزامية

### قاعدة البيانات/RLS

- مستخدم Tenant A: منع SELECT/INSERT/UPDATE/DELETE على B والرسمي في كل الجداول الحرجة.
- Tenant B والعكس، unauthenticated، suspended membership، suspended tenant، admin bypass المقصود فقط.
- Storage cross-tenant، RAG cross-tenant، subscriptions، teacher/student discovery، notifications، messages، exams/progress/wallets.
- فحص أن كل جدول tenant-owned يحمل tenant_id وفهرسًا مناسبًا.

### Production regression

المصفوفة A–K المطلوبة على الرسمي و`ahmed.modrekplus.com` بجلسات حقيقية منفصلة، وتشمل registration/login/OAuth/reset، اختيار المعلم والاشتراك والشراء، dashboard/content/exams/AI/notifications/progress.

### شرط النشر

- لا Deploy قبل نجاح migration dry-run، build/tests، linter، اختبارات RLS الحقيقية، وPlaywright على الرسمي والTenant.
- إطلاق مرحلي: Restore official → schema dual-write → tenant auth/session → tenant UI/data → AI/storage → إزالة القراءة القديمة.
- Rollback لكل مرحلة يبقي الأعمدة القديمة ولا يحذف بيانات الإنتاج.

## ملفات التنفيذ الرئيسية

- `src/lib/platformHost.ts`, `src/hooks/usePlatform.tsx`, `src/hooks/useAuth.tsx`, `src/App.tsx`
- `ProtectedRoute`, `TeacherProtectedRoute`, Auth/callback/reset flows
- student/teacher dashboards, TeacherSelection, subscription/purchase/group/content/exam hooks
- React Query persistence and query keys
- Edge Functions shared auth/request context, AI/RAG/library functions
- migrations الحالية 0003–0008 كنقاط تدقيق فقط؛ الإصلاح سيكون Migrations إضافية آمنة عبر أداة قاعدة البيانات، لا إعادة كتابة تاريخ مطبق.

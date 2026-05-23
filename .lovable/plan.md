# نظام الباقات المجمعة والخصومات (Bundled Packages)

نظام كامل يسمح للمطور بإنشاء باقات مواد بأسعار مخفضة، ويسمح للطلاب بالاشتراك بها مرة واحدة لشراء عدة مجموعات معًا.

---

## 1. قاعدة البيانات (Supabase Migration)

### جداول جديدة

**`bundled_packages`** (الباقة الرئيسية)
- `id`, `created_by` (admin uuid)
- `name`, `description`, `image_url`, `color`
- `education_type` (`عام` | `أزهر`)
- `stage` (`preparatory` | `secondary`)
- `grade` (الصف الأول/الثاني/الثالث)
- `section` (`scientific` | `literary` | `science_track` | `math_track` | null)
- `discount_percentage` numeric (نسبة الخصم الديناميكية)
- `manual_price_override` numeric nullable (لو المطور حدد سعر يدوي)
- `status` (`draft` | `scheduled` | `active` | `hidden` | `expired`)
- `publish_at` timestamptz, `expires_at` timestamptz nullable
- `max_subscriptions` int nullable (Expiry بعدد الاشتراكات)
- `subscriptions_count` int default 0
- `created_at`, `updated_at`

**`bundled_package_subjects`** (المواد المختارة في الباقة)
- `id`, `package_id` FK, `subject_id` FK
- UNIQUE (package_id, subject_id)
- *ملاحظة: لا نخزّن السعر هنا — يحسب ديناميكيًا من المجموعة وقت الاشتراك*

**`bundled_package_subscriptions`** (سجل اشتراك الطالب بالباقة)
- `id`, `package_id` FK, `student_id` FK
- `total_original` numeric, `total_paid` numeric, `discount_applied` numeric
- `created_at`
- UNIQUE (package_id, student_id) — منع التكرار

**`bundled_package_subscription_groups`** (المجموعات المختارة لكل مادة)
- `id`, `subscription_id` FK, `subject_id`, `group_id`, `teacher_id`
- UNIQUE (subscription_id, subject_id)

### Functions

- `compute_package_price(package_id, student_id)` → يحسب أرخص مجموعة نشطة لكل مادة ويعيد `{original, discounted, savings}` بناءً على `discount_percentage` أو `manual_price_override`.
- `purchase_bundled_package(package_id, group_ids jsonb)` SECURITY DEFINER:
  1. تحقق الباقة active وغير منتهية وغير ممتلئة
  2. تحقق ما اشترك قبل كده
  3. لكل مادة → group واحد فقط من المجموعات الفعلية
  4. حساب الإجمالي + الخصم
  5. تحقق رصيد المحفظة
  6. خصم + إنشاء `student_group_purchases` لكل مجموعة (يفعّل الـtrigger الحالي للعمولة)
  7. حفظ سجل الباقة + زيادة `subscriptions_count`
  8. كل ده في transaction واحد، rollback عند أي فشل

### RLS

- المطور (admin): CRUD كامل على كل جداول الباقات
- الطالب: SELECT على الباقات النشطة المطابقة لـ(education_type, stage, grade, section) فقط
- الطالب: SELECT على سجلاته فقط من جداول الاشتراك
- استدعاء `purchase_bundled_package` متاح للـauthenticated

### Trigger

- زيادة `subscriptions_count` تلقائيًا بعد INSERT في `bundled_package_subscriptions`
- تحديث `status='expired'` عند تجاوز `max_subscriptions` أو `expires_at`

---

## 2. واجهة المطور (Admin)

### Sidebar
- إضافة عنصر "الباقات المجمعة" في `AdminSidebar` يربط بـ `/admin/bundled-packages`

### الصفحات

1. **`/admin/bundled-packages`** — صفحتان كبيرتان: التعليم الأزهري / التعليم العام
2. **`/admin/bundled-packages/:eduType`** — اختيار المرحلة والصف
3. **`/admin/bundled-packages/:eduType/:grade`** — اختيار الشعبة (لو لازم) ثم اختيار المواد
4. **`/admin/bundled-packages/new`** — نموذج إنشاء الباقة:
   - اسم، وصف، صورة (رفع لـbucket `books` أو bucket جديد)، لون
   - تاريخ انتهاء + وقت
   - حد أقصى اشتراكات (اختياري)
   - قائمة المواد المختارة (Chips قابلة للإزالة)
   - **زر ديناميكي** لتفعيل نسبة الخصم: Slider 0-90% — يعرض حالًا:
     - مجموع أسعار أرخص مجموعة لكل مادة (الأصلي)
     - السعر بعد الخصم (مباشر)
     - مبلغ التوفير
   - أو إدخال يدوي للسعر النهائي (يحسب النسبة تلقائيًا)
   - أزرار: حفظ مسودة / نشر فوري / جدولة
5. **`/admin/bundled-packages/manage`** — قائمة كل الباقات مع فلتر حالة + تعديل/إخفاء/حذف

### مكونات
- `BundledPackageWizard` — Wizard متعدد الخطوات (تعليم → مرحلة → صف → شعبة → مواد → تفاصيل)
- `PackagePricingPanel` — لوحة التسعير الديناميكية

---

## 3. واجهة الطالب

### Sidebar
- إضافة "الباقات المخفضة" في `StudentSidebarLayout` → `/student/bundles`

### الصفحات

1. **`/student/bundles`** — Grid للباقات المتاحة (مفلترة من Supabase حسب profile)
2. **`/student/bundles/:id`** — تفاصيل الباقة:
   - صورة، اسم، وصف، عدد المواد، نسبة الخصم، السعر قبل/بعد
   - عداد تنازلي للانتهاء + عدد الاشتراكات المتبقية
   - زر "اشترك الآن"
3. **`/student/bundles/:id/checkout`** — اختيار المعلم (إن لم يكن محدد) ثم اختيار مجموعة واحدة لكل مادة + ملخص + زر تأكيد
4. **`/student/bundles/:id/success`** — تأكيد ومعاينة المواد

### مكونات
- `BundleCard`, `BundleGroupSelector`, `BundleCheckoutSummary`

---

## 4. التنفيذ على المساحة الخارجية (External Supabase)

- تطبيق نفس migration على `EXTERNAL_SUPABASE_DB_URL` عبر psql
- إعادة تشغيل `external-sync` edge function لمزامنة الجداول الجديدة

---

## 5. ضمانات الأمان والاستقرار

- لا تعديل على أي جدول حالي (`subjects`, `content_groups`, `student_group_purchases`, `wallets`, `profiles`)
- استخدام نفس آلية `student_group_purchases` الحالية → يعمل تلقائيًا مع `credit_teacher_on_purchase` (العمولات للمعلمين تشتغل بدون تغيير)
- Transaction + Exception handling في الـRPC
- RLS صارم
- الباقة Smart Dynamic: لو سعر مجموعة اتغير، الباقة تعرض السعر الجديد فورًا (يحسب من `content_groups.price` لحظيًا)

---

## ملفات سيتم إنشاؤها/تعديلها

**Migration:**
- `supabase/migrations/<ts>_bundled_packages.sql`

**Admin Pages:**
- `src/pages/admin/BundledPackages/Index.tsx`
- `src/pages/admin/BundledPackages/EducationTypePage.tsx`
- `src/pages/admin/BundledPackages/GradeSelectionPage.tsx`
- `src/pages/admin/BundledPackages/SubjectSelectionPage.tsx`
- `src/pages/admin/BundledPackages/PackageEditor.tsx`
- `src/pages/admin/BundledPackages/PackagesList.tsx`
- `src/components/admin/AdminSidebar.tsx` (إضافة عنصر)

**Student Pages:**
- `src/pages/student/BundlesPage.tsx`
- `src/pages/student/BundleDetailsPage.tsx`
- `src/pages/student/BundleCheckoutPage.tsx`
- `src/components/student/StudentSidebarLayout.tsx` (إضافة عنصر)

**Routes:**
- `src/App.tsx` (إضافة المسارات)

**Libs:**
- `src/lib/bundledPackages.ts` (helpers للتسعير الديناميكي والفلترة)

**External Sync:**
- شغل migration على External DB بعد موافقة المطور

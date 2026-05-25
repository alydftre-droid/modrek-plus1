
# نظام الإعلانات الاحترافي 2026 — مدرك Plus

## نظرة عامة
استبدال الشريط النصي المتحرك الحالي بنظام إعلانات/سلايدر احترافي شامل، مع نقل زر الباقات المخفضة وإعادة هيكلة الصفحة الرئيسية للطلاب.

---

## 1. قاعدة البيانات (Supabase)

### جدول `ads` — الإعلانات الرئيسية
- `title`, `short_description`, `full_content`
- `cover_image_url`, `additional_images` (array), `video_url`
- `external_url`, `internal_route`, `link_type` (external/internal/none)
- `color` (gradient theme)
- `ad_type`: teachers / subjects / discounts / info / updates / general
- `start_date`, `end_date`, `display_order`, `slide_duration_seconds`
- `is_active`, `created_by`

### جدول `ad_targets` — استهداف الجمهور
- `ad_id`, `target_type` (all/stage/grade/section/specific_students)
- `stage`, `education_type`, `grade`, `section`
- `student_ids` (array للطلاب المحددين)

### جدول `ad_views` — الإحصائيات
- `ad_id`, `student_id`, `viewed_at`, `clicked` (bool), `clicked_at`

### جدول `ad_settings` — الإعدادات العامة (single row)
- `bundles_button_placement`: hidden / sidebar / ad_slider / homepage_banner
- `bundles_button_order`
- `show_student_code_with_ads`: bool (تظهر بجانب الإعلان أم لا)

### RLS
- الطلاب: قراءة الإعلانات النشطة المستهدفة لهم فقط
- المطور (super admin alyedaft@gmail.com + admin role): CRUD كامل
- `ad_views`: الطالب يدخل سجلاته الخاصة فقط

### Storage
- bucket جديد `ads-media` للصور والفيديوهات (public read)

---

## 2. لوحة المطور — "إدارة الإعلانات"

### المسار: `/admin/ads`
موقع جديد في AdminSidebar تحت "إعدادات الطالب".

### المكونات:
- **قائمة الإعلانات**: جدول/شبكة مع preview، حالة، نوع، عدد المشاهدات/الضغطات
- **محرر الإعلان** (Dialog/Page):
  - Tabs: المحتوى / الوسائط / الاستهداف / الجدولة / الرابط
  - رفع صورة الغلاف + صور إضافية + فيديو (Supabase Storage)
  - منتقي ألوان احترافي (gradients premade)
  - منتقي تاريخ ومدة الظهور
  - استهداف ذكي: الكل / مرحلة / صف / شعبة / طلاب محددون (مع بحث)
  - معاينة مباشرة للسلايدر
- **إعدادات عامة**:
  - تحكم في موضع زر "الباقات المخفضة" (radio: مخفي / الشريط الجانبي / داخل السلايدر / بانر فوق المواد)
- **لوحة إحصائيات**: مشاهدات، ضغطات، CTR، أكثر إعلان تفاعلاً

---

## 3. سلايدر الإعلانات للطلاب

### المكون: `AdsCarousel.tsx`
موقع: في `Dashboard.tsx` بدل/فوق منطقة كود الطالب + وقت التعلم.

### التصميم (2026 Premium):
- مكتبة: **embla-carousel** (موجودة بالمشروع)
- Auto-play بمدة قابلة للتخصيص لكل شريحة
- Pagination dots احترافية + progress bar
- Swipe gestures للموبايل
- Gradient overlays (dark → transparent من الأسفل)
- Glassmorphism على الـ badges والأزرار
- Soft shadows + subtle glow
- نص العنوان والوصف فوق الصورة بـ backdrop blur
- شارة نوع الإعلان (معلم/خصم/تحديث) بألوان مميزة
- Lazy loading + image optimization
- Smooth fade transitions
- ارتفاع ~200-220px على الموبايل، ~280px على الديسكتوب

### السلوك:
- إذا وُجدت إعلانات نشطة مستهدفة للطالب:
  - يحل السلايدر مكان البطاقتين (كود الطالب + وقت التعلم)
  - أو يظهر فوقهما حسب الإعدادات
- إذا لا توجد إعلانات:
  - تظهر البطاقتان (كود الطالب + وقت التعلم) كما هي

### عند الضغط:
- ينتقل لصفحة `/ads/:id` (تفاصيل كاملة) أو يفتح الرابط الخارجي مباشرة حسب نوع الإعلان
- يسجل في `ad_views` (clicked=true)

---

## 4. صفحة تفاصيل الإعلان

### المسار: `/ads/:id`
- صورة Cover كبيرة (hero)
- العنوان + النوع (badge)
- الوصف المختصر + المحتوى الكامل (markdown/rich text)
- معرض صور إضافية (lightbox)
- فيديو embedded
- زر CTA حسب نوع الرابط (خارجي / داخلي / مادة / مجموعة)
- تصميم نظيف، RTL، typography عربي راقي

---

## 5. زر "الباقات المخفضة" — إعادة التموضع

### الوضع الحالي:
بانر ضخم وردي/بنفسجي في `Dashboard.tsx` فوق أقسام المواد.

### التغييرات:
1. **حذف من الصفحة الرئيسية بشكل افتراضي**
2. **إضافة عنصر في `StudentAccountSheet`** (الشريط الجانبي): "الباقات المخفضة" → `/bundles`
3. **التحكم من المطور** عبر `ad_settings.bundles_button_placement`:
   - `hidden`: لا يظهر إلا في الشريط الجانبي
   - `sidebar`: الشريط الجانبي فقط (الافتراضي)
   - `ad_slider`: يضاف كشريحة داخل السلايدر
   - `homepage_banner`: البانر الحالي فوق المواد

---

## 6. ملفات سيتم إنشاؤها/تعديلها

### جديد:
- `supabase/migrations/...` — الجداول والـ RLS والـ bucket
- `src/components/student/AdsCarousel.tsx`
- `src/pages/student/AdDetailPage.tsx`
- `src/pages/admin/AdsManagement.tsx`
- `src/components/admin/ads/AdEditor.tsx`
- `src/components/admin/ads/AdTargetingPanel.tsx`
- `src/components/admin/ads/AdStatsPanel.tsx`
- `src/components/admin/ads/BundlesPlacementSettings.tsx`
- `src/hooks/useStudentAds.ts`

### تعديل:
- `src/pages/Dashboard.tsx` — دمج السلايدر + شرط إخفاء البطاقات + شرط بانر الباقات
- `src/components/student/StudentAccountSheet.tsx` — إضافة رابط الباقات
- `src/components/admin/AdminSidebar.tsx` — رابط "إدارة الإعلانات"
- `src/App.tsx` — مسارات `/ads/:id` و `/admin/ads`

### إزالة محتمل:
- الشريط النصي المتحرك القديم (إن وُجد كمكون مستقل) — أو إبقاؤه كـ fallback اختياري

---

## 7. الأداء والأمان
- Lazy load للصور (`loading="lazy"` + intersection observer)
- React Query للـ caching مع `staleTime: 5min`
- ضغط الصور قبل الرفع (client-side resize)
- RLS صارم: الطالب يقرأ فقط الإعلانات المستهدفة له والنشطة وفي نافذة التاريخ
- Realtime channel على `ads` لتحديث فوري عند نشر إعلان جديد
- منع SQL injection عبر استخدام Supabase client فقط

---

## 8. ترتيب التنفيذ
1. **المايغريشن أولاً** (جداول + RLS + bucket) — موافقة المستخدم
2. AdsCarousel + hook + دمج في Dashboard
3. صفحة تفاصيل الإعلان
4. لوحة المطور (محرر + قائمة + استهداف)
5. إعدادات عامة + نقل زر الباقات
6. لوحة الإحصائيات
7. اختبار شامل ونشر

---

## ملاحظات تقنية
- استخدام `embla-carousel-react` و`embla-carousel-autoplay` (الأخير سيتم تثبيته)
- جميع الألوان عبر design tokens في `index.css` (لا hardcoded)
- دعم RTL كامل
- خط Cairo للنصوص العربية
- super admin (alyedaft@gmail.com) bypass كامل
- استخدام Lovable Cloud (Supabase المُدار) — لا يحتاج إعداد إضافي

هل أبدأ بإنشاء المايغريشن؟

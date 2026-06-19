## الهدف
تحويل buckets الـ `videos` / `books` / `exams` من Public إلى Private مع الحفاظ 100% على تجربة المستخدم — كل الفيديوهات والكتب وصور الامتحانات تستمر بالعمل بدون أي تغيير مرئي.

## ما لن يتغيّر
- أي تصميم، لون، أيقونة، ترتيب صفحات، أو سلوك واجهة.
- نظام المجموعات، نظام الفيديوهات الحالي (Bunny.net للفيديو الرئيسي يبقى كما هو)، نظام الامتحانات.
- بنية الجداول، الـ APIs، routing، أو ملفات state.

## ما سيتغيّر (Backend + طبقة التخزين فقط)

### 1) Storage — تحويل الـ buckets لخاصة
- `supabase--storage_update_bucket` على `videos` و `books` و `exams` → `public: false`.
- الملفات تبقى موجودة بنفس المسارات.

### 2) Storage RLS Policies (Migration)
على `storage.objects` نضيف سياسات SELECT آمنة:

| Bucket | من يقرأ |
|---|---|
| `books` | المعلم صاحب المسار (`split_part(name,'/',1) = teacher_id`) + الأدمن + الطالب الذي اشترى أي مجموعة تخص هذا المعلم |
| `exams` | نفس منطق `books` (المعلم/الأدمن/الطالب المشترك) |
| `videos` | نفس منطق `books` |

سياسات الـ INSERT/UPDATE/DELETE الحالية (للأدمن والمعلم) تبقى دون تغيير.

### 3) طبقة الـ URL في الواجهة (تعديلات داخلية صامتة)
الملف الموجود `src/lib/privateStorage.ts` فيه بالفعل `getPrivateFileSignedUrl()` و `extractStoragePath()`. سنستخدمه في النقاط القليلة التي تستهلك ملفات من هذه الـ buckets:

| ملف | التعديل |
|---|---|
| `TeacherGroupManager.tsx` (صور غلاف المجموعات) | استبدال قراءة `image_url` المباشرة بـ resolve عبر `getPrivateFileSignedUrl('books', url)` قبل عرض `<img>` |
| `AiLessonManager.tsx` (روابط PDF لدروس AI) | نفس الاستبدال على رابط فتح الـ PDF |
| `useContent` / عارض محتوى الكتب والـ PDF للطلاب | resolve عبر signed URL لما يكون المسار من bucket `books`/`exams` |
| عارض صور الأسئلة (`exam_questions.image_url`) | resolve عند العرض إذا كان المسار يعود لـ `exams` |

**كل التعديلات داخلية في الـ data layer** — `<img src>`, `<video src>`, `<iframe src>` تبقى كما هي، فقط القيمة القادمة تكون signed URL بدل public URL.

### 4) Edge Function — Refresh signed URL
نضيف edge function صغيرة `refresh-storage-url` تأخذ `{ bucket, path }`، تتحقق من JWT والصلاحية (نفس منطق الـ RLS) ثم تُرجع signed URL لمدة ساعة. تُستخدم تلقائياً عند انتهاء الصلاحية بدون تدخل المستخدم.

### 5) Backward compatibility
- الروابط القديمة المخزّنة في DB كـ "public URLs" تبقى موجودة — لكن `extractStoragePath` تستخرج المسار منها تلقائياً وتُولّد signed URL جديد. **لا حاجة لـ data migration**.

## الترتيب التنفيذي
1. Migration للـ storage policies (قراءة آمنة).
2. تحويل الـ buckets لخاصة عبر `storage_update_bucket`.
3. تعديل `privateStorage.ts` لإضافة دالة `resolveBucketUrl()` تختار signed أو passthrough بناء على الـ bucket.
4. تعديل الـ 4 ملفات أعلاه فقط.
5. اختبار سريع: تشغيل preview، فتح صفحة طالب فيها مجموعة، فتح PDF، فتح امتحان فيه صورة.

## نقاط الانتباه
- الفيديو الرئيسي على Bunny.net **لا يتأثر** — لا يستخدم Supabase storage.
- bucket `live-recordings` خاص بالفعل ومُتعامل معه عبر `getPrivateFileSignedUrl` — لا تغيير.
- إذا فشل توقيع URL لأي سبب، الدالة الحالية ترجع الرابط الأصلي (graceful fallback).

## تأكيد
هل أبدأ التنفيذ بهذا الترتيب؟
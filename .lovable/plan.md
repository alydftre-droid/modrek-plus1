# تقرير التخزين + خطة الانتقال الكامل إلى Bunny.net

## 1. الوضع الحالي في الإنتاج (أرقام حقيقية)

ملفات مخزنة في Supabase Storage (الإنتاج):

| المخزن | عدد الملفات | الحجم | عام/خاص |
|---|---|---|---|
| teacher-profiles (صور وفيديوهات تعريف المعلمين) | 84 | 151 MB | عام |
| books (كتب PDF) | 63 | 75 MB | عام |
| payment-receipts (إيصالات الدفع) | 21 | 12 MB | خاص |
| ads-media (صور الإعلانات) | 11 | 9.4 MB | عام |
| student-library (مكتبة الطالب) | 7 | 7.1 MB | خاص |
| ai-lesson-pages (صور صفحات الدروس) | 8 | 0.9 MB | خاص |
| modrek-library | 8 | 0.09 MB | خاص |
| videos / exams / live-recordings / support-uploads / ai-sources | 0 | 0 | — |

الإجمالي: **202 ملف ≈ 256 MB**. الفيديوهات والمحتوى التعليمي الجديد يمر بالفعل عبر Bunny.

ملفات مخزنة داخل PostgreSQL نفسها:

| المكان | العدد | الحجم |
|---|---|---|
| رسائل المساعد الذكي `modrek_ai_messages` (صور Base64 داخل الرسائل) | 34 رسالة | ≈ 63 MB (الجدول 67 MB) |
| باقي الجداول (رسائل المكتبة، صفحات الدروس، الإجابات الصوتية) | 0 | 0 |

حجم قاعدة الإنتاج الآن **289 MB**، أكبر جدول `content_chunks` بـ 119 MB وهو نصوص الكتب ومتجهات البحث (بيانات وليست ملفات، لن تُمس).

## 2. ما هو موجود بالفعل من Bunny
- دوال خلفية: `bunny-storage`, `bunny-stream`, `bunny-orphan-cleanup`, `modrek-upload`, `bunny-*` redirects.
- مكتبات واجهة: `bunnyStorage.ts`, `bunnyPlayback.ts`, `bunnyStream.ts`, `bunnyCleanup.ts`.
- جدول `storage_assets` يحتوي حقول `storage_provider/bucket/object_path/sha256/mime/size` — سيصبح مصدر الحقيقة للملفات.
- المفاتيح كلها أسرار خلفية (`BUNNY_STORAGE_*`, `BUNNY_CDN_TOKEN_KEY`) ولا شيء منها في الواجهة، وسنحافظ على ذلك.

## 3. أماكن الرفع/التنزيل التي ستتغير
- رفع مباشر إلى Supabase Storage في: صفحات الإدارة (المحتوى، المواد، الإعلانات، المنصات، الدعم، المحافظ/السحب)، صفحات المعلم (رفع المحتوى، الرسائل، المجموعات، المساعد، دروس AI)، صفحات الطالب (الإيداع، الدعم، المكتبة، محادثة المعلم)، وتسجيلات الحصص.
- دوال خلفية تكتب/تقرأ Supabase Storage: `teacher-profile-upload`, `teacher-intro-media`, `library-worker`, `library-v2-worker`, `library-analyze-region`, `external-sync`, ودوال المكتبة والمساعد التي تقرأ الصور.
- توليد روابط موقعة عبر `privateStorage.ts` و`usePrivateFileUrl` و`SignedImage` و`PrivateImage` و`ChatAttachment`.

## 4. ما ينتقل وما يبقى
ينتقل إلى Bunny: كل الصور، صور الملفات الشخصية، صور المحادثات والمساعد، المرفقات، الإيصالات، PDF والكتب، ملفات المعلمين/الطلاب، الفيديوهات، وأي رفع مستقبلي.

يبقى في PostgreSQL: البيانات الوصفية فقط (`bunny_url`, `storage_path`, `file_name`, `mime_type`, `file_size`, `width/height`, `owner_id`, `platform_id`, `created_at`, `status`) + كل بيانات الطلاب والاشتراكات والمحتوى النصي والفهرس.

المساحة المتوقع تحريرها: **≈ 63 MB** من قاعدة البيانات (صور Base64) و**≈ 256 MB** من مساحة Supabase Storage. حجم القاعدة المتوقع بعد التنظيف ≈ **225 MB**.

## 5. المخاطر
- روابط عامة قديمة محفوظة في جداول المحتوى/المعلمين → يعالجها resolver يقبل الشكلين خلال فترة الانتقال.
- صور المساعد داخل الرسائل: أي خطأ في التحويل يفقد صورة محادثة → لا يُحذف Base64 إلا بعد تحقق hash وقراءة ناجحة من Bunny.
- إيصالات الدفع والتسجيلات خاصة → يجب أن تبقى محمية بروابط Bunny موقعة قصيرة العمر، لا روابط عامة.
- مزامنة `external-sync` تنسخ روابط التخزين → تُحدَّث لتنسخ روابط Bunny.

## 6. خطة التنفيذ (على مراحل، قابلة للاستئناف)

**المرحلة 0 — سجل الانتقال (إضافة فقط)**
جدول `file_migrations`: `source_kind`, `source_bucket`, `source_path`, `source_row_table`, `source_row_id`, `source_column`, `bunny_path`, `bunny_url`, `sha256`, `byte_size`, `mime_type`, `status` (pending/uploading/verified/failed/migrated), `attempts`, `last_error`, `owner_id`, `platform_id`, timestamps + فريد على (source_bucket, source_path) و(source_row_table, source_row_id, source_column). RLS: Admin فقط، والدوال الخلفية بـ service role.

**المرحلة 1 — خدمة تخزين موحدة**
`src/lib/storage/` تُصدِّر `uploadFile / uploadImage / uploadVideo / uploadDocument / deleteFile / getFileUrl / migrateFile`، كلها تمر عبر `bunny-storage` وتوقيع الروابط في الخلفية. مسارات معزولة:
`/modrek/main/...`, `/modrek/platforms/{platform_id}/...`, `/modrek/users/{user_id}/...`, `/modrek/courses/{course_id}/...`, `/modrek/chat/{conversation_id}/...`
وفحص خلفي أن المسار يطابق هوية المستخدم/المنصة قبل الرفع أو التوقيع.

**المرحلة 2 — تحويل نقاط الرفع**
استبدال كل `supabase.storage.from(...).upload(...)` بالخدمة الموحدة، مع الحفاظ على نفس واجهة المستخدم. القراءة تمر بـ resolver يفهم روابط Bunny وروابط Supabase القديمة معًا (لا كسر للروابط الحالية).

**المرحلة 3 — ترحيل الملفات الحالية على دفعات**
دالة خلفية `storage-migrate` تعمل بدفعات صغيرة: تسجيل pending → تحميل من Supabase → رفع إلى Bunny → تحقق (HEAD + طول + sha256) → تحديث الحقول في الجدول المرتبط → status=verified. الفشل يزيد `attempts` ويُعاد لاحقًا، والملف الأصلي يبقى. العملية idempotent ويمكن استئنافها.

**المرحلة 4 — صور المساعد Base64**
لكل رسالة: استخراج data URI → رفع إلى `/modrek/chat/{conversation_id}/...` → تحقق → استبدال داخل `parts` برابط Bunny → status=migrated. الحذف من العمود يحدث فقط بعد نجاح التحقق، ورسالة واحدة في كل خطوة حتى لا يُستهلك RAM.

**المرحلة 5 — التحقق والتحرير**
تقرير: عدد الملفات المنقولة/الفاشلة، فحص فتح فعلي لكل نوع (صورة، PDF، فيديو، إيصال، مرفق محادثة، صورة مساعد). بعد نجاح كل نوع 100%: حذف نسخ Supabase Storage نوعًا بنوع بموافقتك، ثم `VACUUM` للجداول المتأثرة.

**Rollback**: كل مرحلة تحفظ المسار الأصلي في `file_migrations`؛ الرجوع = إعادة الحقل إلى القيمة الأصلية من السجل. لا حذف قبل موافقة صريحة، ولا تغيير على RLS أو المصادقة أو الاشتراكات أو المدفوعات.

## 7. ملاحظات تقنية
- لا مفاتيح Bunny في الواجهة؛ الرفع عبر Edge Function، والروابط الخاصة عبر توقيع CDN مؤقت.
- `external-sync` و`bunny-orphan-cleanup` يُحدَّثان ليعملا على المسارات الجديدة.
- تُضاف قاعدة في الكود ومذكرة مشروع: أي رفع جديد يستخدم خدمة التخزين الموحدة فقط.

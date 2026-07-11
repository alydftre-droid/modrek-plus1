# خطة إعادة بناء نظام المكتبة (Bunny + Cache)

## نطاق التغيير
- مكتبة الطالب الشخصية فقط (`content.type = 'student_library'`). محتوى المعلم و Modrek يستخدمان Bunny بالفعل — لن يُمَسّا.
- كل الكتب الحالية تجريبية → تُحذف.

## قرارات معمارية
1. التخزين الوحيد: **Bunny Storage** تحت المسار `library/{user_id}/{uuid}.pdf`.
2. القراءة: عبر Edge Function `bunny-storage?action=download` مع دعم **HTTP Range Requests** (تمرير `Range`, `If-None-Match`) والتحقق من الملكية.
3. الكاش على العميل: **IndexedDB** يخزّن ملف الـPDF كاملاً كـBlob بمفتاح `bookId`، وصور الصفحات المُصيَّرة `page:{bookId}:{n}`. الفتحات التالية = فورية بدون شبكة.
4. Lazy render + preload جار واحد أمامي/خلفي (لا تصيير شامل).
5. جدول `content` يبقى (لتفادي تكاثر الجداول) لكن `file_url` يصبح `bstorage://library/...` حصراً.

## الملفات المتغيرة
### قاعدة البيانات (migration جديد)
- حذف كل الصفوف: `DELETE FROM content WHERE type = 'student_library'`.
- حذف bucket `student-library` من `storage.buckets` (وسياساته).
- لا تغييرات على schema.

### Edge Function `supabase/functions/bunny-storage/index.ts`
- إصلاح خطأ صياغة موجود (سطر 197-198 يحتوي `}, 403);` زائدة).
- توسيع `isAllowedStoragePath` ليقبل `library/`.
- إضافة تحقّق ملكية `canWriteLibraryPath`: يتطابق `library/{userId}/…` مع `auth.uid()`.
- في `canReadStoredFile` للمسار `library/…`: تحقّق أن هناك صف `content` مملوك لنفس المستخدم يشير إلى `bstorage://library/...`.
- في `action=download`: تمرير `Range`/`If-None-Match`، إعادة `Accept-Ranges: bytes`, `ETag`, `Content-Range`, `Cache-Control: private, max-age=31536000, immutable`.

### كود العميل — يُعاد كتابته
- `src/lib/studentLibrary.ts` → واجهة جديدة: `uploadBookToBunny(file, userId, onProgress)`, `deleteBookFromBunny(bstorageUri)`, `buildDownloadUrl(bstorageUri)`. حذف كل مراجع Supabase Storage.
- `src/lib/libraryCache.ts` (**جديد**): طبقة IndexedDB خفيفة (`idb-keyval` أو implementation يدوي بسيط) — `getPdfBlob(bookId)`, `putPdfBlob(bookId, blob)`, `getPageImage(bookId, n)`, `putPageImage(bookId, n, dataUrl)`, `evictBook(bookId)`.
- `src/pages/student/MyLibraryPage.tsx` → استبدال upload/delete بـBunny. الأغلفة تُخزَّن في IndexedDB (`cover:{bookId}`) لتفادي إعادة توليدها كل مرة.
- `src/pages/student/LibraryBookStudio.tsx` → عند الفتح: (1) اجلب Blob من IndexedDB إن وجد، (2) وإلا نزّله من proxy واحفظه، (3) صيّر الصفحة الحالية فوراً + جار أمامي/خلفي في `requestIdleCallback`. الصفحات المُصيَّرة تُحفظ في IndexedDB أيضاً.

### يُحذف بالكامل
- `src/hooks/usePrivateFileUrl.ts` (غير مستخدم إلا في سياق تجريبي — سأتحقّق قبل الحذف؛ إن استُخدم في مكان آخر يبقى).
- كتلة `student-library` في `supabase/functions/external-sync/index.ts` (السطور 216-283 وتسجيلها في `1279`).

## التحقّق النهائي
1. `rg "student-library|STUDENT_LIBRARY_BUCKET"` → لا نتائج.
2. `rg "supabase.storage.*library"` → لا نتائج داخل نظام المكتبة.
3. Typecheck + Build يمر بدون أخطاء.
4. اختبار يدوي: رفع PDF جديد → يظهر → فتحه → صفحات تظهر فوراً → إعادة فتحه = فوري (من الكاش).

## قيود بيئة Lovable (يجب اعترافها)
- لا أستطيع تشغيل رفع/قراءة فعلي من داخل الـsandbox — سأتحقّق ببناء + قراءة سجلات + شيفرة، والاختبار الحي على جهازك.
- حذف bucket من Supabase عبر migration — إن رفض النظام لأن به ملفات، أُفرغه أولاً في نفس الـmigration.
- IndexedDB في المتصفح فقط — على Native (Capacitor WebView) يعمل أيضاً؛ لا حاجة لتخزين ملف على القرص.

هل أبدأ التنفيذ بهذه الخطة؟ أم تريد تعديلاً على أي بند (مثلاً استخدام Bunny Token Auth بدل proxy لتخطي edge function واستخدام CDN مباشرة مع URL موقّع)؟

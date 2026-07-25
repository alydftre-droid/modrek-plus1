# مصدر الحقيقة لقاعدة البيانات

**قاعدة بيانات الإنتاج المستخدمة من `modrekplus.com` هي:**

- Project ref: `qteuqfntsocsdbjmdvmr`
- URL: `https://qteuqfntsocsdbjmdvmr.supabase.co`
- المتغيرات المرتبطة بها في هذا الـ sandbox:
  - `EXTERNAL_SUPABASE_URL` / `PRODUCTION_SUPABASE_URL`
  - `EXTERNAL_SUPABASE_DB_URL`
  - `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY`
  - `EXTERNAL_SUPABASE_PROJECT_REF` / `PRODUCTION_SUPABASE_PROJECT_REF`

## قاعدة بيانات Lovable Cloud (preview/dev)

- Project ref: `qohhrliaecdtaeyfhcvb`
- URL: `https://qohhrliaecdtaeyfhcvb.supabase.co`
- تُستخدم فقط في معاينة Lovable الداخلية (`id-preview--*.lovable.app`).
- **لا يستهلكها الموقع الإنتاجي**، ولا يُوثق بها كمصدر للبيانات الحقيقية.

## قواعد التشخيص والاستعلامات المباشرة

- عند تشغيل `psql` من الـ sandbox، استخدم دائمًا `psql "$EXTERNAL_SUPABASE_DB_URL"` للاستعلام عن بيانات الإنتاج الحقيقية.
- `PGHOST` الافتراضي في الـ sandbox يشير إلى Lovable Cloud (`qohh…`) — استعلامات هناك لن تعكس ما يراه المستخدم على `modrekplus.com`.
- عند إثبات وجود فجوة في الفلترة أو المحتوى، أعِد تشغيل نفس الاستعلام على الإنتاج قبل الاستنتاج.

## قواعد الترحيل (Migrations)

- كل ملف SQL جديد في `supabase/migrations/` يُطبَّق على الإنتاج تلقائيًا عبر GitHub Actions:
  `.github/workflows/deploy-production-edge-functions.yml` عند الدفع لفرع `main`.
- منصة Lovable تُطبّق نفس الملفات على Cloud (`qohh…`) عند الاعتماد داخل المحرر.
- لذلك المستودع نفسه هو المصدر الوحيد للحقيقة الهيكلية على كلا المشروعين — لا تُشغّل SQL يدويًا على أحدهما دون تسجيله كملف هجرة.

## المزامنة اللحظية للبيانات

- الدالة الحافة `supabase/functions/external-sync` تعكس البيانات الحيّة من Cloud → External عند التغييرات.
- الاتجاه أحادي: تعديلات المستخدمين الحقيقيين تحدث على الإنتاج مباشرة عبر الموقع، ولا يتم عكسها عودةً إلى Cloud.

## توحيد البيئات مستقبلاً

الخيار الموصى به لإزالة الازدواجية نهائيًا: نقل معاينة Lovable إلى الإنتاج نفسه عبر تعديل `.env` (`VITE_SUPABASE_URL` و`VITE_SUPABASE_PUBLISHABLE_KEY`) لتشير إلى `qteuqfntsocsdbjmdvmr`. يتطلب ذلك موافقة صريحة من مسؤول المشروع لأن Lovable Cloud مُدارة تلقائيًا وقد يُعاد ربطها.

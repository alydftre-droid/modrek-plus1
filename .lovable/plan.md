# خطة حماية فيديوهات Modrek Plus

توازن بين حماية قوية وتجربة مشاهدة سلسة، بدون إفساد أي شيء في النظام الحالي.

## 1) روابط موقعة (Signed URLs) من Bunny Stream

- تفعيل **Token Authentication** على مكتبة Bunny (يجب أن يفعّلها المستخدم من لوحة Bunny مرة واحدة — سأشرح كيف).
- إضافة action جديد في `supabase/functions/bunny-stream/index.ts`:
  - `action=sign-playback` يستقبل `videoId`.
  - يتحقق من:
    - JWT صالح.
    - أن الطالب لديه صلاحية على المحتوى (subscription/purchase على `content.file_url = bunny://videoId`).
  - يُنشئ توقيع HMAC-SHA256 لرابط HLS مع `token_expires` = الآن + **4 ساعات**.
  - يعيد `playbackUrl` (m3u8 موقّع) + `embedUrl` موقّع + `expiresAt`.
- تسجيل محاولات الوصول الفاشلة في `student_activity_logs` (نوع `video_access_denied`).

## 2) استبدال المشغّل الحالي

- تعديل `src/components/video/BunnyStreamPlayer.tsx`:
  - إزالة أي بناء مباشر لـ embed URL على العميل.
  - عند الفتح: استدعاء `bunny-stream?action=sign-playback` وانتظار الرابط الموقع فقط.
  - استخدام embed iframe الموقّع (يخفي الرابط الحقيقي عن الطالب).
  - عند انتهاء الـ 4 ساعات + إعادة فتح لاحقة → طلب توقيع جديد تلقائيًا. **لا** تجديد أثناء التشغيل.
- إزالة/تعطيل أي مسار يستخدم `getBunnyDirectUrl` (MP4 مباشر) وتوجيهه إلى HLS الموقّع.
- إبقاء `resolveVideoUrl` لكن جعله يطلب توقيع من الخادم بدل توليد URL مباشر للفيديوهات على Bunny.

## 3) علامة مائية ذكية (Student ID فقط)

مكوّن جديد `src/components/video/WatermarkOverlay.tsx` فوق iframe:
- يعرض `ID: {short_student_id}` (من `profiles.unique_id` أو آخر 5 خانات من `auth.uid`).
- يظهر **3-5 ثوان كل دقيقتين**، ثم يختفي.
- كل ظهور في موضع عشوائي من 6 مواضع (أعلى/منتصف/أسفل × يمين/يسار)، مع هامش داخلي.
- خط صغير، نصف شفاف، ظل خفيف للقراءة، `pointer-events: none`.
- لا اسم / لا بريد / لا هاتف.

## 4) حماية تطبيق Android (FLAG_SECURE مؤقت)

- Capacitor plugin خفيف أو استخدام `@capacitor-community/privacy-screen` / كود Java مخصّص:
  - عند mount لصفحة الفيديو: `getWindow().addFlags(FLAG_SECURE)`.
  - عند unmount: `clearFlags(FLAG_SECURE)`.
- Hook `useSecureVideoScreen()` يستدعى داخل `BunnyStreamPlayer` فقط.
- Fallback صامت على الويب (no-op).

## 5) حماية طبقة الواجهة داخل صفحة الفيديو

داخل `BunnyStreamPlayer` فقط (بدون التأثير على باقي التطبيق):
- تعطيل `contextmenu`, drag, وحفظ عبر اختصارات (موجود جزئيًا — سنكمل).
- `disablePictureInPicture` + `controlsList="nodownload noremoteplayback"` على أي وسم video.
- عدم كشف الرابط في DOM (iframe فقط، مع توقيع من الخادم).

## 6) مراجعة أمان

- فحص كل الملفات التي تستخدم `bunny://` أو `mediadelivery.net` أو `b-cdn.net` والتأكد أنها تمر عبر الـ signer.
- التأكد أن أي endpoint لا يعيد الـ raw playback URL بدون تحقق صلاحية.

## Technical Details

- Bunny token signing: `token = SHA256(security_key + video_path + expires)` ثم base64url — سنستخدم `crypto.subtle`.
- Secret جديد مطلوب: `BUNNY_STREAM_TOKEN_KEY` (Token Authentication Key من Bunny Library → Security).
- جدول جديد صغير أو الاعتماد على `student_activity_logs` الحالي لتسجيل محاولات الوصول.
- لن نضيف: فحص كل 20 ثانية، ولا حظر الأجهزة المتعددة، ولا تسجيل صارم للجلسات — حسب طلبك (النسخة المتوازنة).

## ما يجب أن يفعله المستخدم يدويًا (مرة واحدة)

1. من لوحة Bunny → Stream Library → Security:
   - تفعيل **Token Authentication**.
   - نسخ **Token Authentication Key**.
2. سأطلب حفظه كسر عبر `add_secret` باسم `BUNNY_STREAM_TOKEN_KEY`.

## خارج النطاق (تم استبعادها عمدًا لعدم إزعاج الطالب/الأداء)

- منع المشاركة بين جهازين في نفس الوقت.
- فحص متكرر كل 20 ثانية.
- علامة مائية دائمة.
- منع Screen Recording الكامل على iOS (غير ممكن تقنيًا).

هل أبدأ التنفيذ بهذا النطاق؟

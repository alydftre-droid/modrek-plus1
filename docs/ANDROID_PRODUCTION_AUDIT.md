# تقرير تدقيق جاهزية Android للإنتاج — الإصدار 1.1.32 (build 35)

آخر تحديث: 2026-08-02

## 1. المشاكل المكتشفة والإصلاحات

| # | المشكلة | الخطورة | الإصلاح | السبب |
|---|---------|---------|---------|-------|
| 1 | `<uses-feature android:name="android.hardware.faketouch" android:required="true" />` | **حرجة** | تحويلها إلى `required="false"` | أي ميزة عتاد `required="true"` تجعل Google Play يستبعد كل جهاز لا يعلن عنها (Android XR، بعض أجهزة العرض/الأجهزة بدون إدخال لمسي) → يختفي زر التثبيت لدى تلك الأجهزة فقط، وهو تفسير مباشر لظاهرة «يظهر لبعض المستخدمين ولا يظهر لآخرين». |
| 2 | نقص إعلانات `uses-feature` لميزات قد يستنتجها Play ضمنياً | عالية | أضفنا إعلانات صريحة `required="false"` لـ: camera/front/flash، microphone، audio.output، location/gps/network، telephony، bluetooth/LE، NFC، accelerometer/compass/gyroscope/light/proximity، touchscreen + multitouch (distinct/jazzhand)، wifi، screen.portrait/landscape، software.webview، leanback، type.pc | Play يستنتج متطلبات عتاد من الأذونات والمكتبات؛ الإعلان الصريح بـ false يمنع أي استبعاد للتابلت وChromebook وأجهزة TV/XR والأجهزة بدون كاميرا/ميكروفون. |
| 3 | `supports-screens` بدون `android:resizeable` | متوسطة | أضفنا `android:resizeable="true"` | يضمن التوافق مع الشاشات القابلة للطي وتعدد النوافذ وChromebook. |
| 4 | `ACCESS_NETWORK_STATE` كان يأتي ضمنياً من إضافة Network فقط | منخفضة | تم إعلانه صريحاً في البيان | شفافية البيان المدمج ومنع مفاجآت الدمج. |
| 5 | لا يوجد تحكم صريح في تقسيم حزمة AAB | متوسطة | أضفنا `bundle { language.enableSplit = false; density/abi enableSplit = true }` | التطبيق عربي بالكامل؛ إيقاف تقسيم اللغة يمنع تسليم حزمة بلا موارد اللغة على أجهزة بلغة نظام مختلفة. |
| 6 | تعليق ملخّص CI يعرض نسخة قديمة ثابتة (31 / 1.1.28) | منخفضة | يُقرأ الآن `versionCode`/`versionName` فعلياً من الـ APK المبني | منع تقارير إصدار مضللة. |
| 7 | لا يوجد تدقيق آلي للبيان المدمج قبل النشر | عالية | خطوة CI جديدة **Google Play device compatibility audit (merged manifest)** | تمنع أي انحدار مستقبلي يعيد حجب الأجهزة. |
| 8 | ذاكرة Gradle 1536m | منخفضة | 4096m + Metaspace 1024m + UTF-8 | استقرار بناء R8/AAB في CI. |

## 2. حالة الإعدادات بعد التدقيق

- **minSdkVersion = 23** (أندرويد 6.0). هذا هو أدنى حد ممكن فعلياً: `androidx.credentials` و`googleid` (تسجيل الدخول الأصلي بجوجل) تتطلبان API 23.
- **compileSdkVersion = 36**, **targetSdkVersion = 36** (مطلوب من Play).
- **AGP 8.9.1 + Gradle 8.11.1 + Java 17** — مزيج مدعوم ومتوافق، ويُتحقق منه في CI.
- **ABI**: لا يوجد كود أصلي (NDK) في التطبيق + `abiFilters.clear()` → الحزمة تعمل على `arm64-v8a` و`armeabi-v7a` و`x86` و`x86_64`. يتم إثبات ذلك في CI عبر `bundletool build-apks --device-spec` لكل معمارية على جهاز sdkVersion 23.
- **لا يوجد**: `<compatible-screens>`، `<supports-gl-texture>`، `resConfigs`، `splits`، فلاتر كثافة، `maxSdkVersion`، `android:requiredFeature`، أي قيد على الشركة المصنعة/الطراز/الذاكرة (Play لا يدعم أصلاً قيود RAM من البيان — وتم التأكد من عدم وجود أي بديل لها).
- **الأذونات**: INTERNET، ACCESS_NETWORK_STATE، POST_NOTIFICATIONS، VIBRATE، WAKE_LOCK، RECEIVE_BOOT_COMPLETED فقط. لا CAMERA ولا RECORD_AUDIO ولا LOCATION ولا READ_PHONE_STATE (كلها تُنتج فلترة عتاد ضمنية)، و`FOREGROUND_SERVICE` مُزالة عبر `tools:node="remove"`.
- **الاتجاهات والنوافذ**: `resizeableActivity="true"`، `configChanges` شاملة للاتجاه/الحجم/الكثافة/اللغة، دعم كل أحجام الشاشات.
- **التوقيع**: توقيع release من keystore مع Play App Signing (SHA-1 يُطبع في ملخص البناء لتسجيله في Google Cloud OAuth).
- **التبعيات**: Capacitor 6.2.1 + إضافات رسمية فقط (لا إضافات تضيف ميزات عتاد)، Firebase BOM 33.5.1، AndroidX Credentials 1.3.0 — كلها متوافقة مع API 23→36.

## 3. لماذا يظهر التطبيق "تجريبي"؟

كلمة «تجريبي / Testing» في Play **لا تأتي من البيان أبداً**؛ هي خاصية مسار الإصدار (Internal / Closed / Open testing). لكي تختفي:

1. Play Console → Release → **Production** → Create new release.
2. ارفع `app-release.aab` (build 35).
3. **Rollout = 100%** لكل الدول المستهدفة.
4. تأكد أن Internal/Closed/Open testing لا يحتوي إصداراً أحدث من الإنتاج (وإلا يُعرض المسار التجريبي لمن انضم إليه).
5. راجع **Release → Reach and devices → Device catalog** بعد الرفع: عدد الأجهزة المدعومة يجب أن يكون بالآلاف بلا استثناءات (Excluded devices = 0 بسبب الميزات).

## 4. بناء حزمة الإنتاج (AAB)

البناء الرسمي يتم في GitHub Actions (`.github/workflows/android.yml`) لأن Android SDK/Gradle غير متوفرين في بيئة المعاينة:

1. شغّل workflow **Build Android Release APK and AAB** (يعمل تلقائياً على `main`، أو يدوياً من Actions).
2. الخطوات الإلزامية التي يجب أن تنجح جميعها: توقيع الحزمة → `Verify Target SDK 36` → `Google Play device compatibility audit`.
3. التنزيل من release الوسم `android-latest`: `app-release.aab` (للنشر) و`app-release.apk` (للاختبار المباشر).

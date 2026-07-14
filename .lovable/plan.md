# خطة التدقيق الشامل ونظام الحماية الدائم

الهدف: ضمان تطابق 100% بين Web وPWA وAndroid، مع طبقة حماية تمنع الاختلاف مستقبلاً.

## المرحلة 1 — تدقيق البنية (بدون تعديلات)

فحص وتوثيق:
- `src/integrations/supabase/client.ts` + متغيرات `VITE_SUPABASE_*` في `.env` والـ workflows.
- `capacitor.config.ts` + `android/app/build.gradle` + `google-services.json` (تأكد نفس `appId` ونفس Supabase URL في البناء).
- `public/site.webmanifest` + `public/sw.js` (لا يوجد كاش لبيانات API).
- `src/App.tsx` — QueryClient وpersister وحارس Wave-4.
- كل `src/hooks/**` + `src/lib/**` + `supabase/functions/**` (إحصاء Queries و RPC و Realtime channels).

المخرج: تقرير `docs/audit/data-source-audit.md` — قائمة كل مصدر بيانات وأي تباين محتمل.

## المرحلة 2 — إصلاحات جذرية

بناءً على مخرجات المرحلة 1، أُصلح فقط ما يُخل بـ Single Source of Truth:
- توحيد أي Query مكررة على نفس الجدول بـ hook واحد مشترك.
- إزالة أي `Map/Set/Date/Class` من نتائج queries (استكمال لعمل Wave-4).
- التأكد أن كل Realtime channel يُنشأ داخل `useEffect` مع cleanup (منع تسريبات).
- التأكد أن كل صفحة تستخدم نفس cache key format.

## المرحلة 3 — Data Integrity Layer (طبقة الحماية الدائمة)

ملفات جديدة:
- `src/lib/dataIntegrity/schemas.ts` — Zod schemas لكل model حرج (Wallet, Subscription, Profile, Earning, Notification, Subject, Content, Book, Exam).
- `src/lib/dataIntegrity/validateResponse.ts` — helper `validated(query, schema)` يمرر نتيجة Supabase عبر Zod؛ عند الفشل: يُبلغ Sentry + يُبطل الكاش + يعيد التحميل.
- `src/lib/dataIntegrity/cacheVersion.ts` — نظام buster مركزي (نسخة واحدة `DATA_SCHEMA_VERSION`)، يمسح الكاش تلقائياً عند الترقية.
- `src/lib/dataIntegrity/platformHash.ts` — دالة تُنتج hash لبيانات المستخدم الحرجة (wallet + subs + notifications count) قابلة للاستدعاء من Web/Android للمقارنة.
- `supabase/functions/integrity-check/index.ts` — edge function تُرجع نفس الـ hash من الخادم؛ العميل يقارن ويعيد التحميل عند الاختلاف.
- `src/lib/dataIntegrity/useIntegrityGuard.ts` — hook يُستدعى في `App.tsx` يُشغّل مقارنة hash كل 60 ثانية عندما تكون التبويبة نشطة.

قواعد:
- كل الـ mutations الحرجة (wallet, subscription) تُبطل كاش React Query تلقائياً.
- كل query key موحّد عبر `src/lib/queryKeys.ts` (ملف جديد) لمنع التباين.

## المرحلة 4 — إثبات التطابق (Playwright)

- سكربت `tests/parity/web-vs-mobile.spec.ts` يُسجّل نفس المستخدم مرتين: مرة user-agent Web ومرة user-agent Android WebView، ويلتقط لقطات + JSON dumps لصفحات:
  - المحفظة، الاشتراكات، الطلاب، المكتبة، الإشعارات، الملف الشخصي.
- المقارنة تُنتج تقرير `docs/audit/parity-report.md` مع لقطات جنباً إلى جنب و diff.

## المرحلة 5 — التقرير النهائي

`docs/audit/final-report.md`:
- كل الملفات المفحوصة (قائمة).
- المشاكل المكتشفة + سببها + الملف المُصلَح.
- إثبات Playwright بلقطات.
- شرح كيف تمنع Data Integrity Layer تكرار المشكلة.

## نطاق الجلسة الحالية

بسبب حجم العمل الضخم، أقترح تقسيمه على **جلستين متتاليتين**:

- **الجلسة الحالية:** المرحلة 1 (تدقيق كامل + تقرير) + المرحلة 3 (بناء Data Integrity Layer كاملة + queryKeys الموحدة + integrity-check edge function).
- **الجلسة التالية:** المرحلة 2 (إصلاحات نقاط التباين المكتشفة) + المرحلة 4 (Playwright parity) + المرحلة 5 (التقرير النهائي).

هذا التقسيم يضمن أن كل جلسة تُنتج مخرج قابل للاختبار، بدلاً من محاولة تنفيذ كل شيء في جلسة واحدة يفشل فيها الوقت أو الحدود التقنية.

## Technical notes

- Zod موجود في المشروع (schemas في `src/lib/validation/schemas.ts`).
- Edge function `integrity-check` تعتمد على JWT verification عبر `_shared/auth.ts`.
- Hash function: SHA-256 لسلسلة JSON مرتبة (deterministic).
- لن يتم تعديل: `client.ts`, `types.ts`, `.env`, `config.toml` (كلها auto-gen).
- Realtime channels ستُوحَّد في hook `src/hooks/useIntegrityRealtime.ts`.

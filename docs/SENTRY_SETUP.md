# Sentry Setup – Modrek Plus

نظام تتبع الأخطاء جاهز بالكامل داخل الكود. يبقى فقط إدخال الـ DSN.

## أين أضع الـ DSN؟
افتح **Workspace Settings → Build Secrets** وأضف:

```
Name:  VITE_SENTRY_DSN
Value: https://<public-key>@o<org>.ingest.sentry.io/<project-id>
```

بعد الحفظ، أعد نشر المشروع مرة واحدة. سيبدأ الملف `src/lib/sentry.ts` بالإرسال تلقائياً بدون أي تغيير كود إضافي.

## ما الذي يُرسَل؟
- أخطاء JavaScript غير المُلتقطة و`ErrorBoundary` fallback.
- 10% من مقاييس traces.
- 10% من الجلسات كـ replays عند وقوع خطأ.

## ما الذي لا يُرسَل (تعقيم مبني داخل beforeSend):
- ترويسات `Authorization` / `Cookie` / `apikey` (مستبدلة بـ `[redacted]`).
- أي `token=...` داخل عناوين URL.

## بدون DSN
الملف يعمل كـ no-op تماماً، ولا يؤثر على التطبيق أو أدائه.

# اختبارات الانحدار البصري — مدرك Plus

## التشغيل

```bash
# تثبيت لمرة واحدة
npm install -D @playwright/test
npx playwright install chromium

# تشغيل الاختبارات
npx playwright test

# عرض التقرير
npx playwright show-report
```

## ما يتم اختباره

- 5 مقاسات هواتف: 320, 360, 390, 412, 430 بكسل
- 5 صفحات عامة: تسجيل الدخول، نسيت كلمة المرور، حول، الخصوصية، الشروط
- التحقق من:
  - عدم وجود قص أفقي (horizontal overflow)
  - عدم قص الترويسة من الأعلى
  - عدم استخدام `100vh` المباشر

## حارس 100vh (وقت البناء)

```bash
node scripts/check-no-100vh.mjs
```

يمنع إضافة `100vh` في `src/pages/**`, `src/components/student/**`, `src/components/teacher/**`, `src/components/live/**`.

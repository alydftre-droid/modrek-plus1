# تقرير هندسي: نظام تحويل كتاب PDF إلى شرح تفاعلي

> هذا **تحليل فقط** — لن يتم تعديل أي كود قبل موافقتك على مسار إعادة البناء.

---

## 1) كيف يعمل النظام الحالي خطوة بخطوة

```text
[Admin يرفع PDF]
      │
      ▼
(1) رفع الملف إلى Storage (library-books)
      │
      ▼
(2) INSERT في library_books  (status = 'processing')
      │
      ▼
(3) INSERT صف واحد في library_processing_jobs
        kind='full_pipeline', state='queued', stage='upload'
      │
      ▼
(4) الواجهة تستدعي edge function: library-admin?action=worker_tick
      │
      ▼
(5) library-admin يُوقظ library-worker (HTTP POST)
      │
      ▼
(6) library-worker يقوم داخل عملية واحدة طويلة بـ:
        a. تنزيل PDF من Storage
        b. عدّ الصفحات
        c. OCR / استخراج النص لكل صفحة  ← أطول مرحلة
        d. حفظ الصفحات في library_book_pages
        e. تقسيم إلى library_book_chunks
        f. توليد Embeddings
        g. بناء library_book_index
        h. توليد library_section_explanations (شرح لكل قسم)
        i. توليد TTS (صوت لكل فقرة)
        j. توليد library_generated_quizzes
        k. تحديث library_books.status = 'ready'
      │
      ▼
(7) الواجهة تسحب progress كل 3 ثوانٍ + Realtime على library_processing_events
      │
      ▼
(8) في الخلفية كان هناك pg_cron كل دقيقة يستدعي worker_tick لالتقاط أي job عالق
        → تم تعطيله سابقًا بعد ظهور "Out of memory" في pg_net
```

---

## 2) نقطة التوقف الفعلية الآن

بناءً على السجلات وقاعدة البيانات:

- **الرفع ينجح** ويتم إنشاء صف في `library_processing_jobs` بحالة `queued`.
- **worker_tick** يعمل عند الضغط اليدوي، لكن:
  - في الكتب الكبيرة: العامل يبدأ ثم **timeout** (حد Edge Function ~150s) قبل انتهاء OCR/الشرح/الصوت.
  - عند التقاطع: أي مهمة تفشل في المنتصف تُعيد الحالة إلى `queued` بدون من يوقظها لأن **pg_cron معطّل**.
  - بعض الكتب تصل لـ 100% في استخراج الصفحات ثم تتوقف لأن مراحل الشرح/الصوت داخل نفس التنفيذ الطويل انقطعت.

**المحصلة:** الكتاب يبقى `queued`/`processing` لأن لا يوجد **Dispatcher مستقل** يعيد استدعاء العامل بعد انقطاع التنفيذ.

---

## 3) لماذا يبقى الكتاب في حالة queued

ثلاثة أسباب متضافرة:

1. **لا يوجد محرّك دوري موثوق**: pg_cron + pg_net تسببا في "Out of memory" فتم تعطيلهما، ولم يُستبدلا بمحرّك بديل.
2. **Edge Function واحدة تقوم بكل شيء**: عند تجاوز حد الوقت/الذاكرة تنتهي العملية بصمت وتترك الـ job في المنتصف.
3. **الاعتماد على "worker_tick" يدوي**: الواجهة تستدعيه مرة واحدة بعد الرفع؛ إن فشل لأي سبب (401/timeout) يبقى الطابور جامدًا.

---

## 4) السبب الجذري (Root Cause)

> **النظام مصمم كـ Pipeline متزامن (synchronous monolith) داخل Edge Function واحدة، بينما طبيعة العمل غير متزامنة وطويلة (OCR + LLM + TTS). ولا يوجد Job Runner مستقل يضمن استئناف العمل بعد أي انقطاع.**

كل الأعراض الأخرى (queued لا ينتهي، توقف عند 100% صفحات، فشل الشرح/الصوت، رفض العامل) هي **نتائج** لهذا السبب، وليست أسبابًا مستقلة.

---

## 5) تصنيف المشكلة

| المكوّن | مسؤول؟ | التفصيل |
|---|---|---|
| Queue (`library_processing_jobs`) | جزئيًا | التصميم صحيح لكن بحقل `stage` واحد لكامل الأنبوب |
| Worker | نعم | Monolith يتجاوز حدود Edge Function |
| Cron | نعم | معطّل، لا يوجد بديل |
| Trigger | لا | لا يوجد trigger فعلي في هذا المسار |
| Database schema | جزئيًا | يحتاج تقسيم الـ stages إلى jobs مستقلة |
| **Pipeline design** | **نعم — السبب الرئيسي** | تنفيذ متزامن طويل بلا تجزئة |

---

## 6) التصميم الجديد المقترح

### مبدأ أساسي
**كل مرحلة = Job مستقل + Worker مستقل + إعادة محاولة مستقلة.**

### مخطط النظام الجديد

```text
[Upload]
   │
   ▼
INSERT library_books (status=processing)
INSERT job(kind=extract_pages, state=queued)
   │
   ▼
┌──────────────────────────────────────────────┐
│  Dispatcher (Edge Function + Scheduler)      │
│  - يعمل كل 20 ثانية عبر Deno.cron داخل      │
│    edge function طويلة العمر، بديل لـ pg_cron│
│  - يختار أول job queued/failed_retryable     │
│  - يستدعي الـ Worker المناسب لنوع الـ job    │
└──────────────────────────────────────────────┘
   │
   ▼
Workers مستقلة (كل واحد Edge Function صغيرة):
  W1: extract_pages   → عند النجاح: enqueue(extract_text)
  W2: extract_text    → عند النجاح: enqueue(chunk_embed)
  W3: chunk_embed     → عند النجاح: enqueue(build_index) + enqueue(generate_explanations)
  W4: build_index     → عند النجاح: enqueue(finalize) بعد اكتمال باقي المسارات المتوازية
  W5: generate_explanations (batch لكل قسم) → enqueue(generate_tts) لكل قسم
  W6: generate_tts (batch لكل فقرة)
  W7: generate_quiz
  W8: finalize        → status = ready
```

### قواعد الموثوقية

- كل Worker: **مهمة واحدة فقط** ثم يخرج (يبقى ضمن حدود Edge Function).
- Job له: `state`, `attempts`, `max_attempts`, `next_run_at`, `last_error`, `stage`.
- عند الفشل: `attempts++` و `next_run_at = now() + backoff`، الـ Dispatcher يعيد التقاطها.
- **Idempotency**: كل مرحلة تفحص إن كان مخرجها موجودًا قبل إعادة العمل.
- **Fan-out / Fan-in**: مراحل الشرح/الصوت تُقسّم إلى Jobs متعددة (لكل قسم/فقرة)، وjob `finalize` ينتظر حتى `COUNT(pending)=0`.

### مكوّنات جديدة مطلوبة

1. تعديل `library_processing_jobs`: `parent_job_id`, `stage` enum موسّع، `payload jsonb`.
2. Edge Function `library-dispatcher` تعمل كل 20-30 ثانية (Deno.cron أو Supabase Scheduled Trigger الجديد).
3. تقسيم `library-worker` الحالي إلى ملفات Workers صغيرة (خيار: ملف واحد + `switch(kind)` لتقليل الـ overhead).
4. لوحة تشخيص المطوّر تعرض شجرة Jobs (parent → children) بدل شريط تقدم واحد.
5. زر "إعادة تشغيل من هذه المرحلة" لكل Job فردي.

### فوائد مباشرة

- لا يوجد Job واحد يتجاوز حد Edge Function.
- انقطاع أي مرحلة لا يُهدر ما قبلها.
- تشخيص دقيق: تعرف أي مرحلة فشلت ولماذا.
- إعادة تشغيل انتقائية بدل معالجة الكتاب من الصفر.

---

## قرار مطلوب منك

اختر أحد المسارات ثم سأبدأ التنفيذ:

- **A) إعادة بناء كاملة** حسب التصميم أعلاه (أنصح بهذا) — عمل أكبر لكنه ينهي المشكلة جذريًا.
- **B) إصلاح جراحي**: إبقاء الـ Worker الحالي + إضافة Dispatcher مستقل فقط (بديل pg_cron). أسرع لكنه لا يحل مشكلة timeout في الكتب الكبيرة.
- **C) تعديل نطاق** تريد إضافته/حذفه قبل الموافقة.

بانتظار قرارك قبل كتابة أي سطر كود.

# إعادة هندسة نظام المكتبة والفهرسة (Modrek AI Library)

## 1. الأسباب الجذرية المكتشفة (بعد فحص الكود الحالي)

المشكلة ليست في رسائل الخطأ، بل في أن المعمارية الحالية **مقسومة حسب حجم الملف**:

| # | السبب الجذري | المكان |
|---|---|---|
| 1 | أي PDF أكبر من 15MB لا يُقرأ محليًا إطلاقًا، بل يُدفع كاملًا إلى Gemini File API (خدمة مدفوعة) → `402 requires at least $0.50 in balance for files` | `modrek-worker` → `queuePdfTextBatches` (حد `PDF_LOCAL_FALLBACK_LIMIT_BYTES = 15MB`) |
| 2 | كل مهمة صفحة تُحمّل **الملف كامل** من Bunny وتفكّ ترميز PDF بالكامل من جديد؛ لكتاب 30MB و300 صفحة = 300 تحميل × 30MB → timeout وقتل الذاكرة | `fetchAssetBytes` + `extractPdfPagesFromBytes` |
| 3 | فشل قراءة عدد الصفحات محليًا = رمي خطأ نهائي بدون parser بديل | `queuePdfTextBatches` (رسالة "تعذر قراءة عدد صفحات PDF محلياً") |
| 4 | مرحلة `structure` ترسل نص الكتاب الضخم دفعة واحدة بحدود مخرجات كبيرة → `fewer max_tokens` / `65536 tokens` | `stageStructure` + طلبات LLM بدون سقف لكل مرحلة |
| 5 | `merge_text` لا يكتمل إذا فشلت صفحة واحدة، فيبدو الكتاب كأنه فشل كليًا | `stageMergeText` |
| 6 | حالة الصفحات موجودة (`knowledge_page_state`) لكن غير معروضة للمطور بشكل منظم، ولا يوجد "إعادة الصفحات الفاشلة فقط" واضح | `ModrekSourceDetailPage.tsx` |

المعمارية الحالية: `detect → extract_text → (upload_pdf_chunk → extract_page ×N | extract_page ×N) → merge_text → structure → chunk → embed → index`
البنية سليمة كفكرة، لكن مصدر النص خطأ (LLM بدل PDF نفسه) وتوزيع العمل خطأ (تحميل الملف كامل لكل صفحة).

## 2. المعمارية المقترحة

```text
Upload → validate → detect (نصي/مصوّر)
       → page_count (unpdf → pdf-lib → مسح خام /Type /Page)
       → split_pdf: تقسيم الكتاب مرة واحدة إلى أجزاء ~10 صفحات مخزّنة في Bunny
       → extract_page (لكل جزء فقط، محلي 100%، بدون LLM)
       → ocr (فقط للصفحات بلا طبقة نص، صفحة واحدة/طلب، سقف توكنز صغير)
       → normalize → structure (على ملخصات محدودة، دفعات مقيّدة) 
       → chunk → embed → index → completed
```

مبادئ إلزامية:
- استخراج النص الخام **محلي دائمًا** بغض النظر عن الحجم؛ LLM فقط لـ OCR والبنية الدلالية.
- لا تحميل للملف الكامل بعد مرحلة التقسيم؛ كل مهمة تقرأ جزءها فقط.
- صفحة فاشلة = `failed_pages` + استكمال الكتاب؛ لا توقف كلي.
- استئناف من آخر صفحة ناجحة (الحالة محفوظة في قاعدة البيانات).

## 3. التغييرات التقنية

**ملفات جديدة**
- `supabase/functions/_shared/pdfPipeline.ts`: عدّاد صفحات متعدد الاحتياطات، خطة الدفعات، تقسيم الأجزاء، استخراج نص صفحة، تصنيف الأخطاء (`PDF_ERROR/PARSER_ERROR/OCR_ERROR/LLM_ERROR/OPENROUTER_ERROR/EMBEDDING_ERROR/DATABASE_ERROR/NETWORK_ERROR/RATE_LIMIT/INSUFFICIENT_CREDITS`) + سقوف توكنز لكل مرحلة.
- `supabase/functions/_shared/pdfPipeline_test.ts`: اختبارات آلية (عدّ الصفحات مع الاحتياطات، تخطيط الدفعات، تصنيف أخطاء 402/429/timeout، منطق retry/backoff، اكتمال جزئي).

**تعديلات**
- `supabase/functions/modrek-worker/index.ts`: إزالة بوابة الحجم، مرحلة `split_pdf`، استخراج محلي أولًا، OCR انتقائي، `merge_text` يتحمّل الصفحات الفاشلة، سقوف `max_tokens` لكل مرحلة، تسجيل أخطاء منظّم.
- `supabase/functions/modrek-retry/index.ts`: `retry_failed_pages` / `reindex_book` / `rebuild_embeddings`.
- `supabase/functions/_shared/openrouter.ts` + `aiProvider.ts`: طبقة تجريد مزوّد + منع أي طلب بسقف مخرجات ضخم.
- `src/pages/admin/ModrekSourceDetailPage.tsx`: حالة الكتاب (Processing/Completed/Partial/Failed)، `157 / 300` + %، المرحلة الحالية، صفحات ناجحة/فاشلة/قيد الإعادة، زر «إعادة الصفحات الفاشلة فقط»، وتفاصيل تقنية قابلة للفتح بدل قائمة أخطاء مكرّرة.

**Migrations (إضافية وآمنة فقط، بلا حذف بيانات)**
1. `knowledge_pdf_parts`: أجزاء PDF المخزّنة (version_id, page_from, page_to, object_path) + GRANT + RLS للمطور/service_role.
2. أعمدة إضافية على `knowledge_source_versions`: `pages_total`, `pages_processed`, `pages_failed`, `pipeline_health` (كلها nullable مع افتراضيات).
3. لا حذف ولا تعديل للكتب/الـchunks/الـembeddings الحالية؛ الكتب المفهرسة تبقى قابلة للبحث كما هي.

**بحث ومساعد ذكي**
منطق الاستهداف والتصفية حسب (الصف/الشعبة/المادة) موجود في `_shared/lessonTargeting.ts` مع 16 اختبارًا ناجحًا؛ سنضيف عليه: ترتيب النتائج بنقاط مركّبة (تطابق الدرس + المادة + الصف + التشابه الدلالي) ومنع الاختراع عند عدم وجود محتوى، وتغطية اختبار «امتحان على درس» و«امتحان على المنهج كامل».

## 4. ما يحتاج تدخلًا خارجيًا
رصيد المزوّد (OpenRouter) سيبقى مطلوبًا لـ OCR للكتب المصوّرة فقط؛ الكتب النصية ستُفهرس بتكلفة LLM قريبة من الصفر بعد هذا التغيير.

## 5. الاختبار
تشغيل حزمة اختبارات Deno الجديدة + حزمة استرجاع الدروس، واختبار الرفع الفعلي وسيناريوهات الاستئناف/الفشل الجزئي/انتهاء الرصيد، ثم تقرير نهائي بالنتائج.

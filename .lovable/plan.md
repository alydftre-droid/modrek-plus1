
# مراجعة معمارية نظام "مكتبة الطلاب التفاعلية 2026"

هذه مراجعة قبل تنفيذ المرحلة الثانية. لن يُكتب أي كود قبل موافقتك.

## 1) واجهة الطالب — تأكيد الالتزام

- التصميم الحالي في `MyLibraryPage.tsx` يبقى كما هو حرفياً: نفس البطاقات (3/4 aspect, غلاف، عنوان، عدد صفحات، شريط تقدم القراءة).
- التغيير الوحيد المسموح: تجميع الكتب حسب المادة بفاصل بسيط (موجود بالفعل).
- زر "رفع PDF" محذوف نهائياً من حساب الطالب.
- فتح الكتاب يبقى عبر `LibraryBookStudio` بنفس التجربة.

## 2) لوحة المطور — عزل تام

- `/admin/library` يظهر فقط للأدمن (تحقق بـ `has_role(uid, 'admin')`).
- لا علاقة بجداول: `content` (كتب المعلمين)، `content_groups` (ملفات المجموعات)، `teacher_*`، `exams`.
- جدول `library_books` منفصل تماماً — لا FK ولا Trigger يربطه بمحتوى المعلم.

## 3) نظام الفلاتر — من قاعدة البيانات فقط

تسلسل إلزامي مبني على الجداول الحالية:

```text
library_stages (النظام: عام/أزهر/الاثنين)
        │
        ▼
library_grades (الصف — WHERE stage_id = ?)
        │
        ▼
library_tracks (الشعبة — WHERE grade_id = ?، اختياري)
        │
        ▼
library_subjects (المواد — WHERE grade_id = ? [AND track_id = ?])
        │
        ▼
library_sub_subjects (اختياري)
```

- لا يوجد أي input نصي لاسم المادة في Wizard الرفع — كل خطوة `<Select>` تُحمّل من DB.
- `library_books` يحمل FKs صارمة: `stage_id`, `grade_id`, `track_id?`, `subject_id`, `sub_subject_id?`.

## 4) ترتيب الكتب عند الطالب

- Query: `ORDER BY subject_name_ar ASC, created_at DESC` (مطبّق حالياً).
- التجميع في UI باستخدام `Map<subject, books[]>` مع فاصل: خط رفيع + اسم المادة في المنتصف (كما هو حالياً).
- لا ترتيب زمني عام — دائماً حسب المادة.

## 5) مخطط Pipeline الكامل

```text
┌─────────────────────────────────────────────────────────────────┐
│                        ADMIN UPLOAD FLOW                         │
└─────────────────────────────────────────────────────────────────┘
  Admin Wizard (9 steps)
        │
        ▼
  library-admin (Edge) ──► library_books (status='draft')
        │
        ▼
  Upload PDF ──► Bunny Storage: library-books/{book_id}/source.pdf
        │
        ▼
  library_processing_jobs (status='queued', kind='ingest')

┌─────────────────────────────────────────────────────────────────┐
│                     ASYNC PROCESSING QUEUE                       │
└─────────────────────────────────────────────────────────────────┘
  library-worker (Edge, invoked by pg_cron each minute)
        │
        ├─► يقرأ job واحد pending، يقفله (SELECT FOR UPDATE SKIP LOCKED)
        │
        ├─► [ingest] pdf.js → صور صفحات → Bunny: pages/{n}.jpg
        │            → library_book_pages (page_number, image_path, ocr_text)
        │
        ├─► [sections] استخراج الفقرات/الصور/الجداول + bbox
        │            → library_book_sections
        │
        └─► يحدّث library_books.processing_progress (0-100)
             وعند الانتهاء status='ready'

┌─────────────────────────────────────────────────────────────────┐
│                    STUDENT READING FLOW                          │
└─────────────────────────────────────────────────────────────────┘
  Student فتح كتاب → LibraryBookStudio يعرض الصفحات
        │
        ▼
  الطالب يضغط "شرح الصفحة" أو يحدّد قسم
        │
        ▼
  library-explain (Edge):
    1) sha256(book_id + page + section + variant + question) → cacheKey
    2) SELECT من library_section_explanations WHERE prompt_hash=?
       ├─ إذا موجود → hit_count++ → إرجاع النص + audio_path ✓
       └─ إذا غير موجود ↓
    3) استدعاء OpenRouter (chat) ──► نص عربي
    4) استدعاء OpenRouter TTS ──► audio bytes
    5) رفع الصوت إلى Bunny: explanations/{hash}.mp3
    6) INSERT library_section_explanations (text_ar, audio_path, tokens…)
    7) إرجاع { text, audio_url, cached:false }

┌─────────────────────────────────────────────────────────────────┐
│                          AI LAYER                                │
└─────────────────────────────────────────────────────────────────┘
  ❌ لا Lovable AI. ❌ لا OpenAI مباشرة.
  ✅ فقط OpenRouter عبر _shared/openrouter.ts (الملف موجود بالفعل).

  Config جدولي (ai_function_settings) لكل وظيفة:
    - library-explain    → model, temperature, max_tokens (افتراضي google/gemini-2.5-flash)
    - library-explain-tts → model, voice (افتراضي google/gemini-3.1-flash-tts-preview / Charon)

  تغيير النموذج = تحديث صف في DB فقط. صفر تعديل كود.
```

## 6) عدم التعارض — ضمانات

| النظام | الحماية |
|---|---|
| مكتبة المعلمين (`content`) | جدول مختلف تماماً، LibraryBookStudio يميّز بـ `source='library' \| 'content'` |
| ملفات المجموعات (`content_groups`) | لا استعلام مشترك، لا Trigger |
| الكتب العادية | تُقرأ من `content` كما كانت — واجهة الطالب الحالية للكتب لم تُمس |
| الامتحانات | نظام مستقل تماماً |
| المساعد الذكي (modrek-ai) | Edge functions منفصلة، لا تشترك في جداول أو helpers جديدة |

- لا Migration يعدّل الجداول القديمة.
- كل Edge function جديدة اسمها يبدأ بـ `library-` لتجنّب التصادم.

## 7) الأداء والمرونة — قابلية التوسع لآلاف الكتب

- **Cache دائم**: `library_section_explanations.prompt_hash` (SHA-256) يمنع أي إعادة توليد لنفس المحتوى.
- **Idempotent Jobs**: `library_processing_jobs` مع `retry_count` و `locked_by` + `locked_at` لمنع المعالجة المكررة.
- **Chunked Processing**: كل صفحة job منفصل — لا يُعاد رفع الكتاب عند فشل صفحة.
- **Lazy Rendering**: الطالب يحمّل صفحة واحدة في كل مرة (streaming من Bunny).
- **Zero Reprocessing**: تعديل عنوان/غلاف/وصف = UPDATE فقط، لا يمس pages/sections.
- **Rate Limiting**: `ai_daily_usage` موجود ويُستخدم للتحكم في استدعاءات الشرح.

## 8) تصحيح المرحلة الأولى — المطلوب قبل المرحلة الثانية

بناءً على ملاحظاتك، سأعدّل ما يلي **قبل** أي feature جديد:

1. **`library-explain/index.ts`**: استبدال استدعاء Lovable AI (`ai.gateway.lovable.dev`) بـ OpenRouter (`_shared/openrouter.ts` + `callOpenRouterChat` + `callOpenRouterTts`).
2. **إضافة صفوف `ai_function_settings`** لـ `library-explain` و `library-explain-tts` لتغيير النماذج من DB.
3. **التأكد أن `LibraryBookStudio`** لا يحاول رفع PDF من الطالب (يقرأ فقط).
4. **إضافة جدول `library_processing_jobs`** كامل مع locking (إذا لم يكن مكتملاً).

## 9) المرحلة الثانية (بعد موافقتك على هذه المراجعة)

- `library-worker` (Edge + pg_cron كل دقيقة).
- `library-ingest` منطق pdf.js/OCR.
- طبقة تفاعلية داخل `LibraryBookStudio`: تحديد نص/قسم → استدعاء `library-explain` → عرض bubble نصي + مشغّل صوت.
- شريط تقدم المعالجة في لوحة المطور (Realtime).

---

**قبل التنفيذ أحتاج تأكيدك على:**

- (أ) هل الاعتماد على OpenRouter فقط + جدول `ai_function_settings` لتغيير النموذج مناسب؟
- (ب) هل نستخدم Bunny Storage لتخزين ملفات الصوت (نفس ما يُستخدم للـ PDF)؟
- (ج) هل أبدأ فوراً بتصحيح `library-explain` لاستخدام OpenRouter (نقطة 8-1) ثم أنتظر قبل المرحلة الثانية؟

---

## Phase Final — Production RAG + Learning Memory (2026-07-13)

### DB migration
- New tables: `library_book_chunks` (vector 1536 + trgm), `library_student_memory`,
  `library_student_book_progress`, `library_student_weaknesses`,
  `library_generated_quizzes`, `library_recommendations`.
- Added `embedding vector(1536)` to `library_book_index` and `library_book_pages`,
  plus HNSW indexes on all three. Added `ocr_confidence` on pages.
- RPC `library_match_chunks(book_id, query_embedding, k)` for scoped RAG.

### Edge functions
- `_shared/openrouter.ts`: added `openRouterEmbed`, `buildVisionMessages`,
  `OPENROUTER_DEFAULT_EMBED_MODEL = openai/text-embedding-3-small`.
- `library-worker`: fixed missing brace bug; new `embed_book` job that chunks
  pages (~700 chars, sentence-aware), batch-embeds via OpenRouter (64/req),
  writes chunks + also embeds page-level summaries + index rows. Follow-up
  jobs `build_index` and `embed_book` now enqueued after every successful
  `extract_book`.
- `library-chat`: `scope=book` now uses vector search via
  `library_match_chunks` (fallback to keyword). Persists student memory and
  per-book progress. Returns `related` nearby chapters.
- `library-search`: hybrid — trigram + semantic (chunk embeddings).
- NEW `library-quiz`: generates MCQ / TF / essay quizzes from any scope with
  full result caching (`library_generated_quizzes`).
- NEW `library-analyze-region`: vision explanation of a bbox (figure /
  equation / table / diagram); results cached in `library_section_explanations`
  and reused for all students.
- NEW `library-recommendations`: personalised suggestions (continue reading,
  weakness revisits, related chapters, same-subject books) with 1h cache.
- `ai_function_settings` rows registered for `library-index`, `library-quiz`,
  `library-analyze-region` — all models configurable centrally.

### Guarantees
- All AI / embeddings / TTS route through OpenRouter (no Lovable AI, no
  direct Gemini/OpenAI).
- Every generated answer / audio / quiz is hashed and stored — reused for
  any future student asking the same question.
- Vector queries are indexed with HNSW; scales to hundreds of thousands of
  chunks per book. Chunk table partitionable later by `book_id` if needed.
- Student-facing UI (`MyLibraryPage`, `LibraryBookStudio`) untouched.

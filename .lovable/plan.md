# خطة دمج OpenRouter كمزوّد موحّد

## المبدأ الأساسي

- **لا حذف، لا استبدال، لا إعادة تصميم.** كل الجداول والصفحات و Bunny.net و Supabase و RLS و UI تبقى كما هي.
- طبقة OpenRouter تُضاف كـ **مزوّد جديد** داخل الـ edge functions الحالية، مع Fallback للمزوّد القديم إن فشل الطلب.
- كل الأسرار تبقى في Backend. لا يُكشف `OPENROUTER_API_KEY` أبدًا للفرونت.

## المراحل

### المرحلة 1 — البنية التحتية المشتركة (Backend فقط)

ملف جديد: `supabase/functions/_shared/openrouter.ts`
- `chatOpenRouter({ messages, stream, model })` — يستدعي `/api/v1/chat/completions` مع `google/gemini-2.5-flash` افتراضيًا، يدعم SSE.
- `embedOpenRouter(text)` — يستدعي `/api/v1/embeddings` (نموذج OpenRouter embeddings المتوافق).
- `ttsOpenRouter({ input, voice, format })` — يستدعي `/api/v1/audio/speech` مع `google/gemini-3.1-flash-tts-preview`، يعيد stream صوتي خام.
- Retry + timeout + خطأ عربي واضح.

Secret مطلوب: `OPENROUTER_API_KEY` (تم حفظه).

### المرحلة 2 — تحويل مسارات الدردشة الحالية

الملفات المعدَّلة (بدون تغيير واجهاتها العامة):
- `supabase/functions/ai-chat/index.ts` → استخدام `chatOpenRouter` كمزوّد أساسي، مع الحفاظ على Fallback الحالي.
- `supabase/functions/teacher-assistant/index.ts` → نفس الشيء.
- `supabase/functions/support-assistant/index.ts` → نفس الشيء.
- `supabase/functions/modrek-reason/index.ts` → نفس الشيء.
- `supabase/functions/generate-exam/index.ts` و `grade-essay/index.ts` → نفس الشيء.

كل الاستجابات (SSE + JSON) تبقى بنفس الشكل، فالكلاينت (`aiStream.ts`, `modrekReason.ts`, `teacherAssistant.ts`) لا يتغيّر.

### المرحلة 3 — نظام TTS الذكي (Smart Voice)

جداول جديدة (Migration واحد):
```
voice_answers (
  id, subject_id, sub_subject_id, teacher_id, grade,
  book_id, page_number, unit_id,
  question_text, answer_text, keywords,
  audio_url, audio_duration_ms, voice_style,
  embedding vector(1536),
  curriculum_version, created_at
)
```
- GRANT + RLS: قراءة للمستخدمين المصادَقين حسب الاشتراك، كتابة عبر service_role فقط.
- HNSW index على embedding.
- Bunny Storage bucket جديد `voice-cache` لتخزين ملفات MP3 المولَّدة.

Edge functions جديدة:
- `voice-ask` — يستقبل سؤال + سياق (subject/book/page)، يعمل بحث دلالي على `voice_answers`، وإن وُجد جواب بتشابه ≥ 0.87 يعيده مباشرة. وإلا يولّد جواب جديد + TTS + يخزّن.
- `voice-tts` — يستقبل نص جاهز (لتلاوة شرح كتاب مثلًا) ويعيد صوت مباشرة مع cache.

إعدادات المعلم:
- عمود جديد `preferred_voice_style` في `teacher_profiles` (نص قصير، افتراضي "arabic_egyptian_teacher").
- صفحة إعدادات المعلم الحالية تُضاف لها Selector واحد للنبرة.

### المرحلة 4 — واجهة المستخدم (الحد الأدنى)

- زر "🎧 استمع" يظهر في: `SubjectAiChat`, `AiChat`, `LibraryBookStudio`, `StudentSubjectView` — يستدعي `voice-tts` ويشغّل الصوت.
- زر "🤖 اسأل الذكاء" داخل `LibraryBookStudio` يستدعي `voice-ask` مع سياق الكتاب/الصفحة الحالية.
- **لا تغيير في التصميم، لا تعديل ألوان، لا حذف مكوّنات.** فقط أزرار جديدة مضافة بنفس نظام الألوان الحالي.

## البنية التقنية (لك كمرجع)

```text
Client (React)
  └─ aiStream / modrekReason / voice-client
      └─ Supabase Edge Function
          └─ _shared/openrouter.ts
              └─ https://openrouter.ai/api/v1/{chat|embeddings|audio/speech}
                  └─ google/gemini-2.5-flash | gemini-3.1-flash-tts-preview
```

- Streaming: SSE على chat، audio bytes stream على TTS.
- Caching: Semantic cache على `voice_answers` + HTTP cache على ملفات Bunny.
- Async: توليد TTS + تخزين embedding يحدثان بعد إرسال الجواب النصي للطالب فورًا.

## ما لن يتغيّر إطلاقًا

- جدول `content`, `content_chunks`, `knowledge_sources`, `knowledge_units` — كما هي.
- خط أنابيب رفع PDF إلى Bunny و`modrek-worker` — كما هو.
- Authentication, RLS الحالية, routes, pricing, wallet — كما هي.
- كل صفحات الطالب/المعلم/الأدمن الموجودة — كما هي.
- نظام TTS المحلي في `textToSpeech.ts` — يبقى كـ Fallback إن فشل OpenRouter.

## التنفيذ التدريجي

سأنفّذ المرحلة 1 و 2 أولًا وأتأكد أن كل شيء يعمل، ثم أنتظر تأكيدك قبل بدء المرحلة 3 (التي تتطلب Migration DB و bucket جديد على Bunny).

هل تريدني أبدأ فورًا بالمرحلة 1+2؟

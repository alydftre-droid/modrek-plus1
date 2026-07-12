# خطة تنفيذ نظام Modrek AI الجديد

## 1) نقاط الدخول في واجهة الطالب

- إزالة زر "المساعد الذكي" من داخل كل مادة (`SubjectPage`, `StudentSubjectView`, `SubjectAiChat`) وإبقاء المسارات القديمة للتوافق مع إعادة توجيه إلى `/ai`.
- إضافة **بطاقة رئيسية مميّزة "Modrek AI"** في الصفحة الرئيسية للطالب (`Dashboard`) بتصميم بارز (gradient-mudrik + أيقونة نجمة) تفتح `/ai`.

## 2) الصفحة الرئيسية لـ Modrek AI (`/ai`)

بطاقتان فقط:
- 📘 **المساعد الدراسي** → `/ai/study`
- 📝 **مساعد الامتحانات** → `/ai/exams`

قائمة جانبية للمحادثات المحفوظة (مثل ChatGPT) مع زر "محادثة جديدة".

## 3) البنية المعمارية (Modular)

```text
src/features/modrek-ai/
  core/
    contextResolver.ts      # يقرأ profile: stage/grade/section/education_type تلقائيًا
    conversationStore.ts    # CRUD للمحادثات + الرسائل (Supabase)
    knowledgeSearch.ts      # محرك البحث المتسلسل (library → student books → question bank → official exams → external)
    ttsBridge.ts            # يعيد استخدام openrouterTts + Voice Cache الحالي
  assistants/
    study/                  # المساعد الدراسي
    exams/                  # مساعد الامتحانات
    review/                 # مراجعة الامتحان (placeholder جاهز للتوسع)
  ui/
    ModrekAiHome.tsx
    ConversationSidebar.tsx
    ChatWindow.tsx          # مبني على AI Elements
    ContextBadge.tsx        # يعرض Context الثابت للمحادثة
```

كل مساعد يُصدَّر عبر واجهة موحّدة `Assistant { id, systemPrompt, tools, contextBuilder }` — لإضافة مساعدين لاحقًا (واجبات، تخطيط، تحليل أداء) دون تعديل النواة.

## 4) قاعدة البيانات (migration واحدة)

- `modrek_ai_conversations`: `id, student_id, assistant_type (study|exams|review), title, context_json (subject_id, chapter, subject_name...), created_at, updated_at`
- `modrek_ai_messages`: `id, conversation_id, role, parts (jsonb), attachments, created_at`
- `modrek_ai_exam_links`: يربط محادثة "مراجعة" بـ `exam_attempts.id` الحالي.
- RLS: كل طالب يرى محادثاته فقط + GRANT كامل حسب معايير المشروع.

## 5) المساعد الدراسي

- Edge Function جديدة `modrek-ai-study` باستخدام نفس نمط `ai-chat` الحالي (Gemini/OpenAI).
- إدخال: نص + صور + PDF (multimodal عبر `image_url` / `file`).
- الـ system prompt يحقن تلقائيًا: المرحلة/الصف/النظام/الشعبة من `profiles`.
- قبل الرد: يستدعي `knowledgeSearch` (يعيد استخدام `modrek-retrieve` + `library` الموجودة). إن لم يجد → يسمح بالمصادر الخارجية الموثوقة (whitelist).
- TTS: زر "اشرح بالصوت" يستدعي `openrouter-tts` الحالي مع الكاش.
- **Context ثابت للمحادثة**: عنوان المحادثة (مثل "فيزياء – الباب الأول") يُخزَّن في `context_json` ويُحقن في كل رسالة تلقائيًا.

## 6) مساعد الامتحانات

- Edge Function `modrek-ai-exams` تستخرج من رسالة الطالب: (subject, chapter, question_types, count, difficulty, reference_exam) عبر structured output.
- المفقود فقط يُسأل عنه (المادة عادةً). كل شيء آخر يُقرأ من الحساب.
- إعادة استخدام `generate-exam` الحالية لبناء الامتحان الفعلي وحفظه في جدول `exams` الموجود مع علامة `source='modrek_ai'` و`student_id`.
- ثم **إعادة التوجيه إلى نفس صفحات الامتحان الحالية** (`ExamTakePage` → `ExamSubmitPage` → `ExamResultPage`) — بدون واجهة جديدة.
- بعد `ExamResultPage`: يظهر مكوّن جديد `PostExamReviewChat` بعنوان "راجع امتحانك مع Modrek AI" يفتح محادثة `assistant_type='review'` مع `context_json = { exam_id, attempt_id }` — المساعد يحمّل كل الأسئلة والإجابات والحلول من الجداول الحالية.

## 7) محرك البحث المتسلسل

في `knowledgeSearch.ts` بالترتيب:
1. `knowledge_units` + `content_chunks` (مكتبة Modrek).
2. مكتبة الطالب الشخصية (`content` حيث `type='student_library'`).
3. بنك أسئلة المنصة (`exam_questions` + `exams` منشورة).
4. الامتحانات الرسمية (`exams` مع `is_official=true`).
5. Fallback: بحث خارجي عبر `modrek-retrieve` الحالية (مصادر موثوقة فقط).

## 8) إعادة الاستخدام (لا إعادة كتابة)

| النظام | يُعاد استخدامه من |
|---|---|
| محرك الامتحانات | `exams`, `exam_questions`, `ExamTakePage`, `ExamSubmitPage`, `ExamResultPage` |
| توليد الامتحانات | `supabase/functions/generate-exam` |
| التصحيح | `grade-essay` + منطق التصحيح الحالي |
| TTS + كاش | `openrouter-tts` + `voice_answers` |
| المكتبة/البحث | `modrek-retrieve`, `knowledge_*` |
| Auth + Profile | `useAuth`, `profiles` |

## 9) الحفاظ على التوافق

- إعادة توجيه `/subject/:id/ai` → `/ai/study?subject=:id` (لا نكسر روابط قديمة).
- عدم حذف جداول `ai_conversations` القديمة — تُترك للأرشيف.
- كل التغييرات على واجهة الطالب فقط (لا نمس واجهة المعلم/الأدمن).

## 10) الاختبار والتقرير النهائي

- سيناريوهات: بطاقة الرئيسية → المساعد الدراسي بسؤال نصي/صورة/PDF → TTS → مساعد الامتحانات بطلب "امتحان في الفيزياء على الباب الأول" → حل → نتيجة → شات المراجعة.
- تقرير موجز يوضح: الملفات الجديدة، ما أُعيد استخدامه، الـ migration، ونقاط التوسع المستقبلية.

---

هل أبدأ التنفيذ بهذه الخطة؟ يمكنك أيضًا طلب تعديل أي جزء (مثل تغيير مكان البطاقة، أو دمج المساعدين في واحد بأزرار وضع).

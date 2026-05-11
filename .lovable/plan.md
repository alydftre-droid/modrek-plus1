## الهدف
تحويل المساعد الذكي من "صوت يتكلم" إلى "معلم حقيقي يشرح بصريًا" داخل المساعد الذكي والمكتبة، مع إصلاح المشاكل العاجلة في الزوم وتبديل الصفحات وحذف الشريط الجانبي الإضافي.

---

## القسم الأول: إصلاحات عاجلة (سريعة)

### 1. إصلاح الزوم (Pinch + Wheel)
- المشكلة: الزوم يقفز بقفزات كبيرة وغير منتظمة في `AssistantLessonStudio` و`LibraryBookStudio`.
- الحل:
  - استبدال منطق الزوم الحالي بـ smooth scaling خطوة 0.05–0.1 لكل event.
  - استخدام `clamp(0.5, scale, 4)` بدل القفزات.
  - دعم pinch بإصبعين مع حساب `distance ratio` لحظيًا (بدون مضاعفة).
  - دعم double-tap للتكبير/التصغير.
  - زر `+` و`-` وزر `Reset` يعمل بنفس المنطق.

### 2. إصلاح تبديل الصفحات السريع (Race Condition)
- المشكلة: الطالب يطلب شرح صفحة 6 ثم يضغط على 9، المساعد يكمل شرح 6.
- الحل:
  - استخدام `AbortController` لكل طلب AI + TTS.
  - عند تغيير الصفحة:
    - `abortControllerRef.current?.abort()`
    - `stopTextToSpeech()`
    - مسح queue الـ chunks
    - بدء طلب جديد للصفحة الجديدة فقط.
  - تتبع `activePageIdRef` ورفض أي استجابة لا تطابق الصفحة الحالية.

### 3. حذف الشريط الجانبي الإضافي
- إزالة عمود الـ thumbnails الجانبي من `AssistantLessonStudio` و`LibraryBookStudio`.
- إبقاء فقط: شريط تنقل سفلي/علوي خفيف + زر صفحات صغير يفتح drawer عند الحاجة.
- المحتوى الرئيسي يأخذ كامل العرض.

---

## القسم الثاني: نظام الشرح التفاعلي الذكي

### معمارية احترافية جديدة تحت `src/features/interactive-tutor/`

```
src/features/interactive-tutor/
├── engines/
│   ├── AnnotationEngine.ts        // إدارة الرسومات فوق الصفحة
│   ├── WhiteboardEngine.ts        // السبورة التفاعلية
│   ├── AudioSyncController.ts     // مزامنة الصوت مع الرسم
│   └── AIDrawingController.ts     // ترجمة أوامر AI إلى رسومات
├── components/
│   ├── InteractiveOverlay.tsx     // طبقة Konva فوق الصفحة
│   ├── SmartWhiteboard.tsx        // السبورة كاملة الشاشة
│   ├── AnnotationLayer.tsx        // shapes: circle/arrow/highlight/underline
│   └── AnimatedPointer.tsx        // مؤشر متحرك
├── store/
│   └── tutorStore.ts              // Zustand: annotations, mode, currentStep
├── types/
│   └── annotations.ts             // AnnotationCommand schema
└── hooks/
    ├── useAnnotationSync.ts
    └── useWhiteboardMode.ts
```

### 1. Annotation Overlay (React Konva)
- طبقة `<Stage><Layer>` فوق صورة الصفحة بنفس الأبعاد.
- تدعم: Circle, Arrow, Rectangle, Highlight, Underline, Hand-drawn path, Text label, Animated pointer.
- Animations عبر Konva tweens (fade-in/out, pulse).
- Responsive: تتعدل مع scale الزوم وتحافظ على دقة الإحداثيات.

### 2. AI Annotation Protocol
المساعد الذكي يعيد JSON منظم بدل نص فقط:

```json
{
  "narration": "ركز على هذه المعادلة...",
  "annotations": [
    { "type": "circle", "x": 0.42, "y": 0.18, "r": 0.05, "color": "#22c55e", "at": 0, "duration": 4000 },
    { "type": "arrow", "from": [0.3, 0.5], "to": [0.5, 0.6], "at": 2000 }
  ],
  "mode": "page" | "whiteboard",
  "whiteboard": {
    "steps": [
      { "type": "write", "text": "س + ٢ = ٥", "at": 0 },
      { "type": "draw", "path": [...], "at": 1500 }
    ]
  }
}
```
الإحداثيات نسبية (0–1) لتعمل مع أي زوم/حجم شاشة.

### 3. Audio Sync Controller
- يقسّم الـ narration إلى chunks مرتبطة بـ timestamps.
- عند بدء كل chunk عبر TTS → يطلق الـ annotations المرتبطة بنفس `at`.
- يستخدم `requestAnimationFrame` للجدولة.
- ينظف الرسومات القديمة تلقائيًا بعد `duration`.

### 4. Smart Whiteboard Mode
- المساعد يقرر تلقائيًا: نقاط بسيطة → شرح على الصفحة، نقاط معقدة (معادلات/رسوم/خطوات) → فتح السبورة.
- السبورة كاملة الشاشة بخلفية داكنة أنيقة + جريد خفيف.
- يدعم: كتابة يدوية متحركة (stroke-by-stroke animation)، أسهم، أشكال، معادلات (KaTeX)، نصوص.
- زر للعودة لصفحة الكتاب في أي وقت.
- المساعد يفسّر صراحة: "هخش السبورة عشان أوضحلك..." ثم يفتحها.

### 5. AI Focus Guidance
- system prompt يفرض:
  - استخدم annotation واحد أو اثنين فقط لكل فكرة.
  - لا تملأ الصفحة.
  - اشرح الرسومات الموجودة في الصفحة (يقرأ pageText + pageImage ويصفها).
- نموذج: `google/gemini-2.5-pro` (vision قوي) لاستخراج الـ annotations بإحداثيات دقيقة.

### 6. Performance
- `requestAnimationFrame` لكل الـ animations.
- Konva `listening={false}` على الطبقات الديكورية.
- Lazy mount للسبورة (تُحمَّل عند الحاجة فقط).
- تنظيف tweens عند unmount.
- pixelRatio محدود على الأجهزة الضعيفة.

---

## القسم الثالث: Edge Function `ai-chat`

- تعديل system prompt ليطلب output بصيغة JSON (narration + annotations + mode).
- إضافة structured output via tool calling مع schema صارم.
- شرح يشبه المعلم: مقدمة قصيرة → نقاط → مثال → خلاصة، بدون حشو.
- تحليل الرسومات في صورة الصفحة وذكرها صراحة.
- قرار تلقائي بين `page` و`whiteboard` بناءً على طبيعة المحتوى.

---

## القسم الرابع: التطبيق Android

- إضافة `react-konva` + `konva` إلى `package.json` (متوافقة مع Capacitor WebView).
- لا حاجة لـ native plugin جديد.
- التأكد من أن TTS الحالي (capacitor-community/text-to-speech) يدعم الـ chunk events للمزامنة.
- بناء APK جديد عبر GitHub Actions تلقائيًا بعد الـ push.

---

## التقنيات
- React Konva + Konva.js (الرسم)
- Zustand (state)
- Framer Motion (UI transitions فقط)
- KaTeX (المعادلات في السبورة)
- TypeScript strict
- requestAnimationFrame

---

## ترتيب التنفيذ
1. الإصلاحات العاجلة (زوم، race condition، حذف الشريط) — يعمل فورًا.
2. تثبيت konva + react-konva + zustand.
3. بناء AnnotationEngine + InteractiveOverlay.
4. تعديل ai-chat لإخراج JSON.
5. AudioSyncController.
6. SmartWhiteboard.
7. تطبيق نفس النظام على LibraryBookStudio.
8. تحسين الأداء والاختبار على موبايل.

---

## ملاحظات للمستخدم
- التحديث ضخم ويُطبَّق على المساعد الذكي داخل المواد **والمكتبة** بنفس الطريقة.
- APK جديد سيُبنى تلقائيًا عبر GitHub Actions بعد الانتهاء.
- هل توافق على البدء بهذا الخطة كما هي؟
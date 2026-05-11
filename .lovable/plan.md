# 🎬 نظام "AI Cinematic Teaching" — إعادة بناء كاملة

تحويل المساعد من "صوت + دوائر" إلى **معلم افتراضي حيّ** يشاور، يكتب بيده، يحدّد بتزامن مع كلامه، ويفتح سبورة طباشير حقيقية عند الحاجة — داخل المساعد الذكي والمكتبة معًا، وعلى الويب والتطبيق.

---

## 🧱 المعمارية الجديدة

```
src/features/cinematic-tutor/
├── engine/
│   ├── TimelineEngine.ts          // محرك جدولة الأحداث (GSAP-driven)
│   ├── SpeechSyncEngine.ts        // ربط كل كلمة بحدث بصري
│   ├── CoordinateResolver.ts      // تحويل "هذه المعادلة" إلى x,y فعلية
│   └── SceneDirector.ts           // المخرج: يقرر متى page / blackboard / zoom
├── actors/
│   ├── VirtualHand.tsx            // يد SVG متحركة (Lottie + GSAP)
│   ├── LaserPointer.tsx           // مؤشر ليزر سينمائي بـ glow + trail
│   ├── SpotlightFocus.tsx         // إظلام الصفحة + دائرة ضوء على الجزء المهم
│   └── Cursor.tsx                 // مؤشر يد يشاور
├── canvas/
│   ├── AnimatedHighlight.tsx      // تحديد يُرسم تدريجيًا (stroke-dasharray)
│   ├── SmoothArrow.tsx            // أسهم منحنية بـ bezier + draw animation
│   ├── HandwrittenText.tsx        // نص يُكتب حرفًا حرفًا بخط يدوي
│   ├── InkStroke.tsx              // خطوط حبر بتأثير ضغط القلم
│   └── ChalkStroke.tsx            // خطوط طباشير مع تشتت ونويز
├── blackboard/
│   ├── RealBlackboard.tsx         // سبورة بنسيج حقيقي + إضاءة + إطار خشبي
│   ├── ChalkRenderer.ts           // محرك الطباشير (Canvas + noise texture)
│   ├── BlackboardScene.tsx        // مشهد كامل: سبورة + يد + صوت
│   └── transitions.ts             // انتقالات سينمائية للدخول والخروج
├── audio/
│   ├── SpeechTimer.ts             // تتبع موقع الكلام لحظيًا (boundary events)
│   └── WordHighlighter.ts         // إبراز الكلمة المنطوقة الآن
└── hooks/
    ├── useCinematicTutor.ts
    └── useTimelineSync.ts
```

---

## 🎯 المكوّنات الأساسية

### 1. Timeline Engine (GSAP)
محرك جدولة احترافي يعمل بـ **GSAP Timeline** — كل شرح يتحول لـ scenes متتابعة:
```
t=0.0s  → spotlight يضيء على المعادلة
t=0.4s  → laser pointer ينزلق إليها
t=1.2s  → highlight يُرسم تحتها (drawSVG)
t=2.5s  → الكاميرا تعمل zoom 1.4x
t=4.0s  → اليد تظهر وتكتب الناتج حرفًا حرفًا
t=7.0s  → fade للسبورة لشرح أعمق
```

### 2. Speech ↔ Visual Sync
- استخدام **`onboundary` events** من Web Speech API (وplugin TTS على Android) لمعرفة أي كلمة تُنطق الآن.
- المساعد يُرجع JSON منظم بـ `cues`:
```json
{"text":"لاحظ أن قانون نيوتن الثاني","cues":[
  {"word":"قانون","action":"spotlight","target":"eq1"},
  {"word":"نيوتن","action":"underline","target":"eq1"}
]}
```
- `SpeechSyncEngine` يطلق الحدث البصري **في اللحظة الصحيحة** لا قبل ولا بعد.

### 3. Virtual Hand (يد افتراضية)
- **Lottie animation** ليد ترسم/تكتب + **SVG path** للمسار.
- اليد تتبع مسار الكتابة حرفًا حرفًا (path tracing).
- ظل خفيف + حركة عضوية (easeInOutSine + jitter بسيط).
- خياران: يد رسوم متحركة أنيقة، أو مؤشر قلم احترافي.

### 4. Laser Pointer + Spotlight
- نقطة حمراء/خضراء بـ **radial glow** و **motion trail**.
- تتحرك بـ `gsap.to` مع `ease: "power2.inOut"`.
- **Spotlight mode**: إظلام 70% للصفحة عدا دائرة ناعمة حول المنطقة المشروحة (mask-image radial-gradient).

### 5. Animated Highlights (ليست دوائر!)
- **Stroke-by-stroke drawing** بـ `stroke-dasharray` animation.
- أنواع راقية: marker highlight (شفافية + blend-mode multiply), underline متموج, brace `{`, callout بخط منحني.
- الألوان من design tokens (أصفر باستيل، أخضر نعناعي، أزرق فاتح) — لا ألوان فاقعة.
- يختفي بـ fade ناعم بعد انتهاء الجملة المرتبطة.

### 6. Handwritten Text (كتابة حية)
- خط **عربي يدوي** (Aref Ruqaa / Lateef / Reem Kufi) + خط **caveat** للإنجليزي.
- كل حرف يُرسم بـ SVG path animation بسرعة تطابق نطق المساعد.
- اليد تتبع آخر حرف.
- صوت طباشير/قلم خفيف اختياري.

### 7. Real Blackboard Scene
- **خلفية**: nooise texture داكنة + gradient أخضر غامق + إطار خشبي.
- **طباشير**: Canvas renderer مع noise + scatter dots لمحاكاة احتكاك الطباشير.
- **انتقال الدخول**: الصفحة تنزلق لأعلى، السبورة تنزل من فوق بـ ease + ظل.
- يدعم: كتابة يدوية، رسم حر، أسهم منحنية، KaTeX (معادلات بطباشير), صور صغيرة من الصفحة (يمكن قصها ولصقها بإطار طباشير).
- زر "ارجع للصفحة" بانتقال عكسي ناعم.

### 8. Smart Camera (Zoom & Pan)
- بدل scale الزوم اليدوي فقط، المساعد يستطيع طلب **cinematic zoom** على منطقة:
```json
{"action":"focus","x":0.4,"y":0.3,"scale":1.8,"duration":1200}
```
- transform-origin يتحرك بسلاسة، خلفية الصفحة تتعتم قليلاً.

---

## ✨ مميزات إضافية أقترحها (Premium)

1. **🎙️ Voice Personality** — اختيار صوت المعلم (هادئ/حماسي/أنثوي/ذكوري) من إعدادات الطالب.
2. **📌 Sticky Notes تفاعلية** — المساعد يلصق ملاحظة صفراء على نقطة مهمة، الطالب يمكنه حفظها في دفتره.
3. **🧠 Recall Moments** — عند نقطة شبيهة بدرس سابق، يظهر "popup ذاكرة" بصورة من الدرس القديم.
4. **❓ Live Quiz Interrupts** — المعلم يتوقف ويسأل سؤال سريع، يظهر بفقاعة، الطالب يجيب لمتابعة الشرح.
5. **📓 Auto Notebook** — كل ما يكتبه المعلم على السبورة يُحفظ تلقائيًا في "دفتر الحصة" للطالب (PDF نهاية الدرس).
6. **🎬 Replay Scene** — زر "أعد هذا الجزء" يُعيد آخر 15 ثانية بصريًا وصوتيًا.
7. **🐢 Speed Control** — 0.75x / 1x / 1.25x / 1.5x للشرح كله (صوت + رسم).
8. **🌗 Theater Mode** — ضغطة واحدة → ملء الشاشة + إظلام UI + تجربة سينما.
9. **🎵 Ambient Sound** — صوت فصل خفيف اختياري (طباشير، أوراق، هدوء مكتبة).
10. **🪄 "اشرح أكثر هنا"** — الطالب يضغط على أي جزء من الصفحة → المعلم يتوقف ويشرحه فقط.
11. **🔖 Bookmarks ذكية** — حفظ لحظة معينة من الشرح (frame + audio offset) للرجوع.
12. **📊 Concept Map** — في نهاية الدرس، خريطة ذهنية متحركة لما تم شرحه.

---

## 🔧 التقنيات المختارة

| الحاجة | الأداة | السبب |
|---|---|---|
| Timeline & easing | **GSAP** (مجاني للاستخدام العام) | الأقوى للتسلسل السينمائي |
| Drawing on page | **SVG + Framer Motion** | DOM-friendly، دقيق، responsive |
| Blackboard | **Konva** على Canvas | أداء عالي لتأثير الطباشير |
| Hand animation | **Lottie** + **lottie-react** | يد جاهزة بجودة عالية |
| Equations | **KaTeX** | معادلات سريعة |
| State | **Zustand** | خفيف ومناسب للـ timeline |
| Speech sync | Web Speech `onboundary` + Capacitor TTS events | تزامن لحظي |
| Mobile perf | `will-change`, `transform3d`, `prefers-reduced-motion` | سلاسة على الموبايل |

---

## 🛣️ ترتيب التنفيذ

1. **تثبيت الحزم**: gsap, konva, react-konva, lottie-react, zustand, katex.
2. **Engine layer**: TimelineEngine + SpeechSyncEngine + CoordinateResolver.
3. **Actors**: VirtualHand, LaserPointer, SpotlightFocus.
4. **Canvas elements**: AnimatedHighlight, SmoothArrow, HandwrittenText.
5. **RealBlackboard** بمحرك الطباشير الكامل.
6. **تعديل `ai-chat` edge function**: إخراج بروتوكول cues + scenes بدل annotations الحالية.
7. **دمج في `AssistantLessonStudio`** ثم `LibraryBookStudio` بنفس API.
8. **اختبار على Android** (Capacitor TTS boundary events).
9. **المميزات الإضافية** (Notebook، Replay، Speed، Theater).
10. **بناء APK جديد** عبر GitHub Actions.

---

## 📱 الموبايل

- كل الـ animations بـ `transform/opacity` فقط (GPU).
- `prefers-reduced-motion` يقلل الحركة تلقائيًا.
- اللمس: tap للإيقاف، long-press لـ "اشرح هنا".
- اختبار على viewport 484px (الحالي للمستخدم).

---

## ⚠️ ملاحظة

هذا تحديث **ضخم** (~15-20 ملف جديد + تعديل 3 موجودة + edge function). سأبدأ التنفيذ مباشرة بعد موافقتك وأسلّمه على مراحل قابلة للاختبار.

هل أبدأ التنفيذ بهذا الشكل؟ أم تريد إضافة/حذف ميزة معينة من القائمة قبل البدء؟

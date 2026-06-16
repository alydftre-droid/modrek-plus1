## نظام الامتحانات الإلكترونية الجديد - Modrek Plus Exams v3

### المرحلة 1: قاعدة البيانات (Migration)

**حذف القديم:**
- `DROP TABLE public.exam_attempts CASCADE`
- `DROP TABLE public.exams CASCADE`

**جداول جديدة (8 جداول):**

1. **`exams`** — الامتحان الرئيسي
   - عنوان، وصف، صورة غلاف، subject_id، group_id، teacher_id
   - duration_minutes, total_marks, pass_marks
   - start_at, end_at (نافذة التوفر)
   - max_attempts (عدد المحاولات المسموحة)
   - shuffle_questions, shuffle_options
   - show_results_immediately, show_correct_answers
   - prevent_tab_switch, require_fullscreen, prevent_copy_paste
   - is_published, status (draft/published/archived)
   - term, difficulty_level

2. **`exam_questions`** — الأسئلة (منفصلة عن jsonb)
   - exam_id, order_index, question_text, image_url
   - question_type (mcq/true_false/short_answer/essay/fill_blank)
   - marks, explanation, difficulty

3. **`exam_question_options`** — خيارات MCQ
   - question_id, order_index, option_text, image_url, is_correct

4. **`exam_attempts`** — محاولات الطلاب
   - exam_id, student_id, attempt_number
   - started_at, submitted_at, time_spent_seconds
   - status (in_progress/submitted/graded/expired)
   - total_score, max_score, percentage, passed
   - tab_switch_count, fullscreen_exits, suspicious_activity
   - is_graded, graded_at, graded_by

5. **`exam_answers`** — إجابات تفصيلية (Auto-save لكل سؤال)
   - attempt_id, question_id, selected_option_ids[], answer_text
   - is_correct, marks_awarded, ai_feedback
   - answered_at, time_spent_seconds

6. **`exam_drafts`** — حفظ تلقائي offline-friendly
   - student_id, exam_id, answers jsonb, last_saved_at
   - يُستخدم للاستعادة عند انقطاع النت

7. **`exam_leaderboard`** — Materialized view لترتيب الطلاب
   - exam_id, student_id, rank, score, time_spent

8. **`exam_statistics`** — إحصائيات مجمّعة لكل طالب
   - student_id, total_exams, avg_score, strong_categories, weak_categories

**RLS Policies كاملة:** طالب يرى امتحاناته فقط، معلم يرى امتحاناته فقط، أدمن كل شيء.

**RPC Functions:**
- `start_exam_attempt(exam_id)` — يتحقق من العدد، النافذة الزمنية، الاشتراك
- `submit_exam_attempt(attempt_id)` — يحسب الدرجة، يحدث الترتيب
- `save_exam_answer(attempt_id, question_id, answer)` — Auto-save
- `get_exam_leaderboard(exam_id)` — جلب الترتيب
- `get_student_exam_stats(student_id)` — إحصائيات الطالب

---

### المرحلة 2: واجهات الطالب (8 صفحات)

**`/student/exams`** — Hub الامتحانات
- 4 تبويبات: الكل / متاحة الآن / قادمة / منتهية
- بطاقات Glassmorphism مع: العنوان، المادة، المعلم، المدة، عدد الأسئلة، الحالة، Timer للقادمة
- فلترة بالمادة + بحث
- Skeleton loading + Empty states

**`/student/exams/:id`** — تفاصيل الامتحان قبل البدء
- نظرة عامة، التعليمات، عدد المحاولات المتبقية
- زر "ابدأ الامتحان" مع تأكيد ملء الشاشة

**`/student/exams/:id/take`** — واجهة الأداء (الأهم)
- Header ثابت: عداد زمني دائري + شريط تقدم + اسم الامتحان
- Sidebar/Bottom: مربعات أرقام الأسئلة (مجاب/فارغ/معلّم للمراجعة)
- منطقة السؤال: نص + صورة + الخيارات بـ animations
- Auto-save كل 5 ثوانٍ + عند تغيير الإجابة
- استعادة من `exam_drafts` عند فتح متقطع
- منع: نسخ/لصق، right-click، tab switch (مع عداد إنذارات)
- Fullscreen API مع رسالة عند الخروج
- زر "علّم للمراجعة" + "السابق/التالي" + "إنهاء وتسليم"
- Modal تأكيد التسليم مع ملخص (مجاب/فارغ)

**`/student/exams/:id/result`** — صفحة النتيجة
- درجة كبيرة مع animation + نسبة مئوية + شارة نجاح/رسوب
- تفصيل الأسئلة الصحيحة/الخاطئة
- زمن مستغرق + ترتيب بين الطلاب
- زر "مراجعة الإجابات" + "العودة للامتحانات"

**`/student/exams/:id/review`** — مراجعة الإجابات
- كل سؤال مع إجابة الطالب + الإجابة الصحيحة + الشرح
- (يظهر فقط إذا `show_correct_answers = true`)

**`/student/exams/stats`** — إحصائيات الأداء
- Charts (Recharts): متوسط الدرجات، أداء بالمادة، تطور زمني
- نقاط قوة/ضعف (تحليل تلقائي)
- سجل كامل لكل المحاولات

**`/student/exams/:id/leaderboard`** — الترتيب
- Top 3 على المنصة + ترتيب الطالب + قائمة كاملة

---

### المرحلة 3: واجهات المعلم (5 صفحات)

**`/teacher/exams`** — قائمة امتحاناتي
- Tabs: مسودة / منشور / مؤرشف
- إحصائيات: عدد المحاولات، متوسط الدرجات، معدل النجاح
- Actions: تعديل، نشر/إخفاء، حذف، عرض النتائج، نسخ

**`/teacher/exams/new`** و **`/teacher/exams/:id/edit`** — محرر الامتحان
- خطوات (Wizard): معلومات → إعدادات → أسئلة → معاينة → نشر
- بناء أسئلة: MCQ، صح/خطأ، إجابة قصيرة، مقالي، فراغات
- رفع صور للأسئلة، شرح، علامات
- إعدادات الحماية (anti-cheat toggles)
- توليد بالـ AI (Gemini) — يستخدم edge function `generate-exam-questions`

**`/teacher/exams/:id/attempts`** — محاولات الطلاب
- جدول بكل المحاولات + فلترة + بحث
- تصحيح يدوي للأسئلة المقالية مع AI suggestion
- تصدير CSV

**`/teacher/exams/:id/analytics`** — تحليلات
- Charts: توزيع الدرجات، أصعب الأسئلة، أسهلها
- تحليل بالـ AI لنقاط ضعف الطلاب

---

### المرحلة 4: Edge Functions

1. **`generate-exam-questions`** — توليد أسئلة بـ Gemini (موجود — تحديث)
2. **`grade-essay-answer`** — تصحيح المقالي بالـ AI semantic
3. **`exam-anti-cheat-report`** — تجميع تقارير الغش

---

### المرحلة 5: المكونات المشتركة (~15 component)

`src/components/exams/`:
- `ExamCard.tsx` — بطاقة عرض
- `ExamTimer.tsx` — عداد دائري
- `ExamProgress.tsx` — شريط تقدم
- `QuestionNavigator.tsx` — مربعات الترقيم
- `QuestionRenderer.tsx` — عرض السؤال حسب النوع
- `MCQOption.tsx`, `TrueFalseOption.tsx`, `EssayInput.tsx`, `FillBlankInput.tsx`
- `ExamFullscreenGuard.tsx` — حماية ملء الشاشة
- `AntiCheatMonitor.tsx` — مراقبة tab switch / copy
- `ExamAutoSave.tsx` — hook حفظ تلقائي
- `ResultSummary.tsx`, `LeaderboardTable.tsx`, `StatsCharts.tsx`
- `ExamSkeleton.tsx`, `ExamEmptyState.tsx`

---

### المرحلة 6: التصميم (Luminous Pastel + Glassmorphism)

- الالتزام بالـ design system الحالي: `gradient-mudrik`, `shadow-mudrik`, Cairo font, RTL
- Dark/Light mode عبر CSS variables (موجود)
- Framer-motion للـ micro-interactions (موجود)
- Responsive كامل: mobile-first → tablet → desktop
- Skeleton loaders + Empty states + Error boundaries

---

### المرحلة 7: التنظيف

- حذف `src/pages/StudentExamPage.tsx`
- حذف `src/components/exam/` بالكامل
- إزالة كل import للقديم
- إضافة الـ routes الجديدة في `App.tsx`
- إضافة روابط في dashboards (طالب + معلم)

---

### الخطة الزمنية للتنفيذ (دفعة واحدة)

نظراً لضخامة المشروع، التنفيذ هيكون في **3 رسائل متتالية**:
1. **Migration كامل** (DB + RPC + RLS) — تنتظر موافقتك
2. **Edge functions + Components + Student pages**
3. **Teacher pages + Routes + Cleanup + اختبار**

### ملاحظات تقنية

- الـ `questions` jsonb القديمة هتتفقد (المستخدم وافق على حذف القديم)
- استخدام React Query للـ caching
- استخدام Supabase Realtime لتحديث leaderboard لحظياً
- استخدام `react-hook-form + zod` لكل forms المعلم
- Recharts للإحصائيات
- جميع المسارات هتتسجل بطريقة لا تسبب reload (SPA navigation موجودة)

### ⚠️ تذكير

التحديثات السابقة (Google Sign-In + منع reload + Offline cache) لسه ما تم اختبارها على APK حقيقي. لو ظهرت مشاكل بعد بناء الـ APK، هنرجع نصلحها قبل ما تطلق النسخة النهائية.
# Modrek Live (Zoom Meeting SDK) — تقرير Audit + خطة المرحلة الأولى

## 1. ما الموجود حاليًا؟

نظام بث مباشر كامل يعمل بمزوّد **Jitsi (meet.jit.si)** وليس Zoom:

| العنصر | الحالة |
| --- | --- |
| `live_sessions` | موجود: `id, group_id, teacher_id, title, room_name, status, allow_student_camera, allow_student_mic, viewer_count, started_at, ended_at, created_at, tenant_id` |
| `live_session_messages` / `live_session_actions` / `live_session_recordings` | موجودة بـ RLS + عزل Tenant |
| Edge Function `livekit-token` | تُدير: `start`, `join`, `leave`, `end`, `moderate` (تتحقق من ملكية المعلم للمجموعة واشتراك الطالب عبر `student_group_purchases`) |
| الواجهة | `src/components/live/LiveTabContent.tsx` + `LiveClassTeacher.tsx` + `LiveClassStudent.tsx` مدمجة كتاب «مباشر» داخل `TeacherUploadContent.tsx` و`StudentSubjectView.tsx` |
| Realtime | قناة `postgres_changes` على `live_sessions` مفلترة بـ `group_id` — تعمل بالفعل |
| RLS | الطالب يرى الجلسات `status='live'` لمجموعاته المشتراة فقط؛ المعلم يدير جلساته؛ الأدمن كامل؛ سياسة RESTRICTIVE `tenant_row_visible(tenant_id)` |
| الحضور | **غير موجود** (لا يوجد `live_attendance`) |
| Zoom | **غير موجود إطلاقًا** — لا SDK ولا secrets ولا webhooks |

النتيجة المهمة: التحقق من الصلاحيات (معلم/طالب/مجموعة/اشتراك/tenant) **جاهز ومختبَر بالإنتاج**. المطلوب فعليًا هو استبدال طبقة الفيديو فقط (Jitsi → Zoom) دون لمس طبقة الصلاحيات.

## 2. ما الذي سنستخدمه كما هو (لا يُلمس)

الاشتراكات (`student_group_purchases`/`subscriptions`)، المجموعات، عزل Tenant، RLS الحالية، Realtime، Modrek AI، المكتبة/RAG، اختيار المعلم، تسجيل الدخول، لوحات المعلم/الطالب.

## 3. ما الذي سنضيفه (المرحلة الأولى — PoC)

1. **مزوّد بث قابل للتبديل**: عمود `provider` على `live_sessions` بقيمة افتراضية `jitsi`. الجلسات القديمة تبقى Jitsi وتعمل كما هي؛ الجلسات الجديدة تُنشأ بـ `zoom` فقط عندما تكون مفاتيح Zoom مضبوطة، وإلا يعود النظام تلقائيًا إلى Jitsi (لا انقطاع خدمة).
2. **Edge Function جديدة `zoom-live`** (لا تعديل هدّام على `livekit-token`):
   - `start` — يتحقق: مصادقة + دور معلم + ملكية المجموعة + المجموعة نشطة + tenant، ثم **Idempotent**: لو توجد جلسة `live`/`starting` لنفس المجموعة يعيدها بدل إنشاء اجتماع ثانٍ (قفل عبر `advisory lock` على `group_id`).
   - ينشئ اجتماع Zoom عبر **Server-to-Server OAuth** (`POST /oauth/token?grant_type=account_credentials` ثم `POST /v2/users/me/meetings`)، ويجلب **ZAK** للمعلم (`GET /v2/users/me/token?type=zak`) ليبدأ كـ Host من داخل Modrek.
   - `join` — يعيد للطالب المؤهل فقط: `meetingNumber`, `passWord`, `sdkKey`, `signature` (JWT موقّع Server-side بـ Meeting SDK Secret، صلاحية قصيرة، role=0). غير المشترك يُرفض 403.
   - `end` — ينهي الاجتماع عبر Zoom API (`PUT /meetings/{id}/status`) ويضبط `status='ended'`.
   - `heartbeat/leave` — تحديث الحضور وعدد المشاهدين (بنفس throttling الحالي).
   - **لا يُعاد أي secret أو ZAK للطالب أبدًا**؛ ZAK يُعاد للمعلم صاحب المجموعة فقط ولحظة البدء ولا يُخزَّن في قاعدة البيانات ولا في localStorage.
3. **Edge Function `zoom-webhook`** (بدون JWT، تتحقق من توقيع Zoom `x-zm-signature` + `ZOOM_WEBHOOK_SECRET_TOKEN`, وتردّ على `endpoint.url_validation`): أحداث `meeting.started` → `live`، `meeting.ended` → `ended` (بما يشمط انتهاء جلسة Basic بعد 40 دقيقة)، وفشل البدء → `failed`. الحالة لا تعتمد على الواجهة.
4. **جدول `live_attendance`**: `id, live_session_id, student_id, joined_at, left_at, duration_seconds, tenant_id` + RLS (الطالب يرى صفوفه، المعلم يرى صفوف جلساته، الأدمن الكل) + GRANTs.
5. **مكوّن `ZoomMeetingView.tsx`**: يحمّل Zoom Meeting SDK for Web (`@zoom/meetingsdk`) بـ **Client View** على الجوال والويب معًا (Component View غير مدعوم للموبايل حسب توثيق Zoom) — بأقل تخصيص ممكن في PoC: صوت، فيديو، مشاركة شاشة، مشاركون، شات، خروج، إنهاء.
6. **حالة الجلسة**: توسيع `status` إلى `scheduled | starting | live | ending | ended | cancelled | failed` مع الحفاظ على القيم الحالية (`live`, `ended`) كما هي حتى لا تنكسر الاستعلامات القائمة.
7. **تجربة 40 دقيقة**: عند `meeting.ended` تظهر للمعلم «انتهت جلسة Zoom الحالية» + زر «استمرار الحصة» (ينشئ جلسة Zoom جديدة رسميًا)، وللطالب «تم استئناف الحصة» + «انضم للحصة». بلا أي تحايل على قيود Zoom.

## 4. الملفات التي ستتغير

**جديدة:** `supabase/functions/zoom-live/index.ts`، `supabase/functions/zoom-webhook/index.ts`، `src/lib/zoomMeeting.ts`، `src/components/live/ZoomMeetingView.tsx`، `src/components/live/LiveProviderGate.tsx`، `docs/ZOOM_LIVE.md`، `scripts/test-zoom-live-authorization.mjs`.

**تعديل محدود:** `src/components/live/LiveTabContent.tsx` (اختيار المزوّد + رسائل الاستئناف)، `LiveClassTeacher.tsx` / `LiveClassStudent.tsx` (تفويض العرض إلى `ZoomMeetingView` عند `provider='zoom'` فقط، ومسار Jitsi يبقى حرفيًا كما هو)، `supabase/config.toml` (تسجيل الوظيفتين)، `package.json` (إضافة `@zoom/meetingsdk`).

**لن يُلمس:** أي ملف طلاب/معلمين/اشتراكات/AI/Library/Tenant خارج ما سبق.

## 5. الجداول والتغييرات في قاعدة البيانات

- `live_sessions`: إضافة `provider text not null default 'jitsi'`, `zoom_meeting_id text`, `zoom_meeting_uuid text`, `zoom_join_url text`, `zoom_host_email text`, `updated_at`, وفهرس جزئي فريد يمنع أكثر من جلسة نشطة لكل مجموعة (Idempotency على مستوى القاعدة).
- `live_attendance`: جدول جديد + GRANTs + RLS.
- لا حذف ولا تعديل لأي عمود قائم، ولا تغيير في سياسات الجداول الأخرى.

## 6. مخاطر التعديل ومنع الـRegression

| الخطر | المنع |
| --- | --- |
| كسر البث الحالي (Jitsi) | `provider` افتراضي `jitsi`؛ مسار Jitsi يبقى كما هو ويُستخدم تلقائيًا عند غياب مفاتيح Zoom |
| تسريب secrets | كل نداءات Zoom داخل Edge Functions؛ الواجهة تستقبل `signature` قصير الأجل فقط |
| مشكلة العزل بين المنصات | `tenant_id` يُملأ من الجلسة الخادمية كما اليوم، والسياسة RESTRICTIVE الحالية تبقى دون تعديل |
| اجتماعان بالضغط المزدوج | فهرس فريد جزئي + advisory lock + إعادة نفس الجلسة |
| Android/Capacitor | Client View داخل WebView مع أذونات الميكروفون/الكاميرا الموجودة أصلًا؛ لا إعادة بناء للتطبيق |

## 7. ACTION REQUIRED FROM USER (قبل تشغيل مسار Zoom)

من Zoom App Marketplace أحتاج قيم تُخزَّن في Secrets الخاصة بالـBackend فقط:

1. تطبيق **Server-to-Server OAuth**: `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` — لإنشاء/إنهاء الاجتماعات وجلب ZAK. Scopes: `meeting:write:admin`, `meeting:read:admin`, `user:read:admin`.
2. تطبيق **Meeting SDK**: `ZOOM_SDK_KEY`, `ZOOM_SDK_SECRET` — لتوقيع دخول الطلاب/المعلم داخل Modrek.
3. **Webhook**: `ZOOM_WEBHOOK_SECRET_TOKEN` + تسجيل رابط الوظيفة `zoom-webhook` مع أحداث `meeting.started`, `meeting.ended`.

سأطلبها عبر نافذة Secrets عند بدء التنفيذ. حتى وصولها سيبقى النظام على Jitsi بلا أي تعطّل، وسأنفّذ ما لا يعتمد عليها (القاعدة، الحضور، البنية، الاختبارات).

## 8. الاختبارات (تُنفَّذ فعليًا وتُوثَّق بجدول Test | Result | Evidence)

سكربت تفويض حقيقي بجلسات JWT فعلية يغطي: بدء المعلم، دخول طالب مؤهل، حجب طالب غير مشترك، حجب معلم مجموعة أخرى، معلّمان بمجموعتين، ضغط مزدوج = جلسة واحدة، إنهاء الجلسة، انتهاء 40 دقيقة عبر webhook، جلسة ثانية بعد الأولى، عزل Tenant، وRegression على تسجيل الدخول/اختيار المعلم/الاشتراك/AI/المكتبة. اختبار Android/Desktop الفعلي يحتاج جهازك وسأزودك بخطوات التحقق.

## 9. المرحلة الثانية (لاحقًا فقط بعد نجاح PoC)

واجهة Modrek Live المخصّصة (شات، رفع يد، اختبار سريع، المذكرة، Modrek AI داخل البث) — البنية ستُجهَّز الآن بحيث تُضاف دون إعادة كتابة.

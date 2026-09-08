# Modrek Live — Zoom Meeting SDK (المرحلة الأولى)

## المكونات
| العنصر | الدور |
| --- | --- |
| `supabase/functions/zoom-live` | التصريح + إنشاء الاجتماع + توقيع SDK + الحضور + الإنهاء |
| `supabase/functions/zoom-webhook` | تحديث حالة الجلسة من أحداث Zoom (بما فيها انتهاء 40 دقيقة) |
| `src/lib/zoomMeeting.ts` | تحميل Zoom SDK من CDN + استدعاء الخدمة |
| `src/components/live/ZoomMeetingView.tsx` | واجهة الاجتماع (Client View) + تقرير خطأ قابل للنسخ |
| `src/components/live/LiveProviderGate.tsx` | اختيار Zoom أو Jitsi تلقائيًا |
| `live_sessions.provider` + `live_attendance` | تخزين المزوّد وسجل الحضور |

## قواعد الأمان
- كل مفاتيح Zoom على الخادم فقط. العميل يستلم توقيع SDK لاجتماع واحد فقط.
- `zak` (توكن المضيف) يُعطى للمعلم صاحب المجموعة فقط ولا يُحفظ في قاعدة البيانات.
- الطالب يحتاج: تسجيل دخول + شراء نفس المجموعة + جلسة نشطة. ولا يُسمح للمحظور (`live_session_actions.action = 'ban'`).
- `zoom-webhook` يتحقق من `x-zm-signature` (HMAC SHA-256) ويرفض أي طلب غير موقّع.
- فهرس فريد `live_sessions_one_active_per_group` يمنع تعدد الجلسات النشطة للمجموعة (Idempotency).
- `live_attendance` محمي بـRLS: الطالب يرى سجله، المعلم يرى سجلات جلساته، الأدمن الكل، مع سياسة عزل المنصات RESTRICTIVE.

## التوافق مع النظام الحالي
Jitsi يبقى المسار الافتراضي: إذا لم تُضبط مفاتيح Zoom يعيد `capabilities` قيمة `zoomEnabled: false`
وتعمل الحصص كما كانت. الجلسات القديمة تُفتح دائمًا بمزوّدها المسجَّل.

## الأسرار المطلوبة
`ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` (Server-to-Server OAuth),
`ZOOM_SDK_KEY`, `ZOOM_SDK_SECRET` (Meeting SDK App), `ZOOM_WEBHOOK_SECRET_TOKEN`.

## Webhook URL
`https://<project>.functions.supabase.co/zoom-webhook` — الأحداث: `meeting.started`, `meeting.ended`, `meeting.deleted`.

## Zoom Webhook (تم اختباره)
- Endpoint: `zoom-webhook` — يقبل POST فقط.
- الأحداث المدعومة: `meeting.started`, `meeting.ended`, `meeting.participant_joined`, `meeting.participant_left`.
- التحقق: `endpoint.url_validation` (HMAC للـplainToken) + توقيع `v0:{timestamp}:{body}` بمقارنة ثابتة الزمن + نافذة 5 دقائق ضد إعادة الإرسال.
- الأحداث تُسجَّل في `zoom_webhook_events` بمفتاح `dedupe_key` فريد ⇒ تكرار نفس الحدث لا ينشئ صفًا ثانيًا.
- لا يتم ربط أي مشارك Zoom بحساب طالب في هذه المرحلة؛ تُخزَّن معرفات Zoom فقط.
- أي خطأ داخلي يُرجع 200 حتى لا يوقف Zoom الاشتراك ولا يتأثر التطبيق.
- المتغير المطلوب حاليًا: `ZOOM_WEBHOOK_SECRET_TOKEN` فقط.

## المرحلة الثانية — Zoom فقط (2026-09-06)
- Jitsi أُزيل تمامًا: حُذفت `livekit-token` و`src/lib/jitsi.ts`/`src/lib/livekit.ts`، وأُزيل `meet.jit.si` من allowNavigation في Capacitor
  وأُضيف `*.zoom.us` بدلًا منه. أي جلسة قديمة غير Zoom تُغلق تلقائيًا عند بدء بث جديد.
- الأسرار المستخدمة: `ZOOM_ACCOUNT_ID` / `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` (Server-to-Server OAuth)
  و`ZOOM_MEETING_SDK_CLIENT_ID` / `ZOOM_MEETING_SDK_CLIENT_SECRET` (توقيع Meeting SDK) و`ZOOM_WEBHOOK_SECRET_TOKEN`.
- `zoom-live` أُضيف له `action: "diagnostics"` (أدمن فقط) يتحقق فعليًا من OAuth وتوفر ZAK دون كشف أي قيمة.
- الحضور مُوثَّق من Zoom: `zoom-live` يمنح كل طالب `participant_tag` قصيرًا يُضاف لاسم العرض،
  و`zoom-webhook` يستخدمه في `participant_joined/left` لتعليم `verified_by_zoom` وحساب `duration_seconds`،
  ويغلق أي حضور مفتوح عند `meeting.ended`. فتح الصفحة وحده لا يُثبت الحضور.
- النطاقات المطلوبة في تطبيق Server-to-Server OAuth: `user:read:user:admin`, `meeting:write:meeting:admin`,
  `user:read:token:admin` (لازم لـZAK حتى يدخل المعلم كـHost), `meeting:update:status:admin` (إنهاء الاجتماع فعليًا).

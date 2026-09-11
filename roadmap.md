# Roadmap

- [ ] إعادة بناء مركز المتابعة الذكي بتبويبين وملخص تنفيذي وتقارير مجمعة متجاوبة

- [x] إغلاق تجاوز حد استخدام Modrek AI اليومي من المسارات البديلة وعند فشل فحص العداد
- [x] تثبيت تكبير رسومات الشرح وإزالة مربع كود Mermaid الأسود
- [x] إخفاء تحويل النص إلى صوت من مساعد الطالب مؤقتًا

- [x] Phase 1: Audit current Teacher Platforms architecture and regressions
- [x] Phase 2: Document root causes and auth limitations
- [x] Phase 3: Design corrected tenant architecture (server-authoritative tenant sessions)
- [x] Phase 4-10: Database, server, frontend, auth, subscriptions, UI, AI/storage/cache isolation
- [x] Phase 11: Acceptance + security regression tests (19/19 PASS, incl. RAG isolation)
- [x] Phase 12: Edge functions deployed (modrek-retrieve, ai-chat, modrek-ai-exams, modrek-ai-study)
- [x] إصلاح إنتاجي: استعادة ظهور بيانات المعلمين واختيارهم للطلاب الرسميين مع الحفاظ على Tenant V2
- [x] إضافة تقرير تشخيص قابل للنسخ لتحميل حسابات وملفات وصور وفيديوهات ومجموعات المعلمين
- [x] Modrek Live المرحلة 1: بنية Zoom (provider + live_attendance + zoom-live + بوابة المزود)
- [x] Zoom Webhook Integration: endpoint آمن + URL validation + تحقق التوقيع + سجل أحداث Idempotent للأحداث الأربعة
- [x] Zoom Live: طلب صريح وآمن لإذن الكاميرا والميكروفون قبل بدء الحصة مع إعادة المحاولة
- [ ] Production Zoom: تشخيص سبب فشل إنشاء الاجتماع وإثبات إنشاء اجتماع حقيقي (بانتظار اختبار هوية إنتاج موثقة)
- [ ] قاعدة الإنتاج الخارجية: مطلوب Restart/ترقية Compute (PGRST002 + مهلات 20-25 ثانية) — التحسينات البرمجية طُبقت

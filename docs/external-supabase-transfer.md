# نقل قاعدة Modrek Plus إلى مشروع Supabase خارجي

## ما الذي يمكن نقله
- جداول ومحتوى `public`
- سياسات RLS والدوال والـ triggers الموجودة داخل `public`
- فهرس التخزين والحاويات

## ما الذي لا ينتقل تلقائياً
- `auth.users`
- الجلسات الحالية
- إعدادات OAuth providers
- ملفات التخزين نفسها بدون صلاحيات/مفاتيح المشروع الخارجي

## أوامر التصدير
```bash
bash /dev-server/scripts/export_public_transfer.sh
```

## أوامر التطبيق على المشروع الخارجي
```bash
bash /dev-server/scripts/apply_external_schema.sh "POSTGRES_URL" \
  /mnt/documents/modrek_plus_transfer_x/public_schema.sql \
  /mnt/documents/modrek_plus_transfer_x/public_data.sql
```

## المزامنة التلقائية
المتاح تلقائياً من خلال GitHub هو مزامنة **الكود وملفات migrations** فقط.
أما مزامنة البيانات الحية والتخزين من Lovable Cloud إلى مشروع خارجي فتحتاج Pipeline منفصلة بمفاتيح المشروع الخارجي.

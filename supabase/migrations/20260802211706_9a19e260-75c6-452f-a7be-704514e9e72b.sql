UPDATE public.app_versions
SET latest_version = '1.1.31',
    latest_build_number = 34,
    release_notes = 'توسيع التوافق ليشمل أجهزة أندرويد 6 وما بعدها، إزالة أي قيود على ميزات الجهاز، دعم كامل للتابلت والشاشات الكبيرة.',
    updated_at = now()
WHERE platform = 'android' AND is_active = true;
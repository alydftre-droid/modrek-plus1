UPDATE public.app_versions
SET latest_version = '1.1.32',
    latest_build_number = 35,
    min_supported_version = '1.1.0',
    force_update = false,
    release_notes = 'تحديث توافق شامل: دعم كل أجهزة أندرويد من 6.0 حتى أحدث إصدار (بدون أي متطلبات عتاد إلزامية)، توافق كامل مع التابلت وChromebook والشاشات القابلة للطي، دعم جميع معماريات المعالجات، وتحسينات استقرار للإنتاج.',
    updated_at = now()
WHERE platform = 'android';
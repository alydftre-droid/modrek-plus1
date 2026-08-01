UPDATE public.app_versions
SET latest_build_number = 33,
    latest_version = '1.1.30',
    release_notes = 'إصلاح تحذيرات وأخطاء البناء، تحسين استقرار الإنتاج، تحسينات عامة في الأداء.',
    updated_at = now()
WHERE platform = 'android' AND is_active = true;
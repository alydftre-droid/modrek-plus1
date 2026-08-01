update public.app_versions
set latest_version = '1.1.29',
    latest_build_number = 32,
    release_notes = 'تحسينات في عارض صفحات الكتب (تكبير سلس واحترافي)، تحسين المساعد الذكي، إصلاحات استقرار وأداء عامة.',
    force_update = false
where platform = 'android';